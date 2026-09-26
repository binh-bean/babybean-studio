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
 *
 * ---------------------------------------------------------------------------
 * BB-254 — ông bà/người thân (link vai 'viewer') giờ GỬI ĐƯỢC yêu cầu này
 * ---------------------------------------------------------------------------
 * Chủ studio chốt 26/09/2026: ông bà XEM và MUA, gửi yêu cầu cho CSKH gọi lại
 * CHÍNH ÔNG BÀ (không phải ba mẹ đứng hợp đồng). Hai điểm khác ba mẹ:
 *
 *   1. CỬA SỔ MỞ KHÁC HẲN: `duocMoiMuaLanHai` (đã duyệt, không vòng sửa) là
 *      luật RIÊNG của ba mẹ — không áp cho ông bà. Ông bà chỉ cần bộ ảnh còn
 *      MỞ CHO KHÁCH XEM (`dangMoChoKhachXem` — chưa hết hạn/lưu trữ), bất kể
 *      đã duyệt hay chưa. Dùng nhầm luật của ba mẹ sẽ khoá cửa ông bà suốt từ
 *      lúc gửi ảnh cho tới khi ba mẹ duyệt xong — sai với điều chủ studio nói.
 *   2. BẮT BUỘC tên + SĐT người gửi: route TỰ KIỂM (không tin schema optional)
 *      để CSKH biết gọi cho ai, không lẫn với số điện thoại của ba mẹ trong
 *      hợp đồng.
 *
 * Ba cột mới (`ten_nguoi_mua`, `sdt_nguoi_mua`, `share_link_id`) nằm trong
 * migration 0073 — CHƯA ÁP lên bb-dev lúc viết route này. `ghiDongMoiMua()`
 * bên dưới TỰ RÚT các cột đó khỏi câu insert nếu PostgREST báo "column không
 * tồn tại" (PGRST204/42703), để route không 500 trên môi trường chưa áp
 * migration — cùng cách phòng thủ ADR đã dùng ở BB-245/`notify.ts`.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateYeuCauMuaThemSchema } from "./schema";
import { nhomSanPham, canGanAnh } from "@/lib/products/nhom-san-pham";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { duocMoiMuaLanHai } from "@/lib/gallery/moi-mua-lan-hai-rules";
import { dangMoChoKhachXem } from "@/lib/gallery/mo-cho-khach-xem";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Chống spam: quá con số này thì từ chối, không ghi thêm. */
const TOI_DA_DONG_MOI = 10;

/** Báo "cột chưa tồn tại" từ PostgREST (schema cache) hoặc Postgres thẳng. */
function laLoiThieuCot(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST204" || err.code === "42703") return true;
  return /column .* (does not exist|not found)/i.test(err.message ?? "");
}

interface DongDeGhi {
  productId: string;
  photoId: string | null;
  soLuong: number;
  ghiChu: string | null;
}

/**
 * Ghi các dòng yêu cầu — thử kèm ba cột BB-254 trước, rớt về bản không có ba
 * cột đó nếu môi trường chưa áp migration 0073. Trả lại đúng các dòng đã ghi
 * để phần còn lại của route không cần biết đường nào vừa chạy.
 */
