/**
 * Khối "Đợt chọn" ở trang chi tiết bộ ảnh + nút xử lý dùng chung với hàng đợi
 * "Việc cần xử lý".
 *
 * OWNER: DEV-FE. Task BB-321. Chủ studio 29/09/2026: sau khi đợt 1 chốt và được
 * xác nhận, khách MUA THÊM ảnh theo từng đợt (đợt 2, 3, …). CSKH cần thấy:
 *   · "Khách mua thêm đợt N: X ảnh · Y ₫" kèm hai nút Xác nhận / Từ chối (lý do);
 *   · ảnh theo TỪNG đợt, và xem + chép danh sách "chỉ đợt N" cho thợ chỉnh ảnh (BB-403: hiện trên trang, không tải tệp).
 *
 * Tách THÀNH COMPONENT RIÊNG (không viết thẳng vào `gallery-detail.tsx`): cùng
 * lý do với `yeu-cau-mo-lai-banner.tsx` — file đó đang được nhiều đội sửa. File
 * này chỉ nhận dữ liệu qua props (route `/items` đã tính `dotChon`) và báo
 * `onDone` để trang cha tải lại.
 *
 * Không đẩy đợt lên Lark thật: CSKH cập nhật hợp đồng bên Lark bằng tay (BB-313
 * cho sửa "Thành phần hợp đồng" ngay trong app, ví dụ nâng Edit file 15 → 16).
 */

"use client";

import React from "react";
import { formatGioVN, formatNgayVN, formatSo } from "@/lib/utils/dinh-dang";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { moDanhSachDot } from "@/lib/gallery/danh-sach-theo-dot";

export interface DotQuanTriView {
  soDot: number;
  laDot1: boolean;
  trangThai: "cho_xac_nhan" | "da_xac_nhan" | "tu_choi" | "da_mo_lai" | null;
  soAnh: number;
  soAnhTinhTien: number;
  giaMoiAnh: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  /** BB-321 — số sản phẩm in khách chốt mà chưa gắn ảnh (khách đã tick biết ảnh chậm hơn). */
  soSanPhamInChuaAnh?: number;
  lyDoTuChoi: string | null;
  lyDoMoLai: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  confirmedAt: string | null;
  xuLyAt: string | null;
  anh: Array<{ photoId: string; fileName: string }>;
  sanPham: Array<{ ten: string; soLuong: number; photoId: string | null }>;
}

const NHAN_TRANG_THAI: Record<string, string> = {
  cho_xac_nhan: "Chờ xác nhận",
  da_xac_nhan: "Đã xác nhận",
  tu_choi: "Đã từ chối — ảnh trả về cho khách",
  da_mo_lai: "Đã mở lại — ảnh trả về cho khách",
};

