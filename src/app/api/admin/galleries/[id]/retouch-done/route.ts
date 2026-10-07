/**
 * POST /api/admin/galleries/[id]/retouch-done — đường CŨ "CSKH dán link Drive ảnh đã
 * chỉnh → chờ khách duyệt" (BB-121).
 *
 * OWNER: DEV-BE. Task BB-121, đổi ở BB-384.
 *
 * ---------------------------------------------------------------------------
 * BB-384 (07/10/2026) — không còn đường gửi khách bằng link Drive
 * ---------------------------------------------------------------------------
 * Anh chụp màn khách: bộ ở bước "Duyệt ảnh" hiện khung cũ — link "Mở thư mục ảnh đã
 * chỉnh" + hai nút duyệt/xin sửa với MỘT ô chữ chung — vì CSKH gửi bằng đường này:
 * bộ sang `awaiting_approval` mà app không có tấm ảnh chỉnh nào. Anh muốn vòng duyệt
 * như Bản yêu cầu: xem từng tấm, ghi chú, khoanh vùng, gửi ảnh mẫu NGAY TRONG APP.
 *
 * Nay mọi đường đưa bộ sang chờ khách duyệt đi qua ảnh chỉnh trong app: route này làm
 * ĐÚNG việc của "Gửi khách duyệt" (`anh-chinh-sua/gui-khach`) — dùng ảnh đã kéo từ thư
 * mục con "ảnh chỉnh sửa", link Drive trong thân (nếu màn cũ còn gửi) bị bỏ qua. Không
 * có ảnh chỉnh trong app thì chặn với câu nói rõ phải bấm Đồng bộ ảnh trước.
 */

import { POST as guiKhachDuyet } from "../anh-chinh-sua/gui-khach/route";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Thân rỗng = gửi vòng TRONG GÓI (đợt mua thêm gửi riêng ở màn quản trị).
  return guiKhachDuyet(
    new Request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    context,
  );
}
