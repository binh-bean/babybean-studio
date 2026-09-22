/**
 * POST /api/g/review — khách duyệt ảnh đã chỉnh, hoặc yêu cầu sửa.
 *
 * OWNER: DEV-BE. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 *   { decision: "approve" }              → approved, chuyển sang in
 *   { decision: "revise", note: "..." }  → quay lại in_retouch, ghi vòng mới
 *
 * ---------------------------------------------------------------------------
 * Một route cho hai quyết định, không phải hai route
 * ---------------------------------------------------------------------------
 * Hai quyết định này loại trừ nhau và cùng đọc một trạng thái. Tách đôi thì
 * phải kiểm cùng một điều kiện ở hai nơi, và hai nơi đó sẽ trôi khỏi nhau —
 * đúng chuyện đã xảy ra với danh sách trạng thái khoá ở 0034.
 *
 * ---------------------------------------------------------------------------
 * Yêu cầu sửa BẮT BUỘC viết gì đó
 * ---------------------------------------------------------------------------
 * "Yêu cầu sửa" mà không nói sửa gì thì người photoshop không làm được, và họ
 * sẽ gọi lại hỏi — tức là khách phải trả lời hai lần cho một việc.
 *
 * ---------------------------------------------------------------------------
 * Chỉ khách CHÍNH được quyết
 * ---------------------------------------------------------------------------
 * Cùng luật với lúc chốt chọn ảnh. Bà hay dì được mời vào xem và gợi ý, nhưng
 * quyết định cuối là của người đứng tên hợp đồng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const MAX_NOTE = 1000;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới duyệt được ảnh");
    }

    const body = (await request.json().catch(() => null)) as {
      decision?: string;
      note?: string;
    } | null;

    const decision = body?.decision;
    if (decision !== "approve" && decision !== "revise") {
      return fail("INVALID_INPUT", "Thiếu quyết định duyệt hoặc yêu cầu sửa");
    }

    const note = (body?.note ?? "").trim();
    if (decision === "revise") {
      if (note.length === 0) {
        return fail("INVALID_INPUT", "Ba mẹ ghi giúp cần sửa gì, để bên chỉnh ảnh làm đúng ý");
      }
      if (note.length > MAX_NOTE) {
        return fail("INVALID_INPUT", `Ghi chú tối đa ${MAX_NOTE} ký tự`);
      }
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", session.galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    // Chỉ duyệt được khi đang chờ duyệt. Bấm hai lần, hoặc mở lại link cũ sau
    // khi đã duyệt, đều rơi vào đây — và câu trả lời phải nói rõ đang ở đâu
    // chứ không phải "có lỗi xảy ra".
    if (gallery.status !== "awaiting_approval") {
      return fail(
        "INVALID_INPUT",
        gallery.status === "approved"
          ? "Ba mẹ đã duyệt bộ ảnh này rồi, studio đang chuẩn bị in."
          : "Bộ ảnh chưa tới bước duyệt ảnh đã chỉnh.",
      );
    }

    const now = new Date().toISOString();

    if (decision === "approve") {
      const { error } = await admin
        .from("galleries")
        .update({ status: "approved", updated_at: now })
        .eq("id", gallery.id);
      if (error) throw error;

      const { error: resErr } = await admin
        .from("revision_requests")
        .update({ resolved_at: now })
        .eq("gallery_id", gallery.id)
        .is("resolved_at", null);
      if (resErr) throw resErr;

      // BB-052: đây là một QUYẾT ĐỊNH của khách, ngang với lúc chốt chọn ảnh.
      // Không ghi thì sau này "khách duyệt lúc nào, hay studio tự chuyển" chỉ
      // còn dựa vào `galleries.updated_at` — cột bị mọi lượt sửa khác ghi đè.
      await ghiNhatKy({
        actorType: "customer",
        actorLabel: "khách",
        branchId: gallery.branch_id,
        action: "gallery.review_approved",
        entityType: "gallery",
        entityId: gallery.id,
        galleryId: gallery.id,
      });

      return ok({ status: "approved" });
    }

    // Yêu cầu sửa: ghi vòng mới rồi trả bộ ảnh về cho người photoshop.
    const { data: last } = await admin
      .from("revision_requests")
      .select("round")
      .eq("gallery_id", gallery.id)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle();

    const round = (last?.round ?? 0) + 1;

    // Giữ lại link bản khách đang xem lúc chê — vòng sau file khác rồi, không
    // lưu thì không ai biết khách chê BẢN NÀO.
    const { data: delivery } = await admin
      .from("deliveries")
      .select("final_drive_url")
      .eq("gallery_id", gallery.id)
      .maybeSingle();

    const { error: insErr } = await admin.from("revision_requests").insert({
      gallery_id: gallery.id,
      round,
      note,
      reviewed_url: delivery?.final_drive_url ?? null,
    });
    if (insErr) throw insErr;

    const { error } = await admin
      .from("galleries")
      .update({ status: "in_retouch", updated_at: now })
      .eq("id", gallery.id);
    if (error) throw error;

    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khách",
      branchId: gallery.branch_id,
      action: "gallery.review_revise",
      entityType: "gallery",
      entityId: gallery.id,
      galleryId: gallery.id,
      // Nội dung khách viết nằm ở `revision_requests.note`; ở đây chỉ cần đủ
      // để lần ra đúng vòng đó.
      metadata: { round },
    });

    return ok({ status: "in_retouch", round });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
