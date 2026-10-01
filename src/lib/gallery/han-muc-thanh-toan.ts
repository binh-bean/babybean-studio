/**
 * BB-348 — CSKH xác nhận thanh toán ảnh vượt hạn mức thì HẠN MỨC TỰ TĂNG.
 *
 * Anh 01/10/2026: thu tiền xong mà hạn mức đứng yên, bộ ảnh vẫn báo "vượt" và các
 * con số không khớp nhau.
 *
 * ---------------------------------------------------------------------------
 * Cách làm: thêm MỘT DÒNG HỢP ĐỒNG, không sửa công thức hạn mức
 * ---------------------------------------------------------------------------
 * `app.gallery_quota()` = tổng `quantity` các dòng `gallery_items` có sản phẩm loại
 * `edited_photo`. Trả đủ N ảnh vượt → app thêm dòng "Edit file × N" (sản phẩm ảnh
 * chỉnh sửa của danh mục) vào bộ ảnh; hạn mức tăng N qua đúng công thức cũ.
 *
 * Dấu nguồn: `lark_record_id = 'thanh_toan:<id dòng sổ>'` (cột có sẵn, unique) và
 * `lark_contract_code = null`. Không cần migration, nên chạy được ngay trên bb-dev.
 *   · Kéo dòng hợp đồng từ Lark (`keoDongHopDongTuLark`, `sync-lark-contracts.mjs`)
 *     chỉ xoá dòng `lark_contract_code = <mã>` → KHÔNG đụng dòng này; dòng cha null
 *     nên cũng không bị xoá dây chuyền.
 *   · Không ghi gì sang Lark.
 *
 * ---------------------------------------------------------------------------
 * Không trừ hai lần
 * ---------------------------------------------------------------------------
 * Hạn mức tăng N thì "số theo ảnh" tự giảm N ảnh, trong khi tiền N ảnh vẫn nằm
 * trong sổ thu. Mọi chỗ tính tiền (`tienCanThuCuaBo`, báo cáo vượt hạn mức) CỘNG
 * LẠI giá trị các dòng này (`TienHanMucDaQuyDoi`) — nên tăng hạn mức không làm đổi
 * số tiền nào. Xem `tien-phat-sinh.ts`.
 *
 * ---------------------------------------------------------------------------
 * Đồng bộ theo MỤC TIÊU, gọi bao nhiêu lần cũng được
 * ---------------------------------------------------------------------------
 * Mỗi lần ghi sổ (thu, giảm giá, đính chính âm), tính lại tổng số ảnh đã trả đủ
 * (`soAnhHanMucTheoThanhToan`) rồi đưa các dòng do thanh toán về đúng tổng đó:
 * thiếu thì thêm một dòng, thừa (đính chính) thì bớt từ dòng mới nhất. Sổ tiền
 * vẫn chỉ ghi thêm; các dòng hạn mức này là số SUY RA từ sổ.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { soAnhHanMucTheoThanhToan, type TienHanMucDaQuyDoi } from "@/lib/gallery/tien-phat-sinh";

/** Tiền tố `gallery_items.lark_record_id` của dòng hạn mức do thanh toán. */
export const TIEN_TO_DONG_THANH_TOAN = "thanh_toan:";

export interface DongHanMucThanhToan {
  id: string;
  quantity: number;
  created_at: string;
}

export function laDongThanhToan(larkRecordId: string | null | undefined): boolean {
  return typeof larkRecordId === "string" && larkRecordId.startsWith(TIEN_TO_DONG_THANH_TOAN);
}

