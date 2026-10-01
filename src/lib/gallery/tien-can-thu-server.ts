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
 *   · đợt mua thêm       = `selection_rounds` đợt ≥ 2 đang `da_xac_nhan`;
 *   · BB-348: dòng hạn mức do thanh toán (`han-muc-thanh-toan.ts`) — cộng lại giá trị
 *     của chúng để tăng hạn mức không làm số tiền bị trừ hai lần.
 * Chưa áp migration 0077 (không có bảng đợt) thì đợt mua thêm = 0, không hỏng.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tienCanThuCuaBo, tienVuotHanMucConPhaiThu } from "@/lib/gallery/tien-phat-sinh";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";
import { layDongThanhToanTheoBo, tinhTienQuyDoi } from "@/lib/gallery/han-muc-thanh-toan";

export interface TienCanThuBo {
  /** Số còn phải thu — 0 nghĩa là chưa phát sinh (hoặc đã thu đủ): khối thanh toán không bấm được. */
  tienCanThu: number;
  tienLucChot: number;
  tienTheoAnh: number;
  tienDotMuaThem: number;
  daGhiCo: number;
  /** BB-348 — số ảnh vượt CHƯA thu theo hạn mức hiện tại (`v_over_quota_unbilled.unbilled_count`). */
  anhVuotChuaThu: number;
  /** BB-348 — tổng số ảnh hạn mức đã tăng do thanh toán. */
  soAnhQuyDoi: number;
  /** BB-348 — phần VƯỢT HẠN MỨC còn phải thu (không kể đợt mua thêm), sau mọi khoản ghi có. */
  conThieuVuot: number;
  /** BB-348 — giá một ảnh vượt: theo lúc chốt khi có, không thì giá ảnh thêm hiện tại. */
  giaMotAnh: number;
}

export async function layTienCanThu(admin: SupabaseClient, galleryId: string): Promise<TienCanThuBo> {
  const [sel, pay, theoAnh, dot, bo, dongTT] = await Promise.all([
    admin
      .from("selections")
      .select("snapshot_extra_amount, snapshot_extra_count, submitted_at")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle(),
    admin.from("gallery_payments").select("amount").eq("gallery_id", galleryId),
    admin.from("v_over_quota_unbilled").select("unbilled_amount, unbilled_count").eq("gallery_id", galleryId).maybeSingle(),
    admin
      .from("selection_rounds")
      .select("tien_anh, tien_san_pham")
      .eq("gallery_id", galleryId)
      .eq("trang_thai", "da_xac_nhan")
      .gte("so_dot", 2),
    admin.from("galleries").select("extra_photo_price").eq("id", galleryId).maybeSingle(),
    layDongThanhToanTheoBo(admin, [galleryId]),
  ]);
  if (sel.error) throw sel.error;
  if (pay.error) throw pay.error;
  if (theoAnh.error) throw theoAnh.error;
  if (dot.error && !laLoiChuaApMigration(dot.error)) throw dot.error;
  if (bo.error) throw bo.error;

  const luot = sel.data as {
    snapshot_extra_amount: number | string | null;
    snapshot_extra_count: number | null;
    submitted_at: string | null;
  } | null;
  const tienLucChot = Number(luot?.snapshot_extra_amount ?? 0);
  const vRow = theoAnh.data as { unbilled_amount: number | string | null; unbilled_count: number | null } | null;
  const tienTheoAnh = Number(vRow?.unbilled_amount ?? 0);
  const anhVuotChuaThu = Number(vRow?.unbilled_count ?? 0);
  const daGhiCo = ((pay.data ?? []) as { amount: number | string }[]).reduce((t, r) => t + Number(r.amount), 0);
  const tienDotMuaThem = dot.error
    ? 0
    : ((dot.data ?? []) as { tien_anh: number | string | null; tien_san_pham: number | string | null }[]).reduce(
        (t, r) => t + Number(r.tien_anh ?? 0) + Number(r.tien_san_pham ?? 0),
        0,
      );
  const giaAnhHienTai = Number((bo.data as { extra_photo_price: number | string | null } | null)?.extra_photo_price ?? 0);
  const quyDoi = tinhTienQuyDoi(dongTT.get(galleryId) ?? [], giaAnhHienTai, luot?.submitted_at);
  const soAnhLucChot = Number(luot?.snapshot_extra_count ?? 0);
  const giaMotAnh = tienLucChot > 0 && soAnhLucChot > 0 ? tienLucChot / soAnhLucChot : giaAnhHienTai;

  return {
    tienCanThu: tienCanThuCuaBo({ tienTheoAnh, tienLucChot, tienDotMuaThem, daGhiCo, quyDoi }),
    tienLucChot,
    tienTheoAnh,
    tienDotMuaThem,
    daGhiCo,
    anhVuotChuaThu,
    soAnhQuyDoi: quyDoi.soAnh,
    conThieuVuot: tienVuotHanMucConPhaiThu({ tienTheoAnh, tienLucChot, daGhiCo, quyDoi }),
    giaMotAnh,
  };
}
