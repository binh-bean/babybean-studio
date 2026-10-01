/**
 * BB-344 — đọc số TIỀN CÒN PHẢI THU của một bộ ảnh (phía máy chủ). Một nguồn cho
 * `GET /api/admin/galleries/[id]/items` (khối "Xác nhận thanh toán" bấm được hay
 * không) và `POST /api/admin/galleries/[id]/payments` (có nhận dòng tiền không).
 *
 * Công thức thuần ở `tienCanThuCuaBo` (tien-phat-sinh.ts); tệp này chỉ gom nguyên
 * liệu từ cơ sở dữ liệu, cùng các nguồn mà báo cáo `over-quota` đọc:
 *   · số lúc khách chốt  = `selections.snapshot_extra_amount` (lượt chọn chính);
 *   · số theo ảnh        = `v_over_quota_unbilled.unbilled_amount` (không có dòng = 0);
 *   · đã ghi có          = tổng `gallery_payments.amount` (thu + giảm giá);
 *   · đợt mua thêm       = `selection_rounds` đợt ≥ 2 đang `da_xac_nhan`.
 * Chưa áp migration 0077 (không có bảng đợt) thì đợt mua thêm = 0, không hỏng.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tienCanThuCuaBo } from "@/lib/gallery/tien-phat-sinh";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";

export interface TienCanThuBo {
  /** Số còn phải thu — 0 nghĩa là chưa phát sinh (hoặc đã thu đủ): khối thanh toán không bấm được. */
  tienCanThu: number;
  tienLucChot: number;
  tienTheoAnh: number;
  tienDotMuaThem: number;
  daGhiCo: number;
}

export async function layTienCanThu(admin: SupabaseClient, galleryId: string): Promise<TienCanThuBo> {
  const [sel, pay, theoAnh, dot] = await Promise.all([
    admin
      .from("selections")
      .select("snapshot_extra_amount")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle(),
    admin.from("gallery_payments").select("amount").eq("gallery_id", galleryId),
    admin.from("v_over_quota_unbilled").select("unbilled_amount").eq("gallery_id", galleryId).maybeSingle(),
    admin
      .from("selection_rounds")
      .select("tien_anh, tien_san_pham")
      .eq("gallery_id", galleryId)
      .eq("trang_thai", "da_xac_nhan")
      .gte("so_dot", 2),
  ]);
  if (sel.error) throw sel.error;
  if (pay.error) throw pay.error;
  if (theoAnh.error) throw theoAnh.error;
  if (dot.error && !laLoiChuaApMigration(dot.error)) throw dot.error;

  const tienLucChot = Number((sel.data as { snapshot_extra_amount: number | string | null } | null)?.snapshot_extra_amount ?? 0);
  const tienTheoAnh = Number((theoAnh.data as { unbilled_amount: number | string | null } | null)?.unbilled_amount ?? 0);
  const daGhiCo = ((pay.data ?? []) as { amount: number | string }[]).reduce((t, r) => t + Number(r.amount), 0);
  const tienDotMuaThem = dot.error
    ? 0
    : ((dot.data ?? []) as { tien_anh: number | string | null; tien_san_pham: number | string | null }[]).reduce(
        (t, r) => t + Number(r.tien_anh ?? 0) + Number(r.tien_san_pham ?? 0),
        0,
      );

  return {
    tienCanThu: tienCanThuCuaBo({ tienTheoAnh, tienLucChot, tienDotMuaThem, daGhiCo }),
    tienLucChot,
    tienTheoAnh,
    tienDotMuaThem,
    daGhiCo,
  };
}
