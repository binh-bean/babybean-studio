/**
 * GET /api/admin/galleries/options — dữ liệu cho các hộp chọn của wizard tạo album.
 *
 * OWNER: DEV-BE. Task BB-022.
 *
 * Một lời gọi thay vì ba: wizard cần chi nhánh, gói chụp và thợ ảnh cùng lúc,
 * ngay khi mở. Ba request song song trên mạng 3G ở studio thì chậm hơn một.
 *
 * Chỉ trả về những gì người đang đăng nhập được thấy — nhân viên một chi nhánh
 * không nhìn thấy chi nhánh khác trong danh sách chọn.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole } from "@/types/domain";

export const runtime = "nodejs";

/** docs/05-rbac.md §2 — retoucher và accountant không tạo album. */
const CAN_CREATE_GALLERY: StaffRole[] = ["owner", "admin", "branch_manager", "cs", "photographer"];

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_CREATE_GALLERY);

    const admin = createAdminClient();

    const { data: branches } = await admin
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .in("id", staff.branchIds)
      .order("name");

    // Gói có branch_id null nghĩa là áp dụng cho mọi chi nhánh.
    const { data: packages } = await admin
      .from("packages")
      .select("id, name, branch_id, included_quota, extra_photo_price")
      .eq("is_active", true)
      .order("name");

    const { data: photographers } = await admin
      .from("staff_profiles")
      .select("id, full_name, role, staff_branches(branch_id)")
      .eq("is_active", true)
      .in("role", ["photographer", "cs", "owner", "admin", "branch_manager"])
      .order("full_name");

    return ok({
      branches: branches ?? [],
      packages: (packages ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        branchId: p.branch_id,
        includedQuota: p.included_quota,
        extraPhotoPrice: Number(p.extra_photo_price),
      })),
      photographers: (photographers ?? [])
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          branchIds: (p.staff_branches as { branch_id: string }[] | null)?.map(
            (b) => b.branch_id,
          ) ?? [],
        }))
        // Chỉ giữ người mà người đang đăng nhập được nhìn thấy.
        .filter(
          (p) => p.branchIds.length === 0 || p.branchIds.some((b) => staff.branchIds.includes(b)),
        ),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
