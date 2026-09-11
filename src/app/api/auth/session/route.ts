/**
 * POST /api/auth/session — ghi nhận nhân viên vừa đăng nhập thành công.
 *
 * OWNER: SEC-ARCH. Task BB-063.
 *
 * `staff_profiles.last_login_at` có trong schema từ đầu nhưng chưa ai ghi vào,
 * nên màn quản lý nhân sự không biết ai còn dùng tài khoản và ai bỏ lâu rồi —
 * mà đó chính là danh sách chủ studio cần để quyết định tắt tài khoản nào.
 *
 * Ghi ở đây, một lần sau khi đăng nhập, thay vì trong requireStaff() vốn chạy
 * ở mọi request.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();

    await createAdminClient()
      .from("staff_profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", staff.staffId);

    return ok({ staffId: staff.staffId, role: staff.role });
  } catch (err) {
    // Thông báo mặc định của mã UNAUTHENTICATED viết cho khách hàng
    // ("Vui lòng mở lại link album"). Nhân viên cần câu khác.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
