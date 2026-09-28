/**
 * POST /api/admin/galleries/[id]/lam-nong-anh — nút "Làm nóng ảnh" ở màn chi
 * tiết bộ ảnh quản trị.
 *
 * OWNER: DEV-INT. Task BB-286, đơn giản hoá BB-311 mục A (28/09/2026).
 *
 * TRƯỚC: làm nóng cỡ 800 cho CẢ BỘ (tới 1.235 ảnh) — route này để trình
 * duyệt gọi LẶP LẠI theo lô 40 ảnh/lượt vì gói Hobby giới hạn thời lượng một
 * lần gọi hàm.
 *
 * TỪ 28/09/2026: `/api/img` không còn đệm ảnh lưới (chỉ đệm ảnh BÌA, w≥1600)
 * — nong cả bộ ở cỡ 800 không còn ý nghĩa (bị chính route đó bỏ qua khi đọc
 * lại). Route này giờ CHỈ làm nóng ẢNH BÌA của bộ (`lamNongAnhBia()`, đúng
 * MỘT ảnh × hai cỡ 1600/2048) — xong trong một lượt gọi, KHÔNG cần trình
 * duyệt lặp lại nữa.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { lamNongAnhBia } from "@/lib/drive/lam-nong-cache";

export const runtime = "nodejs";
// Chỉ 1 ảnh × 2 cỡ — không cần kịch trần 60s như trước, nhưng vẫn để dư so
// với mặc định 10s phòng khi Drive đang lùi (backoff) đúng lúc admin bấm nút.
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Cùng quyền với gửi link cho khách: người được quyền cho khách xem ảnh
    // thì cũng được quyền chuẩn bị trước cho việc đó chạy nhanh.
    requirePermission(staff, "galleries:share");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const ketQua = await lamNongAnhBia(admin, galleryId, requestId);

    return ok({
      coAnhBia: ketQua.coAnhBia,
      soDaCoSan: ketQua.soDaCoSan,
      soMoiNong: ketQua.soMoiNong,
      soLoi: ketQua.soLoi,
      dungVìQuota: ketQua.dungVìQuota,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED");
    return failUnexpected(err, requestId);
  }
}
