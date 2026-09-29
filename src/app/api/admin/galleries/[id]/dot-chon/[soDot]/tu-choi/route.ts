/**
 * POST /api/admin/galleries/[id]/dot-chon/[soDot]/tu-choi — CSKH TỪ CHỐI một
 * đợt mua thêm kèm lý do. Ảnh và sản phẩm của đợt được TRẢ VỀ cho khách chọn
 * lại (dòng trong selection_items/selection_addons bị xoá, bản chụp còn ở
 * `selection_rounds` để màn khách điền sẵn); khách đọc được lý do.
 *
 * OWNER: DEV-BE. Task BB-321. Body: `{ lyDo }` — bắt buộc, tối đa 500 ký tự (khách
 * sẽ đọc dòng này, và sáu tháng sau câu hỏi "sao đợt này bị trả" chỉ trả lời
 * được nếu có người viết vào). Chỉ đi từ `cho_xac_nhan`; đợt đã xác nhận muốn
 * đổi thì đi đường MỞ LẠI (`/reopen` kèm số đợt).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { layMotDot, traDotVeChoKhach } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LY_DO = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; soDot: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const { id: galleryId, soDot: soDotRaw } = await context.params;
    const soDot = Number(soDotRaw);
    if (!UUID_RE.test(galleryId) || !Number.isInteger(soDot) || soDot < 2) {
      return fail("INVALID_INPUT", "Mã bộ ảnh hoặc số đợt không hợp lệ");
    }

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { lyDo?: string } | null;
    const lyDo = (body?.lyDo ?? "").trim();
    if (lyDo.length === 0) return fail("INVALID_INPUT", "Ghi giúp lý do từ chối — khách sẽ đọc dòng này");
    if (lyDo.length > MAX_LY_DO) return fail("INVALID_INPUT", `Lý do tối đa ${MAX_LY_DO} ký tự`);

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const dot = await layMotDot(admin, galleryId, soDot);
    if (!dot) return fail("NOT_FOUND", `Không có đợt ${soDot} của bộ ảnh này`);
    if (dot.trangThai !== "cho_xac_nhan") {
      return fail(
        "CONFLICT",
        dot.trangThai === "da_xac_nhan"
          ? `Đợt ${soDot} đã xác nhận rồi — muốn đổi thì dùng "Mở lại" kèm số đợt`
          : `Đợt ${soDot} đã được trả về cho khách`,
      );
    }

    await traDotVeChoKhach(admin, dot, { trangThai: "tu_choi", lyDo, nhanVienId: staff.staffId });

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(gallery.branch_id),
      action: "selection.round_reject",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { soDot, soAnh: dot.soAnh, lyDo },
    });

    await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: `Studio chưa nhận đợt ${soDot}`,
      noiDung: `${lyDo} — ba mẹ chọn lại giúp em nhé.`.slice(0, 300),
      loai: "dot_chon_tu_choi",
    });

    return ok({ soDot, trangThai: "tu_choi" });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
