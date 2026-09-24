import { Metadata } from "next";
import { GalleryApp } from "@/components/features/gallery/gallery-app";
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";

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

  return {
    title: boAnh?.tenBe ? `Ảnh của bé ${boAnh.tenBe}` : "Chọn ảnh buổi chụp | BabyBean Studio",
    robots: { index: false, follow: false },
    manifest: `/api/g/${token}/manifest.webmanifest`,
    icons: boAnh?.coverDriveFileId
      ? {
          apple: [
            { url: `/api/g/${token}/bia-vuong?w=180`, sizes: "180x180", type: "image/jpeg" },
          ],
        }
      : undefined,
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
