/**
 * BB-378 (P2) — màn link HẾT HẠN / KHÔNG TÌM THẤY (gồm cả đã thu hồi — máy chủ
 * cố ý trả NOT_FOUND cho link thu hồi) / LỖI MỞ, dùng chung cho `/g/<mã>`,
 * `/k/<mã>` và `/k/<mã>/<n>`.
 *
 * OWNER: DEV-FE. Bản cũ (BB-212) là một khối chữ giữa màn trắng với nút "Thử
 * lại" — bấm bao nhiêu lần link hết hạn vẫn hết hạn, ba mẹ không biết làm gì
 * tiếp. Nay cùng ngôn ngữ màn khách hiện tại (nền kem, Playfair cho tiêu đề,
 * Be Vietnam Pro cho chữ, giọng Bean) và LUÔN có lối ra: "Nhắn Bean" (địa chỉ
 * `settings.chat.page_url`, đọc ở máy chủ rồi truyền xuống). Chưa cấu hình
 * địa chỉ nhắn thì về trang chủ — nơi có chi nhánh và số gọi.
 *
 * Thuần trình bày: không hook, dựng được bằng renderToStaticMarkup.
 */

import React from "react";
import { MessageCircle } from "lucide-react";
import { vi } from "@/i18n";
import { giuA } from "@/lib/utils/giu-a";
import { anhHanhTrinh } from "@/components/features/gallery/hanh-trinh";

const M = vi.gallery.manLoi;

export type LoaiLoiLink = "het-han" | "khong-thay" | "loi";

/** Mã lỗi máy chủ → loại màn. Thu hồi = NOT_FOUND (cố ý, xem /api/auth/gallery). */
export function loaiLoiTuMa(ma: string | null | undefined): LoaiLoiLink {
  if (ma === "LINK_EXPIRED") return "het-han";
  if (ma === "NOT_FOUND" || ma === "LINK_REVOKED" || ma === "FORBIDDEN") return "khong-thay";
  return "loi";
}

export interface ManLoiLinkProps {
  loai: LoaiLoiLink;
  /** `settings.chat.page_url` — null thì nút dẫn về trang chủ (chi nhánh + số gọi). */
  chatUrl?: string | null;
  /** Chỉ màn "lỗi mở" mới có Thử lại: link hết hạn/không có thì thử lại vẫn vậy. */
  onThuLai?: () => void;
}

export function ManLoiLink({ loai, chatUrl, onThuLai }: ManLoiLinkProps) {
  const [tieuDe, moTa] =
    loai === "het-han"
      ? [M.hetHanTieuDe, M.hetHanMoTa]
      : loai === "khong-thay"
        ? [M.khongThayTieuDe, M.khongThayMoTa]
        : [M.loiTieuDe, M.loiMoTa];
  const anh =
    loai === "het-han"
      ? anhHanhTrinh("link-het-han")
      : {
          src: "/minh-hoa/khong-tim-thay-1280.webp",
          srcSet: "/minh-hoa/khong-tim-thay-640.webp 640w, /minh-hoa/khong-tim-thay-1280.webp 1280w",
        };
  const coChat = !!chatUrl && /^https?:\/\//i.test(chatUrl);

  return (
    <div
      data-testid="man-loi-link"
      data-loai={loai}
      className="flex min-h-[100dvh] flex-col bg-[#fbf7f2] text-[#2e2a27]"
    >
      <header className="flex h-14 items-center justify-center border-b border-[#e5dcd2]">
        <span className="inline-flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-hat-dau-64.png" alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
          <span className="font-display text-[15px] font-normal not-italic uppercase tracking-[0.2em]">Baby Bean</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center px-6 pb-10 pt-6 text-center">
        <div className="relative mb-7 aspect-[16/9] w-full max-w-[300px] overflow-hidden rounded-[18px] bg-white/60">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={anh.src}
            srcSet={anh.srcSet}
            sizes="300px"
            alt=""
            width={1280}
            height={720}
            className="absolute inset-0 h-full w-full object-cover mix-blend-multiply animate-in fade-in duration-300 motion-reduce:animate-none"
          />
        </div>
        <h1 className="font-display text-[28px] font-normal not-italic leading-[1.2]">{tieuDe}</h1>
        <p className="mt-3 text-pretty text-[15px] leading-relaxed text-[#6f665f]">{giuA(moTa)}</p>

        <div className="mt-7 flex w-full flex-col items-center gap-3">
          <a
            data-testid="man-loi-nhan-bean"
            href={coChat ? chatUrl! : "/"}
            target={coChat ? "_blank" : undefined}
            rel={coChat ? "noopener noreferrer" : undefined}
            className="inline-flex h-12 w-full max-w-[280px] items-center justify-center gap-2 rounded-full bg-[#2e2a27] px-6 text-[15px] font-medium text-[#fbf7f2] transition hover:bg-[#2e2a27]/90 active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {coChat ? M.nhanBean : M.xemChiNhanh}
          </a>
          {loai === "loi" && onThuLai && (
            <button
              type="button"
              onClick={onThuLai}
              className="h-11 rounded-full px-6 text-[14px] font-medium text-[#2e2a27] underline-offset-4 hover:underline"
            >
              {M.thuLai}
            </button>
          )}
        </div>
      </main>

      <footer className="pb-8 text-center font-display text-[15px] font-normal not-italic text-[#6f665f]">
        Yours truly Bean
      </footer>
    </div>
  );
}
