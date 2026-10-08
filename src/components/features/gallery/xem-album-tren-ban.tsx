"use client";

/**
 * BB-398 — "XEM ALBUM TRÊN BÀN": cuốn album đặt lên ảnh mặt bàn thật, đúng khổ cm.
 *
 * Anh 08/10/2026: "Album cũng muốn giao diện hình dung như UV" (UV đặt lên ảnh mặt
 * bàn thật, BB-365). Toán đặt + tỉ lệ cm dùng lại `ban-uv.ts` qua
 * `src/lib/gallery/album-tren-ban.ts` — không có bộ toán thứ hai ở đây.
 *
 *   - Bìa = ảnh bìa bộ ảnh (hoặc tấm ba mẹ thả tim đầu tiên) — chỉ để HÌNH DUNG,
 *     Bean sắp bìa thật cùng ba mẹ sau (album đặt không kèm ảnh, BB-390).
 *   - Đúng khổ: 15×21 / 20×30 cuốn ĐỨNG, 20×20 / 25×25 / 30×30 vuông; đổi khổ để so,
 *     cuốn to/nhỏ đúng tỉ lệ cm trên cùng một mặt bàn.
 *   - Bóng đổ nhẹ (nắng từ cửa sổ phía trên ảnh → bóng xuống dưới) + mép giấy/gáy
 *     theo độ dày ước lượng (`doDayAlbumCm`).
 *   - "Đặt album khổ này" đi đúng đường đặt của `BanAlbum` (`/api/g/addons`, không ảnh).
 */

import React from "react";
import { vi } from "@/i18n";
import { giuA } from "@/lib/utils/giu-a";
import { urlAnh, urlAnhDuPhong } from "@/lib/utils/anh-lh3";
import type { ThumbnailWidth } from "@/types/domain";

/** Cỡ ảnh bìa cuốn album — một bậc HỢP LỆ của `THUMBNAIL_WIDTHS` (route `/api/img` chỉ nhận các bậc đó). */
const CO_ANH_BIA: ThumbnailWidth = 800;
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc } from "@/lib/utils/dinh-dang";
import { nhanSoAnhAlbum } from "@/lib/products/album-khai-niem";
import { taoXuLyEscLopTren, useLopHopThoai } from "@/lib/utils/lop-hop-thoai";
import {
  CANH_BAN_ALBUM,
  VUNG_XEM_ALBUM,
  datAlbumTrenBan,
  phanTramTrongVung,
  viTriAnhNen,
} from "@/lib/gallery/album-tren-ban";

export interface CuonTrenBan {
  productId: string;
  size: string | null;
  unitPrice: number;
}

export interface XemAlbumTrenBanProps {
  cuon: CuonTrenBan[];
  productIdBanDau: string | null;
  anhBiaId: string | null;
  /**
   * BB-405 vòng 2 — mã tệp Drive của ảnh bìa (trường phụ `/api/g/photos`, BB-341): có thì đi
   * THẲNG lh3 như ô lưới (`urlAnh`), không thì qua `/api/img` với cỡ HỢP LỆ.
   */
  maTepDriveBia?: string | null;
  khoa: boolean;
  onDong: () => void;
  /**
   * Đặt cuốn khổ đang xem. `false` = máy chủ từ chối (đã báo riêng). BB-405 — thiếu =
   * vai này không đặt thẳng được: dùng `loiDatKhac` (nếu có) hoặc chỉ xem.
   */
  onDat?: (productId: string) => Promise<boolean>;
  /** BB-405 — đầu màn dùng chung của "Xem trong nhà" (hai lựa chọn Trên tường | Album trên bàn). */
  dauTrang?: React.ReactNode;
  /** BB-405 — cùng luật màn treo tường: vai không đặt thẳng được thì nút dẫn sang lối của vai. */
  loiDatKhac?: { nhan: string; onBam: () => void } | null;
}

