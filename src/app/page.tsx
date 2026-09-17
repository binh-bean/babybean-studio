import { Metadata } from "next";
import Link from "next/link";
import { getDictionary } from "@/i18n";
import { getActiveBranches } from "@/app/actions";

export const metadata: Metadata = {
  title: "BabyBean Studio",
  description: "Nơi lưu giữ những khoảnh khắc đáng yêu của bé.",
};

export const revalidate = 3600; // Cache for 1 hour since branches don't change often

export default async function LandingPage() {
  const t = getDictionary("vi");
  const branches = await getActiveBranches();


  return (
    <main className="min-h-[100dvh] bg-background flex flex-col items-center p-6 sm:p-10 text-center max-w-md mx-auto">
      <div className="flex-1 w-full flex flex-col items-center">
        <h1 className="text-3xl font-bold text-foreground mt-8 mb-2">
          {t.landing.studioName}
        </h1>
        <p className="text-muted-foreground mb-8">
          {t.landing.tagline}
        </p>

        <div className="bg-muted/50 rounded-xl p-5 mb-8 text-sm text-muted-foreground w-full border border-border/50 text-left leading-relaxed">
          {/* Ghep bằng JSX, không dùng dangerouslySetInnerHTML.
              Hôm nay chuỗi này đến từ i18n nên vô hại. Nhưng đây là trang
              CÔNG KHAI, và ngày ai đó cho chủ studio sửa câu này trong màn
              Cài đặt thì nó thành lỗ chèn mã. Đóng trước, rẻ hơn vá sau. */}
          <p>
            {t.landing.lostBefore}
            <strong>{t.landing.lostStrong}</strong>
            {t.landing.lostAfter}
          </p>
        </div>

        {/* 
          CHỖ NÀY ĐỂ DÀNH CHO KHỐI TRA CỨU SAU NÀY (BB-181)
          KHÔNG phải là "gõ số điện thoại rồi vào". Đường đúng là gõ số rồi nhận mã 6 số qua Zalo ZNS.
          Ô cấu hình ZALO_ZNS_TEMPLATE_ID đã khai sẵn trong .env.example từ trước.
          Không chọn đường tắt làm lộ dữ liệu.
        */}

        <div className="w-full space-y-4 mb-10 text-left">
          {branches?.map((branch, i) => (
            <div key={i} className="flex flex-col gap-1 pb-4">
              <h3 className="font-medium text-foreground">{branch.name}</h3>
              {branch.address && (
                <p className="text-sm text-muted-foreground leading-snug">{branch.address}</p>
              )}
              {branch.hotline && (
                <p className="text-sm font-medium text-primary mt-1">
                  <a href={`tel:${branch.hotline.replace(/\s+/g, '')}`}>{branch.hotline}</a>
                </p>
              )}
            </div>
          ))}
        </div>

        <a
          href="https://m.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors block text-center"
        >
          {t.landing.messageCta}
        </a>
      </div>

      <div className="mt-12 mb-4">
        <Link
          href="/login"
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {t.landing.loginCta}
        </Link>
      </div>
    </main>
  );
}
