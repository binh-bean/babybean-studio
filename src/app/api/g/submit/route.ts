/**
 * POST /api/g/submit — Khách bấm CHỐT album ảnh.
 *
 * OWNER: DEV-BE. Task BB-114.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §4, docs/04-api-spec.md §3.7
 *
 * Bốn luật:
 * 1. Chốt xong là KHOÁ (lần hai ném GALLERY_LOCKED).
 * 2. CHỈ CSKH mới chuyển được giai đoạn tiếp theo (khách không thể tự chuyển sang in_retouch).
 * 3. Lúc chốt phải CHỤP LẠI con số: số ảnh đã chọn, hạn mức, số thừa, tiền thừa ghi vào album và selection.
 * 4. Hạn mức chưa biết (app.gallery_quota trả null) thì KHÔNG cho chốt (trả QUOTA_UNKNOWN).
 */

import { isGalleryLocked } from "@/lib/gallery-status";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitSelectionSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Xác thực phiên khách hàng
    const session = await requireGallerySession();

    // Chỉ khách chính (owner) mới có quyền chốt
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới có quyền chốt bộ ảnh");
    }

    // 2. Parse & validate input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = SubmitSelectionSchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    // 3. Kiểm tra trạng thái album — Luật 1: Chốt xong là khoá
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, status, extra_photo_price, included_quota")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    // Danh sách chép tay ở đây từng thiếu 'awaiting_approval' và 'approved':
    // khách đang chờ duyệt ảnh đã chỉnh vẫn gọi được route này, đẩy bộ ảnh
    // ngược về 'submitted' và xoá mất giai đoạn chỉnh ảnh. Dùng chung
    // @/lib/gallery-status, khớp app.gallery_is_locked() bên SQL.
    if (isGalleryLocked(gallery.status)) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể thay đổi");
    }

    // 4. Kiểm tra hạn mức từ app.gallery_quota — Luật 4: Hạn mức chưa biết thì KHÔNG cho chốt
    const { data: quotaVal, error: quotaError } = await admin.rpc("gallery_quota", {
      p_gallery_id: session.galleryId,
    });

    if (quotaError) {
      throw quotaError;
    }

    if (quotaVal === null || quotaVal === undefined) {
      return fail(
        "QUOTA_UNKNOWN",
        "Studio chưa xác định số ảnh trong gói cho bộ ảnh này, vui lòng liên hệ CSKH"
      );
    }

    const includedQuota = Number(quotaVal);

    // 5. Đếm số ảnh đã chọn lúc này
    const { count: selectedCount, error: countError } = await admin
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "selected");

    if (countError) {
      throw countError;
    }

    const selected = selectedCount || 0;
    const extraCount = Math.max(0, selected - includedQuota);
    const extraAmount = extraCount * Number(gallery.extra_photo_price);
    const submittedAt = new Date().toISOString();

    // 6. Luật 3: Chụp lại con số — ghi vào album và selection
    // Cập nhật galleries: chuyển sang submitted, lưu hạn mức đã chụp
    const { error: updateGalleryError } = await admin
      .from("galleries")
      .update({
        status: "submitted",
        submitted_at: submittedAt,
        included_quota: includedQuota,
        updated_at: submittedAt,
      })
      .eq("id", session.galleryId);

    if (updateGalleryError) {
      throw updateGalleryError;
    }

    // Cập nhật selections: lưu snapshot số lượng, tiền phát sinh, người xác nhận
    const selectionUpdate: Record<string, unknown> = {
      submitted_at: submittedAt,
      submitted_by_name: input.confirmedByName,
      snapshot_selected_count: selected,
      snapshot_extra_count: extraCount,
      snapshot_extra_amount: extraAmount,
      updated_at: submittedAt,
    };
    if (input.generalNote !== undefined) {
      selectionUpdate.general_note = input.generalNote;
    }

    const { error: updateSelectionError } = await admin
      .from("selections")
      .update(selectionUpdate)
      .eq("id", session.selectionId);

    if (updateSelectionError) {
      throw updateSelectionError;
    }

    // 7. Lấy thông tin share_link để lấy token_prefix an toàn
    const { data: link } = await admin
      .from("share_links")
      .select("token_prefix")
      .eq("id", session.shareLinkId)
      .single();

    const tokenPrefix = link?.token_prefix || "******";

    // 8. Kênh báo: Ghi notification cho studio (Zalo OA / Lark)
    const { data: branch } = await admin
      .from("branches")
      .select("name, zalo_oa")
      .eq("id", gallery.branch_id)
      .single();

    await admin.from("notifications").insert({
      gallery_id: session.galleryId,
      channel: "lark",
      recipient: branch?.name || "Studio CSKH",
      template: "selection.submitted",
      status: "pending",
      payload: {
        galleryId: session.galleryId,
        branchId: gallery.branch_id,
        tokenPrefix, // Chỉ log 6 ký tự đầu, không log full token
        selectedCount: selected,
        includedQuota,
        extraCount,
        extraAmount,
        confirmedByName: input.confirmedByName,
        submittedAt,
      },
    });

    // 9. Ghi activity log
    await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: input.confirmedByName,
      action: "selection.submit",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        tokenPrefix,
        selectedCount: selected,
        includedQuota,
        extraCount,
        extraAmount,
      },
    });

    return ok({
      submittedAt,
      selectedCount: selected,
      includedQuota,
      extraCount,
      extraAmount,
      summaryUrl: `/g/${tokenPrefix}/done`,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
