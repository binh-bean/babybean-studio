"use client";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

import React, { useState, useEffect, useRef } from "react";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { MAU_CHU_BIA, dienMau } from "@/lib/gallery/mau-chu-bia";
import { X } from "lucide-react";
import { CARD_TITLE_CLASS } from "./page-header";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { tinhTenBiaTuDuLieu } from "@/lib/utils/dinh-dang";

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
  const [layout, setLayout] = useState(detail.coverLayout ?? "ben-canh");

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
    setLayout(detail.coverLayout ?? "ben-canh");
  }, [galleryId, detail.coverPhotoId, detail.coverHeadline, detail.welcomeMessage, detail.coverLayout]);

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
    loi.trim() !== (detail.welcomeMessage ?? "") ||
    layout !== (detail.coverLayout ?? "ben-canh");

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

            <h3 className="mb-2 mt-6 text-md font-semibold">2. Bố cục</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "tap-chi", label: "Tạp chí" },
                { id: "toi-gian", label: "Tối giản" },
                { id: "ben-canh", label: "Bên cạnh" },
                { id: "de-cheo", label: "Đè chéo" }
              ].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={layout === l.id}
                  onClick={() => setLayout(l.id)}
                  className={`rounded border px-3 py-1.5 text-sm ${layout === l.id ? "border-[var(--bb-accent)] bg-[var(--bb-accent)]/10" : "border-[var(--bb-border)]"}`}
                >
                  {l.label}
                </button>
              ))}
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
            
            <div className="mt-8 flex gap-3 pb-8">
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
                    coverLayout: layout,
                  });
                  setMoEditor(false);
                }}
                className="flex-1 rounded-md bg-[var(--bb-fg)] px-4 py-2 text-sm text-[var(--bb-bg)] disabled:opacity-50"
              >
                Lưu bìa
              </button>
            </div>
          </div>

          {/* Xem trước (phải / dưới) — BB-290 (#38): thu nhỏ TRỌN khung theo
              tỉ lệ thật của thiết bị, có nút đổi máy tính / điện thoại. Trước
              đây `zoom: 0.7` lồng với một lớp `scale-[1.428]` bên trong —
              nghịch đảo gần đúng nhau nên ảnh xem trước bị cắt ngang thay vì
              thu gọn. Cách mới: khung ngoài cố định theo TỈ LỆ thiết bị, bên
              trong render `BiaBoAnh` ở kích thước THẬT của thiết bị (1440×900
              hoặc 390×844 — trùng khổ chụp ảnh của phép thử BB-290) rồi
              `scale()` toàn bộ khung đó vừa khít chiều ngang của khung xem
              trước bằng đơn vị container-query (`cqw`), nên không còn phép
              tính tay dễ lệch. */}
          {/* BB-294 (#9) — nền khung xem trước trước đây `bg-gray-100`
              (#F3F4F6, xám lạnh Tailwind mặc định) lệch hẳn tông kem của
              thương hiệu (#fdfbf9 / `--bb-bg`, xem LUAT-DOT-8.md). */}
          <div className="relative shrink-0 bg-[var(--bb-bg)] dark:bg-gray-900 md:w-1/2 md:flex-1 flex flex-col items-center justify-center gap-3 overflow-hidden p-4">
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
              className="relative overflow-hidden rounded-md border border-[var(--bb-border)] bg-white shadow-sm"
              style={{
                containerType: "size",
                width: thietBiXemTruoc === "may-tinh" ? "100%" : "min(100%, 260px)",
                // BB-308 (vòng 4, mục #5 báo cáo chấm 28/09/2026) — "dải
                // trắng thừa bên phải" ĐÃ BẮT ĐƯỢC gốc từ BB-296 mục #2
                // (chú thích cũ): `container-type: size` + `100cqw` làm tròn
                // độ phóng xuống một phần rất nhỏ dưới tỉ lệ thật ở một số bề
                // rộng cửa sổ — nội dung 1440px co hụt vài phần trăm pixel so
                // với khung 640px, để lộ đúng nền TRẮNG của khung (`bg-white`
                // ở div này) thành một sợi/dải mỏng bên phải, nơi
                // `overflow-hidden` không có gì để cắt vì nội dung đã HỤT chứ
                // không TRÀN. Sửa tại gốc: phóng dư một phần rất nhỏ
                // (`+ 0.002`, dưới 1 phần nghìn — không thấy được bằng mắt)
                // để mọi sai số làm tròn luôn rơi về phía TRÀN thay vì HỤT —
                // phần tràn đó mới bị `overflow-hidden` cắt sạch, không còn
                // lộ nền trắng. Không đổi maxWidth (vẫn 640px, an toàn như
                // BB-296 đã chốt).
                maxWidth: thietBiXemTruoc === "may-tinh" ? "640px" : "260px",
                aspectRatio: thietBiXemTruoc === "may-tinh" ? "16 / 10" : "9 / 19.5",
              }}
            >
              <div
                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                style={
                  thietBiXemTruoc === "may-tinh"
                    ? {
                        width: "1440px",
                        height: "900px",
                        // BB-313 mục 3 — `100cqw / 1440` chia MỘT CHIỀU DÀI cho
                        // MỘT SỐ THUẦN (không đơn vị): kết quả vẫn là MỘT CHIỀU
                        // DÀI. `scale()` đòi một SỐ THUẦN, và CSS không cho
                        // cộng chiều dài với số thuần (`+ 0.002` phía sau) —
                        // toàn bộ `calc()` này KHÔNG HỢP LỆ, trình duyệt bỏ
                        // qua cả khai báo `transform`, khung xem trước render
                        // ĐÚNG KÍCH THƯỚC THẬT (1440×900/390×844) rồi bị
                        // `overflow-hidden` của khung ngoài cắt cụt — chỉ còn
                        // thấy đúng góc trên-trái, đúng lỗi "chữ đè kín ảnh,
                        // ảnh bị đẩy sang mép phải/chữ mất hẳn" trong ảnh chụp
                        // app thật (Đợt 9). Bám dữ liệu, không đoán: kiểm bằng
                        // `getComputedStyle(...).transform` trong phép thử e2e
                        // (`tests/e2e/bb-313-chi-tiet-va-bia.spec.ts`) đo được
                        // đúng `"none"` trước khi sửa dòng này. Sửa: chia cho
                        // MỘT CHIỀU DÀI (`1440px`, không phải số thuần `1440`)
                        // — chiều dài chia chiều dài ra ĐÚNG một số thuần, để
                        // cộng `+ 0.002` hợp lệ.
                        transform: "scale(calc(100cqw / 1440px + 0.002))",
                        // Xem chú thích dài ở bia-bo-anh.tsx
                        // (`--bb-bia-khung-cao`): dùng CHO CẢ khối ảnh máy
                        // tính (chặn dải trắng thừa, chấm lại 28/09/2026 —
                        // bìa trước đó chỉ cao ~40% khung) lẫn khối ảnh điện
                        // thoại (chặn mất chữ) — đặt biến này để ghim đúng
                        // 900px, đúng khung đang vẽ.
                        ["--bb-bia-khung-cao" as string]: "900px",
                      }
                    : {
                        width: "390px",
                        height: "844px",
                        // Cùng lỗi/cùng sửa như nhánh máy tính ở trên — chia
                        // cho `390px` (chiều dài), không phải `390` (số thuần).
                        transform: "scale(calc(100cqw / 390px + 0.002))",
                        ["--bb-bia-khung-cao" as string]: "844px",
                      }
                }
              >
                <BiaBoAnh
                  anhBia={anhBiaNhap ? { id: anhBiaNhap } : null}
                  coverHeadline={tieuDe}
                  coverLayout={layout}
                  tenBe={tenBeHienThi}
                  // BB-308 (vòng 4, mục #5) — `detail.createdAt` không tồn
                  // tại trên `Detail` thật (gallery-detail.tsx) nên luôn
                  // `undefined`: ngày chụp trên khung xem trước luôn trống.
                  // `shootDate` là ngày chụp THẬT, đúng trường màn khách dùng.
                  ngayChup={detail.shootDate ?? null}
                  sessionType={detail.sessionType ?? null}
                  chiNhanh={detail.branchName ?? "BabyBean"}
                  loiChao={loi}
                  soAnh={detail.photoCount}
                  hanMuc={detail.includedQuota}
                  daChon={detail.selectedCount}
                  hanChot={null}
                  khoa={false}
                  onBatDau={() => {}}
                  placeholderChuaCoAnh="Chọn một tấm bên trái"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}






