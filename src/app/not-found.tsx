import { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { getPrimaryHotline } from "./actions";

export const metadata: Metadata = {
  title: "Không tìm thấy trang | BabyBean Studio",
};

export default async function NotFound() {
  const t = getDictionary("vi");
  const hotline = await getPrimaryHotline();

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
      <h2 className="text-xl font-semibold mb-2">
        {t.errorPages.notFoundTitle}
      </h2>
      <p className="text-muted-foreground mb-8">
        {t.errorPages.notFoundBody}
      </p>

      {hotline && (
        <p className="font-medium text-foreground mb-8">
          {t.errorPages.contactSupport.replace("{hotline}", hotline)}
        </p>
      )}

      <Link
        href="/"
        className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
      >
        {t.errorPages.backHome}
      </Link>
    </main>
  );
}
