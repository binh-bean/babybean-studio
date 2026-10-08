"use client";

/**
 * BB-400 — công cụ DÙNG CHUNG của mọi lượt chọn ảnh: hàng chip lọc, nhóm ảnh, nút
 * So sánh, thanh đầu/đáy chế độ so sánh, và hook giữ danh sách so sánh.
 *
 * OWNER: DEV-FE. Trước BB-400, màn chính (`gallery-app.tsx`) và màn "Chọn thêm ảnh ·
 * Đợt N" (`man-chon-them-dot.tsx`) mỗi màn tự vẽ chip lọc của mình (khác cỡ, khác số
 * đếm), và màn đợt không có So sánh. Anh 08/10/2026: "nút cùng chỗ cùng tên ở mọi
 * lượt". Hai màn nay dựng từ CÙNG các mảnh ở đây; lượt nào bật mảnh nào do
 * `congCuLuotChon()` (`@/lib/gallery/luot-chon`) quyết.
 *
 * Lớp CSS chép NGUYÊN từ màn chính (BB-319: điện thoại 13px, ba chip vừa một hàng
 * 342px) — các phép thử e2e cũ bám vào `aria-pressed`/tên nút vẫn đúng.
 */

import React from "react";
import { ArrowLeft, Columns2, MessageCircle, X as XIcon } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { formatSo } from "@/lib/utils/dinh-dang";
import { vi } from "@/i18n";
import {
  boKhoiSoSanh,
  daDuSoSanh,
  duSoSanh,
  themVaoSoSanh,
  SO_SANH_TOI_DA,
} from "@/lib/gallery/so-sanh";
import type { ChipLoc, CongCuLuotChon, LoaiLoc } from "@/lib/gallery/luot-chon";
import type { PhotoPublic } from "@/types/domain";
import type { PhotoLightboxProps } from "./photo-lightbox";

// ---------------------------------------------------------------------------
// Chip lọc
// ---------------------------------------------------------------------------

export function HangChipLoc({
  chips,
  loc,
  onLoc,
}: {
  chips: readonly ChipLoc[];
  loc: LoaiLoc;
  onLoc: (loai: LoaiLoc) => void;
}) {
  return (
    <>
      {chips.map((c) => (
        <button
          key={c.loai}
          type="button"
          data-testid={`chip-loc-${c.loai}`}
          onClick={() => onLoc(c.loai)}
          aria-pressed={loc === c.loai}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border border-[#2e2a27] px-2.5 py-1.5 text-[13px] transition-colors lg:px-4 lg:text-[14px]",
            loc === c.loai ? "bg-[#2e2a27] text-[#fdfbf9]" : "bg-[#fdfbf9] text-[#2e2a27] hover:bg-[#2e2a27]/5",
          )}
        >
          {c.nhan}
          <span className="ml-1 opacity-70">{formatSo(c.so)}</span>
        </button>
      ))}
    </>
  );
}

/** Nhóm ảnh (thư mục con trên Drive) — chỉ hiện khi có từ HAI nhóm (BB-180). */
export function HangNhomAnh({
  nhom,
  dangChon,
  onChon,
  demTheoNhom,
  tong,
  className,
}: {
  nhom: readonly string[];
  dangChon: string;
  onChon: (nhom: string) => void;
  demTheoNhom: ReadonlyMap<string, number>;
  tong: number;
  className?: string;
}) {
  if (nhom.length <= 1) return null;
  return (
    <div aria-label={vi.gallery.subfolderTitle} className={cn("flex gap-2 overflow-x-auto", className)}>
      {["", ...nhom].map((f) => (
        <button
          key={f || "tat-ca"}
          type="button"
          onClick={() => onChon(f)}
          aria-pressed={dangChon === f}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors",
            dangChon === f ? "bg-foreground text-background" : "border border-border hover:bg-surface-2",
          )}
        >
          {f || vi.gallery.subfolderAll}
          <span className="ml-1.5 opacity-60">{f ? (demTheoNhom.get(f) ?? 0) : tong}</span>
        </button>
      ))}
    </div>
  );
}

