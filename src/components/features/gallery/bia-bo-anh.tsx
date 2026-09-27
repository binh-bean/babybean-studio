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
  /**
   * BB-287 mục 5 — báo cáo chấm #4: bìa vẫn ghi "Ba mẹ thong thả chọn nhé"
   * kể cả sau khi đã chốt hoặc đã giao ảnh — câu không khớp trạng thái.
   * `gallery.status` cho câu chào MẶC ĐỊNH biết nên nói gì; bỏ trống thì coi
   * như đang mở (giữ nguyên câu cũ).
   */
  trangThai?: string | null;
  onBatDau: () => void;
}

function ngayDep(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hai = (n: number) => String(n).padStart(2, "0");
  // BB-295 mục #7 — báo cáo chấm độc lập: dòng phụ bìa phải là ngày chụp
  // dd/mm/yyyy (gạch chéo), không phải dấu chấm cũ.
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
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
    trangThai,
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

  // BB-287 mục 5 — câu chào MẶC ĐỊNH (không ghi đè khi studio đã tự soạn
  // `loiChao`) phải nói đúng việc ba mẹ cần biết ở TRẠNG THÁI hiện tại, không
  // mời "thong thả chọn nhé" khi đã hết việc để chọn.
  // BB-295 mục #14 — báo cáo chấm độc lập: câu chào khi đã khoá chờ chỉnh
  // đổi thành đúng câu người chấm yêu cầu ("Studio đang chỉnh ảnh của bé"),
  // gắn tên bé thật khi có thay vì chữ "con" chung chung.
  const loiChaoMacDinh =
    trangThai === "delivered"
      ? "Ảnh của bé đã hoàn thiện."
      : khoa
        ? `Studio đang chỉnh ảnh của ${tenBe?.trim() || "bé"}.`
        : `${soAnh.toLocaleString("vi-VN")} khoảnh khắc của con đã sẵn sàng. Ba mẹ thong thả chọn nhé.`;
  const loiChaoBia = loiChao?.trim() || loiChaoMacDinh;

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
  // BB-289 — admin báo hai lỗi thật trên máy khách, đúng lúc BB-285 (bản vẽ
  // đã duyệt) đổi hướng NGƯỢC LẠI với BB-258 (26/09/2026: "không chia đôi"):
  //
  //   (3) Máy tính màn ngang: bìa TRÀN TOÀN SECTION rồi cắt theo `object-cover`
  //       — ảnh chân dung dọc bị cắt đầu/chân trên màn ngang. Bản vẽ
  //       `babybean-assets/BB-285/bia-may-tinh-chia-doi.png` (+ HTML gốc
  //       cùng thư mục) chốt CHIA ĐÔI thật: cột trái 42% là khối ảnh hiện
  //       TRỌN (`object-contain`, nền kem `#e7d3c6` lấp viền thừa — không
  //       còn cắt), cột phải là khối chữ.
  //   (4) Điện thoại: khối chữ `absolute inset-x-0 bottom-0` ĐÈ LÊN ảnh —
  //       ảnh chụp máy thật chủ studio gửi cho thấy chữ trùm lên mặt bé.
  //       Bản vẽ `dang-chinh-da-giao-dien-thoai.png` dùng đúng kiểu THẺ:
  //       khối ảnh cao GIỚI HẠN đứng trong dòng chảy, khối chữ nền kem NẰM
  //       DƯỚI — không bao giờ chồng nhau vì không còn `absolute`.
  //
  // Hệ quả: từ nay khối chữ KHÔNG BAO GIỜ đè lên ảnh ở bất kỳ bề rộng nào (kể
  // cả điện thoại) — bỏ luôn lớp gradient tối và logic đo độ sáng ảnh
  // (`mauChu`/`tcClass`/`bgOverlay`) cho layout này, vì chữ không còn nằm
  // trên ảnh để cần đổi màu theo độ sáng — nền kem/chữ mực cố định như bản
  // vẽ. `mauChu` vẫn tính ở trên vì ba layout kia (tap-chi/toi-gian/de-cheo)
  // còn đè chữ lên ảnh và cần nó.
  //
  // Đo bằng `tests/e2e/bb-289-theo-ban-ve.spec.ts`:
  //  - (3) tỉ lệ khối hiển thị ảnh ở lg khớp tỉ lệ ảnh gốc ±2% (object-contain
  //    đảm bảo luôn đúng, không phụ thuộc ảnh dọc/ngang) ở 1440×900, 1280×720.
  //  - (4) bounding box khối ảnh và khối chữ KHÔNG giao nhau ở 390×844.
  //
  // `tests/e2e/bb-240-man-khach-may-tinh.spec.ts` (mép trái h1 bìa = mép trái
  // lưới ảnh) được VIẾT LẠI cho hướng chia đôi mới — xem ghi chú trong tệp
  // đó; hai bản đo cũ (BB-253 chia đôi cũ, rồi BB-258 xoá chia đôi) đã đổi
  // hướng hai lần trong cùng một task này theo đúng chỉ đạo studio.
  return (
    <section
      aria-label="Ảnh bìa"
      data-testid="bia-bo-anh"
      className={cn(
        "@container relative isolate flex w-full flex-col overflow-hidden bg-[#fbf7f2] text-[#2e2a27]",
        "lg:grid lg:grid-cols-[42%_minmax(0,1fr)] lg:items-stretch",
        className,
      )}
    >
      {/*
        Khối ảnh — điện thoại/bảng: khối cao GIỚI HẠN trong dòng chảy bình
        thường (KHÔNG `absolute` — đó là gốc lỗi (4)), object-cover vì đây là
        một ô ảnh nhỏ như thẻ, cắt nhẹ chấp nhận được. Máy tính (lg): cột
        trái 42%, cao BẰNG cột chữ bên cạnh (`lg:h-full` trong hàng grid
        `items-stretch`), `object-contain` trên nền kem đậm hơn để không cắt
        đầu/chân ảnh dọc — đúng lỗi (3).
      */}
      <div
        data-testid="bia-khoi-anh"
        className="relative h-[42svh] max-h-[440px] min-h-[260px] w-full shrink-0 bg-[#e7d3c6] lg:h-auto lg:max-h-none lg:min-h-[480px]"
      >
        {anhBia && (
          <img
            src={`/api/img/${anhBia.id}?w=1600`}
            srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
            sizes="(min-width: 1024px) 42vw, 100vw"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[50%_30%] lg:object-contain motion-safe:animate-[bia-hien_1.2s_ease-out]"
          />
        )}
      </div>

      {/*
        Khối chữ — LUÔN trong dòng chảy bình thường, ngay dưới ảnh trên điện
        thoại, cột phải trên máy tính. Không `absolute`/`inset-x-0 bottom-0`
        nữa nên không thể chồng lên khối ảnh ở bất kỳ bề rộng nào.
      */}
      <div
        data-testid="bia-khoi-chu"
        className={cn(
          // BB-289 — bỏ `khach-le-trai-lg` (công thức canh mép trái theo bề
          // rộng TOÀN TRANG) ở đây: công thức đó dựng cho khối chữ tràn toàn
          // section (BB-278), không còn đúng nữa khi khối chữ chỉ là MỘT CỘT
          // trong lưới chia đôi (`lg:grid-cols-[42%_1fr]`) — padding cố định
          // (`lg:px-10 xl:px-16`) là đúng cho một cột, không cần co theo cqw
          // toàn trang nữa. `bb-240-man-khach-may-tinh.spec.ts` viết lại theo
          // hướng này (xem ghi chú trong tệp đó).
          "relative flex-1 border-t border-[#e5dcd2] bg-[#fbf7f2] px-6 py-7 sm:px-10",
          "lg:flex lg:flex-col lg:justify-center lg:border-t-0 lg:px-10 lg:py-10 xl:px-16",
        )}
      >
        <div className="max-w-md lg:max-w-2xl">
          {/*
            BB-295 mục #7 — báo cáo chấm độc lập: dòng phụ trên bìa từng là
            "ngày · TÊN CHI NHÁNH", đọc như một nhãn vận hành hơn là lời chào
            cảm xúc. Chi nhánh đã chuyển hẳn xuống chân trang (`gallery-app.tsx`
            footer) — dòng này chỉ còn ngày chụp.
          */}
          {ngay && (
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#6b6057]">{ngay}</p>
          )}

          {/*
            `text-wrap: balance` — bản vẽ và báo cáo chấm: khi không có tên bé
            thật, câu mặc định "Khoảnh khắc của con" xuống dòng 2 để mồ côi
            một chữ ("con"). `balance` chia đều số chữ mỗi dòng thay vì tràn
            hết dòng 1 rồi rớt một chữ xuống dòng 2.
          */}
          <h1
            className="mt-2 font-display text-[40px] font-light leading-[1.02] tracking-[-0.02em] sm:text-[48px] lg:mt-3 lg:text-[44px] xl:text-[52px]"
            style={{ textWrap: "balance" }}
          >
            {tieuDeBia}
          </h1>

          <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-[#4a423b] lg:max-w-2xl lg:text-base">
            {loiChaoBia}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-2 gap-y-2 text-[14px] text-[#4a423b] lg:mt-5">
            {hanMuc != null && (
              <span className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#2e2a27]/15 px-3.5">
                <Heart className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                {hanMuc} tấm trong gói
              </span>
            )}
            {conNgay != null && (
              <span className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#2e2a27]/15 px-3.5">
                <Clock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Còn {conNgay} ngày để chọn
              </span>
            )}
            {khoa && (
              <span className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#2e2a27]/15 px-3.5">
                <Lock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Đã chốt danh sách
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onBatDau}
            className="mt-8 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#2e2a27] px-7 text-[15px] font-medium text-[#fbf7f2] transition hover:bg-[#2e2a27]/90 active:scale-[0.98] sm:w-auto lg:mt-7"
          >
            {nhanNut}
          </button>
        </div>
      </div>
    </section>
  );
}



