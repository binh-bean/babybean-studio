/** BB-409 — đọc hồ sơ + quyền vai + chi nhánh của người sắp bị xoá (route DELETE và GET `/xoa`). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole } from "@/types/domain";
import type { NguoiBiXoa } from "./xoa-nhan-su";

export async function docNguoiBiXoa(
  admin: SupabaseClient,
  id: string,
): Promise<(NguoiBiXoa & { fullName: string }) | null> {
  const [{ data: p, error }, { data: cn }] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("id, full_name, role, is_active, la_to_chuc, da_nghi_luc, roles(permissions)")
      .eq("id", id)
      .maybeSingle(),
    admin.from("staff_branches").select("branch_id").eq("staff_id", id),
  ]);
  if (error) throw error;
  if (!p) return null;
  const vai = (p as { roles?: { permissions?: string[] } | null }).roles;
  return {
    id: p.id as string,
    fullName: (p.full_name as string) ?? "",
    role: p.role as StaffRole,
    permissions: vai?.permissions ?? [],
    branchIds: ((cn as Array<{ branch_id: string }> | null) ?? []).map((b) => b.branch_id),
    laToChuc: !!(p as { la_to_chuc?: boolean }).la_to_chuc,
    daNghiLuc: (p as { da_nghi_luc?: string | null }).da_nghi_luc ?? null,
  };
}
