"use client";

/**
 * BB-390 — MÀN BÁN ALBUM (thay luồng "chọn ảnh để mua album").
 *
 * Anh (Bản yêu cầu, P0): "bán album — mở màn bán hàng chứ không phải chọn ảnh
 * để mua album". Album là SẢN PHẨM in: một quyển ghép từ 20–30 tấm, có một ảnh
 * bìa. Màn này chỉ GIỚI THIỆU cuốn album và nhận ĐẶT — ba mẹ không chọn tấm nào
 * ở đây; Bean/CSKH liên hệ sắp ảnh và bìa sau.
 *
 * - Chỉ bày mục có trong danh mục hậu kỳ (`catalogue` máy chủ đã lọc theo bảng
 *   giá), bỏ tờ ruột, bỏ mục chưa có giá — `cuonAlbumDangBan()`.
 * - Giá, khổ, chất liệu lấy THẲNG từ danh mục — không bịa số.
 * - "Đặt album" đi đúng đường đặt mua thêm sẵn có (`onDat` → `/api/g/addons`,
 *   dòng giỏ không gắn ảnh) — `donDatAlbum()`.
 */

import React from "react";
import { Check } from "lucide-react";
import { vi } from "@/i18n";
import { giuA } from "@/lib/utils/giu-a";
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc, nhanTrangThaiGio, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { tenChatLieuChoKhach } from "@/lib/products/nhom-san-pham";
import { cuonAlbumDangBan, donDatAlbum } from "@/lib/products/album-khai-niem";
import type { SanPhamAlbumTrongDanhMuc } from "@/lib/products/album-khai-niem";

export interface BanAlbumProps {
  /** Danh mục máy chủ trả (mọi nhóm) — component tự lọc ra các CUỐN album. */
  danhMuc: SanPhamAlbumTrongDanhMuc[];
  /** Giỏ hiện tại — để biết đã đặt mấy cuốn của từng loại. */
  daMua: Array<{ productId: string; quantity: number }>;
  donDaGui: boolean;
  khoa: boolean;
  /** Gói đã có album (hoặc giỏ đã có) → nút đổi thành "Đặt thêm một cuốn". */
  daCoAlbum: boolean;
  /** Ghi số lượng TUYỆT ĐỐI, không gắn ảnh. `false` = máy chủ từ chối (đã báo riêng). */
  onDat: (productId: string, soLuong: number, photoId: null) => void | boolean | Promise<void | boolean>;
}

