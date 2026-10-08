"use client";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

import React, { useState, useEffect, useRef } from "react";
import { BiaBoAnh, type BiaBoAnhProps } from "@/components/features/gallery/bia-bo-anh";
import { MAU_CHU_BIA, dienMau } from "@/lib/gallery/mau-chu-bia";
import { ArrowLeft, Bell, ChevronDown, MessageCircle, X } from "lucide-react";
import { CARD_TITLE_CLASS } from "./page-header";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { tinhTenBiaTuDuLieu } from "@/lib/utils/dinh-dang";
import { isGalleryLocked } from "@/lib/gallery-status";
import { tenBoThanThien } from "@/lib/utils/ten-bo-than-thien";
import { NutMoiOngBaBia } from "@/components/features/gallery/moi-nguoi-than";
import { ThuongHieuBoAnh } from "@/components/features/gallery/thuong-hieu-bo-anh";
import { KIEU_BIA, kieuBiaHopLe, propBiaTuBoAnh, tenKieuBia, type KieuBia } from "@/lib/gallery/kieu-bia";
import { cn } from "@/components/ui/utils";

interface AnhLuoi {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

type KhoXemTruoc = "may-tinh" | "dien-thoai";

/** Tỉ lệ khung của một ô lưới chọn bìa: đúng width/height thật, thiếu thì 2:3. */
export function tiLeAnh(anh: { width: number | null; height: number | null }): string {
  const w = anh.width ?? 0;
  const h = anh.height ?? 0;
  return w > 0 && h > 0 ? `${w} / ${h}` : "2 / 3";
}

export interface ChiTietBia {
  coverPhotoId?: string | null;
  coverHeadline?: string | null;
  welcomeMessage?: string | null;
  /** BB-396 — kiểu bìa đã lưu (`galleries.cover_layout`); null = "Bên cạnh". */
  coverLayout?: string | null;
  /**
   * BB-313 — nickname/họ tên đầy đủ RIÊNG, tính lại bằng `tinhTenBiaTuDuLieu`
   * NGAY TRONG component này — cùng hàm, cùng luật `gallery-app.tsx` dùng.
   */
  babyNickname?: string | null;
  babyFullName?: string | null;
  branchName?: string | null;
  /** BB-308 — ngày chụp THẬT (`shoots.shoot_date`), đúng trường màn khách dùng. */
  shootDate?: string | null;
  /** BB-308 — "loại buổi chụp" cho dòng phụ dưới tên bé (`tinhBiaMacDinh`). */
  sessionType?: string | null;
  /** BB-370 — tên bộ (thường là mã hoá đơn) + trạng thái, để khung xem trước nói đúng như màn khách. */
  title?: string | null;
  status?: string | null;
  photoCount: number;
  includedQuota: number | null;
  selectedCount: number;
}

export interface ThayDoiBia {
  coverPhotoId?: string | null;
  coverHeadline?: string | null;
  welcomeMessage?: string | null;
  coverLayout?: KieuBia | null;
}

/**
 * BB-396 — bản nháp trong trình thiết kế → có gì đổi không + gói gửi lên route
 * `PATCH /api/admin/galleries/[id]/bia`. Hàm thuần (phép thử đọc thẳng).
 *
 * Kiểu bìa CHỈ gửi khi đổi (so trên giá trị đã chuẩn hoá: null ≡ "ben-canh") —
 * lưu ảnh/chữ không ghi đè `cover_layout` của bộ. Chỉ đổi kiểu cũng bật nút Lưu.
 */
export function thayDoiBia(
  nhap: { anhBia: string | null | undefined; tieuDe: string; loi: string; kieuBia: KieuBia },
  goc: Pick<ChiTietBia, "coverPhotoId" | "coverHeadline" | "welcomeMessage" | "coverLayout">,
): { doiGi: boolean; thayDoi: ThayDoiBia } {
  const doiKieu = nhap.kieuBia !== kieuBiaHopLe(goc.coverLayout);
  const doiGi =
    nhap.anhBia !== goc.coverPhotoId ||
    nhap.tieuDe.trim() !== (goc.coverHeadline ?? "") ||
    nhap.loi.trim() !== (goc.welcomeMessage ?? "") ||
    doiKieu;
  return {
    doiGi,
    thayDoi: {
      coverPhotoId: nhap.anhBia,
      coverHeadline: nhap.tieuDe,
      welcomeMessage: nhap.loi,
      ...(doiKieu ? { coverLayout: nhap.kieuBia } : {}),
    },
  };
}

export function BiaBoAnhEditor({
  galleryId,
  detail,
  busy,
  onSave,
  choSua = true,
}: {
  galleryId: string;
  /** BB-382 — vai không có `galleries:write`: chỉ xem bìa, không có nút mở trình thiết kế (nên không thấy ô chọn kiểu). */
  choSua?: boolean;
  detail: ChiTietBia;
  busy: boolean;
  onSave: (thayDoi: ThayDoiBia) => void;
}) {
  const [moEditor, setMoEditor] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moEditor) return;
    // BB-329 — khoá CÓ ĐẾM (khoa-cuon-trang.ts), không gán thẳng `""` khi đóng.
    return khoaCuonTrang();
  }, [moEditor]);

  // BB-277 — Esc đóng + Tab quẩn trong hộp thoại + focus trả về nút mở.
  useBayFocusHopThoai(moEditor, () => setMoEditor(false), dialogRef);

  // Lưới ảnh giữ ở đây (không trong hộp thoại) để mở lại không phải tải lại.
  const [luoi, setLuoi] = useState<AnhLuoi[]>([]);
  const [dangTaiLuoi, setDangTaiLuoi] = useState(false);
  const [conTiep, setConTiep] = useState(false);
  const [contentCursor, setContentCursor] = useState<string | undefined>(undefined);

  async function taiLuoi(tuDau: boolean) {
    setDangTaiLuoi(true);
    try {
      const qs = new URLSearchParams({ limit: "60" });
      if (!tuDau && contentCursor) qs.set("sauSortIndex", contentCursor);
      const res = await fetch(`/api/admin/galleries/${galleryId}/photos?${qs.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      const trang: AnhLuoi[] = json.data ?? [];
      setLuoi((cu) => (tuDau ? trang : [...cu, ...trang]));
      setConTiep(Boolean(json.meta?.hasMore));
      setContentCursor(json.meta?.cursor);
    } finally {
      setDangTaiLuoi(false);
    }
  }

  function openEditor() {
    setMoEditor(true);
    if (luoi.length === 0) void taiLuoi(true);
  }

  const tenBeHienThi = tinhTenBiaTuDuLieu(detail.babyNickname, detail.babyFullName) || null;

  return (
    <section className="rounded-lg border border-[var(--bb-border)] p-4">
      {/* BB-290 lượt 2: đã chọn bìa thì hiện thumbnail + tóm tắt; chưa chọn thì lời mời. */}
      {detail.coverPhotoId ? (
        <div className="flex items-center gap-3.5">
          <img
            src={`/api/img/${detail.coverPhotoId}?w=200`}
            alt=""
            className="h-20 w-16 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-[var(--bb-fg-muted)]">
              Bìa bộ ảnh
            </div>
            <p className="truncate text-sm font-medium text-[var(--bb-fg)]">
              {detail.coverHeadline || tenBeHienThi || "Đã chọn ảnh bìa"}
            </p>
            {/* BB-396 mục 6 — kiểu bìa ba mẹ đang thấy. */}
            <p data-testid="kieu-bia-dang-dung" className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
              Kiểu bìa: {tenKieuBia(detail.coverLayout)}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-base font-medium">Bìa bộ ảnh</h2>
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
            Chọn kiểu bìa, ảnh bìa và lời chào — xem trước đúng như ba mẹ thấy.
          </p>
        </>
      )}

      {choSua && (
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={openEditor}
          className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm"
        >
          {detail.coverPhotoId ? "Đổi bìa" : "Mở trình thiết kế bìa"}
        </button>
      </div>
      )}

      {moEditor && choSua && (
        <TrinhThietKeBia
          hopRef={dialogRef}
          detail={detail}
          busy={busy}
          luoi={luoi}
          dangTaiLuoi={dangTaiLuoi}
          conTiep={conTiep}
          onTaiThem={() => void taiLuoi(false)}
          onDong={() => setMoEditor(false)}
          onSave={onSave}
        />
      )}
    </section>
  );
}

/**
 * Hộp thoại thiết kế bìa (toàn màn). Bản nháp khởi tạo từ `detail` mỗi lần mở —
 * đóng (Esc/X) là bỏ nháp.
 *
 * BB-396 (anh 08/10) — "Kiểu bìa" đứng ĐẦU cột trái, TRƯỚC lưới ảnh: mở ra là
 * chọn được ngay, không phải kéo qua cả bộ ảnh. Mỗi ô là MẪU THẬT: chính
 * `BiaBoAnh` với ảnh bìa, tiêu đề, lời chào, tên bé của bộ, cùng khổ đang xem
 * trước (Máy tính/Điện thoại), cùng bộ máy scale với khung lớn (`KhungBiaThat`).
 */
export function TrinhThietKeBia({
  hopRef,
  detail,
  busy,
  luoi,
  dangTaiLuoi,
  conTiep,
  onTaiThem,
  onDong,
  onSave,
}: {
  hopRef?: React.Ref<HTMLDivElement>;
  detail: ChiTietBia;
  busy: boolean;
  luoi: AnhLuoi[];
  dangTaiLuoi: boolean;
  conTiep: boolean;
  onTaiThem: () => void;
  onDong: () => void;
  onSave: (thayDoi: ThayDoiBia) => void;
}) {
  const [anhBiaNhap, setAnhBiaNhap] = useState(detail.coverPhotoId);
  const [tieuDe, setTieuDe] = useState(detail.coverHeadline ?? "");
  const [loi, setLoi] = useState(detail.welcomeMessage ?? "");
  const [kieuBia, setKieuBia] = useState<KieuBia>(() => kieuBiaHopLe(detail.coverLayout));
  /** BB-290 (#38): nút đổi khung xem trước máy tính / điện thoại. */
  const [thietBiXemTruoc, setThietBiXemTruoc] = useState<KhoXemTruoc>("may-tinh");

  // BB-313 mục 3 — MỘT lần tính tên bé, dùng cho mẫu chữ, placeholder và bìa.
  const tenBeHienThi = tinhTenBiaTuDuLieu(detail.babyNickname, detail.babyFullName) || null;
  const duLieuBia = { tenBe: tenBeHienThi, ngayChup: null, chiNhanh: detail.branchName ?? "" };
  const mauDaChonId = MAU_CHU_BIA.find((m) => m.tieuDe === tieuDe || m.loi === loi)?.id ?? null;

  const { doiGi, thayDoi } = thayDoiBia({ anhBia: anhBiaNhap, tieuDe, loi, kieuBia }, detail);

  // BB-370 + BB-396 — bìa dựng ĐÚNG như màn khách (gallery-app.tsx): cùng component,
  // cùng hàm `propBiaTuBoAnh` (tiêu đề, kiểu bìa, loại buổi, ngày chụp, lời chào,
  // trạng thái), cùng trạng thái khoá, dải 4 tấm đầu, nút mời ông bà, đầu trang tên bộ.
  const trangThai = detail.status ?? "ready";
  const khoaXemTruoc = isGalleryLocked(trangThai);
  const tenBoXemTruoc = tenBoThanThien({
    tenBe: tenBeHienThi,
    tieuDe: detail.title ?? null,
    loaiBuoi: detail.sessionType ?? null,
    ngayChup: detail.shootDate ?? null,
  });
  const biaChung: Omit<BiaBoAnhProps, "coverLayout"> = {
    ...propBiaTuBoAnh({
      coverHeadline: tieuDe,
      sessionType: detail.sessionType,
      shootDate: detail.shootDate,
      welcomeMessage: loi,
      status: trangThai,
    }),
    anhBia: anhBiaNhap ? { id: anhBiaNhap } : null,
    tenBe: tenBeHienThi,
    chiNhanh: detail.branchName ?? "BabyBean",
    soAnh: detail.photoCount,
    hanMuc: detail.includedQuota,
    daChon: detail.selectedCount,
    hanChot: null,
    khoa: khoaXemTruoc,
    anhXemTruoc: luoi.slice(0, 4),
    nutMoiOngBa: !khoaXemTruoc && trangThai !== "delivered" ? <NutMoiOngBaBia /> : undefined,
    onBatDau: () => {},
    placeholderChuaCoAnh: "Chọn một tấm bên trái",
  };
  const laMayTinh = thietBiXemTruoc === "may-tinh";

  return (
    <div
      ref={hopRef}
      role="dialog"
      aria-modal="true"
      aria-label="Thiết kế bìa bộ ảnh"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background md:flex-row md:overflow-hidden"
    >
      {/* BB-296 mục #2 — điện thoại: nửa trái chảy theo nội dung, cuộn chung cả hộp
          thoại; từ `md` chia đôi, mỗi nửa tự cuộn. */}
      <div className="flex flex-col border-b border-border p-4 md:w-1/2 md:flex-1 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center justify-between">
          {/* BB-320 (Q-N1): tiêu đề hộp thoại Playfair, không nghiêng. */}
          <h3 className={CARD_TITLE_CLASS}>Thiết kế bìa</h3>
          <button
            type="button"
            onClick={onDong}
            aria-label="Đóng"
            className="rounded-md border p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="mb-2 text-md font-semibold">1. Kiểu bìa</h3>
        <ChonKieuBia
          kho={thietBiXemTruoc}
          kieuDangChon={kieuBia}
          onChon={setKieuBia}
          tenBo={tenBoXemTruoc}
          biaChung={biaChung}
          daGiao={trangThai === "delivered"}
        />

        <h3 className="mb-2 mt-6 text-md font-semibold">2. Ảnh bìa</h3>
        {/* BB-290 (#38): lưới LUÔN hiện, kể cả đang tải (khung xương).
            BB-326 mục 2 — ô theo TỈ LỆ THẬT của từng tấm, xếp masonry bằng cột CSS.
            BB-370 mục 5c — máy tính: lưới tự cuộn trong vùng ~nửa màn. */}
        <div className="md:max-h-[50vh] md:overflow-y-auto md:pr-1" data-testid="vung-luoi-chon-bia">
          <div className="columns-3 gap-2 sm:columns-4" data-testid="luoi-chon-bia">
            {dangTaiLuoi && luoi.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="mb-2 aspect-[2/3] animate-pulse break-inside-avoid rounded-md bg-[var(--bb-surface-2)]"
                  />
                ))
              : luoi.map((anh) => (
                  <button
                    key={anh.id}
                    type="button"
                    aria-pressed={anhBiaNhap === anh.id}
                    aria-label={`Chọn ${anh.fileName} làm bìa`}
                    onClick={() => setAnhBiaNhap(anh.id)}
                    style={{ aspectRatio: tiLeAnh(anh) }}
                    className={`relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-md border-2 ${
                      anhBiaNhap === anh.id ? "border-[var(--bb-accent)]" : "border-transparent"
                    }`}
                  >
                    <img
                      src={`/api/img/${anh.id}?w=400`}
                      className="h-full w-full object-cover"
                      alt=""
                      loading="lazy"
                    />
                  </button>
                ))}
          </div>
          {!dangTaiLuoi && luoi.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--bb-fg-muted)]">
              Bộ ảnh chưa có ảnh nào để chọn làm bìa.
            </p>
          )}
          {conTiep && (
            <button
              type="button"
              onClick={onTaiThem}
              disabled={dangTaiLuoi}
              className="mt-4 w-full rounded-md border p-2 text-sm"
            >
              {dangTaiLuoi ? "Đang tải..." : "Tải thêm"}
            </button>
          )}
        </div>

        <h3 className="mb-2 mt-6 text-md font-semibold">3. Nội dung</h3>
        <label className="flex flex-col gap-1 text-sm">
          Tiêu đề bìa
          <input
            type="text"
            value={tieuDe}
            onChange={(e) => setTieuDe(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-2"
            placeholder={tenBeHienThi || "Khoảnh khắc của con"}
          />
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Lời trên bìa
          <textarea
            value={loi}
            onChange={(e) => setLoi(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-2"
            placeholder="Những khoảnh khắc của con đã sẵn sàng."
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {MAU_CHU_BIA.map((m) => {
            const dien = dienMau(m, duLieuBia);
            if (!dien) return null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setTieuDe(dien.tieuDe);
                  setLoi(dien.loi);
                }}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  mauDaChonId === m.id ? "border-[var(--bb-accent)] bg-[var(--bb-accent)]/10" : "border-[var(--bb-border)] hover:bg-[var(--bb-surface-2)]"
                }`}
              >
                {m.nhan}
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 -mx-4 mt-6 flex gap-3 border-t border-[var(--bb-border)] bg-background px-4 py-3">
          {/* BB-308 — nút chính màu mực (`--bb-fg`), cùng token mọi nút chính quản trị. */}
          <button
            type="button"
            data-testid="nut-luu-bia"
            disabled={!doiGi || busy}
            onClick={() => {
              onSave(thayDoi);
              onDong();
            }}
            className="flex-1 rounded-md bg-[var(--bb-fg)] px-4 py-2 text-sm text-[var(--bb-bg)] disabled:opacity-50"
          >
            Lưu bìa
          </button>
        </div>
      </div>

      {/* Xem trước lớn (phải / dưới) — BB-290/BB-313/BB-370: dựng ở kích thước THẬT
          của thiết bị rồi `scale()` vừa khung, đứng ĐẦU cột (mở ra là thấy). */}
      <div className="relative flex shrink-0 flex-col items-center justify-start gap-3 overflow-hidden bg-[var(--bb-bg)] p-4 dark:bg-gray-900 md:w-1/2 md:flex-1 md:overflow-y-auto md:pt-6">
        <div className="flex items-center gap-1 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-white/70 p-0.5 text-xs backdrop-blur">
          <button
            type="button"
            onClick={() => setThietBiXemTruoc("may-tinh")}
            aria-pressed={laMayTinh}
            className={`rounded px-2.5 py-1 ${laMayTinh ? "bg-[var(--bb-fg)] text-white" : "text-[var(--bb-fg-muted)]"}`}
          >
            Máy tính
          </button>
          <button
            type="button"
            onClick={() => setThietBiXemTruoc("dien-thoai")}
            aria-pressed={!laMayTinh}
            className={`rounded px-2.5 py-1 ${!laMayTinh ? "bg-[var(--bb-fg)] text-white" : "text-[var(--bb-fg-muted)]"}`}
          >
            Điện thoại
          </button>
        </div>

        <KhungBiaThat
          testId="khung-xem-truoc-bia"
          kho={thietBiXemTruoc}
          kieuChon={kieuBia}
          tenBo={tenBoXemTruoc}
          bia={{ ...biaChung, coverLayout: kieuBia }}
          className="rounded-md border border-[var(--bb-border)] shadow-sm"
          style={{
            width: laMayTinh ? "100%" : "min(100%, 300px)",
            maxWidth: laMayTinh ? "760px" : "300px",
          }}
        />
        <p className="max-w-[760px] text-center text-[11px] text-[var(--bb-fg-muted)]">
          Đúng như ba mẹ thấy khi mở bộ ảnh · Kiểu {tenKieuBia(kieuBia)}
        </p>
      </div>
    </div>
  );
}

