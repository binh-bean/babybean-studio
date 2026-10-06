"use client";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

import React, { useState, useEffect, useRef } from "react";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { MAU_CHU_BIA, dienMau } from "@/lib/gallery/mau-chu-bia";
import { ArrowLeft, Bell, ChevronDown, LayoutGrid, MessageCircle, X } from "lucide-react";
import { CARD_TITLE_CLASS } from "./page-header";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { tinhTenBiaTuDuLieu } from "@/lib/utils/dinh-dang";
import { isGalleryLocked } from "@/lib/gallery-status";
import { tenBoThanThien } from "@/lib/utils/ten-bo-than-thien";
import { NutMoiOngBaBia } from "@/components/features/gallery/moi-nguoi-than";
import { ThuongHieuBoAnh } from "@/components/features/gallery/thuong-hieu-bo-anh";

interface AnhLuoi {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

/** Tỉ lệ khung của một ô lưới chọn bìa: đúng width/height thật, thiếu thì 2:3. */
export function tiLeAnh(anh: { width: number | null; height: number | null }): string {
  const w = anh.width ?? 0;
  const h = anh.height ?? 0;
  return w > 0 && h > 0 ? `${w} / ${h}` : "2 / 3";
}

export function BiaBoAnhEditor({
  galleryId,
  detail,
  busy,
  onSave,
}: {
  galleryId: string;
  detail: {
    coverPhotoId?: string | null;
    coverHeadline?: string | null;
    welcomeMessage?: string | null;
    coverLayout?: string | null;
    /**
     * BB-313 (ảnh chụp app thật, Đợt 9, mục 3) — nickname/họ tên đầy đủ
     * RIÊNG (trước là một `babyName` đã coalesce sẵn, dùng thẳng làm `tenBe`
     * mà KHÔNG qua `tenGoiBe` — nickname thật thì khung xem trước thiếu tiền
     * tố "Bé " so với đúng bìa khách thấy). Tính lại bằng
     * `tinhTenBiaTuDuLieu` NGAY TRONG component này — cùng hàm, cùng luật
     * `gallery-app.tsx` (màn khách) đang dùng, để khung xem trước giống hệt.
     */
    babyNickname?: string | null;
    babyFullName?: string | null;
    branchName?: string | null;
    /**
     * BB-308 (vòng 4, mục #5 báo cáo chấm 28/09/2026) — khung xem trước
     * trước đây dùng `detail.createdAt` (trường KHÔNG TỪNG tồn tại trên
     * `Detail` của `gallery-detail.tsx` — luôn `undefined` khi gọi thật, nên
     * ngày chụp trên khung xem trước luôn trống). Đổi sang `shootDate`
     * (ngày chụp THẬT, `shoots.shoot_date`) — đúng trường màn khách dùng.
     */
    shootDate?: string | null;
    /**
     * BB-308 (vòng 4, mục #5) — "loại buổi chụp" ("Thôi nôi"…) để khung xem
     * trước hiện đúng dòng phụ dưới tên bé, khớp bìa khách thấy
     * (`tinhBiaMacDinh`, bia-bo-anh.tsx).
     */
    sessionType?: string | null;
    /** BB-370 — tên bộ (thường là mã hoá đơn) + trạng thái, để khung xem trước nói đúng như màn khách. */
    title?: string | null;
    status?: string | null;
    photoCount: number;
    includedQuota: number | null;
    selectedCount: number;
  };
  busy: boolean;
  onSave: (thayDoi: {
    coverPhotoId?: string | null;
    coverHeadline?: string | null;
    welcomeMessage?: string | null;
    coverLayout?: string | null;
  }) => void;
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

  const [anhBiaNhap, setAnhBiaNhap] = useState(detail.coverPhotoId);
  const [tieuDe, setTieuDe] = useState(detail.coverHeadline ?? "");
  const [loi, setLoi] = useState(detail.welcomeMessage ?? "");

  /** BB-290 (#38): nút đổi khung xem trước máy tính / điện thoại. */
  const [thietBiXemTruoc, setThietBiXemTruoc] = useState<"may-tinh" | "dien-thoai">("may-tinh");

  const [luoi, setLuoi] = useState<AnhLuoi[]>([]);
  const [dangTaiLuoi, setDangTaiLuoi] = useState(false);
  const [conTiep, setConTiep] = useState(false);
  const [contentCursor, setContentCursor] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAnhBiaNhap(detail.coverPhotoId);
    setTieuDe(detail.coverHeadline ?? "");
    setLoi(detail.welcomeMessage ?? "");
  }, [galleryId, detail.coverPhotoId, detail.coverHeadline, detail.welcomeMessage]);

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

