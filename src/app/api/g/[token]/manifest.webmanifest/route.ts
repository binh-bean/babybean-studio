/**
 * GET /api/g/<token>/manifest.webmanifest — manifest PWA RIÊNG cho từng link
 * xem ảnh (khác manifest chung ở src/app/manifest.ts, dùng cho trang chủ và
 * màn quản trị).
 *
 * OWNER: Sonnet (BB-213). Chủ studio 24/09/2026: mỗi bộ ảnh một tên/icon
 * riêng khi ba mẹ "Thêm vào màn hình chính" — không phải icon BabyBean chung.
 *
 * Không dùng file convention `manifest.ts` của Next.js cho route động này:
 * quy ước đó không tài liệu hoá việc nhận `params` theo segment, còn route
 * handler thường thì chắc chắn nhận được `token` và tự kiểm quyền — an toàn
 * hơn là đặt cược vào hành vi chưa công bố của framework cho đúng một route
 * mang tính bảo mật (mỗi manifest gắn với đúng MỘT bộ ảnh của MỘT nhà).
 *
 * Không tồn tại/đã thu hồi/hết hạn: 404, không JSON, không tiết lộ lý do.
 */
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";

export const runtime = "nodejs";

const KHONG_TIM_THAY = new Response("Not found", { status: 404 });

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const boAnh = await xacThucTokenBoAnh(token);
  if (!boAnh) return KHONG_TIM_THAY;

  const scope = `/g/${token}`;
  const ten = boAnh.tenBe ? `Ảnh của bé ${boAnh.tenBe}` : "BabyBean";
  // Android cắt bớt short_name khi hiện dưới icon màn hình chính; 12 ký tự là
  // đủ cho tên bé một, hai chữ mà không tràn dòng.
  const tenNgan = boAnh.tenBe ? boAnh.tenBe.slice(0, 12) : "BabyBean";

  const manifest = {
    name: ten,
    short_name: tenNgan,
    description: "Cổng xem và chọn ảnh dành cho ba mẹ tại BabyBean Studio",
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "portrait",
    // Kem #f7f2eb — đúng màu nền chuẩn màn khách (.giao-dien-khach trong
    // src/styles/tokens.css), không phải màu của manifest chung.
    background_color: "#f7f2eb",
    theme_color: "#f7f2eb",
    icons: boAnh.coverDriveFileId
      ? [
          {
            src: `/api/g/${token}/bia-vuong?w=192`,
            sizes: "192x192",
            type: "image/jpeg",
            purpose: "any",
          },
          {
            src: `/api/g/${token}/bia-vuong?w=512`,
            sizes: "512x512",
            type: "image/jpeg",
            purpose: "any",
          },
        ]
      : // Bộ ảnh chưa có tấm nào (đang đồng bộ Drive) — dùng tạm logo chung
        // thay vì icon rỗng.
        [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