/**
 * BB-396 — 4 ô kiểu bìa, mỗi ô là bìa THẬT thu nhỏ (`KhungBiaThat` + `BiaBoAnh`)
 * theo khổ đang xem trước. Không hook — chỉ dựng từ prop.
 *
 * Phần bìa trong ô `inert` + `aria-hidden` (nút của bìa không bấm/không Tab được);
 * cả ô là MỘT nút phủ trên cùng, tên "Kiểu bìa <tên>". Ảnh bìa dùng đúng địa chỉ
 * khung lớn đang tải (`?w=1600`, cùng một tệp trong bộ đệm trình duyệt) nên 4 ô
 * không tải thêm ảnh lớn nào.
 */
export function ChonKieuBia({
  kho,
  kieuDangChon,
  onChon,
  tenBo,
  biaChung,
  daGiao,
}: {
  kho: KhoXemTruoc;
  kieuDangChon: KieuBia;
  onChon: (kieu: KieuBia) => void;
  tenBo: string;
  biaChung: Omit<BiaBoAnhProps, "coverLayout">;
  daGiao: boolean;
}) {
  const mt = kho === "may-tinh";
  return (
    <div>
      <div
        data-testid="chon-kieu-bia"
        data-kho={kho}
        className={cn("grid gap-3", mt ? "grid-cols-2 sm:grid-cols-4" : "max-w-[460px] grid-cols-4")}
      >
        {KIEU_BIA.map((k) => {
          const dangChon = k.id === kieuDangChon;
          return (
            <div key={k.id} className="relative min-w-0">
              <div
                inert
                aria-hidden="true"
                className={cn(
                  "overflow-hidden rounded-md border-2",
                  dangChon ? "border-[var(--bb-fg)]" : "border-[var(--bb-border)]",
                )}
              >
                <KhungBiaThat kho={kho} tenBo={tenBo} bia={{ ...biaChung, coverLayout: k.id }} style={{ width: "100%" }} />
              </div>
              <p
                className={cn(
                  "mt-1.5 truncate text-center text-xs",
                  dangChon ? "font-semibold text-[var(--bb-fg)]" : "text-[var(--bb-fg-muted)]",
                )}
              >
                {k.ten}
              </p>
              <button
                type="button"
                data-kieu={k.id}
                aria-pressed={dangChon}
                aria-label={`Kiểu bìa ${k.ten}`}
                onClick={() => onChon(k.id)}
                className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
              />
            </div>
          );
        })}
      </div>
      {daGiao && (
        <p data-testid="ghi-chu-kieu-bia-da-giao" className="mt-2 text-xs text-[var(--bb-fg-muted)]">
          Bộ đã giao: ba mẹ đang thấy bìa &quot;Đã hoàn thiện&quot;. Kiểu bìa chỉ dùng lúc ba mẹ chọn ảnh.
        </p>
      )}
    </div>
  );
}

