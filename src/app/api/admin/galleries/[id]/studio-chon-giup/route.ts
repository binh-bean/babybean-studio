/**
 * POST /api/admin/galleries/[id]/studio-chon-giup — CSKH xác nhận đã xử lý xong
 * phần khách để lại cho studio ở đợt 1: "nhờ studio chọn thêm N ảnh" và/hoặc
 * "còn sản phẩm in chưa chọn ảnh" (BB-321).
 *
 * OWNER: DEV-BE. Task BB-337 mục 1.
 *
 * Ghi `selections.studio_xu_ly_dot1_at/_boi` (migration 0082) trên lượt chọn
 * chính. KHÔNG đổi `nho_studio_chon_them`/`so_san_pham_in_chua_anh` — đó là lời
 * khách, giữ làm lịch sử. Xong thì dòng rời hàng đợi "Khách gửi ảnh chọn"
 * (`layDanhSachViecDot1` lọc theo cột này).
 *
 * Không chuyển trạng thái bộ ảnh, không gửi gì sang Lark.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { laLoiThieuCot } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (gErr) return failUnexpected(gErr, requestId);
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id as string);

    const now = new Date().toISOString();
    const { data: capNhat, error: uErr } = await admin
      .from("selections")
      .update({ studio_xu_ly_dot1_at: now, studio_xu_ly_dot1_boi: staff.staffId })
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .select("id");
    if (uErr) {
      if (laLoiThieuCot(uErr)) {
        return fail("CONFLICT", "Cơ sở dữ liệu chưa có cột ghi việc này (chờ áp migration 0082).");
      }
      return failUnexpected(uErr, requestId);
    }
    if (!capNhat || capNhat.length === 0) {
      return fail("NOT_FOUND", "Bộ ảnh này chưa có lượt chọn nào của khách");
    }

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "gallery.studio_xu_ly_dot1",
      entity_type: "gallery",
      entity_id: galleryId,
      gallery_id: galleryId,
      metadata: { xongLuc: now },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ galleryId, studioXuLyDot1At: now });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
