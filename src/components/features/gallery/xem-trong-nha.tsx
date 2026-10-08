"use client";

/**
 * BB-405 — "XEM TRONG NHÀ": MỘT lối vào chung cho "Trên tường" (ảnh in/khung/UV) và
 * "Album trên bàn", ở MỌI màn khách, MỌI đợt, MỌI vai.
 *
 * Anh 08/10/2026: "ảnh trên tường anh muốn hiển thị như phần chọn ảnh thả tim là vào
 * xem được ở tất cả các màn không phải cái dấu # như thế, cả album cũng vậy đồng nhất
 * với ảnh in". Trước đây lối vào là nút "Trên tường" cố định trong màn xem lớn, biểu
 * tượng `Frame` của lucide (trông như dấu "#") — anh không nhận ra.
 *
 *   - `NutXemTrongNha` — nút nhỏ TRÊN TỪNG Ô ẢNH, cùng kiểu/cùng cỡ nút tim (vùng chạm
 *     48px, hình 32px, nền kem mờ), đặt ĐỐI XỨNG tim ở góc DƯỚI TRÁI. Biểu tượng ngôi
 *     nhà (`House`), nhãn trợ năng tiếng Việt. Biến thể "thanh" cho đầu màn xem lớn.
 *   - `ChonCachXemTrongNha` — hai lựa chọn NGANG HÀNG "Trên tường" | "Album trên bàn",
 *     dùng chung cho màn treo tường (`ManTreoTuong`) và màn album (`XemAlbumTrenBan`):
 *     cùng nút, cùng chỗ (đầu màn), cùng cách đóng (đóng là đóng cả lối "Xem trong nhà").
 */

import React from "react";
import { House } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { vi } from "@/i18n";
import { cuonAlbumDangBan, type SanPhamAlbumTrongDanhMuc } from "@/lib/products/album-khai-niem";
import type { CuonTrenBan } from "./xem-album-tren-ban";
import type { NguCanhLuotChon } from "@/lib/gallery/luot-chon";

export type CachXemTrongNha = "tuong" | "ban";

/** Nhãn trợ năng của nút trên ô ảnh — có số thứ tự tấm để trình đọc màn hình phân biệt. */
export function nhanNutXemTrongNha(thuTu?: number): string {
  return thuTu === undefined
    ? vi.gallery.xemTrongNha.nhan
    : vi.gallery.xemTrongNha.nhanTam.replace("{n}", String(thuTu + 1));
}

export interface NutXemTrongNhaProps {
  onBam: () => void;
  /**
   * "o-anh" — nút tròn trên ô ảnh của lưới (góc dưới trái, đối xứng tim).
   * "thanh-sang" / "thanh-toi" — nút có chữ ở đầu màn xem lớn (nền sáng / nền tối).
   */
  kieu?: "o-anh" | "thanh-sang" | "thanh-toi";
  /** Thứ tự tấm trong lưới (0-based) — chỉ để nhãn trợ năng nói đúng "ảnh N". */
  thuTu?: number;
  className?: string;
}

export function NutXemTrongNha({ onBam, kieu = "o-anh", thuTu, className }: NutXemTrongNhaProps) {
  const nhan = nhanNutXemTrongNha(thuTu);
  if (kieu === "o-anh") {
    return (
      <button
        type="button"
        data-testid="nut-xem-trong-nha"
        onClick={(e) => {
          e.stopPropagation();
          onBam();
        }}
        aria-label={nhan}
        title={vi.gallery.xemTrongNha.nhan}
        className={cn(
          "absolute bottom-0 left-0 z-10 grid h-12 w-12 place-items-center touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2",
          className,
        )}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fffdf9]/80 text-[#2a2420] backdrop-blur-sm transition-all duration-150 active:scale-90 group-hover:bg-[#fffdf9]">
          <House className="h-[16px] w-[16px]" strokeWidth={2} aria-hidden="true" />
        </span>
      </button>
    );
  }
  const toi = kieu === "thanh-toi";
  // Tên trợ năng chứa chữ đang hiện ("Trong nhà") và giữ cụm "Xem trên tường nhà" quen thuộc.
  const nhanThanh = vi.gallery.xemTrongNha.nhanThanh;
  return (
    <button
      type="button"
      data-testid="nut-xem-tuong"
      onClick={(e) => {
        e.stopPropagation();
        onBam();
      }}
      aria-label={nhanThanh}
      title={nhanThanh}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition active:scale-95 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2",
        toi
          ? "border border-white/25 text-white hover:bg-white/10"
          : "border border-[#e5dcd2] bg-white/80 text-[#2e2a27] hover:bg-white",
        className,
      )}
    >
      <House className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" />
      {vi.gallery.xemTrongNha.ngan}
    </button>
  );
}

