/**
 * BB-409 — chủ thể chung "Tổ chức BabyBean" nhận việc của nhân sự đã xoá.
 *
 * Vì sao là MỘT DÒNG staff_profiles thật: mọi cột phụ trách (galleries.photographer_id,
 * cskh_id, editor_id, deliveries.retoucher_id, shoots.photographer_id) là khoá ngoại
 * tới staff_profiles, mà staff_profiles.id lại là khoá ngoại tới auth.users. Không
 * có dòng thật thì không có id hợp lệ để chuyển việc về.
 *
 * Tài khoản đăng nhập của dòng này bị KHOÁ ngay khi tạo (ban ~100 năm, mật khẩu
 * ngẫu nhiên không ai biết) và hồ sơ `is_active = false` → requireStaff từ chối.
 * Tạo lười ở lần xoá nhân sự đầu tiên; chỉ mục unique `uq_staff_profiles_to_chuc`
 * (0109) bảo đảm tối đa một dòng.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STAFF_DOMAIN } from "@/lib/auth/username";
import { TEN_TO_CHUC } from "./xoa-nhan-su";

export const EMAIL_TO_CHUC = `to-chuc@${STAFF_DOMAIN}`;
/** "Khoá đăng nhập" theo Supabase Auth: cấm ~100 năm. */
export const THOI_GIAN_KHOA = "876000h";

export async function layHoacTaoToChuc(admin: SupabaseClient): Promise<string> {
  const { data: co, error } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("la_to_chuc", true)
    .maybeSingle();
  if (error) throw error;
  if (co?.id) return co.id as string;

  const { data: tao, error: loiTao } = await admin.auth.admin.createUser({
    email: EMAIL_TO_CHUC,
    password: randomBytes(36).toString("base64url"),
    email_confirm: true,
    ban_duration: THOI_GIAN_KHOA,
    user_metadata: { full_name: TEN_TO_CHUC },
  });
  if (loiTao || !tao?.user) throw loiTao ?? new Error("Không tạo được tài khoản Tổ chức BabyBean");

  const { error: loiHoSo } = await admin.from("staff_profiles").insert({
    id: tao.user.id,
    full_name: TEN_TO_CHUC,
    email: EMAIL_TO_CHUC,
    role: "viewer",
    is_active: false,
    la_to_chuc: true,
  });
  if (loiHoSo) {
    // Hai lượt xoá cùng lúc: lượt kia đã tạo dòng — dọn tài khoản thừa, dùng dòng kia.
    await admin.auth.admin.deleteUser(tao.user.id).catch(() => {});
    const { data: lai } = await admin.from("staff_profiles").select("id").eq("la_to_chuc", true).maybeSingle();
    if (lai?.id) return lai.id as string;
    throw loiHoSo;
  }
  return tao.user.id;
}
