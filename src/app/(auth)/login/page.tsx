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
import { Button, Input, Spinner } from "@/components/ui";
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
      // Về thẳng Quản lý bộ ảnh, KHÔNG về /admin.
      //
      // /admin là Bảng điều khiển, mà màn đó mới chỉ có dòng "Chưa triển khai
      // (BB-060)" — xem docs/17. Mục menu dẫn tới nó còn đang xám ghi "sắp có",
      // nên hai chỗ nói hai điều khác nhau về cùng một màn, và thứ đầu tiên nhân
      // viên thấy sau khi đăng nhập mỗi sáng là một trang trống.
      //
      // Đổi lại thành "/admin" khi BB-060 làm xong Bảng điều khiển.
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin/galleries";

      router.push(target);
      router.refresh();
    } catch {
      // Mất mạng, Supabase không trả lời, cấu hình thiếu biến môi trường — nếu
      // không bắt ở đây thì người dùng bấm Đăng nhập và KHÔNG THẤY GÌ XẢY RA,
      // rồi tưởng mình gõ sai mật khẩu.
      setError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
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

      {/* Bản vẽ dang-nhap.webp: nút chính viên tròn màu mực (#2E2A27 = --bb-fg),
          không phải hồng đất mặc định của <Button variant="default">. */}
      <Button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[var(--bb-fg)] text-[var(--bb-bg)] hover:opacity-90"
      >
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
    // Bản vẽ dang-nhap.webp: nửa trái tranh tĩnh vật trên nền kem, nửa phải
    // form hẹp giữa trang. Dưới 768px chỉ còn form — không đủ chỗ cho tranh,
    // và tranh chỉ minh hoạ, không mang thông tin cần đọc.
    <main className="flex min-h-screen w-full bg-[var(--bb-bg)]">
      <div
        aria-hidden="true"
        className="relative hidden w-1/2 overflow-hidden bg-[#fbf7f2] md:block"
      >
        {/* Tranh dọc vẽ riêng cho trang này (banana BB-262) — TRÀN cả nửa trái,
            không đặt một ô tranh nhỏ giữa nền khác màu (chủ studio 26/09: lộ
            viền là "không tinh tế"). */}
        <img
          src="/minh-hoa/dang-nhap-doc-960.webp"
          srcSet="/minh-hoa/dang-nhap-doc-480.webp 480w, /minh-hoa/dang-nhap-doc-960.webp 960w"
          sizes="50vw"
          alt=""
          width={960}
          height={1285}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </div>

      <div className="flex w-full flex-col items-center justify-center px-4 py-12 md:w-1/2">
        <div className="w-full max-w-sm">
          <h1 className="text-center font-display text-2xl font-bold text-[var(--bb-fg)]">
            BabyBean Studio
          </h1>
          <p className="mt-1 text-center text-sm text-[var(--bb-fg-muted)]">
            Đăng nhập dành cho nhân viên
          </p>
          <Suspense
            fallback={
              <div className="mt-6 flex justify-center">
                <Spinner />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
