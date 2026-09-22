/**
 * POST /api/g/xin-sua-lai — ba mẹ xin mở lại bộ ảnh đã khoá.
 *
 * OWNER: DEV-BE. Chủ studio 22/09/2026:
 *
 *     "Khách chọn ảnh xong nhấn chốt, lát sau muốn sửa lại thì cần có nút yêu
 *      cầu sửa lại. Nếu phía nhân sự chưa chốt [thì tự sửa được], hoặc nếu
 *      nhân sự đã chốt thì cần yêu cầu nhân sự mở lại để sửa, nếu còn đủ điều
 *      kiện sửa."
 *
 * ---------------------------------------------------------------------------
 * Đường này CHỈ dành cho lúc đã khoá
 * ---------------------------------------------------------------------------
 * Từ migration 0060, bộ ảnh chỉ khoá khi CSKH đã xác nhận và chuyển cho thợ
 * chỉnh ảnh. Trước mốc đó ba mẹ sửa thẳng được, không cần xin ai.
 *
 * Nên nếu bộ ảnh CHƯA khoá mà vẫn gọi đường này, ta trả về một câu nói rõ điều
 * đó thay vì gửi một yêu cầu vô nghĩa cho CSKH — họ sẽ mất công gọi lại để nói
 * "chị cứ sửa thoải mái".
 *
 * ---------------------------------------------------------------------------
 * Không tự mở, mà BÁO cho người quyết
 * ---------------------------------------------------------------------------
 * Lúc này công của thợ chỉnh ảnh đã đổ vào danh sách cũ. Mở lại là quyết định
 * có hậu quả, và người biết đủ để quyết là CSKH — họ nhìn được đã chỉnh tới
 * đâu, đã in chưa. App chỉ mang lời của ba mẹ tới đúng chỗ, kèm lý do.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGalleryLocked, GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { enqueueLarkNotification } from "@/lib/lark/notify";

export const runtime = "nodejs";

const MAX_LY_DO = 500;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requireGallerySession();

    // Cùng luật với nút Chốt: quyết định cuối là của người đứng tên hợp đồng.
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ ba mẹ đứng tên mới xin sửa lại được");
    }

    const body = (await request.json().catch(() => null)) as { lyDo?: string } | null;
    const lyDo = (body?.lyDo ?? "").trim();
    if (lyDo.length === 0) {
      return fail("INVALID_INPUT", "Ba mẹ ghi giúp em muốn sửa gì, để bên mình xem có kịp không");
    }
    if (lyDo.length > MAX_LY_DO) {
      return fail("INVALID_INPUT", `Lời nhắn tối đa ${MAX_LY_DO} ký tự`);
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, title, status")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    if (!isGalleryLocked(gallery.status)) {
      return fail(
        "INVALID_INPUT",
        "Bộ ảnh vẫn đang mở — ba mẹ sửa trực tiếp được, không cần xin ạ.",
      );
    }

    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khách",
      branchId: String(gallery.branch_id),
      action: "gallery.reopen_requested",
      entityType: "gallery",
      entityId: String(gallery.id),
      galleryId: String(gallery.id),
      metadata: { lyDo, trangThaiLucXin: gallery.status },
    });

    // Báo vào nhóm Lark của chi nhánh. Không có nhóm thì dòng nhật ký ở trên
    // vẫn còn, và màn Nhật ký thao tác là chỗ CSKH đọc được.
    await enqueueLarkNotification({
      branchId: String(gallery.branch_id),
      event: "gallery.reopen_requested",
      payload: {
        galleryId: String(gallery.id),
        galleryTitle: String(gallery.title),
        trangThai: GALLERY_STATUS_LABEL[gallery.status] ?? gallery.status,
        lyDo,
      },
    });

    return ok({
      daGui: true,
      // Câu này hiện thẳng cho ba mẹ: nói rõ chuyện gì xảy ra tiếp theo, thay
      // vì một chữ "đã gửi" rồi im lặng.
      loiNhan: "Bên mình đã nhận yêu cầu và sẽ liên hệ lại với ba mẹ sớm nhất.",
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
