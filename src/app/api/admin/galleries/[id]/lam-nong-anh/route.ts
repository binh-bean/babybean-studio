/**
 * POST /api/admin/galleries/[id]/lam-nong-anh — nút "Làm nóng ảnh" ở màn chi
 * tiết bộ ảnh quản trị.
 *
 * OWNER: DEV-INT. Task BB-286.
 * Đề xuất #5a của báo cáo vận hành 27/09/2026 (mục 4, đề xuất #5): bộ đệm ảnh
 * mới phủ 4,3% (11/490 bộ) — khách mở một bộ mới toanh thì gần như tấm nào
 * cũng phải đợi kéo từ Google.
 *
 * Hàm dùng chung nằm ở `src/lib/drive/lam-nong-cache.ts` — CSKH tạo link gửi
 * khách (`/share-link`) cũng gọi đúng hàm đó, chạy nền, nhưng CHỈ ĐÚNG MỘT LÔ
 * (đề bài giả định gói Hobby, xem đầu tệp `lam-nong-cache.ts`): đủ lo trước
 * màn hình đầu tiên khách sẽ thấy, không đủ nong hết một bộ 1.235 ảnh. Route
 * này — gọi LẶP LẠI từ trình duyệt (`lamNongAnh()` ở `gallery-detail.tsx`) —
 * là cách làm nóng HẾT cả bộ ảnh.
 *
 * Thân trả về đủ số liệu để màn hình vẽ "đã nóng N/M ảnh" — không cần bảng
 * mới, xem đầu tệp `lam-nong-cache.ts`.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { lamNongMotLo } from "@/lib/drive/lam-nong-cache";

export const runtime = "nodejs";
// GIẢ ĐỊNH HẠ TẦNG: gói Hobby — 60 giây là mức TỐI ĐA Hobby cho phép (mặc
// định chỉ 10s). Một lô 40 ảnh (KICH_THUOC_LO_LAM_NONG) an toàn trong mức
// này; trình duyệt gọi lặp route này tới khi xong cả bộ. Xem đầu tệp
// lam-nong-cache.ts.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
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

    const url = new URL(request.url);
    const sauSortIndexTho = Number(url.searchParams.get("sauSortIndex") ?? "0");
    const sauSortIndex = Number.isFinite(sauSortIndexTho) ? sauSortIndexTho : 0;

    const ketQua = await lamNongMotLo(admin, galleryId, sauSortIndex, requestId);

    return ok({
      conTroTiep: ketQua.conTroTiep,
      soDaXuLyLoNay: ketQua.soDaXuLyLoNay,
      soDaCoSanLoNay: ketQua.soDaCoSanLoNay,
      soMoiNongLoNay: ketQua.soMoiNongLoNay,
      soLoiLoNay: ketQua.soLoiLoNay,
      conAnhChuaXuLy: ketQua.conAnhChuaXuLy,
      dungVìQuota: ketQua.dungVìQuota,
      tongSoAnh: ketQua.tongSoAnh,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED");
    return failUnexpected(err, requestId);
  }
}