export function XemAlbumTrenBan({
  cuon,
  productIdBanDau,
  anhBiaId,
  maTepDriveBia = null,
  khoa,
  onDong,
  onDat,
  dauTrang = null,
  loiDatKhac = null,
}: XemAlbumTrenBanProps) {
  const [chon, setChon] = React.useState<string | null>(productIdBanDau);
  const [dangDat, setDangDat] = React.useState(false);
  const dang = cuon.find((c) => c.productId === chon) ?? cuon[0] ?? null;
  const viTri = React.useMemo(() => (dang ? datAlbumTrenBan(dang.size) : null), [dang]);
  const nen = viTriAnhNen();

  // BB-398 vòng 2 — Esc chỉ đóng màn album (lớp trên cùng), KHÔNG đóng cửa hàng bên dưới.
  const laTren = useLopHopThoai(true);
  const onDongRef = React.useRef(onDong);
  onDongRef.current = onDong;
  React.useEffect(() => {
    const xuLy = taoXuLyEscLopTren(laTren, () => onDongRef.current());
    window.addEventListener("keydown", xuLy, true);
    return () => window.removeEventListener("keydown", xuLy, true);
  }, [laTren]);

  if (!dang) return null;
  const soAnh = nhanSoAnhAlbum(dang.size);
  const tenKho = dang.size ? `${formatKichThuoc(dang.size)} cm` : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vi.gallery.loiBean.albumTrenBanTieuDe}
      data-testid="xem-album-tren-ban"
      className="pointer-events-auto fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div className="flex max-h-[96dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[22px] bg-background sm:rounded-[22px]">
        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-6">
          <div className="min-w-0">
            {dauTrang && <div className="mb-2.5">{dauTrang}</div>}
            <h3 className="kh-h2 text-foreground">{vi.gallery.loiBean.albumTrenBanTieuDe}</h3>
            <p className="mt-0.5 text-pretty text-xs text-muted-foreground">{giuA(vi.gallery.loiBean.albumTrenBanMoTa)}</p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onDong}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl leading-none text-foreground/70 transition hover:bg-[var(--bb-surface-2)]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
          {/* Cảnh: đúng phần mặt bàn `VUNG_XEM_ALBUM` của ảnh gốc, giữ tỉ lệ — không cắt thêm. */}
          <div
            data-testid="canh-ban-album"
            className="relative w-full overflow-hidden rounded-2xl bg-[#d9cbb8] [container-type:inline-size]"
            style={{ aspectRatio: `${VUNG_XEM_ALBUM.rong} / ${VUNG_XEM_ALBUM.cao}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh nền tĩnh trong public/tuong */}
            <img
              src={`/tuong/${CANH_BAN_ALBUM.tep}`}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ left: `${nen.leftPct}%`, top: `${nen.topPct}%`, width: `${nen.widthPct}%`, height: "auto" }}
            />
            {viTri?.vua ? (
              <CuonAlbum
                key={dang.productId}
                viTri={viTri.hinh}
                gocXoayDo={viTri.gocXoayDo}
                dayPx={viTri.dayPx}
                anhBiaId={anhBiaId}
                maTepDriveBia={maTepDriveBia}
                kho={dang.size ?? ""}
              />
            ) : (
              <p className="absolute inset-x-3 bottom-3 rounded-xl bg-white/85 px-3 py-2 text-xs text-foreground">
                {giuA(vi.gallery.loiBean.albumTrenBanKhongVua)}
              </p>
            )}
          </div>

          <p className="mt-2 text-pretty text-[11px] text-muted-foreground">{giuA(vi.gallery.loiBean.albumTrenBanBiaMinhHoa)}</p>

          <p className="mb-2 mt-3.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {vi.gallery.loiBean.albumTrenBanNhanKho}
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={vi.gallery.loiBean.albumTrenBanNhanKho}>
            {cuon.map((c) => {
              const dangChon = c.productId === dang.productId;
              return (
                <button
                  key={c.productId}
                  type="button"
                  role="radio"
                  aria-checked={dangChon}
                  data-testid="chip-kho-album-tren-ban"
                  onClick={() => setChon(c.productId)}
                  className={cn(
                    "h-[34px] shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                    dangChon
                      ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
                      : "border-[var(--bb-border)] bg-white text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]",
                  )}
                >
                  {c.size ? formatKichThuoc(c.size) : "—"}
                </button>
              );
            })}
          </div>

          <p data-testid="album-tren-ban-thong-tin" className="mt-3 text-sm text-foreground">
            {soAnh
              ? vi.gallery.loiBean.banAlbumDongKho.replace("{kho}", formatKichThuoc(dang.size ?? "")).replace("{soAnh}", soAnh)
              : tenKho}
          </p>
        </div>

        <footer className="shrink-0 border-t border-[var(--bb-border)] px-4 py-3 sm:px-6">
          {!onDat ? (
            loiDatKhac ? (
              <button
                type="button"
                data-testid="nut-dat-loi-khac-album-tren-ban"
                onClick={loiDatKhac.onBam}
                className="h-11 w-full rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90"
              >
                {loiDatKhac.nhan}
              </button>
            ) : (
              <p data-testid="album-tren-ban-chi-xem" className="text-center text-[12px] text-muted-foreground">
                {vi.gallery.loiBean.dangChiXemChuaDat}
              </p>
            )
          ) : (
          <button
            type="button"
            data-testid="nut-dat-album-kho-nay"
            disabled={khoa || dangDat}
            onClick={async () => {
              setDangDat(true);
              try {
                await onDat(dang.productId);
              } finally {
                setDangDat(false);
              }
            }}
            className="h-11 w-full rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
          >
            {vi.gallery.loiBean.albumTrenBanDat} · {formatCurrencyVND(dang.unitPrice)}
          </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * Cuốn album nhìn từ trên xuống: khối ruột (mép giấy) lệch xuống dưới-phải theo độ
 * dày, bìa phủ lên trên với dải gáy bên trái; cả cuốn xoay nhẹ như tấm UV trên bàn.
 */
function CuonAlbum({
  viTri,
  gocXoayDo,
  dayPx,
  anhBiaId,
  maTepDriveBia = null,
  kho,
}: {
  viTri: { x: number; y: number; rong: number; cao: number };
  gocXoayDo: number;
  dayPx: number;
  anhBiaId: string | null;
  maTepDriveBia?: string | null;
  kho: string;
}) {
  const pt = phanTramTrongVung(viTri);
  // Độ dày theo % cạnh của CHÍNH cuốn (khối ruột lệch so với bìa).
  const dayX = (dayPx * 0.35 * 100) / viTri.rong;
  const dayY = (dayPx * 0.6 * 100) / viTri.cao;
  return (
    <div
      data-testid="cuon-album-tren-ban"
      data-kho={kho}
      className="absolute transition-all duration-300 ease-out"
      style={{
        left: `${pt.leftPct}%`,
        top: `${pt.topPct}%`,
        width: `${pt.widthPct}%`,
        height: `${pt.heightPct}%`,
        transform: `rotate(${gocXoayDo}deg)`,
        transformOrigin: "50% 50%",
      }}
    >
      {/* Bóng đổ mềm xuống dưới (nắng từ phía trên ảnh). */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2px]"
        style={{
          transform: `translate(${dayX * 0.6}%, ${dayY * 1.4}%)`,
          boxShadow: "0 1.6cqw 3.2cqw rgba(40,28,18,0.42), 0 0.4cqw 0.8cqw rgba(40,28,18,0.3)",
        }}
      />
      {/* Khối ruột: mép giấy xếp lớp. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[2px]"
        style={{
          transform: `translate(${dayX}%, ${dayY}%)`,
          background:
            "repeating-linear-gradient(0deg, #f4efe6 0, #f4efe6 0.25cqw, #e2d9cb 0.25cqw, #e2d9cb 0.35cqw)",
          boxShadow: "inset 0 0 0 0.15cqw rgba(90,70,50,0.25)",
        }}
      />
      {/* Bìa. */}
      <div className="absolute inset-0 overflow-hidden rounded-[2px] bg-[#efe6d8] ring-1 ring-black/10">
        {anhBiaId ? (
          // BB-405 vòng 2 — trước đây `/api/img/<id>?w=640`: 640 KHÔNG thuộc `THUMBNAIL_WIDTHS`
          // nên route từ chối → ảnh vỡ. Nay CÙNG đường ô lưới: `urlAnh` (lh3 thẳng khi có mã tệp,
          // cỡ 800 hợp lệ), lỗi thì lùi một lần về `/api/img?qua=1` như `luoi-anh.tsx`.
          // eslint-disable-next-line @next/next/no-img-element -- ảnh Drive, không qua next/image
          <img
            data-testid="bia-cuon-album"
            src={urlAnh({ id: anhBiaId, maTepDrive: maTepDriveBia }, CO_ANH_BIA)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.qua === "1") return;
              img.dataset.qua = "1";
              img.src = urlAnhDuPhong(anhBiaId, CO_ANH_BIA);
            }}
          />
        ) : (
          <span className="grid h-full w-full place-items-center font-display text-[3cqw] text-[#6b6057]">Album</span>
        )}
        {/* Gáy: dải tối bên trái + bóng gập. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[7%]"
          style={{ background: "linear-gradient(90deg, rgba(30,22,16,0.55), rgba(30,22,16,0.15) 70%, rgba(255,255,255,0.12))" }}
        />
        {/* Ánh sáng nhẹ trên bìa. */}
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: "linear-gradient(160deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 45%, rgba(0,0,0,0.08))" }}
        />
      </div>
    </div>
  );
}
