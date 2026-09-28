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
  /**
   * BB-298 — "loại buổi chụp" (Thôi nôi, Newborn…), bản vẽ BB-297 (admin
   * duyệt 28/09/2026). `null`/`undefined` thì bìa ẩn dòng nghiêng dưới tên
   * bé và câu dự phòng lùi xuống bậc thấp hơn (xem `tinhBiaMacDinh`).
   */
  sessionType?: string | null;
  ngayChup: string | null;
  chiNhanh: string;
  loiChao: string | null;
  soAnh: number;
  hanMuc: number | null;
  daChon: number;
  hanChot: string | null;
  khoa: boolean;
  /**
   * BB-298 — link nhắn Zalo/chat của chi nhánh, cho nút viền "Nhắn cho
   * studio" cạnh nút chính trên bìa máy tính (bản vẽ `bia-may-tinh-tap-chi`).
   * `null`/`undefined` thì ẩn hẳn nút — chi nhánh chưa cấu hình chat.
   */
  chatUrl?: string | null;
  /**
   * BB-298 — 4 tấm đầu tiên của bộ, cho dải "Vài khoảnh khắc trong bộ" ở
   * chân bìa máy tính. `width`/`height` null thì coi ảnh vuông (tỉ lệ 1) —
   * lưới justified vẫn không cắt ảnh, chỉ không đúng tỉ lệ thật.
   */
  anhXemTruoc?: { id: string; width: number | null; height: number | null }[];
  /**
   * BB-298 — màn "Đã giao" (bản vẽ `da-giao-may-tinh.html`/`da-giao-dien-thoai.html`,
   * admin duyệt 28/09/2026 mục 4: "một dấu Đã hoàn thiện"). Bộ ảnh app cho
   * tải cả bộ (`gallery.options.download === true`) → hiện nút chính "Tải cả
   * bộ · N ảnh" ngay màn đầu; không thì chỉ còn nút "Xem lại bộ ảnh".
   */
  choPhepTai?: boolean;
  onTaiCaBo?: () => void;
  /** Ngày giao thật (`review.deliveredAt`) — `null` thì ẩn phần ngày trong dấu "Đã hoàn thiện". */
  ngayGiao?: string | null;
  /**
   * BB-287 mục 5 — báo cáo chấm #4: bìa vẫn ghi "Ba mẹ thong thả chọn nhé"
   * kể cả sau khi đã chốt hoặc đã giao ảnh — câu không khớp trạng thái.
   * `gallery.status` cho câu chào MẶC ĐỊNH biết nên nói gì; bỏ trống thì coi
   * như đang mở (giữ nguyên câu cũ).
   */
  trangThai?: string | null;
  onBatDau: () => void;
  /**
   * BB-296 mục #2 — báo cáo chấm độc lập lần 3: trình thiết kế bìa quản trị
   * dùng LẠI component này (đúng yêu cầu "không sáng tác thêm bố cục") để
   * xem trước, nhưng trước khi admin chọn ảnh, khối ảnh trống trơn — không
   * biết đang chờ gì. CHỈ prop tuỳ chọn, không set thì hành vi màn khách
   * (không admin) giữ nguyên y hệt trước — màn khách luôn có `anhBia`.
   */
  placeholderChuaCoAnh?: string | null;
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