function gioNgay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatGioVN(d)} · ${formatNgayVN(iso)}`;
}

/** Cờ khách để lại lúc chốt ĐỢT 1 (route `/items` → `chotDot1`). */
export interface ChotDot1View {
  nhoStudioChonThem: number;
  dongYAnhStudioChon: boolean;
  soSanPhamInChuaAnh: number;
  bietAnhInChamHon: boolean;
}

/**
 * Hai việc khách giao cho studio lúc chốt đợt 1, hiện NỔI ở đầu trang chi tiết bộ ảnh
 * (chủ studio 29/09/2026):
 *   · "Khách nhờ studio chọn thêm N ảnh" (đã tick đồng ý ảnh studio chọn dùm, không đổi lại);
 *   · "Còn N sản phẩm in chưa chọn ảnh" (đã tick biết nhận ảnh sẽ lâu hơn timeline).
 * Tự ẩn khi không có gì.
 */
export function GhiChuChotDot1({ chotDot1 }: { chotDot1: ChotDot1View | null | undefined }) {
  if (!chotDot1 || (chotDot1.nhoStudioChonThem <= 0 && chotDot1.soSanPhamInChuaAnh <= 0)) return null;
  return (
    <section
      data-testid="ghi-chu-chot-dot-1"
      className="rounded-lg border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 p-4"
    >
      <h2 className="text-sm font-medium">Khách để lại việc cho studio ở đợt 1</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {chotDot1.nhoStudioChonThem > 0 && (
          <li data-testid="nho-studio-chon-them">
            <strong>Khách nhờ studio chọn thêm {chotDot1.nhoStudioChonThem} ảnh</strong>
            {chotDot1.dongYAnhStudioChon && (
              <span className="text-[var(--bb-fg-muted)]"> — đã đồng ý với ảnh studio chọn dùm và không đổi lại.</span>
            )}
          </li>
        )}
        {chotDot1.soSanPhamInChuaAnh > 0 && (
          <li data-testid="san-pham-in-chua-anh">
            <strong>Còn {chotDot1.soSanPhamInChuaAnh} sản phẩm in chưa chọn ảnh</strong>
            {chotDot1.bietAnhInChamHon && (
              <span className="text-[var(--bb-fg-muted)]"> — khách đã biết nhận ảnh sẽ lâu hơn timeline.</span>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}

/** Dòng tóm tắt đúng câu chủ studio đặt: "Khách mua thêm đợt N: X ảnh · Y ₫". */
export function dongTomTatDot(d: { soDot: number; soAnh: number; tong: number }): string {
  return `Khách mua thêm đợt ${d.soDot}: ${formatSo(d.soAnh)} ảnh · ${formatCurrencyVND(d.tong)}`;
}

/**
 * Hai nút "Xác nhận" / "Từ chối (lý do)" của một đợt đang chờ. Dùng ở thẻ trên
 * trang chi tiết VÀ ở hàng đợi — một chỗ gọi API, hai chỗ hiển thị.
 */
export function NutXuLyDot({
  galleryId,
  soDot,
  canConfirm,
  onDone,
}: {
  galleryId: string;
  soDot: number;
  canConfirm: boolean;
  onDone: () => void | Promise<void>;
}) {
  const [dangTuChoi, setDangTuChoi] = React.useState(false);
  const [lyDo, setLyDo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);

  async function goi(duoi: "xac-nhan" | "tu-choi", body?: unknown) {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(
        `/api/admin/galleries/${encodeURIComponent(galleryId)}/dot-chon/${soDot}/${duoi}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không xử lý được, thử lại giúp");
        return;
      }
      await onDone();
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    } finally {
      setBusy(false);
    }
  }

  if (!canConfirm) {
    return (
      <p className="text-xs text-[var(--bb-fg-muted)]">
        Bạn không có quyền xác nhận đợt này — cần quyền sửa bộ ảnh.
      </p>
    );
  }

  return (
    <div data-testid={`nut-xu-ly-dot-${soDot}`}>
      {loi && <p className="mb-2 text-sm text-[var(--bb-danger)]">{loi}</p>}
      {dangTuChoi ? (
        <div>
          <label className="text-xs text-[var(--bb-fg-muted)]" htmlFor={`ly-do-tu-choi-dot-${soDot}`}>
            Lý do từ chối — khách SẼ ĐỌC được dòng này
          </label>
          <textarea
            id={`ly-do-tu-choi-dot-${soDot}`}
            name="lyDoTuChoiDot"
            rows={2}
            value={lyDo}
            maxLength={500}
            onChange={(e) => setLyDo(e.target.value)}
            disabled={busy}
            placeholder="Ví dụ: tấm này đã in xong trong đợt trước, ba mẹ chọn tấm khác giúp em nhé"
            className="mt-1 w-full rounded border border-[var(--bb-border)] p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || lyDo.trim().length === 0}
              onClick={() => void goi("tu-choi", { lyDo: lyDo.trim() })}
              className="rounded-md border border-[var(--bb-danger)] px-3 py-1.5 text-sm text-[var(--bb-danger)] disabled:opacity-40"
            >
              {busy ? "Đang gửi…" : "Xác nhận từ chối"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDangTuChoi(false)}
              className="text-xs text-[var(--bb-fg-muted)] underline"
            >
              Huỷ
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void goi("xac-nhan")}
            className="rounded-md bg-[var(--bb-fg)] px-3 py-1.5 text-sm text-[var(--bb-bg)] disabled:opacity-40"
          >
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDangTuChoi(true)}
            className="rounded-md border border-[var(--bb-border)] px-3 py-1.5 text-sm text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)] disabled:opacity-40"
          >
            Từ chối (lý do)
          </button>
        </div>
      )}
    </div>
  );
}

