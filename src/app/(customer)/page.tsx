import { Metadata } from "next";
import Link from "next/link";
import { MapPin, MessageCircle, UserRound } from "lucide-react";
import { getDictionary } from "@/i18n";
import { getActiveBranches, getChatPageUrl } from "@/app/actions";

export const metadata: Metadata = {
  title: "BabyBean Studio",
  description: "Nơi lưu giữ những khoảnh khắc đáng yêu của bé.",
};

type ChiNhanh = Awaited<ReturnType<typeof getActiveBranches>>[number];

export const revalidate = 3600; // Cache for 1 hour since branches don't change often

/**
 * Trang gốc `hauky.babybeanstudio.vn/` — nhóm `(customer)` để dùng chung
 * layout màn khách (BB-216). Phông: Playfair CHỈ cho tiêu đề/logo, còn lại Be
 * Vietnam Pro (BB-305).
 *
 * BB-328 (29/09/2026) — dựng lại theo bản vẽ
 * `babybean-assets/BB-328/ban-ve/0{1,2}-*-trang-chu.png`:
 *  - Đầu trang: logo hạt đậu + "BABY BEAN", góc phải là nút "Nhân viên đăng
 *    nhập" nổi rõ (admin: "phần đăng nhập của nhân viên làm nổi bật hơn").
 *  - "Nhắn tin cho studio" là nút viền nhẹ, không còn khối màu mực chiếm giữa
 *    trang (admin: "làm nhẹ nhàng hơn").
 *  - Chi nhánh là một danh sách kẻ mảnh thay vì chồng thẻ trắng.
 *  - Lối vào thứ hai cho nhân viên ở cuối trang.
 *
 * BB-331 (30/09/2026) — anh gạch thẻ "Nhân viên studio" ở cột phải:
 *  - Bỏ thẻ đó; lối vào nhân viên chỉ còn nút nhỏ ở góc phải, kiểu kính mờ
 *    (nền trong mờ + backdrop-blur + viền mảnh) thay vì khối xám đậm.
 *  - Tiêu đề lớn đổi thành "Yours truly, Bean" (Playfair, không nghiêng).
 *  - Mất cột phải nên dồn về MỘT cột căn giữa ở mọi khổ; danh sách chi nhánh
 *    (nếu có) nằm ngay dưới, cùng bề rộng.
 */
export default async function LandingPage() {
  const t = getDictionary("vi");
  const [branches, chatUrl] = await Promise.all([getActiveBranches(), getChatPageUrl()]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-8 lg:h-[72px] lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-[15px] tracking-[0.2em] text-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh nhỏ */}
            <img src="/brand/logo-hat-dau-64.png" alt="" aria-hidden="true" className="h-[22px] w-[22px]" />
            <span>BABY BEAN</span>
          </Link>
          <Link
            href="/login"
            data-testid="nut-nhan-vien-dau-trang"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/55 px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md transition hover:border-foreground/25 hover:bg-background/75"
          >
            <UserRound className="h-[13px] w-[13px]" strokeWidth={1.8} aria-hidden="true" />
            {t.landing.loginCta}
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center px-5 pb-8 pt-4 text-center sm:px-8 lg:py-12">
        <section className="flex w-full flex-col items-center">
          {/* Tranh bìa album (banana BB-262), bản đã đưa nền về trắng để
              `multiply` tan hẳn vào nền kem — tệp gốc có vân giấy ngả vàng
              hiện thành một khối mờ quanh tranh. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- tranh tĩnh, có srcSet sẵn */}
          <img
            src="/minh-hoa/trang-chu-album-640.webp"
            srcSet="/minh-hoa/trang-chu-album-640.webp 640w, /minh-hoa/trang-chu-album-1280.webp 1280w"
            sizes="(min-width: 1024px) 340px, 280px"
            alt=""
            aria-hidden="true"
            width={640}
            height={357}
            className="mx-auto block h-auto w-full max-w-[280px] mix-blend-multiply [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] lg:max-w-[340px]"
          />
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t.landing.studioName}
          </p>
          <h1
            data-testid="tieu-de-trang-chu"
            className="mt-2.5 font-display text-[34px] font-normal not-italic leading-[1.2] text-foreground lg:text-[48px]"
          >
            {t.landing.tagline}
          </h1>
          {/* Ghép bằng JSX, không dùng dangerouslySetInnerHTML — trang CÔNG KHAI. */}
          <p className="mt-3.5 max-w-[440px] text-[15px] leading-[1.65] text-muted-foreground lg:text-base">
            {t.landing.lostBefore}
            <strong className="font-medium text-foreground">{t.landing.lostStrong}</strong>
            {branches?.some((b) => b.hotline)
              ? t.landing.lostAfter
              : chatUrl
                ? t.landing.lostAfterNhanTin
                : t.landing.lostAfterChiNhanh}
          </p>
          {chatUrl && (
            <a
              href={chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="nut-nhan-studio"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground transition hover:bg-card active:scale-[0.98]"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              {t.landing.messageCta}
            </a>
          )}
          {/*
            CHỖ ĐỂ DÀNH CHO KHỐI TRA CỨU SAU NÀY (BB-181): gõ số rồi nhận mã 6
            số qua Zalo ZNS — không phải "gõ số điện thoại rồi vào".
          */}
        </section>

        {branches.length > 0 && (
          <section aria-labelledby="tieu-de-chi-nhanh" className="mt-10 w-full text-left">
            <h2
              id="tieu-de-chi-nhanh"
              className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              {t.landing.branchesHeading}
            </h2>
            <DanhSachChiNhanh branches={branches} />
          </section>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">{t.landing.footer}</footer>
    </div>
  );
}

/**
 * Trình bày thuần danh sách chi nhánh. Dữ liệu do `LandingPage` đọc bằng
 * `getActiveBranches()` rồi truyền xuống qua props (BB-336: tách để
 * verify:wired thấy danh sách có nguồn).
 */
function DanhSachChiNhanh({ branches }: { branches: ChiNhanh[] }) {
  return (
    <ul className="mt-3 border-t border-border" data-testid="ds-chi-nhanh">
      {branches.map((branch, i) => (
        <li key={i} className="flex items-start gap-3 border-b border-border py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-medium leading-snug text-foreground">{branch.name}</h3>
            {branch.address && (
              <p className="mt-0.5 text-[13px] leading-normal text-muted-foreground">{branch.address}</p>
            )}
          </div>
          {branch.hotline && (
            <a
              href={`tel:${branch.hotline.replace(/\s+/g, "")}`}
              className="mt-1 shrink-0 whitespace-nowrap text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              {branch.hotline}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
