/**
 * Khối nổi bật ở ĐẦU TRANG chi tiết bộ ảnh — hiện khi ba mẹ đang có một yêu
 * cầu "xin mở lại" CHƯA XỬ LÝ.
 *
 * OWNER: DEV-FE. Task BB-312 (P0, chủ studio 28/09/2026): quy trình "khách xin
 * mở lại" phải có phản hồi ở CẢ HAI phía. Trước bản vá này, yêu cầu chỉ hiện
 * MỘT DÒNG lẫn trong "Dòng thời gian hoạt động" — không chỗ nổi bật, không nút
 * xử lý, nên không ai trả lời khách.
 *
 * Tách THÀNH COMPONENT RIÊNG (không viết thẳng vào `gallery-detail.tsx`): một
 * đội khác đang sửa file đó trong cùng đợt này — xem ghi chú ở chỗ gắn
 * component (`GalleryDetail`). File này CHỈ đọc `reopenRequest` đã có sẵn
 * trong `Detail` (route `/api/admin/galleries/[id]/items` đã tính), tự gọi
 * hai route xử lý, rồi báo `onDone` để trang cha tải lại — không cần
 * `gallery-detail.tsx` biết gì thêm về logic bên trong.
 *
 * ---------------------------------------------------------------------------
 * "Mở lại cho khách" chỉ hoạt động ở hai trạng thái
 * ---------------------------------------------------------------------------
 * Route `/reopen` (đã có từ BB-122) chỉ đảo trạng thái từ `expired`/`submitted`
 * — KHÔNG mở được từ `in_retouch` trở đi (công của thợ chỉnh ảnh đã đổ vào
 * danh sách cũ, xem chú thích đầu file route đó). Ba mẹ có thể xin mở lại ở
 * BẤT KỲ trạng thái đã khoá nào (route `/api/g/xin-sua-lai` cho phép), nên nút
 * "Mở lại cho khách" ở đây CHỈ hiện khi trạng thái thật sự mở được — các
 * trường hợp còn lại chỉ còn "Từ chối" kèm lý do, và CSKH tự xử lý ngoài app
 * nếu thật sự cần mở (giới hạn có sẵn của hệ thống, không phải phạm vi task
 * này để sửa).
 */

"use client";

