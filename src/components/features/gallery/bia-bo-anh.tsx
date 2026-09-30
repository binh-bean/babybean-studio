"use client";

import { cn } from "@/components/ui/utils";
import React, { useEffect, useState } from "react";
import { Clock, Heart, Lock, ArrowDown } from "lucide-react";
import { tinhDoSang, chonMauChu } from "@/lib/utils/do-sang";
import { coChuTieuDeBia, dongChiNhanh, formatSo } from "@/lib/utils/dinh-dang";
import { vi } from "@/i18n";


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
  /**
   * BB-310 mục 7 (chỉ đạo admin 28/09/2026) — 254/258 bé thật không có
   * nickname. Còn nickname thì đây là tên gọi ngắn (qua `tenGoiBe()`, tính ở
   * `gallery-app.tsx`); mất nickname thì đây là HỌ TÊN ĐẦY ĐỦ NGUYÊN VẸN
   * (không rút gọn, không thêm "Bé ") — component tự co cỡ chữ tiêu đề theo
   * độ dài (`coChuTieuDeBia`) để không tràn quá 2 dòng.
   */
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

/**
 * BB-319 K-S2 — dòng phụ nhiều mục (ngày · chi nhánh…) KHÔNG BAO GIỜ để dấu "·"
 * treo cuối dòng. Điện thoại: mỗi mục một dòng, không dấu. Từ sm: một dòng, dấu
 * "·" chỉ nằm GIỮA hai mục đứng liền nhau (mục rỗng bị loại trước khi ghép).
 */
