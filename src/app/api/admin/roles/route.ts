/**
 * GET  /api/admin/roles — danh sách vai trò + danh mục quyền
 * POST /api/admin/roles — tạo một vai trò mới
 *
 * OWNER: SEC-ARCH. Task BB-172 chặng 2b.
 *
 * Chặng 2a đã dựng bảng `roles` và cho lớp RLS đọc quyền từ đó. Đây là đường
 * để chủ studio tự tạo vai và tích chọn quyền, thay vì chín vai cứng.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { DANH_MUC_QUYEN, MA_QUYEN_HOP_LE, tenVaiCoVanDeGi } from "@/lib/auth/danh-muc-quyen";

export const runtime = "nodejs";


const TaoVaiSchema = z.object({
  name: z.string(),
  permissions: z.array(z.string()),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "roles:manage");

    const admin = createAdminClient();

    const { data: vai, error } = await admin
      .from("roles")
      .select("id, name, permissions, is_system, created_at")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw error;

    // Đếm người đang giữ mỗi vai: màn hình phải nói được "vai này đang có 3
    // người" trước khi ai đó bấm Xoá.
    const { data: nhanSu, error: loiDem } = await admin
      .from("staff_profiles")
      .select("role_id")
      .not("role_id", "is", null);
    if (loiDem) throw loiDem;

    const dem = new Map<string, number>();
    for (const n of nhanSu ?? []) {
      const k = String(n.role_id);
      dem.set(k, (dem.get(k) ?? 0) + 1);
    }

    return ok({
      items: (vai ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        permissions: v.permissions ?? [],
        isSystem: v.is_system,
        soNguoiDangGiu: dem.get(String(v.id)) ?? 0,
      })),
      danhMucQuyen: DANH_MUC_QUYEN,
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
    requirePermission(staff, "roles:manage");

    const parsed = TaoVaiSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }

    const ten = parsed.data.name.trim();
    const vanDe = tenVaiCoVanDeGi(ten);
    if (vanDe) return fail("INVALID_INPUT", vanDe);

    // Quyền lạ bị từ chối chứ không bị bỏ qua trong im lặng. Lưu một mã quyền
    // không ai hỏi tới là tạo ra một ô tích không nối với gì cả.
    const la = parsed.data.permissions.filter((p) => !MA_QUYEN_HOP_LE.has(p));
    if (la.length > 0) {
      return fail("INVALID_INPUT", `Không có quyền tên: ${la.join(", ")}`);
    }

    const admin = createAdminClient();

    const { data: trung, error: loiTim } = await admin
      .from("roles")
      .select("id")
      .ilike("name", ten)
      .maybeSingle();
    if (loiTim) throw loiTim;
    if (trung) return fail("CONFLICT", "Đã có vai trò tên này");

    const { data: moi, error: loiTao } = await admin
      .from("roles")
      .insert({ name: ten, permissions: [...new Set(parsed.data.permissions)], is_system: false })
      .select("id, name, permissions, is_system")
      .single();
    if (loiTao) throw loiTao;

    const { error: loiNhatKy } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "role.create",
      entity_type: "role",
      entity_id: moi.id,
      metadata: { name: moi.name, permissions: moi.permissions },
    });
    if (loiNhatKy) console.error("[roles] ghi activity_logs hụt:", loiNhatKy);

    return ok({ id: moi.id, name: moi.name, permissions: moi.permissions, isSystem: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
