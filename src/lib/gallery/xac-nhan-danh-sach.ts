/**
 * BB-349 — xác nhận danh sách ảnh (khoá bộ ảnh) dùng chung cho:
 *   · `POST /api/admin/galleries/[id]/confirm`                     (BB-114, đợt 1);
 *   · `POST /api/admin/galleries/[id]/dot-chon/[soDot]/xac-nhan`   (BB-321, đợt mua thêm);
 *   · `POST /api/admin/galleries/[id]/payments` khi CSKH tick
 *     "Đồng thời xác nhận danh sách và khoá bộ ảnh".
 *
 * Không phải luồng khoá mới: đây là ĐÚNG phần thân của hai route xác nhận cũ, tách
 * ra để route thu tiền gọi lại, không chép một bản thứ hai dễ lệch luật.
 *
 * Ca thật anh gặp (HD_20260926#5299, 01/10/2026): khách chốt 08:17 → CSKH xác nhận
 * 08:23 → CSKH mở lại 08:25 theo lời khách → khách sửa tiếp, CHƯA gửi lại → 11:14
 * CSKH xác nhận thu 100.000 theo danh sách 08:17. Thu tiền chỉ ghi sổ, bộ ảnh
 * vẫn mở. Anh chốt: thu tiền được kèm xác nhận + khoá trong cùng một bước, và
 * phải cảnh báo rõ khi khách đang sửa dở.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { layCacDot } from "@/lib/gallery/dot-chon-server";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { LOAI_DA_BAO } from "@/lib/thong-bao/moc-khach";
import type { KhoaKhiThu } from "@/lib/gallery/khoa-khi-thu";
export { CAU_KHACH_DANG_SUA, type KhoaKhiThu } from "@/lib/gallery/khoa-khi-thu";

export interface NguoiXacNhan {
  staffId: string;
  role: string;
}

export const KHONG_KHOA: KhoaKhiThu = { coTheKhoa: false, dangMoLai: false, soDot: null };

/**
 * Đọc trạng thái khoá của một bộ ảnh cho khối thu tiền.
 *
 *   1. Bộ `submitted` → khách đã gửi danh sách đợt 1, chưa ai xác nhận → khoá được.
 *   2. Bộ `in_review` có `reopened_at` và lượt chọn chính đã từng chốt TRƯỚC lúc mở
 *      lại → khách đang sửa lại, chưa gửi lại → khoá được NHƯNG phải cảnh báo.
 *   3. Một đợt mua thêm `cho_xac_nhan` → khoá (xác nhận) đợt đó.
 *   4. Một đợt mua thêm `da_mo_lai` (khách đang sửa đợt đó) → chỉ cảnh báo, không
 *      khoá: đợt đã trả về cho khách, không còn danh sách nào để xác nhận.
 */
export async function layKhoaKhiThu(admin: SupabaseClient, galleryId: string): Promise<KhoaKhiThu> {
  const [{ data: g, error: eg }, { data: sel, error: es }] = await Promise.all([
    admin.from("galleries").select("status, reopened_at").eq("id", galleryId).maybeSingle(),
    admin.from("selections").select("submitted_at").eq("gallery_id", galleryId).eq("is_primary", true).maybeSingle(),
  ]);
  if (eg) throw eg;
  if (es) throw es;
  if (!g) return KHONG_KHOA;

  if (g.status === "submitted") return { coTheKhoa: true, dangMoLai: false, soDot: 1 };

  const moLaiLuc = g.reopened_at ? Date.parse(String(g.reopened_at)) : NaN;
  const chotLuc = sel?.submitted_at ? Date.parse(String(sel.submitted_at)) : NaN;
  if (g.status === "in_review" && Number.isFinite(moLaiLuc) && Number.isFinite(chotLuc) && chotLuc < moLaiLuc) {
    return { coTheKhoa: true, dangMoLai: true, soDot: 1 };
  }

  const cacDot = await layCacDot(admin, galleryId); // chưa áp 0077 → []
  const choXacNhan = cacDot.filter((d) => d.soDot >= 2 && d.trangThai === "cho_xac_nhan").sort((a, b) => a.soDot - b.soDot)[0];
  if (choXacNhan) return { coTheKhoa: true, dangMoLai: false, soDot: choXacNhan.soDot };
  if (cacDot.some((d) => d.soDot >= 2 && d.trangThai === "da_mo_lai")) {
    return { coTheKhoa: false, dangMoLai: true, soDot: null };
  }
  return KHONG_KHOA;
}

