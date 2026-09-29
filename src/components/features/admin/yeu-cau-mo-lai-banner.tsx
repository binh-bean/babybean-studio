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
 * BB-321 — "Mở lại cho khách" LUÔN có nút chạy được ở nơi trạng thái cho phép
 * ---------------------------------------------------------------------------
 * Chủ studio báo 29/09/2026: khách xin mở lại mà CSKH không có nút mở, chỉ có
 * "Từ chối". Nguyên nhân: nút chỉ hiện ở `expired`/`submitted`. Nay dùng chung
 * `luaChonMoLai` (src/lib/gallery/dot-chon.ts) với route `/reopen`:
 *   · `submitted`, `expired`, `in_retouch` → có nút; ở `in_retouch` có cảnh báo
 *     hậu kỳ có thể đã chỉnh và ô chọn ĐỢT cần mở (mặc định đợt khoá gần nhất);
 *   · `delivered` và các trạng thái còn lại → KHÔNG nút chết: banner giải thích
 *     vì sao, và khách muốn thêm ảnh thì mua đợt mới (mục "Chọn thêm ảnh").
 */

"use client";

import React from "react";
import { formatGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";
import { luaChonMoLai, type DotTomTat } from "@/lib/gallery/dot-chon";

export interface ReopenRequestChiTiet {
  trangThai: "khong_co" | "cho_xu_ly" | "da_mo" | "bi_tu_choi";
  lucGuiGanNhat: string | null;
  lyDoKhach: string | null;
  lyDoTuChoi: string | null;
  lucXuLy: string | null;
  lanThu: number;
  /** BB-321 — đợt khách nói muốn đổi (nếu có). */
  dotXin?: number | null;
}

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
  cacDot = [],
  onDone,
}: {
  galleryId: string;
  status: string;
  canReopen: boolean;
  reopenRequest: ReopenRequestChiTiet | null | undefined;
  /** BB-321 — các đợt mua thêm (từ 2) của bộ ảnh, để hiện ô chọn đợt cần mở lại. */
  cacDot?: ReadonlyArray<DotTomTat>;
  onDone: () => void | Promise<void>;
}) {
  const lua = luaChonMoLai(status, cacDot);
  const [dotChon, setDotChon] = React.useState<number>(lua.dotMacDinh);
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
    // Khách nói rõ đợt nào thì chọn sẵn đợt đó (nếu còn mở lại được); không thì đợt gần nhất.
    const dotKhach = reopenRequest?.dotXin;
    setDotChon(
      dotKhach && luaChonMoLai(status, cacDot).cacDot.some((d) => d.soDot === dotKhach)
        ? dotKhach
        : luaChonMoLai(status, cacDot).dotMacDinh,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đặt lại khi yêu cầu đổi
  }, [reopenRequest?.lucGuiGanNhat]);

  if (!reopenRequest || reopenRequest.trangThai !== "cho_xu_ly") return null;

  const coTheMoTrucTiep = lua.duoc;
  const dotHopLe = lua.cacDot.some((d) => d.soDot === dotChon) ? dotChon : lua.dotMacDinh;

  async function xacNhanMo() {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: lyDoMo.trim(), dot: dotHopLe }),
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
          {lua.canhBao && (
            <p
              data-testid="canh-bao-mo-lai-hau-ky"
              className="mb-2 rounded-md border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 p-2.5 text-sm"
            >
              {lua.canhBao}
            </p>
          )}
          {lua.cacDot.length > 1 && (
            <div className="mb-2">
              <label className="text-xs text-[var(--bb-fg-muted)]" htmlFor="dot-mo-lai">
                Mở lại đợt nào
              </label>
              <select
                id="dot-mo-lai"
                name="dotMoLai"
                value={dotHopLe}
                onChange={(e) => setDotChon(Number(e.target.value))}
                disabled={busy}
                className="mt-1 w-full rounded border border-[var(--bb-border)] bg-[var(--bb-bg)] p-2 text-sm"
              >
                {lua.cacDot.map((d) => (
                  <option key={d.soDot} value={d.soDot}>
                    {d.nhan}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <p data-testid="giai-thich-khong-mo-lai" className="text-xs text-[var(--bb-fg-muted)]">
              {lua.lyDoKhong} Bấm &ldquo;Từ chối&rdquo; kèm lời nhắn để khách biết cách làm tiếp.
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
