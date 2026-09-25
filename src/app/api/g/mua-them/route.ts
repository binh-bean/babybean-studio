/**
 * POST /api/g/mua-them — Ba mẹ GỬI YÊU CẦU mua thêm sau khi đã duyệt ảnh.
 * GET  /api/g/mua-them — Ba mẹ xem lại những yêu cầu đã gửi cho bộ ảnh này.
 *
 * OWNER: DEV-BE. Task BB-245.
 *
 * ---------------------------------------------------------------------------
 * Vì sao route này KHÔNG dùng `/api/g/addons`
 * ---------------------------------------------------------------------------
 * Chủ studio chốt: "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
 * Lúc đó bộ ảnh đã ở `approved`/`delivered` — theo đúng luật (`isGalleryLocked`,
 * migration 0033/0060) selection đã KHOÁ, và `/api/g/addons` từ chối đúng.
 * Route này KHÔNG nới khoá đó. Nó chỉ ghi một YÊU CẦU vào bảng riêng
 * (`yeu_cau_mua_them`, migration 0072) để CSKH gọi lại chốt giá/thanh toán
 * NGOÀI app — không cộng vào `contract`/`selection_addons`.
 *
 * ---------------------------------------------------------------------------
 * Chỉ mở đúng cửa sổ: đã duyệt, và không có vòng xin sửa nào
 * ---------------------------------------------------------------------------
 * Bộ ảnh có `review.rounds.length > 0` nghĩa là ba mẹ từng yêu cầu chỉnh —
 * "mời mua lần hai" chỉ đúng lúc khách ƯNG Ý hoàn toàn ngay từ đầu. Kiểm ở cả
 * hai đầu: màn khách ẩn thẻ mời khi có vòng sửa, và route này TỰ KIỂM LẠI
 * (không tin giao diện) trước khi ghi.
 *
 * ---------------------------------------------------------------------------
 * Chống spam: tối đa 10 dòng 'moi' cho một bộ ảnh
 * ---------------------------------------------------------------------------
 * Không có ràng buộc gì chặn khách gửi liên tục — kiểm đếm ở đây trước khi ghi.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateYeuCauMuaThemSchema } from "./schema";
import { nhomSanPham, canGanAnh } from "@/lib/products/nhom-san-pham";
import { enqueueLarkNotification } from "@/lib/lark/notify";
import { duocMoiMuaLanHai } from "@/lib/gallery/moi-mua-lan-hai-rules";

export const runtime = "nodejs";

/** Chống spam: quá con số này thì từ chối, không ghi thêm. */
const TOI_DA_DONG_MOI = 10;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người xem không có quyền gửi yêu cầu mua thêm");
    }

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateYeuCauMuaThemSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const { items } = parsed.data;

    const admin = createAdminClient();

    // 1. Bộ ảnh phải tồn tại và đã DUYỆT (không phải chỉ "khoá" — submitted,
    // in_retouch, awaiting_approval cũng khoá nhưng chưa phải lúc mời mua).
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, status, title")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    // 2. Chỉ mở đúng cửa sổ chủ studio chốt: đã DUYỆT và không có vòng xin sửa
    // nào. Dùng chung `duocMoiMuaLanHai` với màn khách — không tin giao diện.
    const { count: soVongSua, error: roundsError } = await admin
      .from("revision_requests")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId);

    if (roundsError) throw roundsError;

    if (!duocMoiMuaLanHai(gallery.status, soVongSua ?? 0)) {
      return fail(
        "CONFLICT",
        "Chỉ gửi được yêu cầu mua thêm khi bộ ảnh đã duyệt và không có yêu cầu sửa nào",
      );
    }

    // 3. Sản phẩm phải thuộc danh mục bộ ảnh đang được bán — cùng ba luật tiền
    // của BB-105 (đủ tin cậy giá), tái dùng đúng cách /api/g/gallery lọc
    // `catalogue`.
    const productIds = Array.from(new Set(items.map((i) => i.productId)));
    const { data: products, error: productsError } = await admin
      .from("products")
      .select("id, name, kind, material, size, list_price, price_confidence, price_samples, is_active")
      .in("id", productIds);

    if (productsError) throw productsError;

    const productMap = new Map((products ?? []).map((p) => [p.id, p]));
    const dongDeGhi: {
      productId: string;
      photoId: string | null;
      soLuong: number;
      ghiChu: string | null;
    }[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_active) {
        return fail("NOT_FOUND", "Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh");
      }
      if (product.list_price === null || product.list_price === undefined) {
        return fail("INVALID_INPUT", "Có sản phẩm chưa có đơn giá niêm yết, vui lòng liên hệ CSKH");
      }
      const confidence = product.price_confidence !== null ? Number(product.price_confidence) : 0;
      const samples = product.price_samples ?? 0;
      if (confidence < 0.8 || samples < 5) {
        return fail(
          "INVALID_INPUT",
          "Có sản phẩm chưa đủ độ tin cậy về giá, CSKH sẽ báo giá trực tiếp",
        );
      }

      const nhom = nhomSanPham(product.kind, product.material);
      if (nhom === null) {
        return fail("INVALID_INPUT", "Sản phẩm này không bán trong màn mua thêm");
      }

      const photoId = item.photoId ?? null;
      if (canGanAnh(nhom) && !photoId) {
        return fail("INVALID_INPUT", "Ba mẹ chọn giúp em tấm ảnh cần in cho sản phẩm này");
      }

      if (photoId) {
        const { data: anh } = await admin
          .from("photos")
          .select("id")
          .eq("id", photoId)
          .eq("gallery_id", session.galleryId)
          .maybeSingle();
        if (!anh) return fail("NOT_FOUND", "Không tìm thấy tấm ảnh này trong bộ ảnh");
      }

      dongDeGhi.push({
        productId: item.productId,
        photoId,
        soLuong: item.soLuong,
        ghiChu: item.ghiChu?.trim() || null,
      });
    }

    // 4. Chống spam: đếm dòng 'moi' đang có, cộng thêm lượt này không được vượt.
    // Đếm SÁT trước lúc ghi — kiểm hình dạng dữ liệu (bước 3) không cần chạm
    // tới bảng này, nên body sai hình dạng vẫn trả 400 kể cả khi bảng
    // `yeu_cau_mua_them` (migration 0072) chưa được áp lên môi trường này.
    const { count: soDongMoi, error: demError } = await admin
      .from("yeu_cau_mua_them")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId)
      .eq("trang_thai", "moi");

    if (demError) throw demError;
    if ((soDongMoi ?? 0) + items.length > TOI_DA_DONG_MOI) {
      return fail(
        "RATE_LIMITED",
        "Ba mẹ đã gửi khá nhiều yêu cầu, CSKH sẽ liên hệ trước khi nhận thêm",
      );
    }

    // 5. Ghi — một dòng cho mỗi sản phẩm, KHÔNG gộp, KHÔNG cộng vào hợp đồng.
    const { data: daGhi, error: insertError } = await admin
      .from("yeu_cau_mua_them")
      .insert(
        dongDeGhi.map((d) => ({
          gallery_id: session.galleryId,
          product_id: d.productId,
          photo_id: d.photoId,
          so_luong: d.soLuong,
          ghi_chu: d.ghiChu,
        })),
      )
      .select("id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at");

    if (insertError) throw insertError;

    // 6. Nhật ký nội bộ — không chặn phản hồi nếu ghi hụt.
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: "mua_them.yeu_cau",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: { soDong: dongDeGhi.length, sanPham: dongDeGhi.map((d) => d.productId) },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    // 7. Báo CSKH qua Lark — SAU khi ghi DB thành công. Không bao giờ để lỗi
    // báo tin làm hỏng phản hồi đã thành công với khách (xem lib/lark/notify).
    const tenTepTheoPhoto = new Map<string, string>();
    const photoIds = dongDeGhi.map((d) => d.photoId).filter((x): x is string => Boolean(x));
    if (photoIds.length > 0) {
      const { data: anhList } = await admin
        .from("photos")
        .select("id, file_name")
        .in("id", photoIds);
      for (const a of anhList ?? []) tenTepTheoPhoto.set(a.id as string, a.file_name as string);
    }

    await enqueueLarkNotification({
      branchId: gallery.branch_id,
      event: "mua_them.yeu_cau",
      payload: {
        tieuDeBo: gallery.title,
        galleryId: gallery.id,
        tongSoMon: dongDeGhi.length,
        cacMon: dongDeGhi.map((d) => {
          const product = productMap.get(d.productId);
          return {
            ten: product?.name ?? "—",
            soLuong: d.soLuong,
            tenTep: d.photoId ? tenTepTheoPhoto.get(d.photoId) ?? null : null,
            ghiChu: d.ghiChu,
          };
        }),
      },
    });

    return NextResponse.json(
      {
        data: {
          items: (daGhi ?? []).map((d) => ({
            id: d.id,
            productId: d.product_id,
            photoId: d.photo_id,
            soLuong: d.so_luong,
            ghiChu: d.ghi_chu,
            trangThai: d.trang_thai,
            createdAt: d.created_at,
          })),
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("yeu_cau_mua_them")
      .select("id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at, products(name)")
      .eq("gallery_id", session.galleryId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(
      {
        data: {
          items: (data ?? []).map((d) => ({
            id: d.id,
            productId: d.product_id,
            productName: (d.products as unknown as { name: string } | null)?.name ?? null,
            photoId: d.photo_id,
            soLuong: d.so_luong,
            ghiChu: d.ghi_chu,
            trangThai: d.trang_thai,
            createdAt: d.created_at,
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
