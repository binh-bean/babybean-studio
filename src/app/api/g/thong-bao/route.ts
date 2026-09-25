/**
 * POST /api/g/thong-bao — khách bật thông báo đẩy trên trình duyệt hiện tại.
 * DELETE /api/g/thong-bao — khách tắt.
 *
 * OWNER: Sonnet (BB-246). Chủ studio: ba mẹ bật thông báo một lần trên màn
 * khách, rồi nhận tin khi ảnh đã chỉnh xong, mời duyệt — xem
 * src/lib/thong-bao/gui-day.ts (VÌ SAO không lưu link vào payload đẩy).
 *
 * ---------------------------------------------------------------------------
 * Upsert theo endpoint, không theo gallery_id
 * ---------------------------------------------------------------------------
 * `endpoint` DUY NHẤT toàn bảng (migration 0071): một trình duyệt = một
 * endpoint, bất kể bộ ảnh nào. Bấm "Bật thông báo" hai lần trên cùng máy
 * (mất kết nối, tải lại trang...) chỉ nên GHI ĐÈ đúng dòng đó, không sinh
 * dòng trùng — trùng dòng thì gửi thông báo cũng gửi trùng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DangKyThongBaoSchema, HuyThongBaoSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = DangKyThongBaoSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();
    const { error } = await admin
      .from("push_dang_ky")
      .upsert(
        {
          gallery_id: session.galleryId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw error;

    return ok({ dangKy: true });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // Vẫn đòi phiên hợp lệ — huỷ đăng ký không phải thao tác công khai, dù
    // xoá nhầm endpoint của người khác chỉ làm họ ngưng nhận thông báo (không
    // lộ dữ liệu). Giữ luật chung của mọi route /api/g/* cho nhất quán.
    await requireGallerySession();

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = HuyThongBaoSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("push_dang_ky")
      .delete()
      .eq("endpoint", parsed.data.endpoint);
    if (error) throw error;

    return ok({ dangKy: false });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