/** Đếm số ảnh mỗi nhóm — một lần cho cả hàng nhóm. */
export function demAnhTheoNhom(anh: readonly { subfolder?: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of anh) if (p.subfolder) m.set(p.subfolder, (m.get(p.subfolder) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------------------
// Đầu màn của lượt thay cả trang (đợt N, gợi ý đợt N, gia đình mua thêm)
// ---------------------------------------------------------------------------

/**
 * Đầu màn DÍNH của mọi lượt "thay cả trang": ← · tiêu đề · (So sánh + Nhắn Bean ở góc phải
 * điện thoại) · hàng chip lọc · nhóm ảnh. Một bản cho màn đợt N và màn mua của gia đình —
 * nút cùng chỗ, cùng tên.
 */
export function DauManLuotChon({
  tieuDe,
  testIdTieuDe,
  onDong,
  chips,
  loc,
  onLoc,
  soSanh,
  coSoSanh,
  chatUrl,
  nhom,
  nhomDangChon,
  onChonNhom,
  demTheoNhom,
  tong,
}: {
  tieuDe: React.ReactNode;
  testIdTieuDe: string;
  onDong: () => void;
  chips: readonly ChipLoc[];
  loc: LoaiLoc;
  onLoc: (l: LoaiLoc) => void;
  soSanh: { soSanhBat: boolean; doiSoSanh: () => void; huySoSanh: () => void };
  coSoSanh: boolean;
  chatUrl: string | null;
  nhom: readonly string[];
  nhomDangChon: string;
  onChonNhom: (n: string) => void;
  demTheoNhom: ReadonlyMap<string, number>;
  tong: number;
}) {
  const nhan = (lop: string, icon: string) =>
    chatUrl ? (
      <a
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={vi.gallery.messageStudio}
        title={vi.gallery.messageStudio}
        className={lop}
      >
        <MessageCircle className={icon} strokeWidth={1.5} aria-hidden="true" />
      </a>
    ) : null;
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-md">
      {soSanh.soSanhBat && <ThanhDauSoSanh onHuy={soSanh.huySoSanh} />}
      <div className="mx-auto max-w-[1600px] px-6 lg:flex lg:h-14 lg:items-center lg:px-10">
        <div className="flex min-h-14 items-center gap-1.5 lg:min-h-0">
          <button
            type="button"
            onClick={onDong}
            aria-label="Quay lại bộ ảnh"
            className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-surface-2"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h1 data-testid={testIdTieuDe} className="min-w-0 flex-1 text-[14px] leading-snug lg:flex-none lg:text-[15px]">
            {tieuDe}
          </h1>
          {/* Điện thoại: So sánh (biểu tượng) + Nhắn Bean ở góc phải, cùng chỗ đợt 1. */}
          <div className="-mr-2 flex shrink-0 items-center lg:hidden">
            {coSoSanh && <NutSoSanh kieu="bieu-tuong" bat={soSanh.soSanhBat} onDoi={soSanh.doiSoSanh} />}
            {nhan("grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-surface-2", "h-5 w-5")}
          </div>
        </div>

        <span className="mx-6 hidden h-5 w-px shrink-0 bg-border lg:inline-block" aria-hidden="true" />

        <nav aria-label="Lọc ảnh" className="flex items-center gap-2 overflow-x-auto pb-4 pt-1 lg:gap-3 lg:p-0">
          {!soSanh.soSanhBat && <HangChipLoc chips={chips} loc={loc} onLoc={onLoc} />}
          <span className="mx-3 hidden h-5 w-px shrink-0 bg-border lg:inline-block" aria-hidden="true" />
          {coSoSanh && <NutSoSanh kieu="chip" bat={soSanh.soSanhBat} onDoi={soSanh.doiSoSanh} />}
          {nhan(
            "hidden h-8 w-8 shrink-0 place-items-center rounded-full text-foreground transition hover:bg-surface-2 lg:ml-auto lg:grid",
            "h-4 w-4",
          )}
        </nav>
      </div>

      <HangNhomAnh
        nhom={nhom}
        dangChon={nhomDangChon}
        onChon={onChonNhom}
        demTheoNhom={demTheoNhom}
        tong={tong}
        className="mx-auto max-w-[1600px] px-6 pb-3 lg:px-10"
      />
    </header>
  );
}

/**
 * Thanh đáy của lượt thay cả trang: MỘT câu + (nút phụ) + (một nút chính) — cùng viên, cùng
 * chỗ với thanh "Chốt đợt N" (`thanh-day-dot`).
 */
export function ThanhDayLuot({
  testId,
  cau,
  nutPhu,
  nutChinh,
}: {
  testId: string;
  cau: React.ReactNode;
  nutPhu?: React.ReactNode;
  nutChinh?: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-6 pb-[max(16px,env(safe-area-inset-bottom))] lg:pb-6">
      <div
        data-testid={testId}
        className="pointer-events-auto mx-auto max-w-[560px] rounded-[22px] border border-border bg-background/95 p-3 shadow-[0_14px_32px_-12px_rgba(46,42,39,0.35)] backdrop-blur-md lg:flex lg:w-fit lg:max-w-none lg:items-center lg:gap-4 lg:rounded-full lg:py-2 lg:pl-6 lg:pr-2"
      >
        <p aria-live="polite" className="pl-1.5 text-[15px] font-medium leading-snug tabular-nums lg:whitespace-nowrap lg:pl-0">
          {cau}
        </p>
        {(nutPhu || nutChinh) && (
          <>
            <span className="hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
            <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:mt-0 lg:flex">
              {nutPhu}
              {nutChinh}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Màn xem lớn: công cụ theo lượt
// ---------------------------------------------------------------------------

type CongCuXemLon = Pick<PhotoLightboxProps, "onLuuGhiChu" | "bangSanPham" | "onTaiAnh" | "menuTai" | "onXemTuong">;

/**
 * Bộ nút của `PhotoLightbox` theo công cụ của lượt — MỘT chỗ quyết cho mọi lượt (đợt 1,
 * đợt N, người gợi ý, người cùng chọn, gia đình được mời). Màn nào cũng truyền đủ ba việc
 * nó làm được; hàm này cắt bớt đúng những gì vai KHÔNG được phép — không màn nào tự
 * "quên" một nút nữa (lỗi BB-400: màn đợt N chỉ còn tim).
 */
export function propsCongCuXemLon(
  congCu: CongCuLuotChon,
  viec: {
    luuGhiChu?: PhotoLightboxProps["onLuuGhiChu"];
    bangSanPham?: PhotoLightboxProps["bangSanPham"];
    taiAnh?: Pick<PhotoLightboxProps, "onTaiAnh" | "menuTai"> | null;
    /** BB-400 vòng 4 — mở màn "Xem trên tường / bàn nhà" (nút cố định ở màn xem lớn). */
    xemTuong?: PhotoLightboxProps["onXemTuong"];
  },
): CongCuXemLon {
  return {
    onLuuGhiChu: congCu.ghiChu ? viec.luuGhiChu : undefined,
    bangSanPham: congCu.sanPhamTheoAnh ? viec.bangSanPham : undefined,
    onTaiAnh: congCu.tai ? (viec.taiAnh?.onTaiAnh ?? null) : null,
    menuTai: congCu.tai ? (viec.taiAnh?.menuTai ?? null) : null,
    onXemTuong: congCu.xemTuong ? viec.xemTuong : undefined,
  };
}

// ---------------------------------------------------------------------------
// "Đặt in" của gia đình được mời (màn xem lớn)
// ---------------------------------------------------------------------------

/**
 * Gia đình được mời (`viewer`) không có giỏ của ba mẹ (`/api/g/addons` chặn) — "Đặt in"
 * trong xem lớn của họ mở MÀN MUA CỦA GIA ĐÌNH (`MoiMuaLanHai`, gửi yêu cầu cho Bean).
 * Cùng chỗ, cùng tên nút "Đặt in" như mọi lượt khác; khác nhau chỉ ở đường ghi.
 */
export function DatInChoGiaDinh({ onDatIn }: { onDatIn: () => void }) {
  return (
    <section data-testid="dat-in-gia-dinh" className="space-y-2.5 text-[#2E2A27]">
      <p className="text-pretty text-xs leading-relaxed text-[#6b6057]">{vi.gallery.giaDinhDatInGiaiThich}</p>
      <button
        type="button"
        data-testid="nut-dat-in-gia-dinh"
        onClick={onDatIn}
        className="flex h-11 w-full items-center justify-center rounded-full bg-[#2E2A27] px-5 text-sm font-medium text-[#fdfbf9] transition hover:opacity-90"
      >
        {vi.gallery.giaDinhDatInTamNay}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// So sánh
// ---------------------------------------------------------------------------

/**
 * Nút bật/tắt chế độ "chọn để so sánh". Điện thoại: biểu tượng tròn ở góc phải hàng
 * đầu; máy tính: chip ngay sau cụm chip lọc — đúng chỗ đợt 1 đặt (BB-299, BB-319).
 */
export function NutSoSanh({
  bat,
  onDoi,
  kieu,
}: {
  bat: boolean;
  onDoi: () => void;
  kieu: "bieu-tuong" | "chip";
}) {
  if (kieu === "bieu-tuong") {
    return (
      <button
        type="button"
        onClick={onDoi}
        aria-pressed={bat}
        aria-label={vi.gallery.nutSoSanh}
        title={vi.gallery.nutSoSanh}
        className={cn(
          "grid h-10 w-10 place-items-center rounded-full transition",
          bat ? "bg-foreground text-background" : "text-foreground hover:bg-surface-2",
        )}
      >
        <Columns2 className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onDoi}
      aria-pressed={bat}
      className={cn(
        "mb-2.5 ml-auto hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors lg:mb-0 lg:ml-0 lg:flex",
        bat ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
      {vi.gallery.nutSoSanh}
    </button>
  );
}

/** Thanh đầu khi đang chọn tấm để so sánh: một câu lệnh + Huỷ (bản vẽ `so-sanh-dien-thoai.html`). */
export function ThanhDauSoSanh({ onHuy }: { onHuy: () => void }) {
  return (
    <div data-testid="thanh-dau-so-sanh" className="border-b border-border/70 bg-background px-6 py-3 lg:px-10">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between">
        <span className="text-[14px] font-medium text-foreground">Chọn 2–4 tấm để so sánh</span>
        <button type="button" onClick={onHuy} className="text-[14px] text-muted-foreground hover:text-foreground">
          Huỷ
        </button>
      </div>
      <p className="mx-auto mt-1 max-w-[1600px] text-[12px] text-muted-foreground">{vi.gallery.loiBean.soSanhHuongDan}</p>
    </div>
  );
}

/**
 * Thanh đáy chế độ so sánh — THAY thanh đáy của lượt (không chồng hai thanh tranh chỗ
 * ngón cái, BB-218).
 */
export function ThanhDaySoSanh({ ds, onXem, onHuy }: { ds: readonly string[]; onXem: () => void; onHuy: () => void }) {
  const du = duSoSanh(ds);
  const soTam = ds.length;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-6 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div
        data-testid="thanh-day-so-sanh"
        className="pointer-events-auto mx-auto flex h-[60px] max-w-xl items-center gap-1 rounded-full bg-[#2a2420] pl-4 pr-2 text-[#fffdf9] shadow-[0_14px_32px_-10px_rgba(27,23,20,.55)]"
      >
        <button
          type="button"
          onClick={() => du && onXem()}
          disabled={!du}
          className="min-w-0 flex-1 truncate text-left text-[14px] font-medium disabled:cursor-default disabled:opacity-70"
        >
          {du ? `Đã chọn ${soTam} tấm để so sánh · Xem` : `Chọn ít nhất 2 tấm để so sánh (đã chọn ${soTam})`}
        </button>
        <button
          type="button"
          onClick={onHuy}
          aria-label="Huỷ so sánh"
          title="Huỷ so sánh"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10"
        >
          <XIcon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Danh sách so sánh của một lượt (2–4 tấm, đúng thứ tự đã đánh dấu). `onToiDa` báo khi
 * đã đủ 4 tấm mà bấm thêm — không lặng lẽ bỏ qua (BB-218).
 */
export function useSoSanhLuotChon(photos: readonly PhotoPublic[], onToiDa: (cau: string) => void) {
  const [soSanhBat, setSoSanhBat] = React.useState(false);
  const [dsSoSanh, setDsSoSanh] = React.useState<string[]>([]);
  const [moSoSanh, setMoSoSanh] = React.useState(false);

  const onToggleSoSanh = React.useCallback(
    (photo: PhotoPublic) => {
      // Đọc danh sách hiện tại rồi mới đặt — báo lỗi nằm NGOÀI hàm cập nhật trạng thái,
      // vì React có thể gọi hàm cập nhật hai lần.
      if (dsSoSanh.includes(photo.id)) {
        setDsSoSanh(boKhoiSoSanh(dsSoSanh, photo.id));
        return;
      }
      if (daDuSoSanh(dsSoSanh)) {
        onToiDa(vi.gallery.loiBean.soSanhToiDa.replace("{n}", String(SO_SANH_TOI_DA)));
        return;
      }
      setDsSoSanh(themVaoSoSanh(dsSoSanh, photo.id));
    },
    [dsSoSanh, onToiDa],
  );

  /** Bỏ một tấm ngay trong màn so sánh; còn dưới 2 tấm thì đóng màn so sánh luôn. */
  const boKhoiManSoSanh = React.useCallback(
    (photo: PhotoPublic) => {
      const conLai = boKhoiSoSanh(dsSoSanh, photo.id);
      setDsSoSanh(conLai);
      if (!duSoSanh(conLai)) setMoSoSanh(false);
    },
    [dsSoSanh],
  );

  /** Huỷ hẳn: tắt chế độ chọn VÀ xoá danh sách đang đánh dấu. */
  const huySoSanh = React.useCallback(() => {
    setSoSanhBat(false);
    setDsSoSanh([]);
    setMoSoSanh(false);
  }, []);

  /** Đưa một tấm vào danh sách và bật chế độ chọn (từ màn xem lớn). */
  const themTuXemLon = React.useCallback((photo: PhotoPublic) => {
    setDsSoSanh((cu) => (cu.includes(photo.id) ? cu : themVaoSoSanh(cu, photo.id)));
    setSoSanhBat(true);
  }, []);

  /** photoId -> thứ tự 1–4 — Map để `TheAnh` chỉ nhận một số (LUẬT 2 `luoi-anh.tsx`). */
  const soSanhTheoAnh = React.useMemo(() => {
    const m = new Map<string, number>();
    dsSoSanh.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [dsSoSanh]);

  const anhDangSoSanh = React.useMemo(
    () => dsSoSanh.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoPublic => !!p),
    [dsSoSanh, photos],
  );

  return {
    soSanhBat,
    setSoSanhBat,
    dsSoSanh,
    moSoSanh,
    setMoSoSanh,
    onToggleSoSanh,
    boKhoiManSoSanh,
    huySoSanh,
    themTuXemLon,
    soSanhTheoAnh,
    anhDangSoSanh,
    doiSoSanh: () => (soSanhBat ? huySoSanh() : setSoSanhBat(true)),
  };
}
