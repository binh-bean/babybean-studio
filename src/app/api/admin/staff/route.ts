/**
 * GET  /api/admin/staff — danh sách nhân sự
 * POST /api/admin/staff — tạo tài khoản mới
 *
 * OWNER: DEV-BE. Task BB-063.
 * Spec: docs/13-quyet-dinh-van-hanh.md §8, docs/05-rbac.md §2
 *
 * Chủ studio tự đặt tên tài khoản và mật khẩu rồi gán vai trò; không có màn
 * hình đăng ký công khai. Xem lý do trong docs §8.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidUsername,
  normalizeUsername,
  toAuthEmail,
  toDisplayIdentifier,
  passwordProblem,
  STAFF_DOMAIN,
} from "@/lib/auth/username";
import { CreateStaffSchema } from "./schema";
import type { StaffRole } from "@/types/domain";

export const runtime = "nodejs";

/** docs/05-rbac.md §2: chỉ owner và admin có quyền CRUD nhân sự. */
const CAN_MANAGE: StaffRole[] = ["owner", "admin"];

/**
 * Ai được gán vai trò nào.
 *
 * `owner` không bao giờ gán được qua màn hình này: chuyển quyền sở hữu studio
 * là việc phải làm có chủ đích, không phải một mục trong hộp chọn.
 *
 * Và `admin` chỉ do `owner` gán. Nếu admin tự tạo thêm admin thì một tài khoản
 * bị chiếm là đủ để sinh ra vô số tài khoản cùng quyền, và chủ studio không còn
 * biết ai đã cho ai vào.
 */
function assignableBy(role: StaffRole): readonly StaffRole[] {
  if (role === "owner") {
    return ["admin", "branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
  }
  return ["branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
}

/** Không đăng nhập quá lâu thì màn quản lý nhắc chủ studio xem lại. */
const STALE_DAYS = 60;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_MANAGE);

    const admin = createAdminClient();

    const { data: profiles, error } = await admin
      .from("staff_profiles")
      .select("id, full_name, email, phone, role, is_active, last_login_at, created_at")
      .order("is_active", { ascending: false })
      .order("full_name");
    if (error) throw error;

    const { data: links } = await admin.from("staff_branches").select("staff_id, branch_id");
    const { data: branches } = await admin.from("branches").select("id, name").order("name");

    const byStaff = new Map<string, string[]>();
    for (const link of links ?? []) {
      byStaff.set(link.staff_id, [...(byStaff.get(link.staff_id) ?? []), link.branch_id]);
    }

    const staleBefore = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

    return ok({
      staff: (profiles ?? []).map((p) => ({
        id: p.id,
        fullName: p.full_name,
        identifier: toDisplayIdentifier(p.email),
        usesInternalName: p.email.endsWith(`@${STAFF_DOMAIN}`),
        phone: p.phone,
        role: p.role,
        isActive: p.is_active,
        lastLoginAt: p.last_login_at,
        neverLoggedIn: p.last_login_at === null,
        stale:
          p.is_active &&
          p.last_login_at !== null &&
          new Date(p.last_login_at).getTime() < staleBefore,
        branchIds: byStaff.get(p.id) ?? [],
      })),
      branches: branches ?? [],
      assignableRoles: assignableBy(staff.role),
      canManage: true,
    });
  } catch (err) {
    // Thông báo mặc định của mã UNAUTHENTICATED viết cho khách hàng
    // ("Vui lòng mở lại link album"). Nhân viên cần câu khác.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let createdAuthId: string | null = null;
  const admin = createAdminClient();

  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_MANAGE);

    const parsed = CreateStaffSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    if (!assignableBy(staff.role).includes(input.role)) {
      return fail("FORBIDDEN", "Bạn không có quyền gán vai trò này");
    }

    const username = normalizeUsername(input.username);
    if (!isValidUsername(username)) {
      return fail(
        "INVALID_INPUT",
        "Tên tài khoản bắt đầu bằng chữ cái, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang, dài 3–30 ký tự",
      );
    }

    const pwProblem = passwordProblem(input.password);
    if (pwProblem) return fail("INVALID_INPUT", pwProblem);

    const authEmail = toAuthEmail(username);

    const { data: taken } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("email", authEmail)
      .maybeSingle();
    if (taken) return fail("CONFLICT", "Tên tài khoản này đã có người dùng");

    // Hai bước không nằm chung một transaction được: tài khoản đăng nhập ở
    // Supabase Auth, hồ sơ nhân sự ở bảng của mình. Nếu bước hai hỏng thì phải
    // xoá bước một, nếu không sẽ còn lại một tài khoản đăng nhập được mà không
    // có hồ sơ — requireStaff() từ chối nó, nhưng nó vẫn chiếm mất tên.
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });

    if (authErr || !created?.user) {
      // Không bao giờ ghi mật khẩu vào log, kể cả khi lỗi.
      console.error(JSON.stringify({ evt: "create_auth_user_failed", requestId, reason: authErr?.message }));
      return fail("INTERNAL", "Không tạo được tài khoản đăng nhập");
    }
    createdAuthId = created.user.id;

    const { error: profileErr } = await admin.from("staff_profiles").insert({
      id: createdAuthId,
      full_name: input.fullName,
      email: authEmail,
      phone: input.phone ?? null,
      role: input.role,
      is_active: true,
    });
    if (profileErr) throw profileErr;

    if (input.branchIds.length > 0) {
      const { error: branchErr } = await admin
        .from("staff_branches")
        .insert(input.branchIds.map((branch_id) => ({ staff_id: createdAuthId, branch_id })));
      if (branchErr) throw branchErr;
    }

    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "staff.create",
      entity_type: "staff_profile",
      entity_id: createdAuthId,
      metadata: { username, role: input.role, branchCount: input.branchIds.length },
    });

    return ok({ id: createdAuthId, identifier: username, role: input.role });
  } catch (err) {
    // Dọn tài khoản đăng nhập vừa tạo, đừng để lại rác chiếm tên.
    if (createdAuthId) {
      await admin.auth.admin.deleteUser(createdAuthId).catch(() => {});
    }
    // Thông báo mặc định của mã UNAUTHENTICATED viết cho khách hàng
    // ("Vui lòng mở lại link album"). Nhân viên cần câu khác.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
