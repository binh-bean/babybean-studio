"use client";

/**
 * Khối "Yêu cầu mua thêm" trong màn chi tiết bộ ảnh quản trị — CSKH đổi
 * trạng thái từng yêu cầu ba mẹ gửi sau khi đã duyệt ảnh.
 *
 * OWNER: DEV-FE. Task BB-249. Tách khỏi `gallery-detail.tsx` (rất lớn) để
 * `gallery-detail.tsx` chỉ cần gọi `<YeuCauMuaThemBlock galleryId={...} />`.
 *
 * BB-245 dựng bảng + GET liệt kê (chỉ đọc). Ở đây thêm nút đổi trạng thái,
 * gọi `PATCH /api/admin/galleries/[id]/mua-them/[yeuCauId]`
 * (`src/app/api/admin/galleries/[id]/mua-them/[yeuCauId]/route.ts`).
 *
 * ---------------------------------------------------------------------------
 * Màn hình không phải ranh giới an ninh
 * ---------------------------------------------------------------------------
 * Nút hiện theo trạng thái đọc từ API, nhưng route PATCH mới là chỗ chặn
 * thật — nó tự kiểm chuyển hợp lệ và trả 409 CONFLICT bất kể giao diện hiện
 * nút gì. Lỗi trả về luôn hiện câu tiếng Việt sạch từ `error.message`
 * (fail() ở tầng API đã có sẵn thông điệp mặc định dễ đọc) — không bao giờ
 * hiện mã trần như "FORBIDDEN" hay "CONFLICT" lên màn hình.
 */

import React from "react";

interface Dong {
  id: string;
  productName: string | null;
  photoFileName: string | null;
  soLuong: number;
  ghiChu: string | null;
  trangThai: string;
  createdAt: string;
}

const NHAN_TRANG_THAI: Record<string, string> = {
  moi: "Mới gửi",
  da_lien_he: "Đã liên hệ",
  da_chot: "Đã chốt",
  huy: "Đã huỷ",
};

/** Màu nhãn trạng thái — dùng token có sẵn trong src/styles/tokens.css. */
const MAU_TRANG_THAI: Record<string, { bg: string; fg: string }> = {
  moi: { bg: "var(--bb-warning)", fg: "var(--bb-warning-fg)" },
  da_lien_he: { bg: "var(--bb-accent)", fg: "var(--bb-accent-fg)" },
  da_chot: { bg: "var(--bb-success)", fg: "var(--bb-success-fg)" },
  huy: { bg: "var(--bb-danger)", fg: "var(--bb-danger-fg)" },
};

/** Chuyển hợp lệ — khớp với `CHUYEN_HOP_LE` ở route PATCH. Chỉ để quyết định
 * nút nào hiện; route API mới là nơi chặn thật. */
const NUT_THEO_TRANG_THAI: Record<
  string,
  { trangThai: string; nhan: string; hoiTruocKhiLam?: string }[]
> = {
  moi: [
    { trangThai: "da_lien_he", nhan: "Đã gọi khách" },
    { trangThai: "huy", nhan: "Huỷ", hoiTruocKhiLam: "Huỷ yêu cầu mua thêm này?" },
  ],
  da_lien_he: [
    { trangThai: "da_chot", nhan: "Đã chốt" },
    { trangThai: "huy", nhan: "Huỷ", hoiTruocKhiLam: "Huỷ yêu cầu mua thêm này?" },
  ],
  da_chot: [],
  huy: [],
};

/**
 * BB-245/BB-249 — liệt kê và đổi trạng thái yêu cầu mua thêm ba mẹ gửi sau
 * khi đã duyệt ảnh.
 *
 * Bảng có thể chưa tồn tại trên môi trường chưa áp migration 0072; lỗi
 * 404/500 từ route GET thì im lặng ẩn khối này, không phải hỏng cả màn chi
 * tiết (giữ nguyên hành vi BB-245).
 */
export function YeuCauMuaThemBlock({ galleryId }: { galleryId: string }) {
  const [items, setItems] = React.useState<Dong[] | null>(null);
  const [dangXuLy, setDangXuLy] = React.useState<string | null>(null);
  const [loi, setLoi] = React.useState<Record<string, string>>({});

  // `huy` (biến cờ đóng effect) khác nghĩa với trạng thái "huy" của yêu cầu —
  // đây là quy ước AbortController-lite dùng chung trong gallery-detail.tsx.
  const dongRef = React.useRef(false);

  const taiLai = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/mua-them`);
      if (!res.ok) return; // Bảng chưa áp migration hoặc không có quyền — im lặng ẩn khối.
      const json = await res.json().catch(() => null);
      if (!dongRef.current) setItems(json?.data?.items ?? []);
    } catch {
      // Mạng lỗi — không chặn phần còn lại của màn chi tiết.
    }
  }, [galleryId]);

  React.useEffect(() => {
    dongRef.current = false;
    void taiLai();
    return () => {
      dongRef.current = true;
    };
  }, [taiLai]);

  async function doiTrangThai(yeuCauId: string, trangThaiMoi: string, hoiTruocKhiLam?: string) {
    if (hoiTruocKhiLam && !window.confirm(hoiTruocKhiLam)) return;

    setDangXuLy(yeuCauId);
    setLoi((cu) => ({ ...cu, [yeuCauId]: "" }));
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/mua-them/${yeuCauId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trangThai: trangThaiMoi }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi((cu) => ({
          ...cu,
          [yeuCauId]: json?.error?.message ?? "Không đổi được trạng thái, thử lại giúp em",
        }));
        return;
      }
      await taiLai();
    } catch {
      setLoi((cu) => ({ ...cu, [yeuCauId]: "Không kết nối được, thử lại giúp em" }));
    } finally {
      setDangXuLy(null);
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--bb-border)] p-4">
      <h2 className="text-base font-medium">Yêu cầu mua thêm ({items.length})</h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Ba mẹ gửi sau khi đã duyệt ảnh. Chưa tính vào hợp đồng — gọi lại chốt giá và thanh toán.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((d) => {
          const mau = MAU_TRANG_THAI[d.trangThai] ?? { bg: "var(--bb-border)", fg: "var(--bb-fg)" };
          const nuts = NUT_THEO_TRANG_THAI[d.trangThai] ?? [];
          return (
            <li key={d.id} className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{d.productName ?? "—"}</strong> ×{d.soLuong}
                  {d.photoFileName ? ` · ${d.photoFileName}` : ""}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: mau.bg, color: mau.fg }}
                >
                  {NHAN_TRANG_THAI[d.trangThai] ?? d.trangThai}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
                {new Date(d.createdAt).toLocaleString("vi-VN")}
              </p>
              {d.ghiChu && <p className="mt-1 text-xs">{d.ghiChu}</p>}

              {nuts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {nuts.map((nut) => (
                    <button
                      key={nut.trangThai}
                      type="button"
                      disabled={dangXuLy === d.id}
                      onClick={() => void doiTrangThai(d.id, nut.trangThai, nut.hoiTruocKhiLam)}
                      className="rounded-full border border-[var(--bb-border)] px-3 py-1 text-xs font-medium transition hover:bg-[var(--bb-surface-2)] disabled:opacity-40"
                    >
                      {dangXuLy === d.id ? "Đang lưu…" : nut.nhan}
                    </button>
                  ))}
                </div>
              )}
              {loi[d.id] && <p className="mt-1.5 text-xs text-[var(--bb-danger)]">{loi[d.id]}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
