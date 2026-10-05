/**
 * GET /api/k/<mã>/bia-vuong?w=180|192|512 — icon màn hình chính theo NHÀ
 * (BB-334A): bìa của bộ mới nhất có bìa, cắt vuông; chưa có bìa → logo.
 * Quyền từ chính mã trong đường dẫn; sai/thu hồi/hết hạn → 404.
 * Phần cắt/đệm dùng chung với BB-213: src/lib/gallery/bia-vuong-server.ts.
 */
import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { xacThucMaNha } from "@/lib/gia-dinh/xac-thuc-ma-nha";
import { parseSize, phucVuBiaVuong, coKhongHopLe, veLogo } from "@/lib/gallery/bia-vuong-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ ma: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { ma } = await context.params;
    const size = parseSize(new URL(request.url).searchParams.get("w"));
    if (!size) return coKhongHopLe();

    const nha = await xacThucMaNha(ma);
    if (!nha) return fail("NOT_FOUND", "Không tìm thấy");
    if (!nha.bia) return veLogo(request, size);
    return await phucVuBiaVuong(request, nha.bia, size, requestId);
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
