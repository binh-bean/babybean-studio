"use client";

/**
 * Ảnh bìa — màn đầu tiên ba mẹ thấy khi mở link.
 *
 * OWNER: DEV-FE. Chủ studio duyệt 23/09/2026 hướng "cuốn album kỷ niệm".
 *
 * ---------------------------------------------------------------------------
 * Vì sao mở bằng ẢNH chứ không mở bằng hạn mức
 * ---------------------------------------------------------------------------
 * Màn cũ trên điện thoại 375px: tiêu đề, thanh 6 bước, 4 ô số, bộ lọc — tấm
 * ảnh đầu tiên chỉ ló ra ở 1/6 cuối màn hình. Ba mẹ mở link từ Zalo, thường
 * một tay đang bế con; thứ họ chờ là ảnh của con, không phải quy trình nội bộ
 * của studio. Hạn mức và hạn chót vẫn ở đây, nhưng chỉ là hai dòng nhỏ.
 *
 * ---------------------------------------------------------------------------
 * Không bao giờ in mã hợp đồng lên bìa
 * ---------------------------------------------------------------------------
 * Đo 23/09/2026: 234/488 bộ ảnh chưa gắn tên bé, và tiêu đề của chúng là mã
 * hợp đồng kiểu "HD_20260828#4924". Bìa album mà in mã đó là hỏng cả trang.
 * Thiếu tên bé thì dùng một câu chung, ấm, đúng cho mọi nhà.
 */

import React from "react";
import { Clock, Heart, Lock, ArrowDown } from "lucide-react";

export interface BiaBoAnhProps {
  /** Ảnh bìa. `null` khi bộ ảnh chưa có tấm nào (đang đồng bộ). */
  anhBia: { id: string } | null;
  tenBe: string | null;
  ngayChup: string | null;
  chiNhanh: string;
  loiChao: string | null;
  soAnh: number;
  /** Số tấm trong gói; `null` khi CSKH chưa nhập. */
  hanMuc: number | null;
  daChon: number;
  hanChot: string | null;
  khoa: boolean;
  onBatDau: () => void;
}

/** "28.08.2026" — cách viết ngày quen mắt trên thiệp và bìa album ở Việt Nam. */
function ngayDep(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${hai(d.getDate())}.${hai(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Số ngày còn lại để chọn, làm tròn LÊN: còn 3 tiếng vẫn là "còn 1 ngày". */
function conMayNgay(hanChot: string | null): number | null {
  if (!hanChot) return null;
  const ms = new Date(hanChot).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

export function BiaBoAnh({
  anhBia,
  tenBe,
  ngayChup,
  chiNhanh,
  loiChao,
  soAnh,
  hanMuc,
  daChon,
  hanChot,
  khoa,
  onBatDau,
}: BiaBoAnhProps) {
  const ngay = ngayDep(ngayChup);
  const conNgay = khoa ? null : conMayNgay(hanChot);

  const nhanNut = khoa
    ? "Xem lại bộ ảnh"
    : daChon > 0
      ? `Tiếp tục chọn · ${daChon}${hanMuc ? ` / ${hanMuc}` : ""} tấm`
      : "Bắt đầu chọn ảnh";

  return (
    /*
      HAI BỐ CỤC, MỘT NỘI DUNG.

      Điện thoại: ảnh tràn màn hình, chữ trắng đè ở đáy. Màn điện thoại dọc
      cùng chiều với ảnh em bé (gần như toàn ảnh dọc 2:3), nên ảnh hiện gần
      trọn chiều cao, không mất đầu hay chân bé.

      Máy tính (từ `lg`): CHIA ĐÔI — chữ trên nền kem bên trái, ảnh bên phải.
      Bản đầu để ảnh tràn cả màn rộng: một tấm dọc bị cắt thành khung ngang
      1440×770, mất nửa dưới — mà bé ngồi ở nửa dưới. Kiểm trên bộ thật
      23/09/2026 thì bìa chỉ còn bóng bay và dây cờ.
    */
    <section
      aria-label="Ảnh bìa"
      className="relative isolate flex h-[86svh] min-h-[540px] max-h-[980px] w-full items-end overflow-hidden bg-[#2a2420] text-white lg:grid lg:h-[80vh] lg:min-h-[600px] lg:max-h-[900px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-stretch lg:bg-background lg:text-foreground"
    >
      <div className="absolute inset-0 -z-10 lg:relative lg:inset-auto lg:z-0 lg:order-2 lg:h-full lg:overflow-hidden">
        {anhBia && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/img/${anhBia.id}?w=1600`}
            srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
            sizes="(min-width: 1024px) 60vw, 100vw"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[50%_30%] motion-safe:animate-[bia-hien_1.2s_ease-out] lg:object-center"
          />
        )}

        {/*
          Hai lớp tối (chỉ điện thoại): dải mỏng trên cho chữ "Baby Bean", dải
          dày dưới cho tên bé và nút. Giữa để trong suốt — mặt bé thường nằm
          đúng khoảng đó, và làm tối mặt bé là làm hỏng tấm bìa.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,12,.38)_0%,rgba(20,16,12,0)_20%,rgba(20,16,12,0)_42%,rgba(20,16,12,.82)_100%)] lg:hidden"
        />
      </div>

      <p className="absolute inset-x-0 top-5 text-center font-display text-[15px] uppercase tracking-[0.2em] text-white/95 lg:left-16 lg:right-auto lg:top-10 lg:text-left lg:text-foreground">
        Baby Bean
      </p>

      <div className="w-full px-6 pb-9 sm:px-10 lg:order-1 lg:flex lg:flex-col lg:justify-center lg:px-16 lg:pb-0">
        <div className="max-w-md">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/85 lg:text-muted-foreground">
            {[ngay, chiNhanh].filter(Boolean).join(" · ")}
          </p>

          <h1 className="mt-2 font-display text-[54px] font-light leading-[0.98] tracking-[-0.02em] sm:text-[68px] lg:mt-4 lg:text-[84px]">
            {tenBe || "Khoảnh khắc của con"}
          </h1>

          <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-white/90 lg:mt-5 lg:text-base lg:text-muted-foreground">
            {loiChao?.trim() ||
              `${soAnh.toLocaleString("vi-VN")} khoảnh khắc của con đã sẵn sàng. Ba mẹ thong thả chọn nhé.`}
          </p>

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-white/90 lg:text-foreground/80">
            {hanMuc != null && (
              <span className="inline-flex items-center gap-1.5">
                <Heart className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                {hanMuc} tấm trong gói
              </span>
            )}
            {conNgay != null && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Còn {conNgay} ngày để chọn
              </span>
            )}
            {khoa && (
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Đã chốt danh sách
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onBatDau}
            className="mt-6 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#fffdf9] px-7 text-[15px] font-medium text-[#2a2420] shadow-lg transition hover:bg-white active:scale-[0.98] sm:w-auto lg:mt-8 lg:bg-foreground lg:text-background lg:shadow-none lg:hover:bg-foreground/90"
          >
            {nhanNut}
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