/** Các dòng hạn mức do thanh toán của nhiều bộ ảnh, theo id bộ. */
export async function layDongThanhToanTheoBo(
  admin: SupabaseClient,
  galleryIds: string[],
): Promise<Map<string, DongHanMucThanhToan[]>> {
  const theoBo = new Map<string, DongHanMucThanhToan[]>();
  if (galleryIds.length === 0) return theoBo;
  const { data, error } = await admin
    .from("gallery_items")
    .select("id, gallery_id, quantity, created_at")
    .in("gallery_id", galleryIds)
    .like("lark_record_id", `${TIEN_TO_DONG_THANH_TOAN}%`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  for (const r of (data ?? []) as { id: string; gallery_id: string; quantity: number; created_at: string }[]) {
    const ds = theoBo.get(String(r.gallery_id)) ?? [];
    ds.push({ id: String(r.id), quantity: Number(r.quantity), created_at: String(r.created_at) });
    theoBo.set(String(r.gallery_id), ds);
  }
  return theoBo;
}

/** Giá trị cần cộng lại (xem `TienHanMucDaQuyDoi`), tính theo giá ảnh thêm HIỆN TẠI. */
export function tinhTienQuyDoi(
  dong: readonly DongHanMucThanhToan[],
  giaAnhHienTai: number,
  luotChotLuc: string | null | undefined,
): TienHanMucDaQuyDoi & { soAnh: number } {
  const gia = Number.isFinite(giaAnhHienTai) ? Math.max(0, giaAnhHienTai) : 0;
  const mocChot = luotChotLuc ? Date.parse(luotChotLuc) : NaN;
  let soAnh = 0;
  let soAnhTruocChot = 0;
  for (const d of dong) {
    soAnh += d.quantity;
    if (Number.isFinite(mocChot) && Date.parse(d.created_at) < mocChot) soAnhTruocChot += d.quantity;
  }
  return { soAnh, tatCa: soAnh * gia, truocChot: soAnhTruocChot * gia };
}

export interface KetQuaDongBoHanMuc {
  /** Tổng số ảnh do thanh toán trước / sau lần đồng bộ này. */
  truoc: number;
  sau: number;
  /** Lý do không đổi được (vd bộ chưa có dòng hợp đồng nào), để ghi vào câu trả lời. */
  boQua?: "chua_co_dong_hop_dong" | "khong_co_san_pham_anh";
}

/** Sản phẩm "ảnh chỉnh sửa" của danh mục: ưu tiên sản phẩm có neo Lark đang kinh doanh. */
async function timSanPhamAnhChinh(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from("products")
    .select("id, lark_record_id, is_active, created_at")
    .eq("kind", "edited_photo")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ds = (data ?? []) as { id: string; lark_record_id: string | null }[];
  return (ds.find((p) => p.lark_record_id) ?? ds[0])?.id ?? null;
}

/**
 * Đưa hạn mức do thanh toán của một bộ về đúng số ảnh đã trả đủ. Gọi SAU khi đã ghi
 * dòng sổ. `paymentId` = dòng sổ vừa ghi (làm dấu nguồn cho dòng hạn mức mới).
 */
export async function dongBoHanMucTheoThanhToan(
  admin: SupabaseClient,
  p: { galleryId: string; paymentId: string; staffId: string; branchId: string | null },
): Promise<KetQuaDongBoHanMuc> {
  const { layTienCanThu } = await import("@/lib/gallery/tien-can-thu-server");
  const tien = await layTienCanThu(admin, p.galleryId);
  const truoc = tien.soAnhQuyDoi;

  const mucTieu = soAnhHanMucTheoThanhToan({
    anhVuotGoc: tien.anhVuotChuaThu + tien.soAnhQuyDoi,
    conThieuVuot: tien.conThieuVuot,
    giaMotAnh: tien.giaMotAnh,
  });
  if (mucTieu === truoc) return { truoc, sau: truoc };

  if (mucTieu > truoc) {
    // Bộ chưa có dòng hợp đồng nào thì hạn mức đang lấy từ `galleries.included_quota`;
    // thêm một dòng lúc này làm hạn mức NHẢY về đúng N — sai. Không đụng, để CSKH nhập tay.
    const { count, error: ec } = await admin
      .from("gallery_items")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", p.galleryId)
      .or(`lark_record_id.is.null,lark_record_id.not.like.${TIEN_TO_DONG_THANH_TOAN}*`);
    if (ec) throw ec;
    if ((count ?? 0) === 0) return { truoc, sau: truoc, boQua: "chua_co_dong_hop_dong" };

    const productId = await timSanPhamAnhChinh(admin);
    if (!productId) return { truoc, sau: truoc, boQua: "khong_co_san_pham_anh" };

    const { error } = await admin.from("gallery_items").insert({
      gallery_id: p.galleryId,
      product_id: productId,
      parent_item_id: null,
      quantity: mucTieu - truoc,
      unit_price: null,
      line_total: null,
      lark_contract_code: null,
      lark_record_id: `${TIEN_TO_DONG_THANH_TOAN}${p.paymentId}`,
    });
    if (error) throw error;
  } else {
    // Đính chính: bớt từ dòng MỚI NHẤT trở về trước.
    const dong = (await layDongThanhToanTheoBo(admin, [p.galleryId])).get(p.galleryId) ?? [];
    let canBot = truoc - mucTieu;
    for (const d of [...dong].reverse()) {
      if (canBot <= 0) break;
      if (d.quantity <= canBot) {
        const { error } = await admin.from("gallery_items").delete().eq("id", d.id);
        if (error) throw error;
        canBot -= d.quantity;
      } else {
        const { error } = await admin.from("gallery_items").update({ quantity: d.quantity - canBot }).eq("id", d.id);
        if (error) throw error;
        canBot = 0;
      }
    }
  }

  const { data: hm } = await admin.rpc("gallery_quota", { p_gallery_id: p.galleryId });
  // Nhật ký: "Hạn mức tăng N do thanh toán" (dịch ở src/lib/nhat-ky/dich-hoat-dong.ts).
  await ghiNhatKy({
    actorType: "staff",
    actorId: p.staffId,
    branchId: p.branchId,
    action: "gallery.quota_by_payment",
    entityType: "gallery",
    entityId: p.galleryId,
    galleryId: p.galleryId,
    metadata: { soAnh: mucTieu - truoc, tongDoThanhToan: mucTieu, hanMucSau: hm ?? null, paymentId: p.paymentId },
  });

  return { truoc, sau: mucTieu };
}
