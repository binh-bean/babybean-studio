import { createServerClient } from "../supabase/server";
import { StaffSession, StaffRole } from "../../types/domain";

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN", message?: string) {
    super(message || code);
    this.name = "AuthError";
  }
}

/**
 * Gets the current authenticated staff session.
 * Throws AuthError('UNAUTHENTICATED') if no valid session or deactivated.
 */
export async function requireStaff(): Promise<StaffSession> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthError("UNAUTHENTICATED");
  }

  // Load the profile and branches using the authenticated client.
  // Because RLS is enabled, the staff member can always read their own profile.
  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role, is_active, role_id, roles(name, permissions)")
    .eq("id", user.id)
    .single();

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
    const { data: branches } = await supabase.from("branches").select("id");
    branchIds = (branches || []).map((b: { id: string }) => b.id);
  } else {
    // Regular staff only see assigned branches.
    const { data: staffBranches } = await supabase
      .from("staff_branches")
      .select("branch_id")
      .eq("staff_id", user.id);
    branchIds = (staffBranches || []).map((b: { branch_id: string }) => b.branch_id);
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
