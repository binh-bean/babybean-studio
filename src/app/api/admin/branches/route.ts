/**
 * GET  /api/admin/branches — danh sách chi nhánh
 * POST /api/admin/branches — thêm chi nhánh
 *
 * OWNER: DEV-BE. Task BB-063.
 * Spec: docs/05-rbac.md §2 — owner và admin có CRUD, branch_manager chỉ RU,
 * còn lại chỉ đọc.
 *
 * Địa chỉ và hotline thật của studio thuộc về bảng này, KHÔNG thuộc về
 * db/seed.sql — repo công khai và AGENTS.md §6 cấm đưa thông tin vận hành thật
 * vào đó. Chủ studio nhập qua màn hình này, dữ liệu nằm trong database.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateBranchSchema } from "./schema";
import type { StaffRole } from "@/types/domain";

export const runtime = "nodejs";

const CAN_CREATE: StaffRole[] = ["owner", "admin"];

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("branches")
      .select("id, code, name, address, hotline, is_active, created_at")
      .order("is_active", { ascending: false })
      .order("name");
    if (error) throw error;

    // Đếm nhân sự để không ai tắt nhầm một chi nhánh còn người đang làm.
    const { data: links } = await admin.from("staff_branches").select("branch_id");
    const staffCount = new Map<string, number>();
    for (const l of links ?? []) {
      staffCount.set(l.branch_id, (staffCount.get(l.branch_id) ?? 0) + 1);
    }

    const { data: galleries } = await admin.from("galleries").select("branch_id");
    const galleryCount = new Map<string, number>();
    for (const g of galleries ?? []) {
      galleryCount.set(g.branch_id, (galleryCount.get(g.branch_id) ?? 0) + 1);
    }

    return ok({
      branches: (data ?? []).map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        address: b.address,
        hotline: b.hotline,
        isActive: b.is_active,
        staffCount: staffCount.get(b.id) ?? 0,
        galleryCount: galleryCount.get(b.id) ?? 0,
      })),
      canEdit: ["owner", "admin", "branch_manager"].includes(staff.role),
      canCreate: CAN_CREATE.includes(staff.role),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requireRole(staff, CAN_CREATE);

    const parsed = CreateBranchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: taken } = await admin
      .from("branches")
      .select("id")
      .eq("code", input.code)
      .maybeSingle();
    if (taken) return fail("CONFLICT", `Mã chi nhánh ${input.code} đã tồn tại`);

    const { data: created, error } = await admin
      .from("branches")
      .insert({
        code: input.code,
        name: input.name,
        address: input.address ?? null,
        hotline: input.hotline ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error("insert branch trả về rỗng");

    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: created.id,
      action: "branch.create",
      entity_type: "branch",
      entity_id: created.id,
      metadata: { code: input.code, name: input.name },
    });

    return ok({ id: created.id, code: input.code });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
