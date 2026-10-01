/**
 * GET /api/g/tuc-thi — tên kênh "cập nhật tức thì" của bộ ảnh trong phiên khách.
 *
 * OWNER: DEV-BE. Task BB-342. Xem src/lib/supabase/tuc-thi.ts (vì sao tên kênh
 * là HMAC chỉ máy chủ tính được).
 *
 * Bộ ảnh lấy từ COOKIE PHIÊN đã ký — không nhận id từ query/body. Một mã link
 * của bộ khác chỉ đổi được phiên sang bộ khác, nên chỉ nhận được kênh của bộ
 * khác đó, không bao giờ nhận kênh của bộ này (phép thử phủ định:
 * tests/security/bb-342-kenh-tuc-thi.test.ts).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { kenhKhach } from "@/lib/supabase/tuc-thi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requireGallerySession();
    // Link gắn theo khách chưa chọn buổi chụp nào (BB-130): chưa có bộ để nghe.
    return ok({ kenh: session.galleryId ? [kenhKhach(session.galleryId)] : [] });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
