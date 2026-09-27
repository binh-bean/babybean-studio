"use client";

import { cn } from "@/components/ui/utils";
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
  className?: string;
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
    className,
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
          {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang, bỏ
              khỏi khối chữ bìa để không lặp; chỉ còn ngày · chi nhánh. */}
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
          {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang. */}
          <p className="uppercase tracking-[0.2em] mb-2 text-[12px] opacity-90">{[ngay, chiNhanh].filter(Boolean).join(" · ")}</p>
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
          {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang. */}
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

  // ben-canh (default) - cập nhật theo màn bìa chuẩn
  //
  // BB-258 — chủ studio 26/09/2026: bìa máy tính KHÔNG được chia đôi (chữ
  // trái nền kem, ảnh phải) như BB-253 đã dựng. Điện thoại/máy tính bảng vẫn
  // ảnh TRÀN TOÀN MÀN với chữ đè đáy như BB-258 đã dựng.
  //
  // BB-278 — chủ studio 27/09/2026: "phần thông tin ảnh bìa trên pc màn
  // ngang rất dễ đè lấp mất hình". Mảng phủ mờ của BB-258 (đè chữ lên bên
  // trái ảnh) vẫn CHE MỘT PHẦN ảnh trên máy tính — đúng thứ chủ studio vừa
  // chỉ ra. Từ lg: bỏ hẳn lớp phủ đè lên ảnh; ảnh là MỘT KHỐI riêng (cao giới
  // hạn, không phải nền tuyệt đối phủ hết section), chữ là MỘT DẢI CHÚ THÍCH
  // riêng ngay dưới ảnh (nền kem, chữ mực) — hai khối không bao giờ giao
  // nhau, đo bằng `tests/e2e/bb-278-dau-trang-bia.spec.ts`.
  return (
    <section
      aria-label="Ảnh bìa"
      data-testid="bia-bo-anh"
      className={cn(
        "@container relative isolate w-full overflow-hidden bg-[#2a2420] text-white",
        "h-[86svh] min-h-[540px] max-h-[980px]",
        "lg:flex lg:h-auto lg:max-h-none lg:min-h-0 lg:flex-col lg:bg-[#fbf7f2] lg:text-[#2e2a27]",
        className,
      )}
    >
      {/*
        Khối ảnh — nền tuyệt đối tràn toàn section dưới lg (như BB-258). Từ
        lg là một khối THẬT trong dòng chảy (không còn `absolute inset-0`),
        cao giới hạn, để dải chữ bên dưới không cần đè lên nó.
      */}
      <div
        data-testid="bia-khoi-anh"
        className="absolute inset-0 -z-10 lg:static lg:z-auto lg:h-[64vh] lg:max-h-[760px] lg:min-h-[420px]"
      >
        {imgEl}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent lg:hidden"
        />
      </div>

      {/*
        BB-278 — MỘT khối chữ duy nhất (không phải hai bản sao ẩn/hiện bằng
        CSS): tự đổi vị trí + màu theo bề rộng, thay vì đè lên ảnh dưới lg và
        tách dải riêng từ lg. Từng thử dựng HAI khối riêng (một cho di động,
        một cho lg) rồi ẩn bằng `hidden`/`lg:hidden` — cả hai vẫn nằm trong
        DOM cùng lúc nên `h1` (và mọi phần tử con) bị NHÂN ĐÔI, làm hỏng mọi
        chỗ dò `section[aria-label='Ảnh bìa'] h1` (bb-240, bb-274, bb-258 đều
        có chỗ dò kiểu này — soát bằng cách chạy lại bộ đó phát hiện ra).
      */}
      <div
        data-testid="bia-khoi-chu"
        className={cn(
          "khach-le-trai-lg absolute inset-x-0 bottom-0 z-10 px-6 pb-9 sm:px-10",
          "lg:static lg:z-auto lg:inset-auto lg:border-t lg:border-[#e5dcd2] lg:bg-[#fbf7f2] lg:px-10 lg:py-10 xl:px-16",
        )}
      >
        <div className="max-w-md lg:max-w-2xl">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/90 lg:text-[#6b6057]">
            {[ngay, chiNhanh].filter(Boolean).join(" · ")}
          </p>

          <h1 className="mt-2 font-display text-[54px] font-light leading-[0.98] tracking-[-0.02em] sm:text-[68px] lg:mt-3 lg:text-[44px] lg:leading-[1.02] xl:text-[52px]">
            {tieuDeBia}
          </h1>

          <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-white/90 lg:max-w-2xl lg:text-base lg:text-[#4a423b]">
            {loiChaoBia}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-2 gap-y-2 text-[14px] text-white/90 lg:mt-5 lg:text-[#4a423b]">
            {hanMuc != null && (
              <span className="inline-flex h-[36px] px-3.5 items-center gap-1.5 rounded-full border border-white/30 lg:border-[#2e2a27]/20">
                <Heart className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                {hanMuc} tấm trong gói
              </span>
            )}
            {conNgay != null && (
              <span className="inline-flex h-[36px] px-3.5 items-center gap-1.5 rounded-full border border-white/30 lg:border-[#2e2a27]/20">
                <Clock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Còn {conNgay} ngày để chọn
              </span>
            )}
            {khoa && (
              <span className="inline-flex h-[36px] px-3.5 items-center gap-1.5 rounded-full border border-white/30 lg:border-[#2e2a27]/20">
                <Lock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Đã chốt danh sách
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onBatDau}
            className="mt-8 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#fbf7f2] px-7 text-[15px] font-medium text-[#2e2a27] transition hover:bg-white active:scale-[0.98] sm:w-auto lg:mt-7 lg:bg-[#2e2a27] lg:text-[#fbf7f2] lg:hover:bg-[#2e2a27]/90"
          >
            {nhanNut}
          </button>
        </div>
      </div>
    </section>
  );
}



