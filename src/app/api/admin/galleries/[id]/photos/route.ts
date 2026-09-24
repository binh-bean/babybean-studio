/**
 * GET /api/admin/galleries/[id]/photos — lưới ảnh của MỘT bộ, cho CSKH chọn
 * ảnh bìa.
 *
 * OWNER: DEV-BE. Task BB-215.
 *
 * ---------------------------------------------------------------------------
 * Vì sao thêm đường mới thay vì tái dùng `/api/g/photos`
 * ---------------------------------------------------------------------------
 * `/api/g/photos` xác thực bằng phiên khách qua link (`requireGallerySession`)
 * và luôn trả ảnh của ĐÚNG bộ đang mở trong phiên đó — không nhận `galleryId`
 * làm tham số. Màn quản trị xác thực bằng tài khoản nhân viên
 * (`requireStaff`) và cần xem ảnh của MỘT bộ chỉ định theo `id` trên đường
 * dẫn, có thể khác bộ ảnh phiên khách nào đang mở. Hai luồng quyền khác nhau,
 * gộp lại là phải chọn nhánh if xấu hoặc phải nới lỏng phiên khách — cả hai
 * đều đắt hơn một route mới, gọn.
 *
 * Chỉ trả những gì lưới ảnh bìa cần: id, tên tệp, kích thước để dựng khung.
 * Không trả `mark`/lựa chọn của khách — CSKH chọn bìa không cần biết khách đã
 * tim tấm nào.
 */

import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIOI_HAN_MAC_DINH = 60;
const GIOI_HAN_TOI_DA = 200;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const staff = await requireStaff();
    const admin = createAdminClient();

    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (gErr) return failUnexpected(gErr, requestId);
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    requireBranch(staff, gallery.branch_id);

    const url = new URL(request.url);
    const gioiHanThoY = Number(url.searchParams.get("limit") ?? GIOI_HAN_MAC_DINH);
    const gioiHan = Number.isFinite(gioiHanThoY)
      ? Math.min(GIOI_HAN_TOI_DA, Math.max(1, Math.trunc(gioiHanThoY)))
      : GIOI_HAN_MAC_DINH;
    const conTuSort = Number(url.searchParams.get("sauSortIndex") ?? "0");
    const conTu = Number.isFinite(conTuSort) ? conTuSort : 0;

    // Ảnh `hidden` (CSKH đã cố ý giấu khỏi khách) và `missing` (biến mất khỏi
    // Drive) không đáng để làm bìa — bỏ khỏi lưới chọn.
    const { data: photos, error: pErr } = await admin
      .from("photos")
      .select("id, file_name, width, height, subfolder, sort_index")
      .eq("gallery_id", galleryId)
      .eq("status", "active")
      .gt("sort_index", conTu)
      .order("sort_index", { ascending: true })
      .limit(gioiHan + 1);

    if (pErr) return failUnexpected(pErr, requestId);

    const rows = photos ?? [];
    const hasMore = rows.length > gioiHan;
    const trang = hasMore ? rows.slice(0, gioiHan) : rows;
    // `cursor` mang sort_index của tấm cuối trang — màn hình gửi lại nguyên
    // giá trị đó vào `sauSortIndex` của lượt cuộn tiếp theo. Dùng lại trường
    // `cursor` sẵn có trong ApiMeta (docs/04) thay vì thêm trường mới.
    const cuoiTrang = trang[trang.length - 1];
    const cursor = cuoiTrang ? String(cuoiTrang.sort_index) : undefined;

    return ok(
      trang.map((p) => ({
        id: p.id,
        fileName: p.file_name,
        width: p.width,
        height: p.height,
        subfolder: p.subfolder,
        sortIndex: p.sort_index,
      })),
      { hasMore, cursor },
    );
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