export type KetQuaXacNhan = { ok: true } | { ok: false; code: "INVALID_INPUT" | "CONFLICT" | "NOT_FOUND"; message: string };

/** Phần thân của `/confirm` (BB-114): `submitted` → `in_retouch`, nhật ký, tín hiệu tức thì. */
export async function xacNhanDot1(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string; staff: NguoiXacNhan },
): Promise<KetQuaXacNhan> {
  const now = new Date().toISOString();
  const { data: daSua, error } = await admin
    .from("galleries")
    .update({ status: "in_retouch", updated_at: now })
    .eq("id", p.galleryId)
    .eq("status", "submitted") // hàng rào: hai người bấm cùng lúc / trạng thái vừa đổi
    .select("id");
  if (error) throw error;
  if (!daSua || daSua.length === 0) {
    return { ok: false, code: "INVALID_INPUT", message: "Chỉ bộ ảnh khách đã chốt (submitted) mới xác nhận được" };
  }

  const { error: logErr } = await admin.from("activity_logs").insert({
    actor_type: "staff",
    actor_id: p.staff.staffId,
    actor_label: p.staff.role,
    action: "gallery.confirm_retouch",
    entity_type: "gallery",
    entity_id: p.galleryId,
    metadata: { fromStatus: "submitted", toStatus: "in_retouch", confirmedAt: now },
  });
  if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

  // BB-342: màn khách đang mở thấy "đã xác nhận" ngay; nhân viên khác thấy việc rời hàng đợi.
  await phatSuKienBoAnh({ galleryId: p.galleryId, branchId: p.branchId, loai: LOAI_TUC_THI.studioXacNhan });
  return { ok: true };
}

/** Phần thân của `dot-chon/[soDot]/xac-nhan` (BB-321), KHÔNG gửi tin cho khách (bên gọi tự gửi). */
export async function xacNhanDotMuaThem(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string; staff: NguoiXacNhan; dot: { id: string; soDot: number; soAnh: number; tong: number } },
): Promise<KetQuaXacNhan> {
  const bay = new Date().toISOString();
  const { data: daSua, error } = await admin
    .from("selection_rounds")
    .update({ trang_thai: "da_xac_nhan", confirmed_at: bay, confirmed_by: p.staff.staffId, updated_at: bay })
    .eq("id", p.dot.id)
    .eq("trang_thai", "cho_xac_nhan") // hàng rào chống hai người bấm cùng lúc
    .select("id");
  if (error) throw error;
  if (!daSua || daSua.length === 0) {
    return { ok: false, code: "CONFLICT", message: `Đợt ${p.dot.soDot} vừa được xử lý bởi người khác` };
  }
  await ghiNhatKy({
    actorType: "staff",
    actorId: p.staff.staffId,
    branchId: p.branchId,
    action: "selection.round_confirm",
    entityType: "gallery",
    entityId: p.galleryId,
    galleryId: p.galleryId,
    metadata: { soDot: p.dot.soDot, soAnh: p.dot.soAnh, tong: p.dot.tong },
  });
  // BB-342: màn khách khoá đợt ngay, không F5.
  await phatSuKienBoAnh({ galleryId: p.galleryId, branchId: p.branchId, loai: LOAI_TUC_THI.studioXacNhan });
  return { ok: true };
}

/**
 * Bộ đang mở lại mà CSKH vẫn chọn xác nhận + khoá: CHỐT THAY KHÁCH theo danh sách
 * khách ĐANG chọn ngay lúc này (không phải danh sách lần gửi trước).
 *
 * Vì sao "hiện tại": danh sách ảnh (`selection_items`) được sửa tại chỗ — sau khi
 * mở lại, danh sách lần gửi trước KHÔNG còn lưu ở đâu cả, chỉ còn mấy con số
 * snapshot. Khoá "theo danh sách cũ" nghĩa là khoá một danh sách không tồn tại;
 * thợ chỉnh ảnh sẽ làm theo những tấm khách đang chọn. Nên chụp lại số liệu
 * theo đúng những tấm đó: số ảnh vượt và tiền phát sinh tính lại theo hạn mức
 * hiện tại — khách chọn thêm thì số còn phải thu tăng lên (không mất doanh thu),
 * chọn bớt thì giảm đi (không thu oan). Người xác nhận ghi là CSKH.
 */
