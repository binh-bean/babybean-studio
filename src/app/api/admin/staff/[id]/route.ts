/**
 * PATCH /api/admin/staff/:id — đổi vai trò, chi nhánh, bật/tắt (mật khẩu: xem `mat-khau/route.ts`)
 *
 * OWNER: DEV-BE. Task BB-063.
 * Spec: docs/13-quyet-dinh-van-hanh.md §8
 *
 * Nghỉ việc là TẮT, không xoá. Nhật ký hoạt động phải giữ được tên người đã
 * tạo album nào, đã mở lại album nào.
 *
 * BB-409 — DELETE (xoá nhân sự) giữ đúng tinh thần đó: hồ sơ KHÔNG bị xoá, chỉ
 * đánh dấu `da_nghi_luc`, việc đang phụ trách chuyển về "Tổ chức BabyBean",
 * tài khoản đăng nhập bị khoá.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateStaffSchema } from "../schema";
import type { StaffRole } from "@/types/domain";
import { ghiNhatKy } from "@/lib/nhat-ky";
import {
  CAU_TU_CHOI,
  QUYEN_XOA_NHAN_SU,
  kiemQuyenXoaNhanSu,
  lyDoTuLoiSql,
} from "@/lib/nhan-su/xoa-nhan-su";
import { docNguoiBiXoa } from "@/lib/nhan-su/doc-nguoi-bi-xoa-server";
import { layHoacTaoToChuc, THOI_GIAN_KHOA } from "@/lib/nhan-su/to-chuc-server";

export const runtime = "nodejs";


function assignableBy(role: StaffRole): readonly StaffRole[] {
  if (role === "owner") {
    return ["admin", "branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
  }
  return ["branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer"];
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "staff:manage");

    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = UpdateStaffSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: target } = await admin
      .from("staff_profiles")
      .select("id, role, is_active, full_name, da_nghi_luc, la_to_chuc")
      .eq("id", id)
      .maybeSingle();
    if (!target) return fail("NOT_FOUND", "Không tìm thấy nhân sự");

    // BB-409 — người đã XOÁ (việc đã chuyển về Tổ chức) và chính dòng Tổ chức
    // BabyBean không sửa/bật lại được: "Cho làm lại" ở đây sẽ mở lại một tài
    // khoản đã bị khoá mà không trả lại việc nào.
    if ((target as { da_nghi_luc?: string | null }).da_nghi_luc || (target as { la_to_chuc?: boolean }).la_to_chuc) {
      return fail("CONFLICT", "Nhân sự này đã được xoá, không sửa được nữa");
    }

    const isSelf = target.id === staff.staffId;

    // Không ai được tự tắt mình hoặc tự đổi vai trò của mình. Chủ studio bấm
    // nhầm một cái là không còn đường vào hệ thống của chính mình.
    if (isSelf && (input.isActive === false || input.role !== undefined)) {
      return fail("FORBIDDEN", "Không thể tự đổi vai trò hoặc tự tắt tài khoản của mình");
    }

    // Chỉ owner mới đụng được vào một owner khác.
    if (target.role === "owner" && staff.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ admin mới sửa được tài khoản admin");
    }

    if (input.role !== undefined && !assignableBy(staff.role).includes(input.role)) {
      return fail("FORBIDDEN", "Bạn không có quyền gán vai trò này");
    }

    // Tắt owner cuối cùng là tự khoá cửa từ bên trong.
    if (input.isActive === false && target.role === "owner") {
      const { count } = await admin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) {
        return fail("FORBIDDEN", "Đây là tài khoản admin đang hoạt động duy nhất, không tắt được");
      }
    }

    const profilePatch: Record<string, unknown> = {};
    if (input.fullName !== undefined) profilePatch.full_name = input.fullName;
    if (input.role !== undefined) profilePatch.role = input.role;

    /**
     * Gán vai tự tạo. Kiểm vai có thật trước khi ghi — `role_id` là khoá ngoại
     * nên cơ sở dữ liệu cũng chặn, nhưng thông báo của khoá ngoại thì người
     * dùng không đọc được.
     *
     * `null` là ý "trả về vai nền theo cột role": trigger `app.dong_bo_role_id`
     * sẽ điền lại giúp.
     */
    if (input.roleId !== undefined) {
      if (input.roleId !== null) {
        const { data: vai, error: loiVai } = await admin
          .from("roles")
          .select("id, name")
          .eq("id", input.roleId)
          .maybeSingle();
        if (loiVai) throw loiVai;
        if (!vai) return fail("INVALID_INPUT", "Không có vai trò này");
      }
      profilePatch.role_id = input.roleId;
    }
    if (input.isActive !== undefined) profilePatch.is_active = input.isActive;
    if (input.phone !== undefined) profilePatch.phone = input.phone;

    if (Object.keys(profilePatch).length > 0) {
      profilePatch.updated_at = new Date().toISOString();
      const { error } = await admin.from("staff_profiles").update(profilePatch).eq("id", id);
      if (error) throw error;
    }

    if (input.branchIds !== undefined) {
      const { error: delErr } = await admin.from("staff_branches").delete().eq("staff_id", id);
      if (delErr) throw delErr;
      if (input.branchIds.length > 0) {
        const { error } = await admin
          .from("staff_branches")
          .insert(input.branchIds.map((branch_id) => ({ staff_id: id, branch_id })));
        if (error) throw error;
      }
    }

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "staff.update",
      entity_type: "staff_profile",
      entity_id: id,
      // Đặt mật khẩu đi đường riêng `/mat-khau` (BB-373) — PATCH không nhận mật khẩu nữa.
      metadata: {
        target: target.full_name,
        fields: Object.keys(input),
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id, updated: true });
  } catch (err) {
    // Thông báo mặc định của mã UNAUTHENTICATED viết cho khách hàng
    // ("Vui lòng mở lại link album"). Nhân viên cần câu khác.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/admin/staff/:id — BB-409: XOÁ NHÂN SỰ = chuyển việc đang phụ trách về
 * "Tổ chức BabyBean" + khoá đăng nhập. Hồ sơ GIỮ LẠI (đánh dấu `da_nghi_luc`) để
 * nhật ký và cột lịch sử vẫn đọc được tên, hiện kèm "(đã nghỉ)".
 * Thay luồng cũ (`check_staff_deletable` chặn mọi người có lịch sử).
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Cửa quyền đầu tiên: không có `nhan_su:xoa` thì 403 trước khi đọc gì.
    if (!staff.permissions.includes(QUYEN_XOA_NHAN_SU)) {
      return fail("FORBIDDEN", CAU_TU_CHOI.KHONG_CO_QUYEN);
    }

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("NOT_FOUND", "Không tìm thấy nhân sự");
    const admin = createAdminClient();

    const target = await docNguoiBiXoa(admin, id);
    if (!target) return fail("NOT_FOUND", "Không tìm thấy nhân sự");

    const lyDo = kiemQuyenXoaNhanSu(
      { staffId: staff.staffId, role: staff.role, permissions: staff.permissions, branchIds: staff.branchIds },
      target,
    );
    if (lyDo) return fail(lyDo === "DA_XOA" ? "CONFLICT" : "FORBIDDEN", CAU_TU_CHOI[lyDo]);

    // BB-409 — KHÔNG xoá tài khoản Auth: staff_profiles.id là khoá ngoại `on delete
    // cascade` tới auth.users, xoá Auth là kéo theo hồ sơ → mọi cột lịch sử (người
    // tạo, người xác nhận tiền — vài cột không có `on delete`) hoặc chặn, hoặc mất tên.
    // Thay vào đó: chuyển việc trong MỘT giao dịch SQL, rồi KHOÁ tài khoản (ban).
    const toChucId = await layHoacTaoToChuc(admin);
    const { data: daChuyen, error: loiChuyen } = await admin.rpc("xoa_nhan_su_chuyen_du_lieu", {
      p_staff_id: id,
      p_to_chuc_id: toChucId,
      p_actor_id: staff.staffId,
    });
    if (loiChuyen) {
      const lyDoSql = lyDoTuLoiSql(loiChuyen.message);
      if (lyDoSql === "KHONG_THAY") return fail("NOT_FOUND", "Không tìm thấy nhân sự");
      if (lyDoSql && lyDoSql !== "THIEU_TO_CHUC") {
        return fail(lyDoSql === "DA_XOA" ? "CONFLICT" : "FORBIDDEN", CAU_TU_CHOI[lyDoSql]);
      }
      throw loiChuyen;
    }

    // Khoá đăng nhập. Hồ sơ đã `is_active = false` (requireStaff từ chối mọi phiên
    // đang mở ngay lượt gọi kế tiếp); ban chặn thêm lượt đăng nhập/làm mới phiên.
    const { error: loiKhoa } = await admin.auth.admin.updateUserById(id, { ban_duration: THOI_GIAN_KHOA });
    if (loiKhoa) {
      console.error(JSON.stringify({ evt: "staff.xoa.khoa_dang_nhap_hut", requestId, reason: loiKhoa.message }));
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      action: "staff.xoa",
      entityType: "staff_profile",
      entityId: id,
      metadata: { daChuyen, khoaDangNhap: !loiKhoa },
    });

    return ok({ id, deleted: true, daChuyen, khoaDangNhap: !loiKhoa });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