function DongMeta({ muc, className }: { muc: Array<string | null | undefined | false>; className?: string }) {
  const co = muc.filter((m): m is string => Boolean(m));
  if (co.length === 0) return null;
  return (
    <p className={className} data-testid="bia-dong-meta">
      {co.map((m, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span aria-hidden="true" className="mx-1.5 hidden opacity-50 sm:inline">
              ·
            </span>
          )}
          <span className="block sm:inline">{m}</span>
        </React.Fragment>
      ))}
    </p>
  );
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
    // BB-314: `qua=1` giữ ảnh đo độ sáng CÙNG NGUỒN (đi proxy, không 302 sang
    // lh3) — canvas đọc điểm ảnh khác nguồn sẽ bị "nhiễm", getImageData ném lỗi.
    img.src = `/api/img/${anhBia.id}?w=200&qua=1`;
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
        : `${formatSo(soAnh)} khoảnh khắc của con đã sẵn sàng. Ba mẹ thong thả chọn nhé.`;
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
      srcSet={`/api/img/${anhBia.id}?w=1600 1600w, /api/img/${anhBia.id}?w=2048 2048w`}
      sizes="(min-width: 1024px) 60vw, 100vw"
      alt=""
      fetchPriority="high"
      decoding="async"
      // BB-326 mục 2 — `lg:` hỏi VIEWPORT: trong trình thiết kế bìa quản trị
      // (màn máy tính ≥1024px) khung ĐIỆN THOẠI 390px vẫn ăn `object-center`,
      // nên ảnh bị cắt khác hẳn điện thoại thật của khách (`50% 30%`). Mọi bố
      // cục đều bọc `@container`, nên hỏi bề rộng KHUNG (`@[64rem]:`) — màn
      // khách y nguyên (khung = viewport), khung xem trước thì khớp khách.
      className="h-full w-full object-cover object-[50%_30%] @[64rem]:object-center motion-safe:animate-[bia-hien_1.2s_ease-out]"
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
    // BB-319 (luật 4) — hai câu ≤ 12 chữ thay một câu 16 chữ; vẫn gọi tên bé, và
    // tên bé không bị ngắt giữa hai dòng ("Bé / Xoài").
    const camOn: React.ReactNode = loiChao?.trim() || (
      <>
        Cảm ơn ba mẹ. Năm đầu đời của <span className="whitespace-nowrap">{tenHienThi}</span>, Baby Bean
        giữ trọn ở đây.
      </>
    );

    return (
      <section aria-label="Ảnh bìa — đã giao" data-testid="bia-bo-anh" className="w-full bg-[#fdfbf9] pb-6 text-[#2e2a27] lg:pb-0">
        {/*
          BB-317 K-d — CÙNG LƯỚI BÌA với màn đầu (K1) và màn đang chỉnh (K10):
          máy tính chia hai cột `[1fr | 42%]`, ẢNH Ở CỘT PHẢI tràn mép, chữ ở cột
          trái; điện thoại giữ ảnh trên, chữ dưới. Trước đây ảnh nằm TRÁI trong
          khung 760px nên hai màn cùng một bộ ảnh đổi phía ảnh khi chuyển trạng thái.

          BB-319 K-S1 — màn Đã giao mở ra phải THẤY lưới ảnh hoàn thiện: khối bìa
          gọn lại (ảnh 260px trên điện thoại, lời cảm ơn thành một dòng có tranh
          nhỏ ngay dưới tiêu đề, "Xem lại bộ ảnh" là nút chữ trên điện thoại) để
          lưới ảnh đứng ngay sau khối tải, không bị đẩy xuống màn thứ hai.
        */}
        <div className="lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_42%] lg:items-stretch">
          {/* Bìa nhỏ RÕ MÀU — không dimmed/không nhạt (mục 5 XONG.md). */}
          <div
            data-testid="bia-khoi-anh"
            className="relative mx-6 mt-6 h-[260px] overflow-hidden rounded-[4px] bg-[#dcc0ae] sm:h-[360px] lg:col-start-2 lg:row-start-1 lg:m-0 lg:h-auto lg:rounded-none"
          >
            {anhBia ? (
              <img
                src={`/api/img/${anhBia.id}?w=1600`}
                srcSet={`/api/img/${anhBia.id}?w=1600 1600w, /api/img/${anhBia.id}?w=2048 2048w`}
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

          <div className="mt-5 px-6 lg:col-start-1 lg:row-start-1 lg:mt-0 lg:flex lg:flex-col lg:justify-center lg:px-10 lg:py-10">
           <div className="lg:max-w-2xl">
            <span
              data-testid="dau-da-hoan-thien"
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#e3eee9] px-3.5 text-[13px] font-medium text-[#2f4a40]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Đã hoàn thiện{ngayGiaoDep ? ` · giao ngày ${ngayGiaoDep}` : ""}
            </span>

            <h1 className="mt-4 font-display text-[36px] font-light leading-[1.12] sm:text-[44px] lg:mt-5 lg:text-[48px]">
              Ảnh của {tenHienThi}
              <br />
              <span>đã sẵn sàng</span>
            </h1>

            {/* Lời cảm ơn — khoảnh khắc vui của màn Đã giao: tranh riêng + gọi tên bé,
                gọn thành một khối ngay dưới tiêu đề (không còn là thẻ tách rời dưới nút). */}
            <div data-testid="loi-cam-on-da-giao" className="mt-3 flex items-center gap-3 lg:mt-4">
              <img
                src="/hanh-trinh/tien-do-da-giao-320.webp"
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg object-cover lg:h-14 lg:w-14"
              />
              {/* BB-305 — đoạn cảm ơn là nội dung (đoạn văn), không phải tiêu đề: Be Vietnam Pro. */}
              <p className="text-[15px] leading-snug text-[#4a423b]">{camOn}</p>
            </div>

            {/* BB-319 — số ảnh đã nằm trên nút "Tải cả bộ · N ảnh": dòng phụ không lặp lại
                (và không gọi ảnh gốc là "ảnh đã chỉnh"). Không cho tải thì dòng phụ nói số ảnh. */}
            <DongMeta
              className="mt-3 text-[13px] text-[#6b6057]"
              muc={[sessionType, !choPhepTai && soAnh > 0 ? `${formatSo(soAnh)} ảnh` : null, dongChiNhanh(chiNhanh)]}
            />

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2.5 lg:mt-7 lg:gap-3">
              {choPhepTai && onTaiCaBo && (
                <button
                  type="button"
                  onClick={onTaiCaBo}
                  data-testid="nut-tai-ca-bo-bia"
                  className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#2e2a27] px-7 text-[15px] font-medium text-[#fdfbf9] transition hover:bg-[#2e2a27]/90 active:scale-[0.98]"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Tải cả bộ{soAnh > 0 ? ` · ${formatSo(soAnh)} ảnh` : ""}
                </button>
              )}
              {/* Điện thoại: nút chữ gọn (lưới ảnh ngay bên dưới); máy tính: nút viền như bìa K1. */}
              <button
                type="button"
                onClick={onBatDau}
                className="inline-flex items-center justify-center text-[15px] font-medium text-[#2e2a27] underline underline-offset-4 transition lg:h-[52px] lg:rounded-full lg:border lg:border-[#2e2a27]/20 lg:px-6 lg:no-underline lg:hover:bg-[#2e2a27]/5"
              >
                Xem lại bộ ảnh
              </button>
            </div>
           </div>
          </div>
        </div>
      </section>
    );
  }

  // BB-313 mục 3 (chấm lại, chủ dự án) — CẢ BA bố cục dưới đây (Tạp chí, Tối
  // giản, Đè chéo) dùng chung một lỗi với "ben-canh" (đã sửa ở nhánh
  // return phía dưới, đọc chú thích dài ở đó): breakpoint `sm:`/`lg:` viết
  // theo VIEWPORT trong khi trình thiết kế bìa quản trị mô phỏng khổ bằng
  // `scale()` — cùng một cách sửa (bọc `@container`, đổi `sm:`/`lg:` sang
  // `@[40rem]:`/`@[64rem]:`) và cùng biến CSS `--bb-bia-khung-cao` cho
  // `min-h-[100svh]` (xem chú thích ở nhánh "ben-canh"). Ba bố cục này không
  // có nhánh máy tính/điện thoại riêng (một bố cục full-bleed cho MỌI bề
  // rộng, chỉ đổi cỡ chữ) nên không cần trừ `--bb-phan-tren-bia`.
  if (layout === "tap-chi") {
    return (
      <div className="@container">
        <section
          className={`relative isolate flex min-h-[var(--bb-bia-khung-cao,100svh)] w-full items-center justify-center overflow-hidden ${tcClass}`}
        >
          <div className="absolute inset-0 -z-10">
            {imgEl}
            <div className={`absolute inset-0 ${bgOverlay}`} />
          </div>
          <div className="z-10 flex flex-col items-center text-center px-6 max-w-2xl">
            {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang, bỏ
                khỏi khối chữ bìa để không lặp; chỉ còn ngày · chi nhánh. */}
            <DongMeta className="text-[12px] uppercase tracking-[0.16em] opacity-85 mb-4" muc={[ngay, chiNhanh]} />
            <h1 className="font-display text-[54px] @[40rem]:text-[68px] @[64rem]:text-[84px] font-light leading-[0.98] tracking-[-0.02em]">{tieuDeBia}</h1>
            <p className="mt-5 text-[15px] leading-relaxed opacity-90">{loiChaoBia}</p>
            <div className="flex justify-center w-full"><MetaInfo /></div>
            <button onClick={onBatDau} className={`mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
              {nhanNut} <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (layout === "toi-gian") {
    return (
      <div className="@container">
        <section
          className={`relative isolate flex min-h-[var(--bb-bia-khung-cao,100svh)] w-full items-end p-8 @[64rem]:p-16 overflow-hidden ${tcClass}`}
        >
          <div className="absolute inset-0 -z-10">
            {imgEl}
            <div className={`absolute inset-0 bg-gradient-to-t ${mauChu === 'sang' ? 'from-black/70 to-transparent' : 'from-white/70 to-transparent'} h-1/2 bottom-0 top-auto`} />
          </div>
          <div className="z-10 w-full max-w-3xl">
            {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang. */}
            <DongMeta className="uppercase tracking-[0.2em] mb-2 text-[12px] opacity-90" muc={[ngay, chiNhanh]} />
            <h1 className="font-display text-[48px] @[40rem]:text-[60px] @[64rem]:text-[72px] font-light leading-[1] tracking-[-0.02em] mb-4">{tieuDeBia}</h1>
            <p className="text-[15px] leading-relaxed opacity-90 max-w-md">{loiChaoBia}</p>
            <MetaInfo />
            <button onClick={onBatDau} className={`mt-6 inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
              {nhanNut} <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (layout === "de-cheo") {
    return (
      <div className="@container">
        <section
          className={`relative isolate flex min-h-[var(--bb-bia-khung-cao,100svh)] w-full overflow-hidden ${tcClass}`}
        >
          <div className="absolute inset-0 -z-10">
            {imgEl}
            <div className={`absolute inset-0 bg-gradient-to-br ${mauChu === 'sang' ? 'from-black/60 to-transparent' : 'from-white/60 to-transparent'} w-full h-full`} />
          </div>
          <div className="z-10 w-full p-8 @[64rem]:p-16 flex flex-col justify-start mt-10">
            {/* BB-278 — "Baby Bean" chuyển lên thanh thương hiệu đầu trang. */}
            <DongMeta className="text-[12px] uppercase tracking-[0.16em] opacity-85 mb-4" muc={[ngay, chiNhanh]} />
            <h1 className="font-display text-[50px] @[40rem]:text-[64px] @[64rem]:text-[76px] font-light leading-[0.98] tracking-[-0.02em] max-w-lg mt-4">{tieuDeBia}</h1>
            <p className="mt-4 text-[15px] leading-relaxed opacity-90 max-w-md">{loiChaoBia}</p>
            <MetaInfo />
            <button onClick={onBatDau} className={`mt-8 inline-flex h-[52px] self-start items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium shadow-lg transition active:scale-[0.98] ${btnClass}`}>
              {nhanNut} <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
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
  // BB-310 mục 7 (chỉ đạo admin 28/09/2026) — bìa in NGUYÊN HỌ TÊN ĐẦY ĐỦ khi
  // bé không có nickname (`tenBe` đã là chuỗi đó, tính ở `gallery-app.tsx`);
  // cỡ chữ phải co theo độ dài để không tràn quá 2 dòng ở 390px/1440px.
  const coChu = coChuTieuDeBia(tieuDeHienThi);

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
    // BB-313 (ảnh chụp app thật, Đợt 9) — bọc thêm MỘT lớp `@container`
    // ngoài `<section>`. Trước bản vá, `@container` nằm ngay trên `<section>`
    // trong khi các lớp bẻ bố cục của CHÍNH `<section>` đó
    // (`lg:grid-cols-[...]`) vẫn là biến thể VIEWPORT (`lg:`/`xl:`/`sm:` —
    // media query theo bề rộng CỬA SỔ TRÌNH DUYỆT), không phải biến thể
    // container (`@[…]:` — theo bề rộng CHÍNH KHUNG NÀY). Hai điều đó cộng
    // lại thành vô hiệu hoá nhau theo đúng nghĩa đen: CSS không cho một phần
    // tử container-query lại chính nó, nên `@container` ở đó chỉ là trang trí,
    // trong khi `lg:`/`sm:`/`xl:` vẫn đọc bề rộng CỬA SỔ THẬT.
    //
    // Trên màn khách thì bề rộng khung này với bề rộng cửa sổ luôn xấp xỉ
    // nhau (bìa tràn viền) nên không lộ ra gì khác thường. Nhưng trình thiết
    // kế bìa quản trị (`bia-bo-anh-editor.tsx`) render component này bên
    // trong một khung ĐÃ THU NHỎ theo `scale()` để mô phỏng đúng 390×844 hay
    // 1440×900 — `transform: scale()` không đổi kích thước LAYOUT, chỉ đổi
    // kích thước VẼ RA, nên khung mô phỏng "điện thoại" (layout rộng 390px)
    // vẫn nằm trong một cửa sổ trình duyệt quản trị rộng ≥1024px, `lg:` vẫn
    // kích hoạt — khung "điện thoại" hiện ra đúng bố cục MÁY TÍNH (ảnh bị ép
    // vào cột phải 42%, cột chữ rộng cho máy tính bị nhồi vào 390px nên chữ
    // tràn đè kín ảnh) — đúng hai lỗi trong ảnh chụp thật. Ngược lại khi cửa
    // sổ quản trị hẹp hơn 1024px, khung "máy tính" (1440px) lại rơi về bố cục
    // ĐIỆN THOẠI (lớp phủ tối + chữ đè giữa ảnh) — lỗi còn lại trong ảnh chụp.
    //
    // Sửa tại gốc: `@container` chuyển ra một `<div>` bọc ngoài (phần tử
    // container không tự container-query được chính nó), MỌI biến thể
    // `sm:`/`lg:`/`xl:` bên trong đổi thành container-query cùng ngưỡng pixel
    // (`@[40rem]:`/`@[64rem]:`/`@[80rem]:` — đúng 640/1024/1280px, giữ NGUYÊN
    // ngưỡng cũ, chỉ đổi nó đọc bề rộng của khung nào). Từ nay bố cục luôn
    // theo đúng bề rộng khung bìa THẬT SỰ đang có, bất kể cửa sổ trình duyệt
    // (màn khách) hay khung mô phỏng đã `scale()` (trình thiết kế bìa quản
    // trị) — hai nơi cùng một hành vi, đúng yêu cầu "xem trước giống hệt bìa
    // khách thấy".
    <div className="@container">
      <section
        aria-label="Ảnh bìa"
        data-testid="bia-bo-anh"
        className={cn(
          // BB-317 K-b — điện thoại: CỘT DỌC hai khối (ảnh sạch phía trên, dải kem chứa chữ +
          // nút phía dưới), y hệt cách máy tính tách ảnh và cột chữ. Ảnh nhận PHẦN CÒN LẠI của
          // màn sau khi trừ khối chữ (tối đa ~62% màn), nên tên/loại buổi chụp dài thì ảnh co
          // lại chứ nút chính không bị đẩy xuống dưới mép màn. Máy tính: một hàng, hai cột.
          "relative isolate flex min-h-[calc(var(--bb-bia-khung-cao,100svh)-var(--bb-phan-tren-bia,0px))] w-full flex-col overflow-hidden bg-[#fdfbf9] text-[#2e2a27]",
          "@[64rem]:grid @[64rem]:min-h-0 @[64rem]:grid-cols-[minmax(0,1fr)_42%] @[64rem]:grid-rows-1 @[64rem]:items-stretch",
          className,
        )}
      >
        {/*
          Khối ảnh — điện thoại: TRÀN TOÀN MÀN (`min-h-[100svh]`), lớp tối dần
          phía dưới để chữ kem đọc được (bản vẽ `bia-dien-thoai.html`). Máy
          tính (@[64rem]): CỘT PHẢI 42% (đảo so với bản vẽ gốc — chỉ đạo điều
          hành sau khi xem bản dựng), cao bằng cột chữ, `object-cover` tràn
          cột — không còn letterbox kem.
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
          // trị không đặt biến này).
          //
          // BB-313 mục 3 — `100svh` đọc CHIỀU CAO CỬA SỔ TRÌNH DUYỆT THẬT, một
          // đơn vị viewport KHÔNG có phiên bản container-query tương đương
          // (khác `sm:`/`lg:`/`xl:` đã đổi được sang `@[…]:` ở trên). Trình
          // thiết kế bìa quản trị mô phỏng khổ bằng `transform: scale()` bên
          // trong một khung KÍCH THƯỚC CỐ ĐỊNH (390×844 hay 1440×900), nhưng
          // cửa sổ trình duyệt quản trị thật rộng/cao khác hẳn — `100svh` bên
          // trong đọc đúng chiều cao CỬA SỔ THẬT đó, không phải chiều cao khung
          // mô phỏng, nên: điện thoại — "khối chữ" (`self-end`) tụt xuống NGOÀI
          // khung 844px, bị `overflow-hidden` (bia-bo-anh-editor.tsx) cắt mất
          // (mất trắng chữ tiêu đề); máy tính — nhánh `@[64rem]:min-h-0` bỏ hẳn
          // `100svh`, khối ảnh co về đúng chiều cao NỘI DUNG cột chữ (thường
          // thấp hơn khung mô phỏng nhiều), để lộ một dải trắng lớn phía dưới
          // (chấm lại 28/09/2026: "bìa chỉ chiếm ~40% khung"). Cả hai đều bắt
          // được qua ảnh chụp app thật Đợt 9.
          //
          // Sửa bằng MỘT biến CSS tuỳ chọn `--bb-bia-khung-cao`, dùng cho CẢ
          // HAI nhánh (trước chỉ có bản điện thoại riêng,
          // `--bb-bia-mobile-min-h` — đổi tên vì nay dùng chung): trình thiết
          // kế bìa đặt nó bằng đúng CHIỀU CAO KHUNG MÔ PHỎNG (844px hay 900px,
          // xem bia-bo-anh-editor.tsx) cho CẢ điện thoại lẫn máy tính; màn
          // khách không đặt biến này — điện thoại rơi về `100svh` y như cũ,
          // máy tính rơi về `0px` (tức `min-h-0` y như cũ) — không đổi hành vi
          // màn khách ở cả hai bề rộng.
          // BB-317 K-b — điện thoại: ảnh chiếm ~62% chiều cao màn (không chữ, không nút,
          // không lớp tối), phần còn lại là dải kem của khối chữ bên dưới.
          className="relative min-h-[220px] w-full max-h-[calc(var(--bb-bia-khung-cao,100svh)*0.62)] flex-1 basis-0 bg-[#e2c9bb] @[64rem]:col-start-2 @[64rem]:col-end-3 @[64rem]:h-auto @[64rem]:max-h-none @[64rem]:min-h-[var(--bb-bia-khung-cao,0px)] @[64rem]:flex-none @[64rem]:basis-auto"
        >
          {anhBia ? (
            <img
              src={`/api/img/${anhBia.id}?w=1600`}
              srcSet={`/api/img/${anhBia.id}?w=1600 1600w, /api/img/${anhBia.id}?w=2048 2048w`}
              sizes="(min-width: 1024px) 42vw, 100vw"
              alt=""
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-[50%_30%] @[64rem]:object-center motion-safe:animate-[bia-hien_1.2s_ease-out]"
            />
          ) : placeholderChuaCoAnh ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[#6b5d4f]">
              {placeholderChuaCoAnh}
            </div>
          ) : null}
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
            // BB-317 K-b — điện thoại: dải kem RIÊNG dưới ảnh (hàng 2), chữ mực — không đè ảnh nữa.
            "relative z-10 shrink-0 bg-[#fdfbf9] px-6 pb-6 pt-5 text-[#2e2a27]",
            "@[64rem]:static @[64rem]:col-start-1 @[64rem]:row-start-1 @[64rem]:row-end-2 @[64rem]:flex @[64rem]:flex-col @[64rem]:justify-center",
            // BB-319 (luật 2) — cột chữ bìa máy tính đứng CÙNG lề trang 40 px với thanh đầu,
            // lưới ảnh và chân trang (trước đây 64 px từ 1280 px — hai mép trái trên một màn).
            "@[64rem]:px-10 @[64rem]:py-10",
          )}
        >
          <div className="@[64rem]:max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b6057] @[64rem]:tracking-[0.16em]">
              {bia.eyebrow}
            </p>

            <h1
              // BB-310 mục 7 — cỡ chữ KHÔNG còn hằng số cố định: bốn biến CSS
              // dưới đây (đặt qua `coChuTieuDeBia`, dựa trên số ký tự của
              // `tieuDeHienThi`) nuôi đúng bốn bậc responsive cũ
              // (mobile/sm/lg/xl) — họ tên đầy đủ dài co nhỏ lại, tên ngắn giữ
              // nguyên cỡ gốc 44/52/64/84px. `textWrap: balance` (giữ nguyên)
              // dàn đều số chữ mỗi dòng thay vì để dòng cuối lẻ loi.
              // BB-313 — bốn bậc nay đọc BỀ RỘNG KHUNG BÌA (`@[…]:`), không
              // phải bề rộng cửa sổ (xem chú thích đầu hàm `BiaBoAnh`).
              className="mt-3.5 font-display font-light leading-[1] tracking-[-0.01em] @[64rem]:mt-4 @[64rem]:leading-[0.95] @[64rem]:tracking-[-0.02em] text-[length:var(--bb-bia-title-mobile)] @[40rem]:text-[length:var(--bb-bia-title-sm)] @[64rem]:text-[length:var(--bb-bia-title-lg)] @[80rem]:text-[length:var(--bb-bia-title-xl)]"
              style={{
                textWrap: "balance",
                ["--bb-bia-title-mobile" as string]: `${coChu.mobile}px`,
                ["--bb-bia-title-sm" as string]: `${coChu.sm}px`,
                ["--bb-bia-title-lg" as string]: `${coChu.lg}px`,
                ["--bb-bia-title-xl" as string]: `${coChu.xl}px`,
              }}
            >
              {tieuDeHienThi}
            </h1>
            {/* BB-305 — vẫn Playfair Display (phụ đề đi ngay dưới H1 tên
                bé/tiêu đề bìa), nhưng bỏ nghiêng: luật mới cấm italic kể cả
                dòng loại buổi chụp ("Thôi nôi") ở đây. */}
            {dungTieuDeTuDong && bia.phuDe && (
              <p className="mt-1.5 font-display text-[24px] leading-[1.2] text-[#4a423b] @[64rem]:mt-2.5 @[64rem]:text-[28px]">
                {bia.phuDe}
              </p>
            )}

            {/* Lời chào — máy tính luôn hiện (bản vẽ `.loi`). BB-317 K-f: điện thoại chỉ hiện khi bộ ảnh
                đang KHOÁ, để dòng trạng thái "Studio đang chỉnh ảnh của …" có mặt ở cả hai khổ. */}
            <p
              data-testid="bia-loi-chao"
              className={cn(
                "mt-3 max-w-[29rem] text-[14px] leading-relaxed text-[#4a423b] @[64rem]:mt-5 @[64rem]:block @[64rem]:text-[15px]",
                khoa ? "block" : "hidden",
              )}
            >
              {loiChaoBia}
            </p>

            {/* Dòng phụ ngày/chi nhánh — CHỈ điện thoại (bản vẽ `.meta`). */}
            {(ngay || chiNhanh) && (
              <div data-testid="bia-meta-dt" className="mt-3 flex flex-col items-start gap-y-0.5 text-[13px] text-[#6b6057] @[64rem]:hidden">
                {ngay && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                    {ngay}
                  </span>
                )}
                {chiNhanh && <span>{dongChiNhanh(chiNhanh)}</span>}
              </div>
            )}

            {/* Bộ ba thông tin: Ngày chụp · Chi nhánh · Trong gói — CHỈ máy tính (bản vẽ `.meta`). */}
            {(ngay || chiNhanh || hanMuc != null) && (
              <div className="mt-6 hidden flex-wrap gap-x-10 gap-y-3 @[64rem]:flex">
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
              <div className="mt-4 hidden items-center gap-1.5 rounded-full border border-[#2e2a27]/15 px-3.5 text-[14px] text-[#4a423b] @[64rem]:inline-flex @[64rem]:h-[36px]">
                <Lock className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
                Đã chốt danh sách
              </div>
            )}

            {/* Nút chính (bản vẽ `.nut-k`/`.hang .nut`) + "Nhắn cho studio" (chỉ máy tính, bản vẽ `.hang .chip`). */}
            <div className="mt-6 flex items-center gap-3.5 @[64rem]:mt-8">
              <button
                type="button"
                onClick={onBatDau}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#2e2a27] px-7 text-[15px] font-medium text-[#fdfbf9] transition hover:bg-[#2e2a27]/90 active:scale-[0.98] @[64rem]:w-auto"
              >
                {nhanNut} <ArrowDown className="h-4 w-4 -rotate-90" aria-hidden="true" />
              </button>
              {chatUrl && (
                <a
                  href={chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden h-[52px] items-center justify-center rounded-full border border-[#2e2a27]/20 px-6 text-[15px] font-medium text-[#2e2a27] transition hover:bg-[#2e2a27]/5 @[64rem]:inline-flex"
                >
                  {vi.gallery.messageStudio}
                </a>
              )}
            </div>

            {/* Dòng cuối điện thoại: N ảnh · M tấm trong gói · Chọn trước dd/mm (bản vẽ `.duoi`; BB-319: một dấu ngăn "·" cho cả app, không lẫn "|"). */}
            {(soAnh > 0 || hanMuc != null || conNgay != null) && (
              <div className="mt-3.5 flex flex-wrap justify-center gap-3 text-center text-[12px] text-[#6b6057] @[64rem]:hidden">
                {soAnh > 0 && <span>{formatSo(soAnh)} ảnh</span>}
                {hanMuc != null && (
                  <>
                    {soAnh > 0 && <span aria-hidden="true" className="opacity-45">·</span>}
                    <span>{hanMuc} tấm trong gói</span>
                  </>
                )}
                {hanChot && !khoa && (
                  <>
                    <span aria-hidden="true" className="opacity-45">·</span>
                    <span>Chọn trước {ngayDep(hanChot)}</span>
                  </>
                )}
                {khoa && (
                  <>
                    <span aria-hidden="true" className="opacity-45">·</span>
                    <span>Đã chốt danh sách</span>
                  </>
                )}
              </div>
            )}

            {/* Dải "Vài khoảnh khắc trong bộ" — CHỈ máy tính (bản vẽ `.dai`). */}
            {anhXemTruoc.length > 0 && (
              <div className="mt-9 hidden @[64rem]:block">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-[#8a8078]">
                    Vài khoảnh khắc trong bộ
                  </span>
                  <button
                    type="button"
                    onClick={onBatDau}
                    className="text-[13px] text-[#6b6057] underline underline-offset-[3px] hover:text-[#2e2a27]"
                  >
                    Xem cả {formatSo(soAnh)} ảnh
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
                          // BB-314: cỡ này (w=200 ≤ 800) nay được `/api/img`
                          // điều hướng 302 thẳng sang lh3.googleusercontent.com
                          // (xem route). Nếu lh3 lỗi ngay trên trình duyệt
                          // khách (chặn CORS lạ, quá tải tạm thời…), thử lại
                          // ĐÚNG MỘT LẦN qua chính route cũ với `?qua=1` —
                          // route thấy cờ này thì bỏ qua điều hướng, tự kéo
                          // ảnh qua Vercel như trước bản vá. Đánh dấu bằng
                          // `dataset.qua` để lần lỗi THỨ HAI không tự gọi lại
                          // chính nó — tránh vòng lặp lỗi vô hạn. Cùng mẫu với
                          // `luoi-anh.tsx` (BB-314).
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.dataset.qua === "1") return;
                            img.dataset.qua = "1";
                            const url = new URL(img.src, window.location.origin);
                            url.searchParams.set("qua", "1");
                            img.src = url.toString();
                          }}
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
    </div>
  );
}



