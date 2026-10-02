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
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Input, Spinner } from "@/components/ui";
import { toAuthEmail } from "@/lib/auth/username";
import { vi } from "@/i18n/vi";
import { layerMoNgang } from "@/lib/utils/tranh-tan-nen";

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
          placeholder="ten.dang.nhap"
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

      {/* Nút chính màu mực (--bb-fg). BB-362: cùng hình dạng nút chính của quản trị
          (biến thể `muc`, góc 8px) — không còn viên tròn riêng ở màn này. */}
      <Button
        type="submit"
        variant="muc"
        disabled={busy}
        className="w-full"
      >
        {busy ? vi.admin.login.loggingIn : vi.admin.login.submit}
      </Button>
    </form>
  );
}

/**
 * BB-327 — "Quên mật khẩu?" bấm được: nhân viên gõ tên tài khoản/email, app
 * gửi yêu cầu tới admin (Việc cần xử lý → tab Quên mật khẩu), admin đặt lại
 * ở Nhân sự. Câu trả lời LUÔN giống nhau — không lộ tài khoản có hay không.
 * Nằm NGOÀI form đăng nhập (form lồng form là HTML sai).
 */
function QuenMatKhau() {
  const [mo, setMo] = useState(false);
  const [taiKhoan, setTaiKhoan] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [thongBao, setThongBao] = useState<string | null>(null);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    setDangGui(true);
    try {
      const res = await fetch("/api/auth/quen-mat-khau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: taiKhoan }),
      });
      const json = await res.json().catch(() => null);
      setThongBao(json?.data?.message ?? json?.error?.message ?? "Không gửi được, thử lại giúp.");
    } catch {
      setThongBao("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setDangGui(false);
    }
  }

  if (!mo) {
    return (
      <p className="mt-4 text-center text-xs text-[var(--bb-fg-muted)]">
        <button
          type="button"
          onClick={() => setMo(true)}
          className="underline underline-offset-2 hover:text-[var(--bb-fg)]"
        >
          Quên mật khẩu?
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={gui} className="mt-5 space-y-3 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-4">
      <p className="text-sm font-medium text-[var(--bb-fg)]">Quên mật khẩu</p>
      {thongBao ? (
        <p role="status" data-testid="thong-bao-quen-mat-khau" className="text-sm text-[var(--bb-fg-muted)]">
          {thongBao}
        </p>
      ) : (
        <>
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--bb-fg-muted)]">
              Nhập tên tài khoản hoặc email — admin sẽ nhận yêu cầu và đặt lại giúp bạn.
            </span>
            <Input
              name="taiKhoanQuenMatKhau"
              value={taiKhoan}
              onChange={(e) => setTaiKhoan(e.target.value)}
              required
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ten.dang.nhap"
            />
          </label>
          <Button type="submit" variant="outline" disabled={dangGui || taiKhoan.trim().length === 0} className="w-full">
            {dangGui ? "Đang gửi…" : "Gửi yêu cầu cho admin"}
          </Button>
        </>
      )}
      <button type="button" onClick={() => { setMo(false); setThongBao(null); }} className="block w-full text-center text-xs text-[var(--bb-fg-muted)] underline">
        Quay lại đăng nhập
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    // Bản vẽ dang-nhap.webp: nửa trái tranh tĩnh vật trên nền kem, nửa phải
    // form hẹp giữa trang. Dưới 768px không còn nửa trái, nhưng BB-292: thay
    // vì để trống hẳn phía trên form, có một dải tranh ngang
    // (`dai-dang-nhap-*.webp`) ~160px cao đầu trang — máy tính vẫn giữ
    // nguyên tranh dọc hiện có, không hiện cả hai cùng lúc.
    <main className="flex min-h-screen w-full flex-col bg-[var(--bb-bg)] md:flex-row">
      <div
        aria-hidden="true"
        className="relative h-[160px] w-full shrink-0 overflow-hidden bg-[#fdfbf9] md:hidden"
      >
        <img
          src="/minh-hoa/dai-dang-nhap-1920.webp"
          srcSet="/minh-hoa/dai-dang-nhap-960.webp 960w, /minh-hoa/dai-dang-nhap-1920.webp 1920w"
          sizes="100vw"
          alt=""
          width={1920}
          height={634}
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={layerMoNgang}
        />
      </div>

      <div
        aria-hidden="true"
        className="relative hidden w-1/2 overflow-hidden bg-[#fdfbf9] md:block"
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
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-[var(--bb-fg-muted)] transition-colors hover:text-[var(--bb-fg)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
            Về trang chủ
          </Link>
          {/* BB-290 (#29): MỘT logo chữ duy nhất cho toàn hệ — "BABY BEAN"
              giãn chữ, không còn "BabyBean Studio" Playfair đậm khác hẳn
              thanh bên quản trị (admin-sidebar.tsx) và màn khách. */}
          {/* BB-306 — logo hạt đậu trước chữ, căn giữa dọc theo chữ. `h1`
              vẫn là MỘT phần tử, nhãn truy cập giữ nguyên "BABY BEAN" (ảnh
              `aria-hidden`, không thêm vào tên truy cập). */}
          <h1 className="flex items-center justify-center gap-[10px] font-display text-2xl font-normal tracking-[0.18em] text-[var(--bb-fg)]">
            <img
              data-testid="logo-hat-dau"
              src="/brand/logo-hat-dau-64.png"
              alt=""
              aria-hidden="true"
              className="h-[28px] w-[28px] shrink-0"
            />
            <span>BABY BEAN</span>
          </h1>
          {/* BB-328 — chạm nhẹ cùng kiểu trang gốc mới: nhãn chữ hoa giãn
              (Be Vietnam Pro) thay câu phụ thường, và lối quay về trang chủ. */}
          <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--bb-fg-muted)]">
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
          <QuenMatKhau />
        </div>
      </div>
    </main>
  );
}
