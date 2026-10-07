import { cache } from "react";
import { createServerClient } from "../supabase/server";
import { StaffSession, StaffRole } from "../../types/domain";
import { headers } from "next/headers";
import { HEADER_NGUOI_DUNG, docNguoiDung } from "./dau-nguoi-dung";

/** Dấu "middleware đã xác thực" của request đang chạy, hoặc `null` ngoài request. */
async function uidTuMiddleware(): Promise<string | null> {
  try {
    const h = await headers();
    return await docNguoiDung(h.get(HEADER_NGUOI_DUNG), h.get("cookie") ?? "");
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN", message?: string) {
    super(message || code);
    this.name = "AuthError";
  }
}

/**
 * Gets the current authenticated staff session.
 * Throws AuthError('UNAUTHENTICATED') if no valid session or deactivated.
 *
 * BB-333 — hai thay đổi CHỈ về tốc độ, không đổi luật quyền:
 *
 * 1. `cache()` của React: trong MỘT lượt dựng trang, layout quản trị và trang
 *    con cùng gọi hàm này (vd. /admin: layout + page) — trước đây mỗi nơi tự đi
 *    lại trọn chuỗi getUser → hồ sơ → chi nhánh. Nay lượt thứ hai dùng lại kết
 *    quả của lượt đầu. Ngoài lượt dựng trang (route API, phép thử) `cache()`
 *    không có kho theo lượt nên gọi thẳng — không bao giờ dùng chung giữa hai
 *    request, hai người.
 * 2. Hồ sơ và HAI câu chi nhánh chạy SONG SONG sau getUser, thay vì nối đuôi
 *    (hồ sơ xong mới biết là superuser hay không rồi mới hỏi chi nhánh). Câu
 *    chi nhánh không dùng tới bị bỏ đi — tốn một câu nhỏ, bớt một vòng mạng
 *    ở MỌI route API quản trị.
 */
export const requireStaff = cache(requireStaffKhongCache);

async function requireStaffKhongCache(): Promise<StaffSession> {
  const supabase = await createServerClient();

  // BB-341 — trang /admin: middleware vừa hỏi Supabase Auth cho CHÍNH cookie
  // này và để lại dấu ký (src/lib/auth/dau-nguoi-dung.ts). Dấu hợp lệ thì dùng
  // luôn — bớt một lượt gọi Auth nối đuôi mỗi lần mở trang. Không có dấu (route
  // API, phép thử, dấu hỏng/hết hạn) thì hỏi `getUser()` như cũ.
  let user: { id: string } | null = null;
  const uidDaXacThuc = await uidTuMiddleware();
  if (uidDaXacThuc) {
    user = { id: uidDaXacThuc };
  } else {
    const { data, error: authError } = await supabase.auth.getUser();
    if (!authError && data.user) user = data.user;
  }

  if (!user) {
    throw new AuthError("UNAUTHENTICATED");
  }

  // Load the profile and branches using the authenticated client.
  // Because RLS is enabled, the staff member can always read their own profile.
  const [
    { data: profile, error: profileError },
    tatCaChiNhanh,
    chiNhanhDuocGan,
  ] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("role, is_active, role_id, roles(name, permissions)")
      .eq("id", user.id)
      .single(),
    supabase.from("branches").select("id"),
    supabase.from("staff_branches").select("branch_id").eq("staff_id", user.id),
  ]);

  if (profileError || !profile || !profile.is_active) {
    throw new AuthError("UNAUTHENTICATED", "Account deactivated or not found");
  }

  /**
   * Bộ quyền lấy từ bảng `roles`. Đây là thứ mọi cửa quyền ở tầng API hỏi từ
   * BB-172 chặng 2d — không còn hỏi tên vai.
   *
   * Nhánh dự phòng theo `role`: một tài khoản có thể chưa kịp có `role_id`
   * (trigger `app.dong_bo_role_id` vá nguồn, nhưng dữ liệu cũ thì không ai bảo
   * đảm). Thiếu nhánh này thì người đó đăng nhập được mà không làm gì được, và
   * màn hình không nói vì sao — đúng lớp lỗi im lặng dự án này đang dọn.
   */
  const vaiGan = (profile as { roles?: { name?: string; permissions?: string[] } | null }).roles;
  let permissions: string[] = vaiGan?.permissions ?? [];
  let roleName: string | undefined = vaiGan?.name;

  if (permissions.length === 0) {
    const { data: vaiTheoTen } = await supabase
      .from("roles")
      .select("name, permissions")
      .eq("name", profile.role)
      .maybeSingle();
    permissions = vaiTheoTen?.permissions ?? [];
    roleName = roleName ?? vaiTheoTen?.name ?? profile.role;
  }

  // Determine branch access
  let branchIds: string[] = [];
  if (permissions.includes("system:superuser")) {
    // Owners and admins can see all branches.
    const branches = tatCaChiNhanh.data as { id: string }[] | null;
    branchIds = (branches || []).map((b) => b.id);
  } else {
    // Regular staff only see assigned branches.
    const staffBranches = chiNhanhDuocGan.data as { branch_id: string }[] | null;
    branchIds = (staffBranches || []).map((b) => b.branch_id);
  }

  return {
    staffId: user.id,
    role: profile.role as StaffRole,
    roleName: roleName ?? profile.role,
    permissions,
    branchIds,
  };
}

