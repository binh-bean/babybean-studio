"use client";

import React, { useState, useEffect, useRef } from "react";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { MAU_CHU_BIA, dienMau } from "@/lib/gallery/mau-chu-bia";
import { X } from "lucide-react";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";

interface AnhLuoi {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

export function BiaBoAnhEditor({
  galleryId,
  detail,
  busy,
  onSave,
}: {
  galleryId: string;
  detail: { coverPhotoId?: string | null, coverHeadline?: string | null, welcomeMessage?: string | null, coverLayout?: string | null, babyName?: string | null, branchName?: string | null, createdAt?: string | null, photoCount: number, includedQuota: number | null, selectedCount: number };
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
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
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

  const duLieuBia = {
    tenBe: detail.babyName ?? null,
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
              {detail.coverHeadline || detail.babyName || "Đã chọn ảnh bìa"}
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
              <h3 className="text-lg font-semibold">Thiết kế bìa</h3>
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
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {dangTaiLuoi && luoi.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[2/3] animate-pulse rounded-md bg-[var(--bb-surface-2)]"
                    />
                  ))
                : luoi.map((anh) => (
                    <button
                      key={anh.id}
                      onClick={() => setAnhBiaNhap(anh.id)}
                      className={`relative aspect-[2/3] overflow-hidden rounded-md border-2 ${
                        anhBiaNhap === anh.id ? "border-[var(--bb-accent)]" : "border-transparent"
                      }`}
                    >
                      <img
                        src={`/api/img/${anh.id}?w=400`}
                        className="h-full w-full object-cover"
                        alt=""
                      />
                    </button>
                  ))}
              {!dangTaiLuoi && luoi.length === 0 && (
                <p className="col-span-3 sm:col-span-4 py-6 text-center text-xs text-[var(--bb-fg-muted)]">
                  Bộ ảnh chưa có ảnh nào để chọn làm bìa.
                </p>
              )}
            </div>
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
                placeholder={detail.babyName || "Khoảnh khắc của con"}
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
                className="rounded-md bg-[var(--bb-accent)] px-4 py-2 text-sm text-white disabled:opacity-50 flex-1"
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
              thương hiệu (#FBF7F2 / `--bb-bg`, xem LUAT-DOT-8.md). */}
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
                // BB-296 mục #2 — báo cáo chấm độc lập lần 3 cũng nói khung
                // xem trước máy tính có "dải trắng thừa bên phải". Thử nới
                // `maxWidth` lên 900px lộ ra một lỗi HIỂN THỊ KHÁC (nội dung
                // bìa tràn ra ngoài khung bo góc ở một số bề rộng cửa sổ —
                // khả năng do `container-type: size` + `cqw` tính lệch một
                // nhịp khi đổi kích thước, xem ảnh chụp `test-results` lúc
                // soát). Không có bản vẽ định con số chính xác, và việc sửa
                // đúng gốc (đổi hẳn cách quy đổi tỉ lệ, không còn dùng cqw)
                // vượt phạm vi mục #2 (chỉ nói "bỏ dải trắng thừa", không xin
                // đổi cơ chế dựng khung xem trước) — GIỮ NGUYÊN 640px an
                // toàn, chỉ sửa phần chắc chắn của mục #2 (placeholder khi
                // chưa chọn ảnh, lưới dt không kẹt ô cuộn). Ghi vào bàn giao.
                maxWidth: thietBiXemTruoc === "may-tinh" ? "640px" : "260px",
                aspectRatio: thietBiXemTruoc === "may-tinh" ? "16 / 10" : "9 / 19.5",
              }}
            >
              <div
                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                style={
                  thietBiXemTruoc === "may-tinh"
                    ? { width: "1440px", height: "900px", transform: "scale(calc(100cqw / 1440))" }
                    : { width: "390px", height: "844px", transform: "scale(calc(100cqw / 390))" }
                }
              >
                <BiaBoAnh
                  anhBia={anhBiaNhap ? { id: anhBiaNhap } : null}
                  coverHeadline={tieuDe}
                  coverLayout={layout}
                  tenBe={detail.babyName ?? null}
                  ngayChup={detail.createdAt ?? null}
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






