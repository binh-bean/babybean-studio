/**
 * GET /api/k/<mã>/manifest.webmanifest — manifest PWA theo NHÀ (BB-334A).
 *
 * Anh chốt Q7 ★: tên "Nhà bé …", icon = bìa của bộ mới nhất. `start_url` là
 * trang gia đình `/k/<mã>`, `scope` `/k/<mã>/` — app cài xong luôn mở vào nhà.
 * Quyền từ chính mã trong đường dẫn (xem src/lib/gia-dinh/xac-thuc-ma-nha.ts).
 * Sai/thu hồi/hết hạn: 404 trần, không nói lý do (như BB-213).
 * Hợp đồng: docs/29-link-gia-dinh.md §2.2.
 */
import { xacThucMaNha } from "@/lib/gia-dinh/xac-thuc-ma-nha";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ma: string }> },
): Promise<Response> {
  const { ma } = await context.params;
  const nha = await xacThucMaNha(ma);
  if (!nha) return new Response("Not found", { status: 404 });

  const goc = `/k/${encodeURIComponent(ma)}`;
  const manifest = {
    name: nha.tenNha,
    short_name: nha.tenNgan,
    description: "Album ảnh của gia đình tại Baby Bean Studio",
    start_url: goc,
    scope: `${goc}/`,
    display: "standalone",
    orientation: "portrait",
    // Kem #f7f2eb — màu nền chuẩn màn khách (giống manifest theo bộ BB-213).
    background_color: "#f7f2eb",
    theme_color: "#f7f2eb",
    icons: nha.bia
      ? [
          { src: `${goc.replace("/k/", "/api/k/")}/bia-vuong?w=192`, sizes: "192x192", type: "image/jpeg", purpose: "any" },
          { src: `${goc.replace("/k/", "/api/k/")}/bia-vuong?w=512`, sizes: "512x512", type: "image/jpeg", purpose: "any" },
        ]
      : [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=3600" },
  });
}