  // BB-313 mục 3 — MỘT lần tính duy nhất, dùng lại cho cả `duLieuBia` (mẫu
  // chữ có sẵn), placeholder ô tiêu đề, và prop `tenBe` gửi xuống `BiaBoAnh` ở
  // khung xem trước — đúng cùng chuỗi `gallery-app.tsx` tính cho màn khách.
  const tenBeHienThi = tinhTenBiaTuDuLieu(detail.babyNickname, detail.babyFullName) || null;

  const duLieuBia = {
    tenBe: tenBeHienThi,
    ngayChup: null,
    chiNhanh: detail.branchName ?? "",
  };

  const mauDaChonId = MAU_CHU_BIA.find((m) => m.tieuDe === tieuDe || m.loi === loi)?.id ?? null;

  const doiGi =
    anhBiaNhap !== detail.coverPhotoId ||
    tieuDe.trim() !== (detail.coverHeadline ?? "") ||
    loi.trim() !== (detail.welcomeMessage ?? "");

  // BB-370 — khung xem trước dựng ĐÚNG như màn khách (gallery-app.tsx): cùng
  // component bìa, cùng bố cục (màn khách luôn dùng bố cục mặc định "Bên cạnh" —
  // `coverLayout` KHÔNG được màn khách đọc, nên trình thiết kế không còn cho chọn
  // bố cục: chọn mà khách không thấy là xem trước sai), cùng trạng thái khoá,
  // cùng dải 4 tấm đầu, cùng nút mời ông bà, cùng đầu trang thương hiệu + tên bộ.
  const trangThai = detail.status ?? "ready";
  const khoaXemTruoc = isGalleryLocked(trangThai);
  const tenBoXemTruoc = tenBoThanThien({
    tenBe: tenBeHienThi,
    tieuDe: detail.title ?? null,
    loaiBuoi: detail.sessionType ?? null,
    ngayChup: detail.shootDate ?? null,
  });
  const laMayTinh = thietBiXemTruoc === "may-tinh";

