/**
 * GET /api/g/<token>/bia-vuong?w=192|512|180 — icon màn hình chính riêng cho
 * từng link, cắt VUÔNG từ ảnh bìa của bộ ảnh.
 *
 * OWNER: Sonnet (BB-213). Chủ studio 24/09/2026: "hiển thị trên màn khách khi
 * gắn ra màn chính là ảnh bìa bộ hình."
 *
 * Quyền xem đến từ CHÍNH MÃ TRONG ĐƯỜNG DẪN (xem
 * src/lib/auth/xac-thuc-token-bo-anh.ts) — không phải cookie phiên, vì hệ
 * điều hành/trình duyệt gọi route này lúc "Thêm vào màn hình chính" mà không
 * chắc luôn kèm cookie. Sai mã / đã thu hồi / hết hạn đều trả 404 — không nói
 * lý do, giống hệt cách /api/auth/gallery từ chối các ca này.
 */
// BB-334A: phần cắt/đệm/logo tách sang src/lib/gallery/bia-vuong-server.ts
// (dùng chung với /api/k/<mã>/bia-vuong) — luật không đổi.
import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";
import { parseSize, phucVuBiaVuong, coKhongHopLe } from "@/lib/gallery/bia-vuong-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { token } = await context.params;
    const size = parseSize(new URL(request.url).searchParams.get("w"));
    if (!size) return coKhongHopLe();

    const boAnh = await xacThucTokenBoAnh(token);
    if (!boAnh) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    return await phucVuBiaVuong(request, boAnh, size, requestId);
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
