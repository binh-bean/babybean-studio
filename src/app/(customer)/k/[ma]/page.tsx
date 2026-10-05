import type { Metadata } from "next";
import { TrangGiaDinh } from "@/components/features/gallery/trang-gia-dinh";
import { metadataNha } from "./metadata";

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
  return (
    <main className="min-h-[100dvh] bg-background">
      <TrangGiaDinh ma={ma} />
    </main>
  );
}
