import type { Metadata } from "next";
import { TrangGiaDinh } from "@/components/features/gallery/trang-gia-dinh";
import { metadataNha } from "./metadata";
import { layChatUrlCoDem } from "@/app/(customer)/chat-url-co-dem";

/**
 * BB-334B — trang album gia đình `/k/<mã>` (docs/29 §2.1, bản vẽ 01/02).
 * OWNER: DEV-FE.
 */
interface PageProps {
  params: Promise<{ ma: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ma } = await params;
  return metadataNha(ma);
}

export default async function TrangGiaDinhPage({ params }: PageProps) {
  const { ma } = await params;
  // BB-378 — "Nhắn Bean" cho màn link hết hạn/không tìm thấy.
  const chatUrl = await layChatUrlCoDem();
  return (
    <main className="min-h-[100dvh] bg-background">
      <TrangGiaDinh ma={ma} chatUrl={chatUrl} />
    </main>
  );
}
