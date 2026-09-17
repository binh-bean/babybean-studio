"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { getPrimaryHotline } from "./actions";

export default function ErrorPage({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getDictionary("vi");
  const [hotline, setHotline] = useState<string | null>(null);

  useEffect(() => {
    // Attempt to fetch the hotline for support display
    getPrimaryHotline().then(setHotline).catch(() => {});
  }, []);

  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <h1 className="text-4xl font-bold text-foreground mb-4">500</h1>
      <h2 className="text-xl font-semibold mb-2">
        {t.errorPages.serverErrorTitle}
      </h2>
      <p className="text-muted-foreground mb-8">
        {t.errorPages.serverErrorBody}
      </p>

      {hotline && (
        <p className="font-medium text-foreground mb-8">
          {t.errorPages.contactSupport.replace("{hotline}", hotline)}
        </p>
      )}

      <div className="flex gap-4">
        <button
          onClick={reset}
          className="bg-secondary text-secondary-foreground px-6 py-2 rounded-md font-medium hover:bg-secondary/90 transition-colors border border-border"
        >
          {t.common.retry}
        </button>
        <Link
          href="/"
          className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          {t.errorPages.backHome}
        </Link>
      </div>
    </main>
  );
}
