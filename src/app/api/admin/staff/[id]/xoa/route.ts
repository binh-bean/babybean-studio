/**
 * GET /api/admin/staff/:id/xoa — BB-409: XEM TRƯỚC khi xoá nhân sự.
 *
 * Trả: có được xoá không (cùng luật với DELETE), và số bộ ảnh / việc / buổi chụp
 * sẽ chuyển về "Tổ chức BabyBean". Chỉ đọc — không ghi gì.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CAU_TU_CHOI,
  QUYEN_XOA_NHAN_SU,
  keHoachChuyen,
  kiemQuyenXoaNhanSu,
  type SoLieuChuyen,
} from "@/lib/nhan-su/xoa-nhan-su";
import { docNguoiBiXoa } from "@/lib/nhan-su/doc-nguoi-bi-xoa-server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
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

    const { data: soLieu, error } = await admin.rpc("dem_du_lieu_nhan_su", { p_staff_id: id });
    if (error) throw error;
    const keHoach = keHoachChuyen(soLieu as Partial<SoLieuChuyen> | null, target.fullName);

    return ok({
      id,
      duocXoa: lyDo === null,
      lyDo: lyDo ? CAU_TU_CHOI[lyDo] : null,
      keHoach,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
