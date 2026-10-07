/**
 * BB-387 — số ngày Bean ước tính gửi lại ảnh sau khi ba mẹ xin sửa.
 *
 * Anh 07/10: "không hứa cứng nhưng nêu khoảng" — lời Bean nói "trong khoảng {n}
 * ngày". Admin sửa ở Cài đặt (khoá `gallery.revision_days_estimate`), mặc định 3.
 *
 * Thiếu dòng / chưa áp migration 0101 / giá trị lạ (chữ, số lẻ, âm, quá trần) →
 * 3. Phần chuẩn hoá là HÀM THUẦN (`chuanHoaSoNgaySua`) để phép thử gọi thẳng; phần
 * đọc cài đặt đi theo khuôn `giaAnhChonThemMacDinh`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "@/i18n/vi";

export const KHOA_SO_NGAY_SUA = "gallery.revision_days_estimate";
export const SO_NGAY_SUA_MAC_DINH = 3;
export const SO_NGAY_SUA_TOI_DA = 30;

/** Số nguyên 1..30 thì giữ; còn lại về mặc định. */
export function chuanHoaSoNgaySua(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= SO_NGAY_SUA_TOI_DA ? v : SO_NGAY_SUA_MAC_DINH;
}

/** Câu Bean hẹn gửi lại: "…trong khoảng {n} ngày ạ." — n thiếu/lạ thì 3. Màn khách và khung thông tin dùng chung. */
export function cauHanSua(soNgay: unknown): string {
  return vi.gallery.anhChinh.hanSua.replace("{n}", String(chuanHoaSoNgaySua(soNgay)));
}

/** Đọc cài đặt chung; lỗi đọc hay thiếu dòng đều không ném — về mặc định. */
export async function docSoNgaySuaDuKien(admin: SupabaseClient): Promise<number> {
  try {
    const { data } = await admin.from("settings").select("value").eq("key", KHOA_SO_NGAY_SUA).is("branch_id", null).maybeSingle();
    return chuanHoaSoNgaySua((data as { value?: unknown } | null)?.value);
  } catch {
    return SO_NGAY_SUA_MAC_DINH;
  }
}