/** "Ngày 12 tháng 9" — bậc cuối của câu dự phòng khi không có cả tên bé lẫn loại buổi chụp. */
function ngayThangDep(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Ngày ${d.getDate()} tháng ${d.getMonth() + 1}`;
}

export interface BiaMacDinh {
  /** Nhãn nhỏ hoa phía trên tên — "Bộ ảnh của" hay chỉ "Bộ ảnh". */
  eyebrow: string;
  /** Chữ lớn Playfair — tên bé, loại buổi chụp, hoặc ngày chụp. */
  title: string;
  /** Dòng nghiêng dưới tên — loại buổi chụp, "của con", hoặc "của gia đình mình". `null` = không có dòng này. */
  phuDe: string | null;
}

/**
 * BB-298 — câu dự phòng BA BẬC cho bìa (bản vẽ `bia-khong-ten-dien-thoai.html`,
 * admin duyệt 28/09/2026 mục 2):
 *   1. Có tên bé → "Bộ ảnh của" / Tên bé / loại buổi chụp (nghiêng).
 *   2. Không tên bé, CÓ loại buổi chụp → "Bộ ảnh" / Loại buổi chụp / "của con".
 *   3. Không có cả hai → "Bộ ảnh" / "Ngày {d} tháng {m}" / "của gia đình mình".
 * Hàm THUẦN (không đọc DOM/props ngoài tham số) để phép thử đơn vị canh đúng
 * luật rẽ nhánh, không canh chuỗi HTML render ra (AGENTS.md §5a).
 */
export function tinhBiaMacDinh(
  tenBe: string | null,
  sessionType: string | null | undefined,
  ngayChup: string | null,
): BiaMacDinh {
  const ten = tenBe?.trim();
  const loai = sessionType?.trim();
  if (ten) {
    return { eyebrow: "Bộ ảnh của", title: ten, phuDe: loai || null };
  }
  if (loai) {
    return { eyebrow: "Bộ ảnh", title: loai, phuDe: "của con" };
  }
  return { eyebrow: "Bộ ảnh", title: ngayThangDep(ngayChup) || "Khoảnh khắc", phuDe: "của gia đình mình" };
}

export function BiaBoAnh(props: BiaBoAnhProps) {
  const {
    className,
    anhBia,
    coverHeadline,
    coverLayout,
    tenBe,
    sessionType,
    ngayChup,
    chiNhanh,
    loiChao,
    soAnh,
    hanMuc,
    daChon,
    hanChot,
    khoa,
    chatUrl,
    anhXemTruoc = [],
    choPhepTai = false,
    onTaiCaBo,
    ngayGiao,
    trangThai,
    onBatDau,
    placeholderChuaCoAnh,
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

  const imgEl = anhBia ? (
          <img
      src={`/api/img/${anhBia.id}?w=1600`}
      srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
      sizes="(min-width: 1024px) 60vw, 100vw"
      alt=""
      fetchPriority="high"
      decoding="async"
      className="h-full w-full object-cover object-[50%_30%] lg:object-center motion-safe:animate-[bia-hien_1.2s_ease-out]"
    />
  ) : placeholderChuaCoAnh ? (
    <div className="flex h-full w-full items-center justify-center bg-[#e7d3c6] px-6 text-center text-sm text-[#6b5d4f]">
      {placeholderChuaCoAnh}
    </div>
  ) : null;

  const tcClass = mauChu === "sang" ? "text-white" : "text-[#2a2420]";
  const bgOverlay = mauChu === "sang" ? "bg-black/30" : "bg-white/30";
  const btnClass = mauChu === "sang"
    ? "bg-white text-[#2a2420] hover:bg-white/90"
    : "bg-[#2a2420] text-white hover:bg-[#2a2420]/90";

  // ĐÃ GIAO — bản vẽ `da-giao-may-tinh.html`/`da-giao-dien-thoai.html` (admin
  // duyệt 28/09/2026, XONG.md mục 4: "một dấu Đã hoàn thiện"). Thắng MỌI
  // `coverLayout` admin đã chọn cho lúc CHƯA giao — bìa lúc đã giao là một
  // thiết kế cố định, không phải một biến thể của bốn kiểu bìa "đang chọn
  // ảnh" phía trên.
  if (trangThai === "delivered") {
    const ngayGiaoDep = ngayDep(ngayGiao ?? null);
    const tenHienThi = tenBe?.trim() || "bé";
    const camOn =
      loiChao?.trim() ||
      `"Cảm ơn ba mẹ đã tin Baby Bean giữ lại năm đầu đời của ${tenHienThi}."`;

    return (
      <section aria-label="Ảnh bìa — đã giao" data-testid="bia-bo-anh" className="w-full bg-[#fbf7f2] text-[#2e2a27]">
        <div className="mx-auto max-w-[1360px] px-6 pt-8 sm:px-8 lg:grid lg:grid-cols-[760px_minmax(0,1fr)] lg:gap-20 lg:px-10">
          {/* Bìa nhỏ RÕ MÀU — không dimmed/không nhạt (mục 5 XONG.md). */}
          <div
            data-testid="bia-khoi-anh"
            className="relative h-[300px] w-full overflow-hidden rounded-[4px] bg-[#dcc0ae] sm:h-[360px] lg:h-[540px]"
          >
            {anhBia ? (
              <img
                src={`/api/img/${anhBia.id}?w=1600`}
                srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
                alt=""
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : placeholderChuaCoAnh ? (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-[#6b5d4f]">
                {placeholderChuaCoAnh}
              </div>
            ) : null}
          </div>

          <div className="mt-6 lg:mt-10">
            <span
              data-testid="dau-da-hoan-thien"
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#e3eee9] px-3.5 text-[13px] font-medium text-[#2f4a40]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Đã hoàn thiện{ngayGiaoDep ? ` · giao ngày ${ngayGiaoDep}` : ""}
            </span>

            <h1 className="mt-5 font-display text-[36px] font-light leading-[1.12] sm:text-[44px] lg:text-[48px]">
              Ảnh của {tenHienThi}
              <br />
              <span>đã sẵn sàng</span>
            </h1>

            <p className="mt-3.5 text-[15px] text-[#6b6057]">
              {[sessionType, soAnh > 0 ? `${soAnh.toLocaleString("vi-VN")} ảnh đã chỉnh` : null, chiNhanh]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {choPhepTai && onTaiCaBo && (
                <button
                  type="button"
                  onClick={onTaiCaBo}
                  data-testid="nut-tai-ca-bo-bia"
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#2e2a27] px-7 text-[15px] font-medium text-[#fbf7f2] transition hover:bg-[#2e2a27]/90 active:scale-[0.98]"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Tải cả bộ{soAnh > 0 ? ` · ${soAnh.toLocaleString("vi-VN")} ảnh` : ""}
                </button>
              )}
              <button
                type="button"
                onClick={onBatDau}
                className="inline-flex h-[52px] items-center justify-center rounded-full border border-[#2e2a27]/20 px-6 text-[15px] font-medium text-[#2e2a27] transition hover:bg-[#2e2a27]/5"
              >
                Xem lại bộ ảnh
              </button>
            </div>

            <div className="mt-8 flex items-center gap-4 border-t border-[#e5dcd2] pt-6">
              <img
                src="/hanh-trinh/tien-do-da-giao-320.webp"
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover sm:h-20 sm:w-20"
              />
              {/* BB-305 — đoạn cảm ơn là nội dung (đoạn văn), không phải
                  tiêu đề: chuyển khỏi font-display/italic sang Be Vietnam
                  Pro mặc định theo LUẬT PHÔNG mới. */}
              <p className="text-[16px] leading-relaxed text-[#4a423b] sm:text-[17px]">{camOn}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

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

  // ben-canh (default) — BB-298 dựng đúng bản vẽ BB-297 (admin duyệt
  // 28/09/2026, "Bìa máy tính: B chia đôi tạp chí", `bia-may-tinh-tap-chi`
  // + `bia-dien-thoai`), SUPERSEDES quyết định BB-289 dưới đây cho layout
  // "ben-canh": bản vẽ mới của studio cho phép/đòi chữ ĐÈ lên ảnh ở điện
  // thoại (kiểu tạp chí — tràn toàn màn, lớp tối dần phía dưới, chữ kem) và
  // ảnh KHÔNG còn letterbox ở máy tính (`object-cover` tràn cột, không phải
  // `object-contain` với nền kem lấp viền). `tests/e2e/bb-289-theo-ban-ve.spec.ts`
  // đã được SỬA LẠI theo hướng mới này (mục (3)/(4) đổi hẳn kỳ vọng — xem
  // ghi chú trong tệp đó) — không phải hồi quy, là bản vẽ mới ghi đè bản cũ,
  // đúng luật "bản vẽ là luật" (LUAT-DOT-8.md).
  //
  // Ghi chú BB-289 gốc (lịch sử, không còn áp dụng cho layout này):
  //   (3) Máy tính: từng chốt CHIA ĐÔI object-contain để không cắt ảnh dọc.
  //   (4) Điện thoại: từng chốt khối chữ KHÔNG được đè ảnh (kiểu thẻ).
  // Bản vẽ BB-297 đảo ngược cả hai cho ĐÚNG LAYOUT NÀY — các layout tap-chi/
  // toi-gian/de-cheo phía trên (đè chữ lên ảnh, đo sáng tối tự động) không
  // đổi gì.
  const bia = tinhBiaMacDinh(tenBe, sessionType, ngayChup);
  // `coverHeadline` (BB-215, admin tự viết tiêu đề) vẫn thắng — giữ đúng tên
  // bé/ngày CHỈ khi studio chưa tự soạn tiêu đề riêng.
  const tieuDeHienThi = coverHeadline?.trim() || bia.title;
  const dungTieuDeTuDong = !coverHeadline?.trim();

  // MỘT h1/eyebrow/phụ-đề/nút-chính DUY NHẤT trong DOM, dùng lưới CSS để
  // CHỒNG chữ lên ảnh ở điện thoại (cùng một ô lưới — `col/row-start-1`) và
  // TÁCH thành cột riêng ở máy tính. Nhiều phép thử cũ
  // (`bb-240-man-khach-may-tinh.spec.ts`, `bb-258-bia-tran-thanh-noi.spec.ts`)
  // đọc `section[aria-label='Ảnh bìa'] h1` ở strict mode (đúng MỘT phần tử) —
  // dựng hai khối chữ riêng cho hai bề rộng (bản nháp đầu của BB-298) sinh ra
  // HAI thẻ `<h1>` cùng lúc trong DOM (một `lg:hidden`, một `hidden lg:flex`)
  // và làm vỡ toàn bộ các phép thử đó dù không cố ý đổi hành vi tại đó. Giữ
  // đúng MỘT `<h1>`/nút chính, chỉ đổi VỊ TRÍ + MÀU qua `lg:`; các phần NỘI
  // DUNG thật sự khác nhau giữa hai bề rộng (dòng cuối điện thoại, bộ ba
  // thông tin + dải ảnh xem trước máy tính) vẫn là hai khối riêng — không có
  // phép thử cũ nào đọc chúng.
  //
  // BB-298 (điều hành, sau khi admin xem bản dựng đầu) — ĐẢO NGƯỢC cột máy
  // tính so với bản vẽ gốc `bia-may-tinh-tap-chi.html`: ảnh nay đứng CỘT
  // PHẢI, chữ đứng CỘT TRÁI (bản vẽ gốc là ảnh trái/chữ phải). Số đo và nội
  // dung giữ nguyên, chỉ đổi thứ tự cột — `lg:grid-cols-[1fr_42%]` thay vì
  // `[42%_1fr]`, khối ảnh chuyển sang `lg:col-start-2`, khối chữ ở lại
  // `lg:col-start-1` (mặc định, không cần override). Logo/tin nhắn/chuông
  // KHÔNG lặp lại bên trong bìa: thanh thương hiệu dùng chung của trang
  // (`gallery-app.tsx`, đứng NGOÀI/TRÊN toàn bộ khối bìa) đã có logo bên
  // trái + hai icon bên phải cho máy tính từ trước (BB-278/281) — việc đảo
  // cột ảnh/chữ bên trong bìa không đụng tới thanh đó, nên không cần thêm
  // lớp tối/đổi màu cho icon (chúng không nằm trên ảnh). Điện thoại không
  // đổi gì (ảnh vẫn tràn màn, chữ vẫn đè đáy).
  return (
    <section
      aria-label="Ảnh bìa"
      data-testid="bia-bo-anh"
      className={cn(
        "@container relative isolate grid w-full grid-cols-1 grid-rows-1 overflow-hidden bg-[#fbf7f2] text-[#2e2a27]",
        "lg:grid-cols-[minmax(0,1fr)_42%] lg:items-stretch",
        className,
      )}
    >
      {/*
        Khối ảnh — điện thoại: TRÀN TOÀN MÀN (`min-h-[100svh]`), lớp tối dần
        phía dưới để chữ kem đọc được (bản vẽ `bia-dien-thoai.html`). Máy
        tính (lg): CỘT PHẢI 42% (đảo so với bản vẽ gốc — chỉ đạo điều hành
        sau khi xem bản dựng), cao bằng cột chữ, `object-cover` tràn cột —
        không còn letterbox kem.
      */}
      <div
        data-testid="bia-khoi-anh"
        // BB-298 (điều hành) — `min-h-[100svh]` đơn thuần cộng dồn với thanh
        // thương hiệu + chip "Lưu ra màn hình chính" đứng TRÊN bìa (ngoài
        // component này, trong `gallery-app.tsx`) đẩy nút chính và dòng cuối
        // xuống dưới mép màn hình thật (bắt được qua ảnh chụp 390×844). Trừ
        // đúng chiều cao ĐO THẬT của khối phía trên qua biến CSS
        // `--bb-phan-tren-bia` (gallery-app.tsx đo bằng `ResizeObserver`,
        // không phải hằng số đoán) — biến thiếu thì `0px` (không đổi hành vi
        // ở nơi khác dùng lại component này, ví dụ trình thiết kế bìa quản
        // trị không đặt biến này). Máy tính không đụng, vẫn `lg:min-h-0`.
        className="relative col-start-1 col-end-2 row-start-1 row-end-2 min-h-[calc(100svh_-_var(--bb-phan-tren-bia,0px))] w-full bg-[#e2c9bb] lg:col-start-2 lg:col-end-3 lg:min-h-0 lg:h-auto"
      >
        {anhBia ? (
          <img
            src={`/api/img/${anhBia.id}?w=1600`}
            srcSet={`/api/img/${anhBia.id}?w=800 800w, /api/img/${anhBia.id}?w=1600 1600w`}
            sizes="(min-width: 1024px) 42vw, 100vw"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[50%_30%] lg:object-center motion-safe:animate-[bia-hien_1.2s_ease-out]"
          />
        ) : placeholderChuaCoAnh ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-[#6b5d4f]">
            {placeholderChuaCoAnh}
          </div>
        ) : null}

        {/* Lớp tối dần — CHỈ điện thoại (bản vẽ `.phu`), máy tính không cần
            vì chữ đứng ở cột riêng nền kem, không đè ảnh. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 lg:hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(28,22,18,.28) 0, rgba(28,22,18,0) 120px, rgba(28,22,18,0) 380px, rgba(28,22,18,.58) 640px, rgba(28,22,18,.72) 100%)",
          }}
        />
      </div>

      {/*
        Khối chữ — điện thoại: CÙNG Ô LƯỚI với ảnh (chồng lên đáy ảnh, chữ
        kem — bản vẽ `.chu`). Máy tính: CỘT TRÁI riêng (đảo so với bản vẽ gốc
        `.phai` — nay là cột 1, không phải cột 2), nền kem, chữ mực, không đè
        ảnh.
      */}
      <div
        data-testid="bia-khoi-chu"
        className={cn(
          "relative z-10 col-start-1 col-end-2 row-start-1 row-end-2 self-end px-6 pb-10 text-[#fbf7f2]",
          "lg:static lg:row-start-1 lg:self-auto lg:flex lg:flex-col lg:justify-center",
          "lg:bg-[#fbf7f2] lg:px-10 lg:py-10 lg:text-[#2e2a27] xl:px-16",
        )}
      >
        <div className="lg:max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#fbf7f2]/85 lg:text-[#6b6057] lg:tracking-[0.16em]">
            {bia.eyebrow}
          </p>

          <h1
            className="mt-3.5 font-display text-[44px] font-light leading-[1] tracking-[-0.01em] sm:text-[52px] lg:mt-4 lg:text-[64px] lg:leading-[0.95] lg:tracking-[-0.02em] xl:text-[84px]"
            style={{ textWrap: "balance" }}
          >
            {tieuDeHienThi}
          </h1>
          {/* BB-305 — vẫn Playfair Display (phụ đề đi ngay dưới H1 tên
              bé/tiêu đề bìa), nhưng bỏ nghiêng: luật mới cấm italic kể cả
              dòng loại buổi chụp ("Thôi nôi") ở đây. */}
          {dungTieuDeTuDong && bia.phuDe && (
            <p className="mt-1.5 font-display text-[26px] leading-[1.2] text-[#fbf7f2]/92 lg:mt-2.5 lg:text-[28px] lg:text-[#4a423b]">
              {bia.phuDe}
            </p>
          )}

          {/* Lời chào — chỉ máy tính (bản vẽ `.loi`); điện thoại không có chỗ, dòng cuối thay thế. */}
          <p className="mt-5 hidden max-w-[29rem] text-[15px] leading-relaxed text-[#4a423b] lg:block">
            {loiChaoBia}
          </p>

          {/* Dòng phụ ngày/chi nhánh — CHỈ điện thoại (bản vẽ `.meta`). */}
          {(ngay || chiNhanh) && (
            <div className="mt-4.5 flex items-center gap-1.5 text-[13px] text-[#fbf7f2]/85 lg:hidden">
              {ngay && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                  {ngay}
                </span>
              )}
              {ngay && chiNhanh && <span className="opacity-50">·</span>}
              {chiNhanh && <span>Chi nhánh {chiNhanh}</span>}
            </div>
          )}

          {/* Bộ ba thông tin: Ngày chụp · Chi nhánh · Trong gói — CHỈ máy tính (bản vẽ `.meta`). */}
          {(ngay || chiNhanh || hanMuc != null) && (
            <div className="mt-6 hidden flex-wrap gap-x-10 gap-y-3 lg:flex">
              {ngay && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a8078]">Ngày chụp</p>
                  <p className="mt-1 text-[15px]">{ngay}</p>
                </div>
              )}
              {chiNhanh && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a8078]">Chi nhánh</p>
                  <p className="mt-1 text-[15px]">{chiNhanh}</p>
                </div>
              )}
              {hanMuc != null && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-[#8a8078]">Trong gói</p>
                  <p className="mt-1 text-[15px]">
                    {hanMuc} tấm{hanChot && !khoa ? ` · chọn trước ${ngayDep(hanChot)}` : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {khoa && (
            <div className="mt-4 hidden items-center gap-1.5 rounded-full border border-[#2e2a27]/15 px-3.5 text-[14px] text-[#4a423b] lg:inline-flex lg:h-[36px]">
              <Lock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
              Đã chốt danh sách
            </div>
          )}

          {/* Nút chính (bản vẽ `.nut-k`/`.hang .nut`) + "Nhắn cho studio" (chỉ máy tính, bản vẽ `.hang .chip`). */}
          <div className="mt-6 flex items-center gap-3.5 lg:mt-8">
            <button
              type="button"
              onClick={onBatDau}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#fbf7f2] px-7 text-[15px] font-medium text-[#2e2a27] transition hover:bg-white active:scale-[0.98] lg:w-auto lg:bg-[#2e2a27] lg:text-[#fbf7f2] lg:hover:bg-[#2e2a27]/90"
            >
              {nhanNut} <ArrowDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
            </button>
            {chatUrl && (
              <a
                href={chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden h-[52px] items-center justify-center rounded-full border border-[#2e2a27]/20 px-6 text-[15px] font-medium text-[#2e2a27] transition hover:bg-[#2e2a27]/5 lg:inline-flex"
              >
                Nhắn cho studio
              </a>
            )}
          </div>

          {/* Dòng cuối điện thoại: N ảnh | M tấm trong gói | Chọn trước dd/mm (bản vẽ `.duoi`). */}
          {(soAnh > 0 || hanMuc != null || conNgay != null) && (
            <div className="mt-3.5 flex flex-wrap justify-center gap-3 text-center text-[12px] text-[#fbf7f2]/80 lg:hidden">
              {soAnh > 0 && <span>{soAnh.toLocaleString("vi-VN")} ảnh</span>}
              {hanMuc != null && (
                <>
                  {soAnh > 0 && <span className="opacity-45">|</span>}
                  <span>{hanMuc} tấm trong gói</span>
                </>
              )}
              {hanChot && !khoa && (
                <>
                  <span className="opacity-45">|</span>
                  <span>Chọn trước {ngayDep(hanChot)}</span>
                </>
              )}
              {khoa && (
                <>
                  <span className="opacity-45">|</span>
                  <span>Đã chốt danh sách</span>
                </>
              )}
            </div>
          )}

          {/* Dải "Vài khoảnh khắc trong bộ" — CHỈ máy tính (bản vẽ `.dai`). */}
          {anhXemTruoc.length > 0 && (
            <div className="mt-9 hidden lg:block">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.1em] text-[#8a8078]">
                  Vài khoảnh khắc trong bộ
                </span>
                <button
                  type="button"
                  onClick={onBatDau}
                  className="text-[13px] text-[#6b6057] underline underline-offset-[3px] hover:text-[#2e2a27]"
                >
                  Xem cả {soAnh.toLocaleString("vi-VN")} ảnh
                </button>
              </div>
              <div className="flex gap-2">
                {anhXemTruoc.slice(0, 4).map((p) => {
                  const ti_le = p.width && p.height ? p.width / p.height : 1;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={onBatDau}
                      aria-label="Xem ảnh này trong lưới"
                      className="min-w-0 overflow-hidden rounded-[4px] bg-[#e7d3c6]"
                      style={{ flex: `${ti_le} 1 0`, aspectRatio: ti_le }}
                    >
                      <img
                        src={`/api/img/${p.id}?w=200`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



