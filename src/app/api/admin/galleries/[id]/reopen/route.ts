/**
 * POST /api/admin/galleries/[id]/reopen — mở lại cho khách chọn tiếp.
 *
 * OWNER: PM. Task BB-122.
 * Spec: docs/16 mục 4b
 *
 * ---------------------------------------------------------------------------
 * Vì sao route này phải có
 * ---------------------------------------------------------------------------
 * Migration 0035 khoá bộ ảnh 'expired' khỏi việc đổi lựa chọn — đúng, nhưng
 * trước đó cái lỗ hổng ấy chính là đường thoát duy nhất: khách hết hạn vẫn bấm
 * tim được. Khoá mà không mở đường chính thức thì bộ ảnh quá hạn thành ngõ
 * cụt, và CSKH phải nhờ người sửa thẳng cơ sở dữ liệu.
 *
 * Hai cột `reopened_at` và `reopen_reason` có sẵn trong schema từ đầu mà chưa
 * ai ghi. Route này ghi chúng.
 *
 * ---------------------------------------------------------------------------
 * Chỉ mở lại được từ hai trạng thái
 * ---------------------------------------------------------------------------
 * 'expired' (hết hạn) và 'submitted' (khách chốt rồi nhưng muốn đổi ý, CSKH
 * chưa xác nhận). KHÔNG mở từ 'in_retouch' trở đi: lúc đó người chỉnh ảnh đã
 * làm theo danh sách cũ, mở ra thì công đã bỏ vào những ảnh khách vừa bỏ chọn.
 * Muốn đổi ở giai đoạn đó thì đi đường yêu cầu sửa.
 *
 * ---------------------------------------------------------------------------
 * Bắt buộc ghi lý do
 * ---------------------------------------------------------------------------
 * Mở lại là đảo ngược một quyết định của khách. Sáu tháng sau, câu hỏi "sao bộ
 * này mở lại" chỉ trả lời được nếu lúc đó có người viết vào.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/** Chỉ hai trạng thái này. Xem ghi chú đầu file. */
const REOPENABLE = ["expired", "submitted"];

const MAX_REASON = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const body = (await request.json().catch(() => null)) as { reason?: string } | null;
    const reason = (body?.reason ?? "").trim();
    if (reason.length === 0) {
      return fail("INVALID_INPUT", "Ghi giúp lý do mở lại, để sau này còn tra được");
    }
    if (reason.length > MAX_REASON) {
      return fail("INVALID_INPUT", `Lý do tối đa ${MAX_REASON} ký tự`);
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    if (!REOPENABLE.includes(gallery.status)) {
      return fail(
        "INVALID_INPUT",
        gallery.status === "in_review" || gallery.status === "ready"
          ? "Bộ ảnh đang mở, khách vẫn chọn được."
          : "Bộ ảnh đã qua bước chỉnh ảnh, không mở lại chọn ảnh được. " +
              "Cần sửa thì đi đường yêu cầu sửa ảnh đã chỉnh.",
      );
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("galleries")
      .update({
        status: "in_review",
        reopened_at: now,
        reopen_reason: reason,
        updated_at: now,
      })
      .eq("id", galleryId);
    if (error) throw error;

    return ok({ status: "in_review", reopenedAt: now });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền mở lại bộ ảnh");
    return failUnexpected(err, requestId);
  }
}
