"use client";

/**
 * Đăng nhập nhân viên.
 *
 * OWNER: SEC-ARCH. Task BB-020, BB-063.
 *
 * Nhận cả tên tài khoản lẫn email. Nhiều thợ ảnh và retoucher không dùng email;
 * chủ studio cấp cho họ một tên tài khoản, hệ thống ghép tên miền nội bộ phía
 * sau — docs/13-quyet-dinh-van-hanh.md §8.
 *
 * useSearchParams() làm cây con thoát khỏi kết xuất tĩnh, nên phải nằm trong
 * Suspense, nếu không `next build` hỏng lúc dựng sẵn /login.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Input, Card, Spinner } from "@/components/ui";
import { toAuthEmail } from "@/lib/auth/username";
import { vi } from "@/i18n/vi";

function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: toAuthEmail(identifier),
        password,
      });

      if (signInError) {
        // Sai tên tài khoản và sai mật khẩu trả cùng một câu: tách ra là nói
        // cho người lạ biết tài khoản nào có thật.
        setError(vi.admin.login.errorInvalid);
        return;
      }

      // Ghi lại lần đăng nhập để màn nhân sự biết ai còn dùng tài khoản.
      // Hỏng thì kệ, không chặn người ta vào làm việc.
      void fetch("/api/auth/session", { method: "POST" }).catch(() => {});

      const next = searchParams.get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";

      router.push(target);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleLogin} className="mt-6 space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] px-3 py-2 text-sm text-[var(--bb-danger)]"
        >
          {error}
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--bb-fg)]">
          Tên tài khoản hoặc email
        </span>
        <Input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoFocus
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          placeholder="linh.q1"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-[var(--bb-fg)]">Mật khẩu</span>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? vi.admin.login.loggingIn : vi.admin.login.submit}
      </Button>

      <p className="text-center text-xs text-[var(--bb-fg-muted)]">
        Quên mật khẩu? Nhờ chủ studio đặt lại giúp.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full p-6">
        <h1 className="text-xl font-semibold text-[var(--bb-fg)]">BabyBean Studio</h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">Đăng nhập dành cho nhân viên</p>
        <Suspense
          fallback={
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </Card>
    </main>
  );
}
