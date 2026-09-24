import { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { getActiveBranches, getChatPageUrl } from "@/app/actions";

export const metadata: Metadata = {
  title: "BabyBean Studio",
  description: "Nơi lưu giữ những khoảnh khắc đáng yêu của bé.",
};

export const revalidate = 3600; // Cache for 1 hour since branches don't change often

/**
 * Trang gốc `hauky.babybeanstudio.vn/` — chuyển vào nhóm `(customer)` để dùng
 * chung layout với màn khách (phông Fraunces + bảng màu "cuốn album kỷ niệm",
 * chủ studio duyệt 23/09/2026). Task BB-216.
 */
export default async function LandingPage() {
  const t = getDictionary("vi");
  const [branches, chatUrl] = await Promise.all([getActiveBranches(), getChatPageUrl()]);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col items-center px-6 pb-10 pt-12 text-center sm:px-10 sm:pt-16">
      <div className="flex w-full flex-1 flex-col items-center">
        {/* Tệp logo do BB-213 đưa vào public/icons/logo-goc.jpg — trang này
            chỉ tham chiếu, không tự thêm tệp, để hai việc không đụng nhau. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh nhỏ, không cần next/image tối ưu */}
        <img
          src="/icons/logo-goc.jpg"
          alt={t.landing.studioName}
          width={72}
          height={72}
          className="h-[72px] w-[72px] rounded-full border border-border object-cover"
        />

        <h1 className="mt-5 font-display text-[32px] font-light leading-tight sm:text-[40px]">
          {t.landing.studioName}
        </h1>
        <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
          {t.landing.tagline}
        </p>

        <div className="mt-8 w-full rounded-2xl border border-border bg-card p-5 text-left text-[14px] leading-relaxed text-muted-foreground">
          {/* Ghep bằng JSX, không dùng dangerouslySetInnerHTML.
              Hôm nay chuỗi này đến từ i18n nên vô hại. Nhưng đây là trang
              CÔNG KHAI, và ngày ai đó cho chủ studio sửa câu này trong màn
              Cài đặt thì nó thành lỗ chèn mã. Đóng trước, rẻ hơn vá sau. */}
          <p>
            {t.landing.lostBefore}
            <strong className="text-foreground">{t.landing.lostStrong}</strong>
            {branches?.some((b) => b.hotline)
              ? t.landing.lostAfter
              : chatUrl
                ? t.landing.lostAfterNhanTin
                : t.landing.lostAfterChiNhanh}
          </p>
        </div>

        {/*
          CHỖ NÀY ĐỂ DÀNH CHO KHỐI TRA CỨU SAU NÀY (BB-181).
          KHÔNG phải là "gõ số điện thoại rồi vào". Đường đúng là gõ số rồi
          nhận mã 6 số qua Zalo ZNS. Ô cấu hình ZALO_ZNS_TEMPLATE_ID đã khai
          sẵn trong .env.example từ trước. Không chọn đường tắt làm lộ dữ
          liệu của nhà khác.
          Bố cục cố tình để một khoảng đứng ở đây (giữa phần giới thiệu và
          phần chi nhánh) để khối mới chen vào mà không phải xếp lại cả
          trang.
        */}

        <section className="mt-10 w-full text-left" aria-label={t.landing.branchesHeading}>
          <h2 className="font-display text-lg font-medium text-foreground">
            {t.landing.branchesHeading}
          </h2>
          <div className="mt-4 space-y-3">
            {branches.map((branch, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <h3 className="font-medium text-foreground">{branch.name}</h3>
                {branch.address && (
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">
                    {branch.address}
                  </p>
                )}
                {branch.hotline && (
                  <p className="mt-2 text-sm font-medium">
                    <a
                      href={`tel:${branch.hotline.replace(/\s+/g, "")}`}
                      className="text-[var(--bb-moss)] underline-offset-2 hover:underline"
                    >
                      {branch.hotline}
                    </a>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {chatUrl && (
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 inline-flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98] sm:w-auto"
          >
            {t.landing.messageCta}
          </a>
        )}
      </div>

      <div className="mt-10 mb-2">
        <Link
          href="/login"
          className="text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        >
          {t.landing.loginCta}
        </Link>
      </div>
    </main>
  );
}
