/**
 * POST /api/admin/galleries/[id]/retouch-done — CSKH chuyển file đã chỉnh cho khách.
 *
 * OWNER: DEV-BE. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 * Chủ studio mô tả ngày 12.09.2026: sau khi người photoshop chỉnh xong, CSKH
 * chuyển file cho khách; khách duyệt hoặc yêu cầu sửa; vòng lặp tiếp tục.
 *
 * Route này là bước "CSKH chuyển file": in_retouch → awaiting_approval.
 *
 * ---------------------------------------------------------------------------
 * Bắt buộc có link file đã chỉnh
 * ---------------------------------------------------------------------------
 * Chuyển sang "chờ khách duyệt" mà không có gì cho khách xem thì khách mở link
 * ra thấy trang trống rồi gọi điện. Thà chặn ở đây còn hơn để CSKH phát hiện
 * qua một cuộc gọi.
 *
 * ---------------------------------------------------------------------------
 * Chuyển bản mới là ĐÓNG vòng yêu cầu sửa đang mở
 * ---------------------------------------------------------------------------
 * Khách yêu cầu sửa ở vòng N; CSKH chuyển bản mới nghĩa là vòng N đã xử lý.
 * Không đóng thì đến vòng thứ tư, bảng lịch sử có bốn dòng mở và không ai biết
 * dòng nào còn chờ.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


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

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { finalDriveUrl?: string } | null;
    const url = (body?.finalDriveUrl ?? "").trim();
    if (!/^https?:\/\/\S+$/.test(url)) {
      return fail("INVALID_INPUT", "Cần link thư mục ảnh đã chỉnh để gửi khách");
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // Chỉ đi từ 'in_retouch'. Gửi từ trạng thái khác nghĩa là ai đó nhầm bộ ảnh
    // — ví dụ gửi một bộ khách còn đang chọn.
    if (gallery.status !== "in_retouch") {
      return fail(
        "INVALID_INPUT",
        `Bộ ảnh đang ở "${gallery.status}", chỉ gửi được khi đang chỉnh ảnh.`,
      );
    }

    const now = new Date().toISOString();

    // Lưu link vào deliveries — bảng này có sẵn từ đầu nhưng chưa ai dùng.
    const { data: existing } = await admin
      .from("deliveries")
      .select("id")
      .eq("gallery_id", galleryId)
      .maybeSingle();

    if (existing) {
      const { error: delUpdErr } = await admin
        .from("deliveries")
        .update({ final_drive_url: url, status: "ready", updated_at: now })
        .eq("id", existing.id);
      if (delUpdErr) throw delUpdErr;
    } else {
      const { error: delInsErr } = await admin.from("deliveries").insert({
        gallery_id: galleryId,
        branch_id: gallery.branch_id,
        status: "ready",
        final_drive_url: url,
      });
      if (delInsErr) throw delInsErr;
    }

    // Đóng mọi vòng yêu cầu sửa đang mở.
    const { error: revErr } = await admin
      .from("revision_requests")
      .update({ resolved_at: now })
      .eq("gallery_id", galleryId)
      .is("resolved_at", null);
    if (revErr) throw revErr;

    const { error } = await admin
      .from("galleries")
      .update({ status: "awaiting_approval", updated_at: now })
      .eq("id", galleryId);
    if (error) throw error;

    // BB-052: mốc "đã chuyển file cho khách" trước nay không nằm ở đâu ngoài
    // cột `deliveries.updated_at`, mà cột đó bị lượt chuyển sau ghi đè.
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.retouch_sent",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      // Không ghi địa chỉ Drive: nhật ký đọc được rộng hơn, và đó là đường vào
      // thẳng thư mục ảnh của một đứa bé.
      metadata: { daCoBanGiaoTruoc: Boolean(existing) },
    });

    return ok({ status: "awaiting_approval", finalDriveUrl: url });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền gửi ảnh cho khách");
    return failUnexpected(err, requestId);
  }
}