async function ghiDongMoiMua(
  admin: SupabaseClient,
  galleryId: string,
  dongDeGhi: DongDeGhi[],
  nguoiMua: { ten: string; sdt: string; shareLinkId: string } | null,
) {
  const coBan = dongDeGhi.map((d) => ({
    gallery_id: galleryId,
    product_id: d.productId,
    photo_id: d.photoId,
    so_luong: d.soLuong,
    ghi_chu: d.ghiChu,
  }));

  if (nguoiMua) {
    const day = coBan.map((d) => ({
      ...d,
      ten_nguoi_mua: nguoiMua.ten,
      sdt_nguoi_mua: nguoiMua.sdt,
      share_link_id: nguoiMua.shareLinkId,
    }));
    const thu = await admin
      .from("yeu_cau_mua_them")
      .insert(day)
      .select("id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at");
    if (!thu.error) return thu;
    if (!laLoiThieuCot(thu.error)) return thu;
    console.error(
      "[mua-them] Migration 0073 chưa áp — ghi tạm KHÔNG kèm tên/SĐT người mua:",
      thu.error.message,
    );
  }

  return admin
    .from("yeu_cau_mua_them")
    .insert(coBan)
    .select("id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at");
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();
    // BB-254: ông bà (viewer) GỬI ĐƯỢC yêu cầu này — không còn chặn 403 cho
    // mọi viewer như trước. Điều kiện của họ kiểm ở bước 2b bên dưới.

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateYeuCauMuaThemSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const { items, tenNguoiMua, sdtNguoiMua } = parsed.data;

    // BB-254 — viewer BẮT BUỘC tên + SĐT để CSKH gọi lại đúng người. Kiểm ở
    // đây (không tin schema `nullish`) vì trường này chỉ bắt buộc CÓ ĐIỀU
    // KIỆN theo vai trong phiên, Zod không tự biết `session.role`.
    if (session.role === "viewer") {
      if (!tenNguoiMua || !sdtNguoiMua) {
        return fail(
          "INVALID_INPUT",
          "Vui lòng cho studio xin tên và số điện thoại để gọi lại giúp em",
        );
      }
    }

    const admin = createAdminClient();

    // 1. Bộ ảnh phải tồn tại.
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, status, title")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    if (session.role === "viewer") {
      // 2a. Cửa sổ của ÔNG BÀ: bộ ảnh còn mở cho khách xem — KHÔNG đòi hỏi
      // "đã duyệt, không vòng sửa" như ba mẹ (xem ghi chú đầu tệp).
      if (!dangMoChoKhachXem(gallery.status)) {
        return fail(
          "CONFLICT",
          "Bộ ảnh này không còn mở để gửi yêu cầu mua thêm",
        );
      }
    } else {
      // 2b. Cửa sổ của BA MẸ — giữ NGUYÊN luật BB-245: đã DUYỆT và không có
      // vòng xin sửa nào. Dùng chung `duocMoiMuaLanHai` với màn khách.
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
    // BB-254: viewer kèm tên/SĐT/link — `ghiDongMoiMua` tự rớt về bản không
    // có ba cột đó nếu migration 0073 chưa áp (xem hàm ở đầu tệp).
    const nguoiMuaDeGhi =
      session.role === "viewer" && tenNguoiMua && sdtNguoiMua
        ? { ten: tenNguoiMua, sdt: sdtNguoiMua, shareLinkId: session.shareLinkId }
        : null;
    const { data: daGhi, error: insertError } = await ghiDongMoiMua(
      admin,
      session.galleryId,
      dongDeGhi,
      nguoiMuaDeGhi,
    );

    if (insertError) throw insertError;

    // 6. Nhật ký nội bộ — không chặn phản hồi nếu ghi hụt.
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: session.role === "viewer" ? "Viewer" : "Customer",
      action: "mua_them.yeu_cau",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        soDong: dongDeGhi.length,
        sanPham: dongDeGhi.map((d) => d.productId),
        // Không ghi cả SĐT trần vào nhật ký nội bộ — che giữa cùng luật Lark.
        nguoiMua: nguoiMuaDeGhi
          ? { ten: nguoiMuaDeGhi.ten, sdtChe: cheSoDienThoai(nguoiMuaDeGhi.sdt) }
          : null,
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    // 6b. Nhãn của link viewer ("Bà nội"…) — chỉ để CSKH biết ai đã gửi qua
    // Lark. Đọc hụt thì bỏ qua, không chặn phản hồi.
    let nhanLinkNguoiMua: string | null = null;
    if (nguoiMuaDeGhi) {
      const { data: linkRow } = await admin
        .from("share_links")
        .select("label")
        .eq("id", nguoiMuaDeGhi.shareLinkId)
        .maybeSingle();
      nhanLinkNguoiMua = (linkRow?.label as string | null) ?? null;
    }

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
        // BB-254 — chỉ có khi gửi từ link ông bà/người thân. Khoá đặt tên
        // tránh mọi chữ khớp `/(photo|image|anh|thumb|url|src|href|drive)/i`
        // (locBoAnh() cắt theo TÊN KHOÁ, không phải theo giá trị) — "nguoiMua"
        // và "soLienHe" đều không dính bẫy "anh" như `danhSach`/`thanhTien`.
        nhanNguoiMua: nguoiMuaDeGhi ? nhanLinkNguoiMua : null,
        nguoiMuaTen: nguoiMuaDeGhi?.ten ?? null,
        soLienHeNguoiMua: nguoiMuaDeGhi ? cheSoDienThoai(nguoiMuaDeGhi.sdt) : null,
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
