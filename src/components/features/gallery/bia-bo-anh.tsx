"use client";

import React, { useEffect, useState } from "react";
import { Clock, Heart, Lock, ArrowDown } from "lucide-react";
import { tinhDoSang, chonMauChu } from "@/lib/utils/do-sang";


/** Vùng chữ nằm trên ảnh, theo tỉ lệ chiều cao [từ, đến] — mỗi kiểu chữ bìa. */
const VUNG_CHU_THEO_KIEU: Record<string, readonly [number, number]> = {
  "tap-chi": [0, 0.45], // tiêu đề lớn sát mép trên
  "toi-gian": [0.6, 1], // tiêu đề ở đáy
  "de-cheo": [0.3, 0.8], // tiêu đề lệch giữa
  "ben-canh": [0.6, 1], // điện thoại: chữ đè ở đáy (máy tính chữ nằm trên nền kem)
};

export interface BiaBoAnhProps {
  anhBia: { id: string } | null;
  coverHeadline: string | null;
  coverLayout?: string | null;
  tenBe: string | null;
  ngayChup: string | null;
  chiNhanh: string;
  loiChao: string | null;
  soAnh: number;
  hanMuc: number | null;
  daChon: number;
  hanChot: string | null;
  khoa: boolean;
  onBatDau: () => void;
}

