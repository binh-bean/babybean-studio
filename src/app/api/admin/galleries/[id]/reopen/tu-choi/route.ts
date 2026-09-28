/**
 * POST /api/admin/galleries/[id]/reopen/tu-choi — CSKH từ chối yêu cầu "xin
 * mở lại" của khách, kèm lý do gửi lại cho khách.
 *
 * OWNER: DEV-BE. Task BB-312 (P0, chủ studio): quy trình "khách xin mở lại"
 * phải có phản hồi ở CẢ HAI phía. Trước bản vá này, `/api/g/xin-sua-lai` chỉ
 * ghi một dòng nhật ký — không nút xử lý, không đường trả lời cho khách, nên
 * không ai trả lời khách.
 *
 * ---------------------------------------------------------------------------
 * Vì sao "từ chối" không đổi trạng thái bộ ảnh
 * ---------------------------------------------------------------------------
 * Khác `POST .../reopen` (đảo trạng thái về `in_review`), từ chối GIỮ NGUYÊN
 * bộ ảnh — khách xin mà CSKH thấy chưa hợp lý (đã in, đã giao, hoặc đơn giản
 * là quá muộn). Route chỉ ghi lại QUYẾT ĐỊNH đó và báo khách, không đụng
 * `galleries`.
 *
 * ---------------------------------------------------------------------------
 * Chỉ từ chối được khi ĐANG có yêu cầu chờ xử lý
 * ---------------------------------------------------------------------------
 * Không cho từ chối một yêu cầu đã xử lý rồi (đã mở, hoặc đã từ chối trước
 * đó) — bấm hai lần (double-submit, hai tab CSKH cùng mở) không được phép ghi
 * chồng hai quyết định khác nhau lên cùng một yêu cầu.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { layTrangThaiXinMoLai } from "@/lib/gallery/yeu-cau-mo-lai";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_LY_DO = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Cùng quyền với "Mở lại" — hai nút là hai mặt của MỘT quyết định trên
    // cùng yêu cầu, không tách quyền riêng cho việc nói "không".
    requirePermission(staff, "galleries:reopen");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { lyDo?: string } | null;
    const lyDo = (body?.lyDo ?? "").trim();
    if (lyDo.length === 0) {
      return fail("INVALID_INPUT", "Ghi giúp lý do gửi cho khách, để ba mẹ biết vì sao chưa mở được");
    }
    if (lyDo.length > MAX_LY_DO) {
      return fail("INVALID_INPUT", `Lý do tối đa ${MAX_LY_DO} ký tự`);
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    if (trangThai.trangThai !== "cho_xu_ly") {
      return fail(
        "INVALID_INPUT",
        "Không còn yêu cầu nào đang chờ xử lý — có thể đã xử lý ở một tab khác.",
      );
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.reopen_rejected",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { lyDo, tuTrangThai: gallery.status },
    });

    // BB-312: báo khách qua chuông + đẩy — KHÔNG qua Lark. Không bao giờ ném.
    await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: "Yêu cầu mở lại đã có phản hồi",
      noiDung: `Studio: ${lyDo}`,
      loai: "reopen_tu_choi",
    });

    return ok({ daTuChoi: true });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xử lý yêu cầu mở lại");
    return failUnexpected(err, requestId);
  }
}