/** Khối "Đợt chọn" trên trang chi tiết bộ ảnh. Tự ẩn khi chưa có đợt mua thêm nào. */
export function DotChonQuanTri({
  galleryId,
  dotChon,
  canConfirm,
  onDone,
}: {
  galleryId: string;
  dotChon: DotQuanTriView[] | null | undefined;
  canConfirm: boolean;
  onDone: () => void | Promise<void>;
}) {
  if (!dotChon || dotChon.length === 0) return null;
  const choXacNhan = dotChon.filter((d) => d.trangThai === "cho_xac_nhan");

  return (
    <section
      id="dot-chon"
      data-testid="dot-chon-quan-tri"
      className="scroll-mt-6 rounded-lg border border-[var(--bb-border)] p-4"
    >
      <h2 className="text-base font-medium">Đợt chọn</h2>
      <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
        Tóm tắt từng đợt khách chọn. Đợt 2 trở đi là ảnh khách mua thêm — thợ chỉnh ảnh chỉ cần làm
        đợt mới. Danh sách tên tệp xem và chép ở khối &ldquo;Xuất danh sách&rdquo; bên phải, phía dưới
        (bấm &ldquo;Xem danh sách đợt N&rdquo; để nhảy tới đúng đợt). Cập nhật hợp đồng bên Lark bằng tay sau khi xác nhận.
      </p>

      {choXacNhan.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3" data-testid="dot-cho-xac-nhan">
          {choXacNhan.map((d) => (
            <li
              key={d.soDot}
              data-testid={`the-dot-${d.soDot}`}
              className="rounded-lg border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 p-3"
            >
              <p className="text-sm font-medium">{dongTomTatDot(d)}</p>
              <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
                {d.submittedByName ? `${d.submittedByName} · ` : ""}
                {gioNgay(d.submittedAt)}
                {d.soAnhTinhTien > 0 && ` · ${formatSo(d.soAnhTinhTien)} ảnh tính tiền (${formatCurrencyVND(d.tienAnh)})`}
                {d.tienSanPham > 0 && ` · sản phẩm ${formatCurrencyVND(d.tienSanPham)}`}
              </p>
              {(d.soSanPhamInChuaAnh ?? 0) > 0 && (
                <p className="mt-1 text-xs font-medium">
                  Còn {d.soSanPhamInChuaAnh} sản phẩm in chưa chọn ảnh (khách đã biết ảnh sẽ lâu hơn timeline)
                </p>
              )}
              <div className="mt-3">
                <NutXuLyDot galleryId={galleryId} soDot={d.soDot} canConfirm={canConfirm} onDone={onDone} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-4 flex flex-col gap-4">
        {dotChon.map((d) => (
          <li key={d.soDot} data-testid={`dot-${d.soDot}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {d.laDot1 ? "Đợt 1 · ảnh trong gói" : `Đợt ${d.soDot} · mua thêm`}
                <span className="ml-2 text-xs font-normal text-[var(--bb-fg-muted)]">
                  {d.laDot1 ? "" : NHAN_TRANG_THAI[d.trangThai ?? ""] ?? ""}
                </span>
              </p>
              <span className="text-xs text-[var(--bb-fg-muted)] tabular-nums">
                {formatSo(d.soAnh)} ảnh{!d.laDot1 && ` · ${formatCurrencyVND(d.tong)}`}
              </span>
            </div>

            {d.trangThai === "tu_choi" && d.lyDoTuChoi && (
              <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">Lý do từ chối: {d.lyDoTuChoi}</p>
            )}
            {d.trangThai === "da_mo_lai" && d.lyDoMoLai && (
              <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">Lý do mở lại: {d.lyDoMoLai}</p>
            )}

            {d.sanPham.length > 0 && (
              <p className="mt-2 text-xs text-[var(--bb-fg-muted)]">
                Sản phẩm: {d.sanPham.map((s) => `${s.ten} ×${s.soLuong}`).join(", ")}
              </p>
            )}

            {d.anh.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {/* BB-403 (anh 08/10): không tải tệp — mở danh sách đúng đợt ngay ở khối "Xuất danh sách". */}
                <button
                  type="button"
                  onClick={() => moDanhSachDot(d.soDot)}
                  data-testid={`xem-danh-sach-dot-${d.soDot}`}
                  className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-2.5 py-1 text-xs hover:bg-[var(--bb-surface-2)]"
                >
                  Xem danh sách đợt {d.soDot}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Tab "Khách gửi ảnh chọn" ở /admin/viec-can-xu-ly: xem `khach-gui-anh-chon-report.tsx` (BB-337).
