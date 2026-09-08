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
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    throw new AuthError("UNAUTHENTICATED", "Account deactivated or not found");
  }

  // Determine branch access
  let branchIds: string[] = [];
  if (profile.role === "owner" || profile.role === "admin") {
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
    branchIds,
  };
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
  // owner and admin have access to all branches implicitly
  // but their branchIds list is populated with all branches in requireStaff()
  // checking includes() is sufficient.
  // Wait! If a new branch is created and not cached in the session, they might not have it in branchIds immediately.
  // Actually, we can just allow owner and admin explicitly here.
  if (staff.role === "owner" || staff.role === "admin") {
    return;
  }
  
  if (!staff.branchIds.includes(branchId)) {
    throw new AuthError("FORBIDDEN");
  }
}