export interface ChonCachXemTrongNhaProps {
  cach: CachXemTrongNha;
  onDoi: (cach: CachXemTrongNha) => void;
  /** "toi" — nổi trên ảnh phòng (kính tối); "sang" — trên nền kem của màn album. */
  nen?: "toi" | "sang";
  className?: string;
}

/** Hai lựa chọn ngang hàng của "Xem trong nhà" — một component cho cả hai màn. */
export function ChonCachXemTrongNha({ cach, onDoi, nen = "toi", className }: ChonCachXemTrongNhaProps) {
  const toi = nen === "toi";
  const LUA_CHON: Array<{ ma: CachXemTrongNha; nhan: string }> = [
    { ma: "tuong", nhan: vi.gallery.xemTrongNha.trenTuong },
    { ma: "ban", nhan: vi.gallery.xemTrongNha.albumTrenBan },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={vi.gallery.xemTrongNha.nhan}
      data-testid="chon-cach-xem-trong-nha"
      className={cn(
        "inline-flex items-center gap-1 rounded-full p-1",
        toi ? "bg-black/40 backdrop-blur-sm" : "bg-[var(--bb-surface-2,#f3ede6)]",
        className,
      )}
    >
      {LUA_CHON.map((lc) => {
        const dangChon = lc.ma === cach;
        return (
          <button
            key={lc.ma}
            type="button"
            role="radio"
            aria-checked={dangChon}
            data-testid={`cach-xem-${lc.ma}`}
            onClick={() => onDoi(lc.ma)}
            className={cn(
              "h-8 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition",
              dangChon
                ? toi
                  ? "bg-white text-[#2e2a27]"
                  : "bg-[var(--bb-fg,#2e2a27)] text-[var(--bb-bg,#fdfbf9)]"
                : toi
                  ? "text-white/90 hover:bg-white/10"
                  : "text-[#2e2a27] hover:bg-white/70",
            )}
          >
            {lc.nhan}
          </button>
        );
      })}
    </div>
  );
}

/** Prop `album` của trình xem chung (`ManTreoTuong`) — cùng hình ở mọi màn. */
export interface AlbumXemTrongNha {
  cuon: CuonTrenBan[];
  /** Có CHỈ khi vai được đặt thẳng album (`duocDatAlbumThang`). */
  onDat?: (productId: string, soLuong: number) => Promise<boolean | void> | boolean | void;
  /** Lối của vai không đặt thẳng (vd. người gợi ý → "Gợi ý tấm này" cho ba mẹ). */
  loiDatKhac?: { nhan: string; onBam: (photoId: string) => void } | null;
}

/**
 * BB-405 vòng 2 — vai nào được ĐẶT THẲNG album từ "Xem trong nhà" (cùng luật tiền với cửa
 * hàng): ba mẹ (đợt 1, đợt N) và người cùng chọn — có. Người gợi ý KHÔNG (không tự trả
 * tiền; gợi ý cho ba mẹ). Gia đình được mời: chỉ trong màn mua của gia đình (`trongManGio`),
 * nơi món vào GIỎ YÊU CẦU (Bean gọi báo giá — không trả tiền tại đây, như "Thêm vào giỏ"
 * của màn tường ở cùng màn đó); ở trang chính thì không.
 */
export function duocDatAlbumThang(nguCanh: NguCanhLuotChon, opts: { trongManGio?: boolean } = {}): boolean {
  if (nguCanh === "goiY") return false;
  if (nguCanh === "giaDinh") return opts.trongManGio === true;
  return true;
}

/**
 * BB-405 — dựng lựa chọn "Album trên bàn" từ danh mục của màn: chỉ CUỐN album đang bán
 * (bỏ tờ ruột, bỏ mục chưa có giá — cùng luật `BanAlbum`). Không có cuốn nào → null
 * (trình xem chỉ còn "Trên tường"). `onDat` chỉ được giữ khi `duocDatAlbumThang`; vai khác
 * đi `loiDatKhac` (nếu có) hoặc chỉ xem.
 */
export function albumXemTrongNha(
  danhMuc: readonly SanPhamAlbumTrongDanhMuc[],
  p: {
    nguCanh: NguCanhLuotChon;
    trongManGio?: boolean;
    onDat?: AlbumXemTrongNha["onDat"];
    loiDatKhac?: AlbumXemTrongNha["loiDatKhac"];
  },
): AlbumXemTrongNha | null {
  const cuon = cuonAlbumDangBan(danhMuc).map((sp) => ({ productId: sp.productId, size: sp.size, unitPrice: sp.unitPrice }));
  if (cuon.length === 0) return null;
  const thang = duocDatAlbumThang(p.nguCanh, { trongManGio: p.trongManGio });
  return { cuon, onDat: thang ? p.onDat : undefined, loiDatKhac: thang ? null : (p.loiDatKhac ?? null) };
}