/**
 * Cửa quyền của tầng API: hỏi BỘ QUYỀN, không hỏi tên vai.
 *
 * Đây là thứ làm cho vai tự tạo có nghĩa. Chừng nào còn `requireRole(staff,
 * ['owner','admin'])` thì chủ studio tạo bao nhiêu vai cũng vô ích — mọi đường
 * API vẫn xét theo chín cái tên cứng.
 */
export function requirePermission(staff: StaffSession, quyen: string): void {
  if (!staff.permissions.includes(quyen)) {
    throw new AuthError("FORBIDDEN");
  }
}

/**
 * BB-383 — như `requirePermission` nhưng nhận MỘT TRONG nhiều quyền (vd. đồng
 * bộ ảnh: `galleries:sync` hoặc `galleries:write`). Vẫn hỏi quyền, không hỏi vai.
 */
export function requireMotTrongCacQuyen(staff: StaffSession, cacQuyen: readonly string[]): void {
  if (!cacQuyen.some((q) => staff.permissions.includes(q))) {
    throw new AuthError("FORBIDDEN");
  }
}

/**
 * Ensures the staff member has one of the allowed roles.
 * Throws AuthError('FORBIDDEN') if not.
 */
export function requireRole(staff: StaffSession, allowedRoles: StaffRole[]): void {
  if (!allowedRoles.includes(staff.role)) {
    throw new AuthError("FORBIDDEN");
  }
}

/**
 * Ensures the staff member has access to the given branch.
 * Throws AuthError('FORBIDDEN') if not.
 */
export function requireBranch(staff: StaffSession, branchId: string): void {
  // Vai vượt chi nhánh thấy hết. Hỏi quyền chứ không hỏi tên vai — một vai tự
  // tạo cũng có thể được cấp `system:superuser`.
  if (staff.permissions.includes("system:superuser")) {
    return;
  }
  
  if (!staff.branchIds.includes(branchId)) {
    throw new AuthError("FORBIDDEN");
  }
}

/**
 * BB-333 — tên nhân viên đang đăng nhập, hỏi MỘT lần cho cả lượt dựng trang.
 *
 * Layout quản trị (góc phải) và trang /admin (lời chào) cùng cần tên; trước đây
 * mỗi nơi tự hỏi `staff_profiles` một lần. `cache()` gộp hai lượt đó thành một.
 * Không có dòng/không có tên thì trả `null` (giữ đúng luật cũ của hai nơi gọi).
 */
export const layHoTenNhanVien = cache(async (staffId: string): Promise<string | null> => {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("staff_profiles")
    .select("full_name")
    .eq("id", staffId)
    .maybeSingle();
  return (data?.full_name as string | undefined) ?? null;
});
