/**
 * POST /api/g/addons — Khách bấm mua thêm sản phẩm trong lúc chọn ảnh.
 *
 * OWNER: DEV-BE. Task BB-105.
 *
 * Ba luật về tiền:
 * 1. Đơn giá CHỐT lúc bấm mua, chép từ products.list_price vào selection_addons.unit_price.
 * 2. CHỈ bán khi giá qua luật dùng chung `giaDuocBaoTuDong` (BB-335 — xem
 *    src/lib/products/kich-thuoc-dang-ban.ts; thay ngưỡng cũ 0.8 / 5 mẫu).
 * 3. list_price null thì KHÔNG bán.
 */

import { vi } from "@/i18n";
import { isGalleryLocked } from "@/lib/gallery-status";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAddonSchema } from "./schema";
import { nhomSanPham, canGanAnh, sanPhamBanChoKhach } from "@/lib/products/nhom-san-pham";
import { giaDuocBaoTuDong } from "@/lib/products/kich-thuoc-dang-ban";
import { batBuocChonAnh, kiemKhungGanIn, LOI_KHUNG } from "@/lib/products/khung-gan-anh-in";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BB-398 — số khung gắn một dòng in không vượt số lượng in: giảm số in thì kẹp khung gắn theo
 * xuống bằng số in (bỏ hẳn dòng in thì khoá ngoại 0104 `on delete cascade` tự xoá khung).
 */