export function BanAlbum({ danhMuc, daMua, donDaGui, khoa, daCoAlbum, onDat }: BanAlbumProps) {
  const dsCuon = React.useMemo(() => cuonAlbumDangBan(danhMuc), [danhMuc]);
  const [chon, setChon] = React.useState<string | null>(null);
  const [dangGui, setDangGui] = React.useState(false);
  const [daGhiNhan, setDaGhiNhan] = React.useState<string | null>(null);

  const dangChon = dsCuon.find((sp) => sp.productId === chon) ?? dsCuon[0] ?? null;
  const soCuon = (productId: string) =>
    daMua.filter((d) => d.productId === productId).reduce((t, d) => t + d.quantity, 0);

  return (
    <section data-testid="man-ban-album" className="pb-6">
      {/* Tranh minh hoạ sản phẩm có sẵn (BB-202/248) — không phải ảnh của bé. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/san-pham/sp-album-dat-mua-640.webp"
        srcSet="/san-pham/sp-album-dat-mua-320.webp 320w, /san-pham/sp-album-dat-mua-640.webp 640w"
        sizes="(min-width: 640px) 472px, 100vw"
        alt=""
        loading="lazy"
        className="h-[180px] w-full rounded-2xl border border-[var(--bb-border)] bg-white object-contain"
      />

      <h3 className="kh-h2 mt-4 text-foreground">{vi.gallery.loiBean.banAlbumTieuDe}</h3>
      <p className="mt-1 text-sm text-foreground">{giuA(vi.gallery.loiBean.banAlbumMoTa)}</p>

      <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-foreground">
        <li className="flex items-center gap-1.5 rounded-xl bg-[var(--bb-surface-2)] px-3 py-2">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          {vi.gallery.loiBean.banAlbumSoAnh}
        </li>
        <li className="flex items-center gap-1.5 rounded-xl bg-[var(--bb-surface-2)] px-3 py-2">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          {vi.gallery.loiBean.banAlbumMotBia}
        </li>
      </ul>

      {dsCuon.length === 0 ? (
        <p data-testid="ban-album-chua-mo-ban" className="mt-4 text-sm text-muted-foreground">
          {giuA(vi.gallery.loiBean.banAlbumChuaMoBan)}
        </p>
      ) : (
        <>
          <div className="mt-4 border-t border-[var(--bb-border)] pt-3.5">
            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {vi.gallery.loiBean.banAlbumNhanKho}
            </p>
            <ul className="space-y-1.5" role="radiogroup" aria-label={vi.gallery.loiBean.banAlbumNhanKho}>
              {dsCuon.map((sp) => {
                const laDangChon = dangChon?.productId === sp.productId;
                const n = soCuon(sp.productId);
                const chatLieu = tenChatLieuChoKhach(sp.material);
                return (
                  <li key={sp.productId}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={laDangChon}
                      data-testid="lua-chon-album"
                      onClick={() => {
                        setChon(sp.productId);
                        setDaGhiNhan(null);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        laDangChon
                          ? "border-[var(--bb-fg)] bg-white"
                          : "border-[var(--bb-border)] bg-white/60 hover:bg-white",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {sp.size ? `${formatKichThuoc(sp.size)} cm` : tenSanPhamChoKhach(sp)}
                        </span>
                        {chatLieu && (
                          <span className="block text-xs text-muted-foreground">
                            {vi.gallery.loiBean.banAlbumNhanChatLieu}: {chatLieu}
                          </span>
                        )}
                        {n > 0 && (
                          <span data-testid="ban-album-so-cuon" className="block text-xs font-medium text-[var(--bb-heart,#C4645A)]">
                            {nhanTrangThaiGio(donDaGui)} · {vi.gallery.loiBean.banAlbumSoCuon.replace("{n}", String(n))}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                        {formatCurrencyVND(sp.unitPrice)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-3.5 text-xs text-muted-foreground">
            {giuA(vi.gallery.loiBean.banAlbumKhongCanChonAnh)}
          </p>

          {daGhiNhan && (
            <p data-testid="ban-album-da-ghi-nhan" role="status" className="mt-3 rounded-xl bg-[#4F5B45]/[0.08] px-3.5 py-2.5 text-sm text-[#2E2A27]">
              {giuA(vi.gallery.loiBean.banAlbumDaDat.replace("{ten}", daGhiNhan))}
            </p>
          )}

          {dangChon && (
            <button
              type="button"
              data-testid="nut-dat-album"
              disabled={khoa || dangGui}
              onClick={async () => {
                const don = donDatAlbum(dangChon.productId, soCuon(dangChon.productId));
                setDangGui(true);
                try {
                  const ok = await onDat(don.productId, don.soLuong, don.photoId);
                  if (ok === false) return;
                  setDaGhiNhan(`album ${dangChon.size ? `${formatKichThuoc(dangChon.size)} cm` : tenSanPhamChoKhach(dangChon)}`);
                } finally {
                  setDangGui(false);
                }
              }}
              className="mt-4 h-11 w-full rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
            >
              {daCoAlbum || soCuon(dangChon.productId) > 0
                ? vi.gallery.loiBean.banAlbumDatThem
                : vi.gallery.loiBean.banAlbumNutDat}
              {" · "}
              {formatCurrencyVND(dangChon.unitPrice)}
            </button>
          )}
        </>
      )}
    </section>
  );
}
