/**
 * GET /api/admin/galleries/[id]/anh-chinh-sua/anh-mau?p=<đường dẫn> — ảnh minh hoạ (ảnh mẫu)
 * ba mẹ gửi kèm khi xin sửa, cho thợ/CSKH xem (BB-401 vòng 3).
 *
 * Vì sao đi qua app: trước đây màn quản trị nhúng thẳng URL KÝ của Supabase Storage, nhưng CSP
 * của app chỉ cho `img-src 'self' data: blob: lh3` (docs/12: ảnh đi qua proxy cùng origin) —
 * trình duyệt chặn, ảnh mẫu chưa từng hiện được (e2e bb-401 ca 2, 08/10: naturalWidth 0).
 * Không nới CSP: route này xét quyền xem bộ ảnh rồi trả BYTE ảnh cùng origin.
 *
 * Bucket `yeu-cau-sua` riêng tư; đường dẫn phải đúng dạng '<galleryId>/<uuid>.<đuôi>' CỦA ĐÚNG
 * bộ ảnh trong URL (`laDuongDanAnhMau`) — không đọc chéo bộ khác. Không lưu đệm công khai.
 */

import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { xetQuyenXemBoAnh, CAU_CHAN_BO_ANH } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_ANH_MAU, laDuongDanAnhMau } from "@/lib/anh-chinh-sua/du-lieu";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KIEU: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    const duongDan = new URL(request.url).searchParams.get("p");
    if (!laDuongDanAnhMau(duongDan, galleryId)) return fail("NOT_FOUND", "Không tìm thấy ảnh mẫu");

    const admin = createAdminClient();
    const { data: gallery } = await admin.from("galleries").select("id, branch_id, editor_id").eq("id", galleryId).maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    const lyDoChan = xetQuyenXemBoAnh(staff, gallery as { branch_id: string; editor_id: string | null });
    if (lyDoChan) return fail("FORBIDDEN", CAU_CHAN_BO_ANH[lyDoChan].tieuDe);

    const { data, error } = await admin.storage.from(BUCKET_ANH_MAU).download(duongDan);
    if (error || !data) return fail("NOT_FOUND", "Không tìm thấy ảnh mẫu");
    const duoi = duongDan.split(".").pop()!.toLowerCase();
    return new Response(await data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": KIEU[duoi] ?? "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
