import { Metadata } from "next";
import { GalleryApp } from "@/components/features/gallery/gallery-app";
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";
import { TEN_NGAN_MAC_DINH } from "@/lib/utils/dinh-dang";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * BB-213 — biểu tượng màn hình chính RIÊNG theo từng link (ảnh bìa bộ ảnh),
 * đè lên manifest/apple-touch-icon CHUNG ở layout gốc (src/app/layout.tsx).
 * Next.js gộp metadata theo tầng, trường trùng ở page thắng layout.
 *
 * Token sai/thu hồi/hết hạn không làm generateMetadata lỗi — page vẫn dựng
 * bình thường và tự báo lỗi ở tầng client (GalleryApp gọi /api/auth/gallery).
 * Ở đây chỉ lặng lẽ dùng tiêu đề/manifest mặc định, không tiết lộ gì thêm.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const boAnh = await xacThucTokenBoAnh(token);
  // BB-324 — MỘT tên ngắn cho mọi chỗ hệ điều hành đọc khi "Thêm vào màn hình
  // chính": iOS lấy `apple-mobile-web-app-title` (rồi tới `<title>`), Android
  // lấy `short_name` của manifest. "Bé Xoài" / "Bé Bảo An" / "Baby Bean".
  // `absolute`: không ghép đuôi "| BabyBean Studio" của layout gốc vào.
  const tenNgan = boAnh?.tenNgan ?? TEN_NGAN_MAC_DINH;

  return {
    title: { absolute: tenNgan },
    robots: { index: false, follow: false },
    manifest: `/api/g/${token}/manifest.webmanifest`,
    // Chỉ `title`. Next mặc định `capable: true` (thêm thẻ mobile-web-app-capable)
    // — tắt đi: cách mở app đã do `display` của manifest quyết định (BB-213).
    appleWebApp: { title: tenNgan, capable: false },
    // BB-324 — iOS KHÔNG đọc icon trong manifest: thiếu `apple-touch-icon`
    // thì nó CHỤP MÀN HÌNH trang làm icon (vài ảnh bất kỳ của lưới). Luôn khai
    // báo: ảnh bìa đã chọn cắt vuông giữa, chưa có bìa thì logo Baby Bean.
    icons: {
      apple: [
        boAnh?.coverDriveFileId
          ? { url: `/api/g/${token}/bia-vuong?w=180`, sizes: "180x180", type: "image/jpeg" }
          : { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

export default async function GalleryPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="min-h-[100dvh] bg-background">
      <GalleryApp token={token} />
    </main>
  );
}