/**
 * MỘT bộ máy scale cho cả khung xem trước lớn lẫn 4 ô kiểu bìa (BB-396 tách từ
 * BB-290/BB-313): dựng đầu trang + `BiaBoAnh` ở kích thước THẬT của thiết bị
 * (1440×900 / 390×844) rồi `scale()` theo bề rộng khung bằng `cqw`.
 */
function KhungBiaThat({
  kho,
  tenBo,
  bia,
  testId,
  kieuChon,
  className,
  style,
}: {
  kho: KhoXemTruoc;
  tenBo: string;
  bia: BiaBoAnhProps;
  testId?: string;
  kieuChon?: KieuBia;
  className?: string;
  style?: React.CSSProperties;
}) {
  const mt = kho === "may-tinh";
  return (
    <div
      data-testid={testId}
      data-kho={kho}
      data-kieu-chon={kieuChon}
      className={cn("relative overflow-hidden bg-[#fdfbf9]", className)}
      style={{ containerType: "size", aspectRatio: mt ? "1440 / 900" : "390 / 844", ...style }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left overflow-hidden bg-[#fdfbf9]"
        style={
          mt
            ? {
                width: "1440px",
                height: "900px",
                // Chia cho CHIỀU DÀI `1440px` (không phải số thuần) — xem BB-313.
                transform: "scale(calc(100cqw / 1440px + 0.002))",
                // Bìa phủ kín phần khung DƯỚI đầu trang (BB-313 P0).
                ["--bb-bia-khung-cao" as string]: `${900 - CAO_DAU_TRANG_MAY_TINH}px`,
              }
            : {
                width: "390px",
                height: "844px",
                transform: "scale(calc(100cqw / 390px + 0.002))",
                ["--bb-bia-khung-cao" as string]: "844px",
                // Màn khách trừ đúng chiều cao đầu trang khỏi bìa (gallery-app đo thật).
                ["--bb-phan-tren-bia" as string]: `${CAO_DAU_TRANG_DIEN_THOAI}px`,
              }
        }
      >
        <DauTrangXemTruoc kho={kho} tenBo={tenBo} />
        <BiaBoAnh {...bia} />
      </div>
    </div>
  );
}

/**
 * Chiều cao đầu trang màn khách trên điện thoại, px. BB-405 — hai hàng: thương hiệu
 * (biểu tượng 40px + đệm 14px trên/dưới) rồi "← Album gia đình" + tên bộ ngay dưới.
 */
const CAO_DAU_TRANG_DIEN_THOAI = 140;
/** Chiều cao đầu trang màn khách trên máy tính, px (cột trái: "Album gia đình" + tên bộ). */
const CAO_DAU_TRANG_MAY_TINH = 84;

/**
 * BB-370 — đầu trang màn khách trong khung xem trước: cụm thương hiệu DÙNG
 * CHUNG (`ThuongHieuBoAnh`) + tên bộ thân thiện đúng như ô chuyển bộ của khách
 * (`tenBoThanThien` — không bao giờ là mã hoá đơn). Biểu tượng hai bên chỉ để
 * giữ đúng bố cục, không bấm được (khung xem trước `pointer-events-none`).
 *
 * BB-405 — khớp bố cục mới của màn khách: logo đứng MỘT MÌNH ở giữa; tên bộ nằm
 * NGAY DƯỚI "← Album gia đình" (điện thoại: hàng thứ hai sát lề trái; máy tính:
 * cột trái).
 */
function DauTrangXemTruoc({ kho, tenBo }: { kho: KhoXemTruoc; tenBo: string }) {
  const mt = kho === "may-tinh";
  const khoiAlbum = (
    <div
      data-testid="khoi-album-gia-dinh-xem-truoc"
      className={`flex min-w-0 flex-col items-start ${mt ? "w-[220px]" : "col-span-3 border-t border-[#efe7de] pt-2"}`}
      aria-hidden="true"
    >
      <span
        className={`inline-flex items-center font-medium ${
          mt ? "gap-2 text-[15px] text-[#2e2a27]" : "gap-1.5 text-[13px] text-[#6f6760]"
        }`}
      >
        <ArrowLeft className={mt ? "h-[18px] w-[18px]" : "h-4 w-4"} strokeWidth={1.5} />
        Album gia đình
      </span>
      <span
        data-testid="ten-bo-xem-truoc"
        className={`inline-flex min-h-[32px] max-w-full items-center gap-1 rounded-full font-medium text-[#2e2a27] ${
          mt ? "mt-1 max-w-[220px] bg-[#f3ede6] px-3 text-[13px]" : "-ml-2 mt-0.5 px-2 text-[14px]"
        }`}
      >
        <span className="truncate">{tenBo}</span>
        <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      </span>
    </div>
  );
  return (
    <div
      data-testid="dau-trang-xem-truoc"
      className={`border-b border-[#e5dcd2] bg-[#fdfbf9] ${
        mt
          ? "flex items-center justify-between px-10"
          : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] content-center items-center gap-2 px-3.5"
      }`}
      style={{ height: `${mt ? CAO_DAU_TRANG_MAY_TINH : CAO_DAU_TRANG_DIEN_THOAI}px` }}
    >
      {mt ? (
        khoiAlbum
      ) : (
        <MessageCircle className="h-5 w-5 text-[#2e2a27]" strokeWidth={1.5} aria-hidden="true" />
      )}
      <ThuongHieuBoAnh kho={kho} />
      <div className="flex items-center justify-end gap-4 text-[#2e2a27]" aria-hidden="true">
        {mt && <MessageCircle className="h-5 w-5" strokeWidth={1.5} />}
        <Bell className="h-5 w-5" strokeWidth={1.5} />
      </div>
      {!mt && khoiAlbum}
    </div>
  );
}
