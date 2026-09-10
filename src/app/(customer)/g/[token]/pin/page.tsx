import { Metadata } from "next";
import { PinForm } from "@/components/features/gallery/pin-form";

export const metadata: Metadata = {
  title: "Nhập mã PIN | BabyBean Studio",
  robots: { index: false, follow: false },
};

interface PinPageProps {
  params: Promise<{ token: string }>;
}

export default async function PinPage({ params }: PinPageProps) {
  const { token } = await params;

  return (
    <main className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 bg-[var(--bb-bg)]">
      <PinForm token={token} />
    </main>
  );
}
