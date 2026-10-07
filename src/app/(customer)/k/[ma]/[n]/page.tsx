import type { Metadata } from "next";
import { BoAnhTrongNha } from "@/components/features/gallery/bo-anh-trong-nha";
import { metadataNha } from "../metadata";
import { layChatUrlCoDem } from "@/app/(customer)/chat-url-co-dem";

/**
 * BB-334B — bộ thứ n của gia đình `/k/<mã>/<n>` (docs/29 §1, §6): dựng LẠI màn
 * chọn ảnh hiện có (GalleryApp), mọi lượt gọi `/api/g/*` mang `x-bb-bo`.
 * OWNER: DEV-FE.
 */
interface PageProps {
  params: Promise<{ ma: string; n: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ma } = await params;
  return metadataNha(ma);
}

export default async function BoAnhTrongNhaPage({ params }: PageProps) {
  const { ma, n } = await params;
  // BB-378 — "Nhắn Bean" cho màn link hết hạn/không tìm thấy.
  const chatUrl = await layChatUrlCoDem();
  return (
    <main className="min-h-[100dvh] bg-background">
      <BoAnhTrongNha ma={ma} n={n} chatUrl={chatUrl} />
    </main>
  );
}