import React from "react";
import { formatGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";

export interface ReopenRequestChiTiet {
  trangThai: "khong_co" | "cho_xu_ly" | "da_mo" | "bi_tu_choi";
  lucGuiGanNhat: string | null;
  lyDoKhach: string | null;
  lyDoTuChoi: string | null;
  lucXuLy: string | null;
  lanThu: number;
}

const TRANG_THAI_MO_LAI_DUOC = new Set(["expired", "submitted"]);

function gioNgay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatGioVN(d)} · ${formatNgayVN(iso)}`;
}

export function YeuCauMoLaiBanner({
  galleryId,
  status,
  canReopen,
  reopenRequest,
  onDone,
}: {
  galleryId: string;
  status: string;
  canReopen: boolean;
  reopenRequest: ReopenRequestChiTiet | null | undefined;
  onDone: () => void | Promise<void>;
}) {
  const [dangMo, setDangMo] = React.useState(false);
  const [dangTuChoi, setDangTuChoi] = React.useState(false);
  const [lyDoMo, setLyDoMo] = React.useState("");
  const [lyDoTuChoi, setLyDoTuChoi] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Yêu cầu đổi (vd trang tải lại sau khi xử lý xong) — đóng hai form phụ,
    // không giữ lại chữ đã gõ cho một yêu cầu khác.
    setDangMo(false);
    setDangTuChoi(false);
    setLyDoMo("");
    setLyDoTuChoi("");
    setLoi(null);
  }, [reopenRequest?.lucGuiGanNhat]);

  if (!reopenRequest || reopenRequest.trangThai !== "cho_xu_ly") return null;

  const coTheMoTrucTiep = TRANG_THAI_MO_LAI_DUOC.has(status);

  async function xacNhanMo() {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: lyDoMo.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không mở lại được");
        return;
      }
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  async function xacNhanTuChoi() {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/reopen/tu-choi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyDo: lyDoTuChoi.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không gửi được");
        return;
      }
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="yeu-cau-mo-lai-banner"
      className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger)]/10 p-4"
    >
      <p className="text-sm font-medium text-[var(--bb-fg)]">
        Ba mẹ xin mở lại để sửa
        {reopenRequest.lucGuiGanNhat && <> · lúc {gioNgay(reopenRequest.lucGuiGanNhat)}</>}
        {" · lần thứ "}
        {reopenRequest.lanThu}
      </p>
      {reopenRequest.lyDoKhach && (
        <p className="mt-1.5 rounded-md bg-[var(--bb-surface)] p-2.5 text-sm italic">
          &ldquo;{reopenRequest.lyDoKhach}&rdquo;
        </p>
      )}

      {loi && <p className="mt-2 text-sm text-[var(--bb-danger)]">{loi}</p>}

      {!canReopen ? (
        <p className="mt-2 text-xs text-[var(--bb-fg-muted)]">
          Bạn không có quyền xử lý yêu cầu này — cần quyền &quot;Mở lại album đã chốt&quot;.
        </p>
      ) : dangMo ? (
        <div className="mt-3">
          <label className="text-xs text-[var(--bb-fg-muted)]" htmlFor="ly-do-mo-lai">
            Lý do mở lại (khách sẽ không thấy dòng này, chỉ để tra lại sau)
          </label>
          <textarea
            id="ly-do-mo-lai"
            rows={2}
            value={lyDoMo}
            onChange={(e) => setLyDoMo(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded border border-[var(--bb-border)] p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || lyDoMo.trim().length === 0}
              onClick={() => void xacNhanMo()}
              className="rounded-md bg-[var(--bb-fg)] px-3 py-1.5 text-sm text-[var(--bb-bg)] disabled:opacity-40"
            >
              {busy ? "Đang mở…" : "Xác nhận mở lại"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDangMo(false)}
              className="text-xs text-[var(--bb-fg-muted)] underline"
            >
              Huỷ
            </button>
          </div>
        </div>
      ) : dangTuChoi ? (
        <div className="mt-3">
          <label className="text-xs text-[var(--bb-fg-muted)]" htmlFor="ly-do-tu-choi">
            Lý do từ chối — khách SẼ ĐỌC được dòng này
          </label>
          <textarea
            id="ly-do-tu-choi"
            rows={2}
            value={lyDoTuChoi}
            onChange={(e) => setLyDoTuChoi(e.target.value)}
            disabled={busy}
            placeholder="Ví dụ: ảnh đã in xong, ba mẹ lấy tại studio giúp em nhé"
            className="mt-1 w-full rounded border border-[var(--bb-border)] p-2 text-sm"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || lyDoTuChoi.trim().length === 0}
              onClick={() => void xacNhanTuChoi()}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {coTheMoTrucTiep ? (
            <button
              type="button"
              onClick={() => {
                setLyDoMo(
                  reopenRequest.lyDoKhach
                    ? `Mở lại theo yêu cầu ba mẹ: ${reopenRequest.lyDoKhach}`
                    : "Mở lại theo yêu cầu ba mẹ",
                );
                setDangMo(true);
              }}
              className="rounded-md bg-[var(--bb-fg)] px-3 py-1.5 text-sm text-[var(--bb-bg)]"
            >
              Mở lại cho khách
            </button>
          ) : (
            <p className="text-xs text-[var(--bb-fg-muted)]">
              Bộ ảnh đã qua bước chỉnh ảnh — nút mở lại tự động không dùng được ở trạng thái này.
              Xử lý thủ công rồi bấm Từ chối kèm lý do nếu không mở được.
            </p>
          )}
          <button
            type="button"
            onClick={() => setDangTuChoi(true)}
            className="rounded-md border border-[var(--bb-border)] px-3 py-1.5 text-sm text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]"
          >
            Từ chối
          </button>
        </div>
      )}
    </section>
  );
}
