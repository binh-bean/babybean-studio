/**
 * BB-334B — metadata chung của `/k/<mã>` và `/k/<mã>/<n>`: manifest + icon
 * màn hình chính THEO NHÀ (docs/29 §2.2), tên ngắn dưới icon, không lập chỉ mục.
 *
 * OWNER: DEV-FE. Mã sai/thu hồi/hết hạn: không ném — trang vẫn dựng và tự báo
 * lỗi ở trình duyệt (như `/g/[token]`), ở đây chỉ dùng tên mặc định.
 */
import type { Metadata } from "next";
import { xacThucMaNha } from "@/lib/gia-dinh/xac-thuc-ma-nha";
import { TEN_NGAN_MAC_DINH } from "@/lib/utils/dinh-dang";

export async function metadataNha(ma: string): Promise<Metadata> {
  const nha = await xacThucMaNha(ma).catch(() => null);
  const tenNgan = nha?.tenNgan ?? TEN_NGAN_MAC_DINH;
  const goc = `/api/k/${encodeURIComponent(ma)}`;
  return {
    title: { absolute: tenNgan },
    robots: { index: false, follow: false },
    // Như /g/[token] (BB-330): không khai og:url, ảnh xem trước chung, không tên bé.
    openGraph: {
      title: "Baby Bean Studio",
      description: "Ảnh của bé tại Baby Bean Studio",
      siteName: "Baby Bean Studio",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Baby Bean Studio" }],
      locale: "vi_VN",
      type: "website",
    },
    manifest: `${goc}/manifest.webmanifest`,
    appleWebApp: { title: tenNgan, capable: false },
    icons: {
      apple: [
        nha?.bia
          ? { url: `${goc}/bia-vuong?w=180`, sizes: "180x180", type: "image/jpeg" }
          : { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}