async function kepKhungTheoDongIn(admin: SupabaseClient, idDongIn: string, soLuongIn: number): Promise<void> {
  const { error } = await admin
    .from("selection_addons")
    .update({ quantity: soLuongIn })
    .eq("gan_voi_addon_id", idDongIn)
    .gt("quantity", soLuongIn);
  if (error) throw error;
}

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate customer session
    const session = await requirePhienBoAnh(request);

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người xem không có quyền mua thêm sản phẩm");
    }

    // 2. Parse & validate JSON input
    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateAddonSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    // 3. Check gallery lock status
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    // Danh sách chép tay ở đây từng thiếu 'awaiting_approval' và 'approved':
    // khách đang chờ duyệt ảnh đã chỉnh vẫn gọi được route này, đẩy bộ ảnh
    // ngược về 'submitted' và xoá mất giai đoạn chỉnh ảnh. Dùng chung
    // @/lib/gallery-status, khớp app.gallery_is_locked() bên SQL.
    if (isGalleryLocked(gallery.status)) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã chốt hoặc đã khoá, không thể mua thêm");
    }

    // 4. Verify product & price rules
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id, name, kind, material, size, list_price, price_confidence, price_samples, is_active")
      .eq("id", input.productId)
      .single();

    if (productError || !product || !product.is_active) {
      return fail("NOT_FOUND", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh");
    }

    // BB-288: chỉ bán 3 nhóm ảnh in/album/khung, và loại thêm canvas — cùng
    // luật dùng để dựng `catalogue` ở /api/g/gallery (xem nhom-san-pham.ts).
    // Không tin danh mục hiển thị: một productId hợp lệ nhưng ngoài danh mục
    // (vd. canvas, hoặc kind dịch vụ kèm buổi chụp) bị chặn ngay ở đây.
    if (!sanPhamBanChoKhach({ name: product.name, isActive: product.is_active, kind: product.kind, material: product.material, size: product.size })) {
      return fail("NOT_FOUND", "Sản phẩm không nằm trong danh mục đang bán");
    }

    // Luật 3: list_price null thì KHÔNG bán
    if (product.list_price === null || product.list_price === undefined) {
      return fail("INVALID_INPUT", "Sản phẩm chưa có đơn giá niêm yết, vui lòng liên hệ CSKH");
    }

    // Luật 2 (BB-335): cùng luật giá với danh mục của /api/g/gallery.
    if (!giaDuocBaoTuDong(product)) {
      return fail(
        "INVALID_INPUT",
        "Sản phẩm chưa đủ độ tin cậy về giá, CSKH sẽ báo giá trực tiếp"
      );
    }

    /**
     * Luật 5 (BB-105 + quyết định 22/09/2026): sản phẩm in phải GẮN VÀO ẢNH.
     *
     * Kiểm ba điều, mỗi điều chặn một kiểu sai khác nhau:
     *
     *  1. Nhóm cần gắn ảnh mà không gửi ảnh -> từ chối. Thợ in sẽ không biết
     *     in tấm nào.
     *  2. Ảnh phải thuộc ĐÚNG bộ ảnh này. Thiếu vế đó thì đoán một id ảnh bất
     *     kỳ là đặt in ảnh của nhà khác.
     *  3. Ảnh phải nằm trong danh sách ba mẹ ĐÃ CHỌN. Mua in một tấm không
     *     chọn nghĩa là tấm đó không có trong đơn giao, và thợ chỉnh ảnh cũng
     *     không chỉnh nó.
     */
    const nhom = nhomSanPham(product.kind, product.material);
    const photoId = input.photoId ?? null;

    // Đơn giá chốt lúc bấm mua — dùng chung cho cả nhánh đơn và nhánh batch.
    const unitPrice = Number(product.list_price);

    /**
     * BB-279 — NHÁNH BATCH: cửa hàng chọn nhiều tấm cùng lúc, ghi một dòng
     * `selection_addons` cho MỖI tấm với cùng `quantity`.
     *
     * Ba ràng buộc giữ nguyên tinh thần luật 5 ở nhánh đơn bên dưới, chỉ khác
     * là kiểm THEO LÔ thay vì từng ảnh một:
     *  1. Nhóm không gắn ảnh (album) thì không dùng nhánh này.
     *  2. Mọi photoId phải thuộc ĐÚNG bộ ảnh của phiên — chặn IDOR kiểu
     *     BB-276 (ảnh của bộ khác lẫn vào request).
     *  3. Mọi photoId phải nằm trong danh sách phiên ĐÃ CHỌN (mark='selected').
     * Trượt điều nào của MỘT ảnh trong lô -> từ chối CẢ LÔ, không âm thầm bỏ
     * qua ảnh sai — ba mẹ cần biết chính xác ảnh nào bị từ chối để sửa.
     */
    if (input.photoIds && input.photoIds.length > 0) {
      if (!canGanAnh(nhom)) {
        return fail(
          "INVALID_INPUT",
          "Sản phẩm này không gắn vào một tấm ảnh cụ thể, không đặt theo nhiều tấm được",
        );
      }

      const idsYeuCau = Array.from(new Set(input.photoIds));

      const { data: anhHopLe, error: anhErr } = await admin
        .from("photos")
        .select("id")
        .eq("gallery_id", session.galleryId)
        .in("id", idsYeuCau);
      if (anhErr) throw anhErr;
      const idThuocBoNay = new Set((anhHopLe ?? []).map((r) => r.id as string));

      const { data: daChonRows, error: chonErr } = await admin
        .from("selection_items")
        .select("photo_id")
        .eq("selection_id", session.selectionId)
        .eq("mark", "selected")
        .in("photo_id", idsYeuCau);
      if (chonErr) throw chonErr;
      const idDaChon = new Set((daChonRows ?? []).map((r) => r.photo_id as string));

      const idBiTuChoi = idsYeuCau.filter((id) => !idThuocBoNay.has(id) || !idDaChon.has(id));
      if (idBiTuChoi.length > 0) {
        return fail(
          "INVALID_INPUT",
          "Một số ảnh không thuộc bộ ảnh này hoặc chưa được ba mẹ chọn",
          { photoIds: idBiTuChoi },
        );
      }

      interface DongMuaThemBatch {
        id: string;
        selection_id: string;
        product_id: string;
        photo_id: string | null;
        quantity: number;
        unit_price: number;
        created_at: string;
      }
      const ketQua: DongMuaThemBatch[] = [];

      for (const photoIdLo of idsYeuCau) {
        if (input.quantity === 0) {
          const { error: delErr } = await admin
            .from("selection_addons")
            .delete()
            .eq("selection_id", session.selectionId)
            .eq("product_id", product.id)
            .eq("photo_id", photoIdLo)
            // BB-398 — chỉ dòng KHÔNG gắn in (khung gắn dòng in đi đường `ganVoiAddonId`).
            .is("gan_voi_addon_id", null);
          if (delErr) throw delErr;
          continue;
        }

        // TÌM RỒI SỬA — lý do giống hệt nhánh đơn bên dưới: chỉ mục một phần
        // của 0061 không khớp cú pháp `on conflict` của supabase-js.
        const { data: dongCu } = await admin
          .from("selection_addons")
          .select("id")
          .eq("selection_id", session.selectionId)
          .eq("product_id", product.id)
          .eq("photo_id", photoIdLo)
          .is("gan_voi_addon_id", null)
          .maybeSingle();

        const ghi = dongCu
          ? admin
              .from("selection_addons")
              .update({ quantity: input.quantity, unit_price: unitPrice })
              .eq("id", dongCu.id)
          : admin.from("selection_addons").insert({
              selection_id: session.selectionId,
              product_id: product.id,
              photo_id: photoIdLo,
              quantity: input.quantity,
              unit_price: unitPrice,
            });

        const { data, error: ghiErr } = await ghi
          .select("id, selection_id, product_id, photo_id, quantity, unit_price, created_at")
          .single();
        if (ghiErr || !data) throw ghiErr || new Error("Không lưu được sản phẩm mua thêm (batch)");
        if (dongCu && nhom === "anh_in") await kepKhungTheoDongIn(admin, (data as { id: string }).id, input.quantity);
        ketQua.push(data as unknown as DongMuaThemBatch);
      }

      const { data: allAddonsBatch, error: sumErrorBatch } = await admin
        .from("selection_addons")
        .select("quantity, unit_price")
        .eq("selection_id", session.selectionId);
      if (sumErrorBatch) throw sumErrorBatch;

      const totalAddonsAmountBatch = (allAddonsBatch || []).reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0,
      );

      const { error: logErrBatch } = await admin.from("activity_logs").insert({
        actor_type: "customer",
        actor_id: session.selectionId,
        actor_label: "Customer",
        action: input.quantity === 0 ? "addon.batch_remove" : "addon.batch_set",
        entity_type: "gallery",
        entity_id: session.galleryId,
        metadata: {
          productId: product.id,
          productName: product.name,
          photoIds: idsYeuCau,
          quantity: input.quantity,
          unitPrice,
        },
      });
      if (logErrBatch) console.error("[activity_logs] Ghi hụt:", logErrBatch);

      return NextResponse.json(
        {
          data: {
            addons: ketQua.map((a) => ({
              id: a.id,
              selectionId: a.selection_id,
              productId: a.product_id,
              productName: product.name,
              material: product.material,
              size: product.size,
              photoId: a.photo_id,
              quantity: a.quantity,
              unitPrice,
              totalPrice: unitPrice * a.quantity,
              createdAt: a.created_at,
            })),
            totalAddonsAmount: totalAddonsAmountBatch,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    /**
     * BB-398 — KHUNG GẮN DÒNG IN ("Đóng khung ảnh đã đặt in"). Máy chủ kiểm lại mọi
     * luật (`kiemKhungGanIn`): dòng in cùng lượt chọn, là ẢNH IN, không UV, khổ khung =
     * khổ in, số khung ≤ số in. Ảnh của dòng khung LẤY TỪ dòng in, không tin client.
     */
    if (input.ganVoiAddonId) {
      if (input.photoIds && input.photoIds.length > 0) {
        return fail("INVALID_INPUT", "Khung gắn dòng in không đặt theo nhiều tấm được");
      }
      const { data: dongInRow, error: dongInErr } = await admin
        .from("selection_addons")
        .select("id, selection_id, photo_id, quantity, dot, gan_voi_addon_id, product:products (kind, material, size)")
        .eq("id", input.ganVoiAddonId)
        .maybeSingle();
      if (dongInErr) throw dongInErr;
      const spIn = dongInRow
        ? ((Array.isArray(dongInRow.product) ? dongInRow.product[0] : dongInRow.product) as
            | { kind: string | null; material: string | null; size: string | null }
            | null)
        : null;
      // BB-398 vòng 3 — route này ghi lượt chọn gốc (đợt 1). Khung gắn cùng dòng in ở ĐỢT KHÁC
      // (đợt mua thêm) vẫn tính vào trần "số khung ≤ số in".
      const { data: khungDotKhac, error: eDotKhac } = await admin
        .from("selection_addons")
        .select("quantity")
        .eq("gan_voi_addon_id", input.ganVoiAddonId)
        .neq("dot", 1);
      if (eDotKhac) throw eDotKhac;
      const soKhungDotKhac = (khungDotKhac ?? []).reduce((t, r) => t + Number(r.quantity), 0);
      const kq = kiemKhungGanIn({
        selectionId: session.selectionId,
        sanPhamKhung: { kind: product.kind, material: product.material, size: product.size },
        dongIn:
          dongInRow && spIn && !dongInRow.gan_voi_addon_id
            ? {
                id: dongInRow.id as string,
                selectionId: dongInRow.selection_id as string,
                photoId: (dongInRow.photo_id as string | null) ?? null,
                quantity: Number(dongInRow.quantity),
                sanPham: spIn,
              }
            : null,
        soLuong: input.quantity === 0 ? 0 : input.quantity + soKhungDotKhac,
      });
      if (!kq.ok) {
        return fail(
          kq.lyDo === "khong_thay_dong_in" || kq.lyDo === "khac_luot_chon" ? "NOT_FOUND" : "INVALID_INPUT",
          LOI_KHUNG[kq.lyDo],
        );
      }
      const idDongIn = dongInRow!.id as string;

      interface DongKhungGan {
        id: string;
        selection_id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        created_at: string;
      }
      let addonKhung: DongKhungGan | null = null;
      if (input.quantity === 0) {
        const { error: delErr } = await admin
          .from("selection_addons")
          .delete()
          .eq("selection_id", session.selectionId)
          .eq("product_id", product.id)
          .eq("gan_voi_addon_id", idDongIn)
          .eq("dot", 1);
        if (delErr) throw delErr;
      } else {
        const { data: dongCu } = await admin
          .from("selection_addons")
          .select("id")
          .eq("selection_id", session.selectionId)
          .eq("product_id", product.id)
          .eq("gan_voi_addon_id", idDongIn)
          .eq("dot", 1)
          .maybeSingle();
        const ghi = dongCu
          ? admin
              .from("selection_addons")
              .update({ quantity: input.quantity, unit_price: unitPrice })
              .eq("id", dongCu.id)
          : admin.from("selection_addons").insert({
              selection_id: session.selectionId,
              product_id: product.id,
              photo_id: (dongInRow!.photo_id as string | null) ?? null,
              gan_voi_addon_id: idDongIn,
              dot: 1,
              quantity: input.quantity,
              unit_price: unitPrice,
            });
        const { data, error: ghiErr } = await ghi
          .select("id, selection_id, product_id, quantity, unit_price, created_at")
          .single();
        if (ghiErr || !data) throw ghiErr || new Error("Không lưu được khung gắn dòng in");
        addonKhung = data as unknown as DongKhungGan;
      }

      const { data: tatCaDong, error: sumErrKhung } = await admin
        .from("selection_addons")
        .select("quantity, unit_price")
        .eq("selection_id", session.selectionId);
      if (sumErrKhung) throw sumErrKhung;
      const tongKhung = (tatCaDong || []).reduce((t, r) => t + Number(r.unit_price) * r.quantity, 0);

      const { error: logErrKhung } = await admin.from("activity_logs").insert({
        actor_type: "customer",
        actor_id: session.selectionId,
        actor_label: "Customer",
        action: input.quantity === 0 ? "addon.khung_gan_in_remove" : "addon.khung_gan_in_set",
        entity_type: "gallery",
        entity_id: session.galleryId,
        metadata: {
          addonId: addonKhung?.id ?? null,
          productId: product.id,
          productName: product.name,
          ganVoiAddonId: idDongIn,
          quantity: input.quantity,
          unitPrice,
        },
      });
      if (logErrKhung) console.error("[activity_logs] Ghi hụt:", logErrKhung);

      return NextResponse.json(
        {
          data: {
            addon: addonKhung
              ? {
                  id: addonKhung.id,
                  selectionId: addonKhung.selection_id,
                  productId: addonKhung.product_id,
                  productName: product.name,
                  material: product.material,
                  size: product.size,
                  ganVoiAddonId: idDongIn,
                  quantity: addonKhung.quantity,
                  unitPrice,
                  totalPrice: unitPrice * addonKhung.quantity,
                  createdAt: addonKhung.created_at,
                }
              : null,
            totalAddonsAmount: tongKhung,
          },
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    // BB-398 — chỉ ẢNH IN bắt buộc ảnh; khung không ảnh là KHUNG LẺ (bán như cũ).
    if (batBuocChonAnh(nhom) && !photoId) {
      return fail("INVALID_INPUT", vi.gallery.loiBean.chonAnhCanIn);
    }

    if (photoId) {
      const { data: anh } = await admin
        .from("photos")
        .select("id")
        .eq("id", photoId)
        .eq("gallery_id", session.galleryId)
        .maybeSingle();
      if (!anh) return fail("NOT_FOUND", "Không tìm thấy tấm ảnh này trong bộ ảnh");

      const { data: daChon } = await admin
        .from("selection_items")
        .select("id")
        .eq("selection_id", session.selectionId)
        .eq("photo_id", photoId)
        .eq("mark", "selected")
        .maybeSingle();
      if (!daChon) {
        return fail("INVALID_INPUT", "Ba mẹ chọn tấm ảnh này trước rồi mới đặt in được");
      }
    }

    // Luật 1: Đơn giá chốt tại thời điểm mua (đã tính ở `unitPrice` phía trên,
    // dùng chung với nhánh batch).

    /**
     * 5. ĐẶT số lượng, không phải cộng dồn.
     *
     * `quantity = 0` là bỏ mua. Ràng buộc `uq_selection_addons_selection_product`
     * (migration 0059) bảo đảm một sản phẩm chỉ có một dòng, nên `upsert` ở đây
     * là sửa đúng dòng đó chứ không sinh dòng mới.
     *
     * Đơn giá vẫn CHỐT LẠI mỗi lần đặt, theo giá niêm yết lúc bấm — đúng luật 1
     * của BB-105. Ba mẹ đổi số lượng hôm sau mà studio vừa đổi giá thì giá mới
     * là giá áp dụng, và nó nằm ngay trên màn hình lúc họ bấm.
     */
    if (input.quantity === 0) {
      let xoa = admin
        .from("selection_addons")
        .delete()
        .eq("selection_id", session.selectionId)
        .eq("product_id", product.id);
      // Bỏ mua ĐÚNG dòng của tấm ảnh đó, không quét sạch mọi tấm cùng sản phẩm.
      xoa = photoId ? xoa.eq("photo_id", photoId) : xoa.is("photo_id", null);
      // BB-398 — khung gắn dòng in chỉ bỏ qua `ganVoiAddonId`, không bị quét theo ảnh.
      xoa = xoa.is("gan_voi_addon_id", null);
      const { error: delErr } = await xoa;
      if (delErr) throw delErr;
    }

    /*
      TÌM RỒI SỬA, không dùng `upsert`.

      Hai chỉ mục duy nhất của 0061 là chỉ mục TỪNG PHẦN (`where photo_id is
      not null` và `where photo_id is null`). Postgres đòi mệnh đề `where` đó
      phải nằm trong `on conflict`, mà supabase-js chỉ nhận danh sách cột —
      nên `upsert` trả thẳng 42P10 "there is no unique or exclusion constraint
      matching the ON CONFLICT specification". Đo thật 22/09/2026.

      Tốn thêm một lượt đọc, đổi lại đường ghi nói đúng điều nó làm.
    */
    interface DongMuaThem {
      id: string;
      selection_id: string;
      product_id: string;
      quantity: number;
      unit_price: number;
      created_at: string;
    }
    let addon: DongMuaThem | null = null;

    if (input.quantity > 0) {
      let timDong = admin
        .from("selection_addons")
        .select("id")
        .eq("selection_id", session.selectionId)
        .eq("product_id", product.id);
      timDong = photoId ? timDong.eq("photo_id", photoId) : timDong.is("photo_id", null);
      timDong = timDong.is("gan_voi_addon_id", null);
      const { data: dongCu } = await timDong.maybeSingle();

      const ghi = dongCu
        ? admin
            .from("selection_addons")
            .update({ quantity: input.quantity, unit_price: unitPrice })
            .eq("id", dongCu.id)
        : admin.from("selection_addons").insert({
            selection_id: session.selectionId,
            product_id: product.id,
            photo_id: photoId,
            quantity: input.quantity,
            unit_price: unitPrice,
          });

      const { data, error: ghiErr } = await ghi
        .select("id, selection_id, product_id, quantity, unit_price, created_at")
        .single();
      if (ghiErr || !data) throw ghiErr || new Error("Không lưu được sản phẩm mua thêm");
      addon = data as unknown as DongMuaThem;
      if (dongCu && nhom === "anh_in") await kepKhungTheoDongIn(admin, addon.id, input.quantity);
    }

    // 6. Calculate total addons amount for the current selection session
    const { data: allAddons, error: sumError } = await admin
      .from("selection_addons")
      .select("quantity, unit_price")
      .eq("selection_id", session.selectionId);

    if (sumError) {
      throw sumError;
    }

    const totalAddonsAmount = (allAddons || []).reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0
    );

    // 7. Log activity
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: input.quantity === 0 ? "addon.remove" : "addon.set",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        addonId: addon?.id ?? null,
        productId: product.id,
        productName: product.name,
        photoId,
        quantity: input.quantity,
        unitPrice,
        totalPrice: unitPrice * input.quantity,
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return NextResponse.json(
      {
        data: {
          addon: addon
            ? {
                id: addon.id,
                selectionId: addon.selection_id,
                productId: addon.product_id,
                productName: product.name,
                material: product.material,
                size: product.size,
                quantity: addon.quantity,
                unitPrice,
                totalPrice: unitPrice * addon.quantity,
                createdAt: addon.created_at,
              }
            : null,
          totalAddonsAmount,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
