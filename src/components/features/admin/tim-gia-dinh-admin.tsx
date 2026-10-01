"use client";

/**
 * BB-345 — phía CSKH của "tim gia đình" và "đặt chỉnh sửa".
 *
 *   · `TimGiaDinhBlock`: khối nhỏ ở chi tiết bộ ảnh — "Gia đình thả tim: N tấm",
 *     danh sách tên tệp, nút tải danh sách (GET /api/admin/galleries/[id]/tim-gia-dinh).
 *   · `NutXuLyDatChinhSua`: nút đổi trạng thái một yêu cầu chỉnh sửa trong ngăn
 *     "Khách gửi ảnh chọn" — dùng route PATCH sẵn có của yêu cầu mua thêm
 *     (BB-249), không có route mới.
 *
 * Chưa áp migration 0083 (`chuaApMigration`) hoặc chưa có tim nào → khối ẩn.
 */

import React from "react";
import { formatSo } from "@/lib/utils/dinh-dang";

interface AnhTim {
  photoId: string;
  fileName: string;
  soNguoi: number;
}

export function TimGiaDinhBlock({ galleryId }: { galleryId: string }) {
  const [anh, setAnh] = React.useState<AnhTim[] | null>(null);
  const [moRong, setMoRong] = React.useState(false);
  const co = encodeURIComponent(galleryId);

  React.useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/galleries/${co}/tim-gia-dinh`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!huy && json?.data && !json.data.chuaApMigration) setAnh(json.data.anh ?? []);
      } catch {
        // Mạng lỗi — khối phụ, không chặn màn chi tiết.
      }
    })();
    return () => {
      huy = true;
    };
  }, [co]);

  if (!anh || anh.length === 0) return null;
  const hien = moRong ? anh : anh.slice(0, 12);

  return (
    <section className="rounded-lg border border-[var(--bb-border)] p-4" data-testid="khoi-tim-gia-dinh">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium">Gia đình thả tim: {formatSo(anh.length)} tấm</h2>
        <a
          href={`/api/admin/galleries/${co}/tim-gia-dinh?xuat=1`}
          download
          className="inline-flex h-8 items-center rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium hover:bg-[var(--bb-surface-2)]"
        >
          Tải danh sách tên tệp
        </a>
      </div>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Người được ba mẹ mời thả tim — chưa phải ảnh trong gói. Gợi ý gọi gia đình đặt chỉnh sửa hoặc mua thêm.
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="ds-tim-gia-dinh">
        {hien.map((a) => (
          <li key={a.photoId} className="rounded-full border border-[var(--bb-border)] px-2.5 py-0.5 text-xs">
            {a.fileName}
            {a.soNguoi > 1 && <span className="ml-1 text-[var(--bb-fg-muted)]">×{a.soNguoi}</span>}
          </li>
        ))}
      </ul>
      {anh.length > 12 && (
        <button
          type="button"
          onClick={() => setMoRong((v) => !v)}
          className="mt-2 text-xs underline underline-offset-2"
        >
          {moRong ? "Thu gọn" : `Xem đủ ${formatSo(anh.length)} tấm`}
        </button>
      )}
    </section>
  );
}

const NUT_THEO_TRANG_THAI: Record<string, { trangThai: string; nhan: string; hoi?: string }[]> = {
  moi: [
    { trangThai: "da_lien_he", nhan: "Đã gọi gia đình" },
    { trangThai: "huy", nhan: "Huỷ", hoi: "Huỷ yêu cầu chỉnh sửa này?" },
  ],
  da_lien_he: [
    { trangThai: "da_chot", nhan: "Đã chốt" },
    { trangThai: "huy", nhan: "Huỷ", hoi: "Huỷ yêu cầu chỉnh sửa này?" },
  ],
};

/** Nút đổi trạng thái một yêu cầu chỉnh sửa — PATCH sẵn có của BB-249. */
export function NutXuLyDatChinhSua({
  galleryId,
  yeuCauId,
  trangThai,
  canConfirm,
  onDone,
}: {
  galleryId: string;
  yeuCauId: string;
  trangThai: string;
  canConfirm: boolean;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const nuts = NUT_THEO_TRANG_THAI[trangThai] ?? [];
  if (!canConfirm) {
    return <p className="text-xs text-[var(--bb-fg-muted)]">Bạn không có quyền đổi trạng thái — cần quyền sửa bộ ảnh.</p>;
  }

  async function doi(moi: string, hoi?: string) {
    if (hoi && !window.confirm(hoi)) return;
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(
        `/api/admin/galleries/${encodeURIComponent(galleryId)}/mua-them/${encodeURIComponent(yeuCauId)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trangThai: moi }) },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không đổi được trạng thái, thử lại giúp.");
        return;
      }
      await onDone();
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nuts.map((n) => (
        <button
          key={n.trangThai}
          type="button"
          disabled={busy}
          data-testid={`nut-chinh-sua-${n.trangThai}`}
          onClick={() => void doi(n.trangThai, n.hoi)}
          className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium transition hover:bg-[var(--bb-surface-2)] disabled:opacity-40"
        >
          {busy ? "Đang lưu…" : n.nhan}
        </button>
      ))}
      {loi && <span className="text-xs text-[var(--bb-danger)]">{loi}</span>}
    </div>
  );
}