export async function chotThayKhachTheoDanhSachHienTai(
  admin: SupabaseClient,
  p: { galleryId: string; staffLabel: string },
): Promise<void> {
  const [{ data: g, error: eg }, { data: sel, error: es }, { data: hm, error: eh }] = await Promise.all([
    admin.from("galleries").select("extra_photo_price").eq("id", p.galleryId).single(),
    admin.from("selections").select("id").eq("gallery_id", p.galleryId).eq("is_primary", true).single(),
    admin.rpc("gallery_quota", { p_gallery_id: p.galleryId }),
  ]);
  if (eg) throw eg;
  if (es) throw es;
  if (eh) throw eh;
  const { count, error: ec } = await admin
    .from("selection_items")
    .select("*", { count: "exact", head: true })
    .eq("selection_id", sel.id)
    .eq("mark", "selected");
  if (ec) throw ec;
  const daChon = count ?? 0;
  const hanMuc = hm === null || hm === undefined ? null : Number(hm);
  const vuot = hanMuc === null ? 0 : Math.max(0, daChon - hanMuc);
  const bay = new Date().toISOString();

  const { error: eSel } = await admin
    .from("selections")
    .update({
      submitted_at: bay,
      submitted_by_name: p.staffLabel,
      snapshot_selected_count: daChon,
      snapshot_extra_count: vuot,
      snapshot_extra_amount: vuot * Number(g.extra_photo_price ?? 0),
      updated_at: bay,
    })
    .eq("id", sel.id);
  if (eSel) throw eSel;
  const { error: eGal } = await admin
    .from("galleries")
    .update({
      status: "submitted",
      submitted_at: bay,
      ...(hanMuc !== null ? { included_quota: hanMuc } : {}),
      updated_at: bay,
    })
    .eq("id", p.galleryId)
    .eq("status", "in_review");
  if (eGal) throw eGal;
}

/** Câu Bean báo ba mẹ sau khi thu tiền (BB-349). */
export const TIN_THANH_TOAN = {
  xacNhan: {
    tieuDe: "Bean đã nhận thanh toán và xác nhận danh sách ảnh của ba mẹ ạ!",
    noiDung: "Danh sách ảnh đã được khoá, Bean sẽ xếp lịch chỉnh sửa cho bé ạ.",
    loai: "da_xac_nhan_danh_sach",
  },
  chiThanhToan: {
    tieuDe: "Bean đã nhận thanh toán của ba mẹ ạ!",
    noiDung: "Bean cảm ơn ba mẹ, khoản thanh toán đã được ghi nhận ạ.",
    loai: "da_nhan_thanh_toan",
  },
} as const;

/**
 * Gửi tin cho khách sau khi thu: đã khoá thì "nhận thanh toán + xác nhận danh sách"
 * — trừ khi tin xác nhận danh sách ĐÃ gửi rồi (cùng khoá chống lặp với BB-347:
 * `thong_bao_khach.loai` thuộc `LOAI_DA_BAO.da_xac_nhan_danh_sach`), khi đó chỉ báo
 * đã nhận thanh toán. Không khoá thì chỉ báo đã nhận thanh toán.
 * Đọc bảng hỏng → coi như đã báo (thà lỡ một tin còn hơn báo lặp), cùng luật BB-347.
 */
export async function baoKhachSauThanhToan(
  admin: SupabaseClient,
  galleryId: string,
  daKhoa: boolean,
): Promise<"xac_nhan" | "thanh_toan"> {
  let daBaoXacNhan = true;
  if (daKhoa) {
    const { data, error } = await admin
      .from("thong_bao_khach")
      .select("id")
      .eq("gallery_id", galleryId)
      .in("loai", LOAI_DA_BAO.da_xac_nhan_danh_sach)
      .limit(1);
    if (error) console.error(JSON.stringify({ evt: "bb349.kiem_da_bao_loi", galleryId, loi: error.message }));
    else daBaoXacNhan = (data ?? []).length > 0;
  }
  const loai = daKhoa && !daBaoXacNhan ? "xac_nhan" : "thanh_toan";
  const tin = loai === "xac_nhan" ? TIN_THANH_TOAN.xacNhan : TIN_THANH_TOAN.chiThanhToan;
  await guiThongBaoBoAnh(admin, galleryId, { tieuDe: tin.tieuDe, noiDung: tin.noiDung, loai: tin.loai });
  return loai;
}