function ngayDep(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${hai(d.getDate())}.${hai(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function conMayNgay(hanChot: string | null): number | null {
  if (!hanChot) return null;
  const ms = new Date(hanChot).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

export function BiaBoAnh(props: BiaBoAnhProps) {
  const {
    anhBia,
    coverHeadline,
    coverLayout,
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
  } = props;

  const [mauChu, setMauChu] = useState<"sang" | "toi">("sang");
  const layout = coverLayout || "ben-canh";

  // Đo độ sáng ĐÚNG VÙNG ĐẶT CHỮ của từng kiểu (tỉ lệ theo chiều cao ảnh),
  // không đo cả ảnh: ảnh trời sáng phía trên mà áo tối phía dưới thì đo cả ảnh
  // ra "trung bình", chọn nhầm màu chữ cho kiểu Tối giản (chữ ở đáy) — Opus soát.
  const vungChu = VUNG_CHU_THEO_KIEU[layout] ?? VUNG_CHU_THEO_KIEU["ben-canh"]!;

  useEffect(() => {
    if (!anhBia) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `/api/img/${anhBia.id}?w=200`;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = (img.height / img.width) * 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const doSang = tinhDoSang(
        imageData.data,
        canvas.width,
        canvas.height,
        canvas.height * vungChu[0],
        canvas.height * vungChu[1],
      );
      setMauChu(chonMauChu(doSang));
    };
  }, [anhBia, vungChu]);

  const ngay = ngayDep(ngayChup);
  const conNgay = khoa ? null : conMayNgay(hanChot);

  const nhanNut = khoa
    ? "Xem lại bộ ảnh"
    : daChon > 0
      ? `Tiếp tục chọn · ${daChon}${hanMuc ? ` / ${hanMuc}` : ""} tấm`
      : "Bắt đầu chọn ảnh";

  const tieuDeBia = coverHeadline?.trim() || tenBe || "Khoảnh khắc của con";
  const loiChaoBia = loiChao?.trim() || `${soAnh.toLocaleString("vi-VN")} khoảnh khắc của con đã sẵn sàng. Ba mẹ thong thả chọn nhé.`;

  const MetaInfo = () => (
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] opacity-90">
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
  );

  const imgEl = anhBia && (
          <img
      src={`/api/img/${anhBia.id}?w=1600`}
      srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
      sizes="(min-width: 1024px) 60vw, 100vw"
      alt=""
      fetchPriority="high"
      decoding="async"
      className="h-full w-full object-cover object-[50%_30%] lg:object-center motion-safe:animate-[bia-hien_1.2s_ease-out]"
    />
  );

  const tcClass = mauChu === "sang" ? "text-white" : "text-[#2a2420]";
  const bgOverlay = mauChu === "sang" ? "bg-black/30" : "bg-white/30";
  const btnClass = mauChu === "sang" 
    ? "bg-white text-[#2a2420] hover:bg-white/90" 
    : "bg-[#2a2420] text-white hover:bg-[#2a2420]/90";

  if (layout === "tap-chi") {
    return (
      <section className={`relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden ${tcClass}`}>
        <div className="absolute inset-0 -z-10">
          {imgEl}
          <div className={`absolute inset-0 ${bgOverlay}`} />
        </div>
        <div className="z-10 flex flex-col items-center text-center px-6 max-w-2xl">
          <p className="uppercase tracking-[0.2em] mb-4 text-[13px] opacity-90">Baby Bean</p>
          <p className="text-[12px] uppercase tracking-[0.16em] opacity-85 mb-4">
            {[ngay, chiNhanh].filter(Boolean).join(" · ")}
          </p>
          <h1 className="font-display text-[54px] sm:text-[68px] lg:text-[84px] font-light leading-[0.98] tracking-[-0.02em]">{tieuDeBia}</h1>
          <p className="mt-5 text-[15px] leading-relaxed opacity-90">{loiChaoBia}</p>
          <div className="flex justify-center w-full"><MetaInfo /></div>
          <button onClick={onBatDau} className={`mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
            {nhanNut} <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  if (layout === "toi-gian") {
    return (
      <section className={`relative isolate flex min-h-[100svh] w-full items-end p-8 lg:p-16 overflow-hidden ${tcClass}`}>
        <div className="absolute inset-0 -z-10">
          {imgEl}
          <div className={`absolute inset-0 bg-gradient-to-t ${mauChu === 'sang' ? 'from-black/70 to-transparent' : 'from-white/70 to-transparent'} h-1/2 bottom-0 top-auto`} />
        </div>
        <div className="z-10 w-full max-w-3xl">
          <p className="uppercase tracking-[0.2em] mb-2 text-[12px] opacity-90">Baby Bean · {[ngay, chiNhanh].filter(Boolean).join(" · ")}</p>
          <h1 className="font-display text-[48px] sm:text-[60px] lg:text-[72px] font-light leading-[1] tracking-[-0.02em] mb-4">{tieuDeBia}</h1>
          <p className="text-[15px] leading-relaxed opacity-90 max-w-md">{loiChaoBia}</p>
          <MetaInfo />
          <button onClick={onBatDau} className={`mt-6 inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
            {nhanNut} <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  if (layout === "de-cheo") {
    return (
      <section className={`relative isolate flex min-h-[100svh] w-full overflow-hidden ${tcClass}`}>
        <div className="absolute inset-0 -z-10">
          {imgEl}
          <div className={`absolute inset-0 bg-gradient-to-br ${mauChu === 'sang' ? 'from-black/60 to-transparent' : 'from-white/60 to-transparent'} w-full h-full`} />
        </div>
        <div className="z-10 w-full p-8 lg:p-16 flex flex-col justify-start mt-10">
          <p className="uppercase tracking-[0.2em] mb-2 text-[12px] opacity-90">Baby Bean</p>
          <p className="text-[12px] uppercase tracking-[0.16em] opacity-85 mb-4">
            {[ngay, chiNhanh].filter(Boolean).join(" · ")}
          </p>
          <h1 className="font-display text-[50px] sm:text-[64px] lg:text-[76px] font-light leading-[0.98] tracking-[-0.02em] max-w-lg mt-4">{tieuDeBia}</h1>
          <p className="mt-4 text-[15px] leading-relaxed opacity-90 max-w-md">{loiChaoBia}</p>
          <MetaInfo />
          <button onClick={onBatDau} className={`mt-8 inline-flex h-[52px] self-start items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
            {nhanNut} <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  }

  // ben-canh (default)
  return (
    <section
      aria-label="Ảnh bìa"
      className="@container relative isolate flex h-[86svh] min-h-[540px] max-h-[980px] w-full items-end overflow-hidden bg-[#2a2420] text-white lg:grid lg:h-[80vh] lg:min-h-[600px] lg:max-h-[900px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-stretch lg:bg-background lg:text-foreground"
    >
      <div className="absolute inset-0 -z-10 lg:relative lg:inset-auto lg:z-0 lg:order-2 lg:h-full lg:overflow-hidden">
        {imgEl}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,16,12,.38)_0%,rgba(20,16,12,0)_20%,rgba(20,16,12,0)_42%,rgba(20,16,12,.82)_100%)] lg:hidden"
        />
      </div>

      <p className="khach-le-trai-lg-pos absolute inset-x-0 top-5 text-center font-display text-[15px] uppercase tracking-[0.2em] text-white/95 lg:right-auto lg:top-10 lg:text-left lg:text-foreground">
        Baby Bean
      </p>

      {/*
        BB-240 (2-1) — `khach-le-trai-lg` thay cho `lg:px-16` cố định: canh
        đúng mép trái với đầu trang/lưới ảnh/chân trang ở MỌI bề rộng máy
        tính, không chỉ đúng ở cỡ màn đã đo. `sm:px-10` vẫn lo lề phải của cột
        chữ (cột chỉ rộng 5/12, không cần canh mép phải theo lưới trang).
        Xem giải thích công thức ở `src/styles/tokens.css`.
      */}
      <div className="khach-le-trai-lg w-full px-6 pb-9 sm:px-10 lg:order-1 lg:flex lg:flex-col lg:justify-center lg:pb-0">
        <div className="max-w-md">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/85 lg:text-muted-foreground">
            {[ngay, chiNhanh].filter(Boolean).join(" · ")}
          </p>

          <h1 className="mt-2 font-display text-[54px] font-light leading-[0.98] tracking-[-0.02em] sm:text-[68px] lg:mt-4 lg:text-[84px]">
            {tieuDeBia}
          </h1>

          <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-white/90 lg:mt-5 lg:text-base lg:text-muted-foreground">
            {loiChaoBia}
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



