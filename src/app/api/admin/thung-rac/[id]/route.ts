/**
 * POST /api/admin/thung-rac/:id — BB-409: thao tác trên một bộ trong thùng rác.
 *
 * Thân `{ hanhDong }`:
 *   - "khoi_phuc"  — đưa bộ về như cũ (gỡ dấu chặn Lark).
 *   - "xoa_han"    — dọn hẳn NGAY (không đợi 10 ngày). Bắt gõ lại mã bộ (`xacNhan`,
 *                    8 ký tự đầu id) — không hoàn tác được.
 *   - "bo_dau"     — bộ ĐÃ dọn hẳn: cho phép đồng bộ Lark tạo lại bộ từ dòng Hậu Kỳ.
 * Quyền `bo_anh:xoa` + đúng chi nhánh của bộ.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { QUYEN_XOA_BO_ANH, maBo, xacNhanDungMa } from "@/lib/thung-rac/thung-rac";
import { donHanBoAnh, khoiPhucBoAnh } from "@/lib/thung-rac/thung-rac-server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Schema = z.object({
  hanhDong: z.enum(["khoi_phuc", "xoa_han", "bo_dau"]),
  xacNhan: z.string().max(40).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, QUYEN_XOA_BO_ANH);

    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = Schema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const { hanhDong, xacNhan } = parsed.data;

    const admin = createAdminClient();

    if (hanhDong === "bo_dau") {
      const { data: dau, error } = await admin
        .from("bo_anh_da_xoa")
        .select("gallery_id, branch_id, don_luc, bo_dau_luc")
        .eq("gallery_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!dau) return fail("NOT_FOUND", "Không tìm thấy dấu của bộ này");
      if (dau.branch_id) requireBranch(staff, dau.branch_id as string);
      else if (!staff.permissions.includes("system:superuser")) return fail("FORBIDDEN");
      if (!dau.don_luc) return fail("CONFLICT", "Bộ còn trong thùng rác — bấm Khôi phục thay vì bỏ dấu");
      if (dau.bo_dau_luc) return ok({ id, boDau: true });
      const { error: loi } = await admin
        .from("bo_anh_da_xoa")
        .update({ bo_dau_luc: new Date().toISOString(), bo_dau_boi: staff.staffId })
        .eq("gallery_id", id);
      if (loi) throw loi;
      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        branchId: (dau.branch_id as string | null) ?? null,
        action: "gallery.bo_dau_lark",
        entityType: "gallery_tombstone",
        entityId: id,
        metadata: { maBo: maBo(id) },
      });
      return ok({ id, boDau: true });
    }

    const { data: gallery, error } = await admin
      .from("galleries")
      .select("id, branch_id, deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id as string);
    if (!gallery.deleted_at) return fail("CONFLICT", "Bộ ảnh này không ở thùng rác");
    const branchId = (gallery.branch_id as string | null) ?? null;

    if (hanhDong === "khoi_phuc") {
      const daKhoiPhuc = await khoiPhucBoAnh(admin, { id });
      if (!daKhoiPhuc) return fail("CONFLICT", "Bộ ảnh này không ở thùng rác");
      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        branchId,
        action: "gallery.khoi_phuc",
        entityType: "gallery",
        entityId: id,
        galleryId: id,
        metadata: { maBo: maBo(id) },
      });
      return ok({ id, khoiPhuc: true });
    }

    // xoa_han — gõ lại mã để chắc chắn (không hoàn tác được).
    if (!xacNhanDungMa(id, xacNhan)) {
      return fail("INVALID_INPUT", `Gõ lại mã bộ ${maBo(id)} để xác nhận xoá hẳn`);
    }
    // Nhật ký "gallery.xoa_han" ghi trong donHanBoAnh (TRƯỚC khi xoá dòng galleries).
    const kq = await donHanBoAnh(admin, { id, branch_id: branchId }, { staffId: staff.staffId, actorType: "staff" });
    if (!kq) return fail("CONFLICT", "Bộ ảnh này không ở thùng rác");
    return ok({ id, xoaHan: true, soTepStorage: kq.soTepStorage, soLieu: kq.soLieu });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
