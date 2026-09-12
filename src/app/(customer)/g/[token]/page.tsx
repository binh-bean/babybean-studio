import { Metadata } from "next";
import { GalleryApp } from "@/components/features/gallery/gallery-app";

export const metadata: Metadata = {
  title: "Chọn ảnh buổi chụp | BabyBean Studio",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function GalleryPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="min-h-[100dvh] bg-background">
      <GalleryApp token={token} />
    </main>
  );
}
