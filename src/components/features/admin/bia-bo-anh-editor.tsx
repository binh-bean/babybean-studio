"use client";

import React, { useState, useEffect } from "react";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { MAU_CHU_BIA, dienMau } from "@/lib/gallery/mau-chu-bia";
import { X } from "lucide-react";

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

  useEffect(() => {
    if (!moEditor) return;
    document.body.style.overflow = "hidden";
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoEditor(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEscape);
    };
  }, [moEditor]);
  
  const [anhBiaNhap, setAnhBiaNhap] = useState(detail.coverPhotoId);
  const [tieuDe, setTieuDe] = useState(detail.coverHeadline ?? "");
  const [loi, setLoi] = useState(detail.welcomeMessage ?? "");
  const [layout, setLayout] = useState(detail.coverLayout ?? "ben-canh");

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
      <h2 className="text-base font-medium">Bìa bộ ảnh</h2>
      <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
        Thiết kế bìa album, với lưới chọn ảnh và xem trước toàn phần.
      </p>
      
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={openEditor}
          className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm"
        >
          Mở trình thiết kế bìa
        </button>
      </div>

      {moEditor && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-background md:flex-row overflow-hidden">
          {/* Lưới chọn ảnh (trái / trên) */}
          <div className="flex flex-1 flex-col overflow-y-auto border-r border-border p-4 md:w-1/2">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Thiết kế bìa</h3>
              <button onClick={() => setMoEditor(false)} className="p-2 border rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <h3 className="mb-2 text-md font-semibold mt-2">1. Chọn ảnh bìa</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {luoi.map((anh) => (
                <button
                  key={anh.id}
                  onClick={() => setAnhBiaNhap(anh.id)}
                  className={`relative aspect-[2/3] overflow-hidden rounded-md border-2 ${
                    anhBiaNhap === anh.id ? "border-[var(--bb-accent)]" : "border-transparent"
                  }`}
                >
                                    <img
                    src={`/api/img/${anh.id}?w=300`}
                    className="h-full w-full object-cover"
                    alt=""
                  />
                </button>
              ))}
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

            <h3 className="mb-2 mt-6 text-md font-semibold">2. Bố cục (Layout)</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "tap-chi", label: "Tạp chí" },
                { id: "toi-gian", label: "Tối giản" },
                { id: "ben-canh", label: "Bên cạnh" },
                { id: "de-cheo", label: "Để chéo" }
              ].map((l) => (
                <button
                  key={l.id}
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

          {/* Xem trước (phải / dưới) */}
          <div className="relative flex-1 bg-gray-100 dark:bg-gray-900 md:w-1/2 flex items-center justify-center overflow-hidden">
            <div className="absolute top-2 right-2 z-10 p-2 bg-white/50 backdrop-blur rounded text-xs">Xem trước</div>
            
            <div className="w-full h-full relative" style={{ zoom: 0.7 }}>
              <div className="absolute inset-0 origin-top scale-[1.428] w-[142.8%] h-[142.8%] pointer-events-none">
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
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}