  return (
    <section className="rounded-lg border border-[var(--bb-border)] p-4">
      {/* BB-290 lượt 2: khi đã chọn bìa, hiện thumbnail + tóm tắt (thay vì
          chỉ một nút trần) — theo khối "BÌA ALBUM" của quan-tri-chi-tiet.png.
          Chưa chọn thì giữ nguyên lời mời cũ. */}
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
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-base font-medium">Bìa bộ ảnh</h2>
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
            Thiết kế bìa album, với lưới chọn ảnh và xem trước toàn phần.
          </p>
        </>
      )}

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

      {moEditor && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Thiết kế bìa bộ ảnh"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background md:flex-row md:overflow-hidden"
        >
          {/*
            BB-296 mục #2 — báo cáo chấm độc lập lần 3: trên điện thoại, hai
            nửa (lưới chọn ảnh / xem trước) đều `flex-1` bên trong khung
            `fixed inset-0` cố định chiều cao — mỗi nửa chỉ còn ~320-400px,
            lưới ảnh + form bị nhốt trong một ô cuộn riêng cao ngắn, cắt
            ngang hàng thứ hai. Sửa: bỏ `flex-1` ở NỬA TRÁI trên điện thoại —
            nó chảy theo chiều cao thật của nội dung, cuộn CHUNG với toàn hộp
            thoại (`overflow-y-auto` ở khung ngoài). Từ `md` trở lên giữ
            nguyên bố cục chia đôi, mỗi nửa tự cuộn riêng như cũ.
          */}
          <div className="flex flex-col border-b border-border p-4 md:w-1/2 md:flex-1 md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="flex justify-between items-center mb-4">
              {/* BB-320 (Q-N1): tiêu đề hộp thoại Playfair như mọi tiêu đề khác của quản trị, không phải sans đậm. */}
              <h3 className={CARD_TITLE_CLASS}>Thiết kế bìa</h3>
              <button
                type="button"
                onClick={() => setMoEditor(false)}
                aria-label="Đóng"
                className="p-2 border rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <h3 className="mb-2 text-md font-semibold mt-2">1. Chọn ảnh bìa</h3>
            {/* BB-290 (#38): lưới LUÔN hiện, kể cả đang tải — trước đây mục
                này trống trơn trong lúc `taiLuoi` chạy, trông như bộ ảnh
                không có tấm nào. Khung xương giữ đúng chỗ cho lưới thật. */}
            {/* BB-326 mục 2 — lưới theo TỈ LỆ THẬT của từng tấm (width/height
                của Drive), xếp kiểu masonry bằng cột CSS. Trước đây mọi ô ép
                khung dọc 2:3 nên ảnh ngang bị cắt mất hai bên, chọn bìa như
                chọn mò. Thiếu kích thước thì lùi về 2:3. */}
            {/* BB-370 mục 5c — lưới tự cuộn trong một vùng cao ~nửa màn (máy tính): mở ra là thấy
                cả lưới, phần Nội dung và nút Lưu, không phải kéo cả cột xuống dưới. */}
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
                onClick={() => void taiLuoi(false)}
                disabled={dangTaiLuoi}
                className="mt-4 rounded-md border p-2 text-sm w-full"
              >
                {dangTaiLuoi ? "Đang tải..." : "Tải thêm"}
              </button>
            )}
            </div>

            <h3 className="mb-2 mt-6 text-md font-semibold">2. Nội dung</h3>
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
              {/* BB-308 (vòng 4, mục #5 báo cáo chấm 28/09/2026) — "Lưu bìa"
                  vẫn dùng `--bb-accent` (sage/bạc hà nhạt), màu BB-301 đã bỏ
                  cho nút chính ("Nhất quán: bạc hà là một màu lạ nằm ngoài
                  bảng màu"). Đổi sang mực (`--bb-fg`) — cùng token mọi nút
                  chính khác trong quản trị dùng (gallery-detail.tsx,
                  settings-manager.tsx). */}
              <button
                disabled={!doiGi || busy}
                onClick={() => {
                  onSave({
                    coverPhotoId: anhBiaNhap,
                    coverHeadline: tieuDe,
                    welcomeMessage: loi,
                  });
                  setMoEditor(false);
                }}
                className="flex-1 rounded-md bg-[var(--bb-fg)] px-4 py-2 text-sm text-[var(--bb-bg)] disabled:opacity-50"
              >
                Lưu bìa
              </button>
            </div>
          </div>

          {/* Xem trước (phải / dưới) — BB-290 (#38): render `BiaBoAnh` ở kích thước
              THẬT của thiết bị (1440×900 hoặc 390×844) rồi `scale()` vừa khung
              bằng `cqw` (chú thích dài ở các bản trước: BB-296/308/313).

              BB-370 (anh 06/10, ảnh 417e5a51 so với 3b8e6719) — khung xem trước
              "lệch hẳn" màn khách thật vì: (1) trình thiết kế cho chọn bố cục
              (Tối giản…) mà màn khách KHÔNG đọc `coverLayout` (luôn "Bên cạnh");
              (2) thiếu trạng thái khoá, dải 4 tấm, nút mời ông bà, đầu trang tên
              bộ; (3) máy tính ép bìa cao 900px trong khi màn khách cao theo nội
              dung. Nay đưa ĐÚNG các prop màn khách truyền, thêm đầu trang dùng
              chung cụm thương hiệu, và khung đứng ở ĐẦU cột (không căn giữa dọc
              — mở ra là thấy, không phải cuộn). */}
          <div className="relative flex shrink-0 flex-col items-center justify-start gap-3 overflow-hidden bg-[var(--bb-bg)] p-4 dark:bg-gray-900 md:w-1/2 md:flex-1 md:overflow-y-auto md:pt-6">
            <div className="flex items-center gap-1 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-white/70 backdrop-blur p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setThietBiXemTruoc("may-tinh")}
                aria-pressed={thietBiXemTruoc === "may-tinh"}
                className={`rounded px-2.5 py-1 ${thietBiXemTruoc === "may-tinh" ? "bg-[var(--bb-fg)] text-white" : "text-[var(--bb-fg-muted)]"}`}
              >
                Máy tính
              </button>
              <button
                type="button"
                onClick={() => setThietBiXemTruoc("dien-thoai")}
                aria-pressed={thietBiXemTruoc === "dien-thoai"}
                className={`rounded px-2.5 py-1 ${thietBiXemTruoc === "dien-thoai" ? "bg-[var(--bb-fg)] text-white" : "text-[var(--bb-fg-muted)]"}`}
              >
                Điện thoại
              </button>
            </div>

            <div
              data-testid="khung-xem-truoc-bia"
              data-kho={thietBiXemTruoc}
              className="relative overflow-hidden rounded-md border border-[var(--bb-border)] bg-[#fdfbf9] shadow-sm"
              style={{
                containerType: "size",
                width: laMayTinh ? "100%" : "min(100%, 300px)",
                maxWidth: laMayTinh ? "760px" : "300px",
                aspectRatio: laMayTinh ? "1440 / 900" : "390 / 844",
              }}
            >
              <div
                className="pointer-events-none absolute left-0 top-0 origin-top-left overflow-hidden bg-[#fdfbf9]"
                style={
                  laMayTinh
                    ? {
                        width: "1440px",
                        height: "900px",
                        // Chia cho CHIỀU DÀI `1440px` (không phải số thuần) — xem BB-313.
                        transform: "scale(calc(100cqw / 1440px + 0.002))",
                        // Bìa phủ kín phần khung DƯỚI đầu trang (BB-313 P0: không để
                        // dải trắng lớn) — trước đây ghim 900px nên bìa tràn qua đáy
                        // khung khi đã có đầu trang phía trên.
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
                <DauTrangXemTruoc kho={thietBiXemTruoc} tenBo={tenBoXemTruoc} />
                <BiaBoAnh
                  anhBia={anhBiaNhap ? { id: anhBiaNhap } : null}
                  coverHeadline={tieuDe}
                  tenBe={tenBeHienThi}
                  ngayChup={detail.shootDate ?? null}
                  sessionType={detail.sessionType ?? null}
                  chiNhanh={detail.branchName ?? "BabyBean"}
                  loiChao={loi}
                  soAnh={detail.photoCount}
                  hanMuc={detail.includedQuota}
                  daChon={detail.selectedCount}
                  hanChot={null}
                  khoa={khoaXemTruoc}
                  trangThai={trangThai}
                  anhXemTruoc={luoi.slice(0, 4)}
                  nutMoiOngBa={!khoaXemTruoc && trangThai !== "delivered" ? <NutMoiOngBaBia /> : undefined}
                  onBatDau={() => {}}
                  placeholderChuaCoAnh="Chọn một tấm bên trái"
                />
              </div>
            </div>
            <p className="max-w-[760px] text-center text-[11px] text-[var(--bb-fg-muted)]">
              Đúng như ba mẹ thấy khi mở bộ ảnh.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Chiều cao đầu trang màn khách trên điện thoại (thương hiệu + tên bộ), px. */
const CAO_DAU_TRANG_DIEN_THOAI = 86;
/** Chiều cao đầu trang màn khách trên máy tính, px. */
const CAO_DAU_TRANG_MAY_TINH = 86;

/**
 * BB-370 — đầu trang màn khách trong khung xem trước: cụm thương hiệu DÙNG
 * CHUNG (`ThuongHieuBoAnh`) + tên bộ thân thiện đúng như ô chuyển bộ của khách
 * (`tenBoThanThien` — không bao giờ là mã hoá đơn). Biểu tượng hai bên chỉ để
 * giữ đúng bố cục, không bấm được (khung xem trước `pointer-events-none`).
 */
function DauTrangXemTruoc({ kho, tenBo }: { kho: "may-tinh" | "dien-thoai"; tenBo: string }) {
  const mt = kho === "may-tinh";
  return (
    <div
      data-testid="dau-trang-xem-truoc"
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#e5dcd2] bg-[#fdfbf9] ${
        mt ? "px-10" : "px-3.5"
      }`}
      style={{ height: `${mt ? CAO_DAU_TRANG_MAY_TINH : CAO_DAU_TRANG_DIEN_THOAI}px` }}
    >
      {mt ? (
        <span className="inline-flex items-center gap-2 text-[15px] font-medium text-[#2e2a27]" aria-hidden="true">
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          Album gia đình
        </span>
      ) : (
        <LayoutGrid className="h-5 w-5 text-[#2e2a27]" strokeWidth={1.5} aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-col items-center">
        <ThuongHieuBoAnh kho={kho} />
        <span
          data-testid="ten-bo-xem-truoc"
          className={`inline-flex max-w-[220px] items-center gap-1 truncate rounded-full text-[13px] font-medium text-[#2e2a27] ${
            mt ? "mt-1.5 max-w-[320px] bg-[#f3ede6] px-3 py-1" : "mt-1 px-2 py-0.5"
          }`}
        >
          <span className="truncate">{tenBo}</span>
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-center justify-end gap-4 text-[#2e2a27]" aria-hidden="true">
        {mt && <MessageCircle className="h-5 w-5" strokeWidth={1.5} />}
        <Bell className="h-5 w-5" strokeWidth={1.5} />
      </div>
    </div>
  );
}
