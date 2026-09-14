/**
 * Màn chi tiết bộ ảnh cho CSKH: thành phần hợp đồng, hạn mức, chốt đơn, PIN.
 *
 * OWNER: DEV-FE. Task BB-103.
 * Spec: docs/16 mục 3.3 và mục 4
 *
 * ---------------------------------------------------------------------------
 * Mọi thao tác đổi hạn mức đều hỏi lại bằng CON SỐ
 * ---------------------------------------------------------------------------
 * Hạn mức là tổng số lượng các dòng `Edit file`. Sửa một dòng như thế là đổi số
 * ảnh khách được chọn miễn phí, mà khách đang nhìn con số đó trên màn hình của
 * họ ngay lúc này.
 *
 * API trả về hạn mức trước và sau, nên hộp thoại hỏi được "15 sẽ thành 25" chứ
 * không phải "bạn có chắc không". Câu hỏi chung chung thì ai cũng bấm qua.
 *
 * ---------------------------------------------------------------------------
 * Màn hình không phải ranh giới an ninh
 * ---------------------------------------------------------------------------
 * Nút sửa bị ẩn khi bộ ảnh đã chốt, nhưng route API mới là chỗ chặn thật — nó
 * trả GALLERY_LOCKED bất kể giao diện hiện gì.
 */

"use client";

import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { isGalleryLocked, GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { PAYMENT_METHODS } from "@/lib/payment-methods";

interface Component {
  id: string;
  name: string;
  kind: string;
  quantity: number;
}

interface Item {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  totalPrice: number | null;
  components: Component[];
}

interface Revision {
  round: number;
  note: string;
  reviewed_url: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface CatalogProduct {
  id: string;
  name: string;
  kind: string;
}

interface Detail {
  galleryId: string;
  title: string;
  status: string;
  contractCodes: string[];
  extraPhotoPrice: number;
  quotaKnown: boolean;
  includedQuota: number | null;
  totalValue: number;
  selectedCount: number;
  shareLink: { id: string; requiresPin: boolean } | null;
  items: Item[];
  revisions: Revision[];
  catalog: CatalogProduct[];
  finalDriveUrl: string | null;
  photoCount: number;
  dueAmount: number;
  paidAmount: number;
  outstanding: number;
}

export function GalleryDetail({ galleryId }: { galleryId: string }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [linkMoi, setLinkMoi] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/admin/galleries/${galleryId}/items`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error?.message ?? "Không tải được bộ ảnh");
      return;
    }
    setDetail(json.data);
  }, [galleryId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!detail) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  const locked = isGalleryLocked(detail.status);

  /** Gửi một thay đổi dòng hàng, hỏi lại nếu hạn mức đổi. */
  async function changeItem(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/items`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không lưu được");
        return;
      }
      const { quotaBefore, quotaAfter } = json.data;
      if (quotaBefore !== quotaAfter) {
        setNotice(
          `Hạn mức đã đổi: ${quotaBefore ?? "chưa biết"} → ${quotaAfter ?? "chưa biết"} ảnh. ` +
            "Nhớ báo lại cho khách.",
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function togglePin() {
    if (!detail?.shareLink) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/share-links/${detail.shareLink.id}/pin`, {
        method: detail.shareLink.requiresPin ? "DELETE" : "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không đổi được PIN");
        return;
      }
      // Mã chỉ hiện MỘT LẦN — hệ thống chỉ lưu bản băm. Đọc cho khách ngay.
      setNotice(
        json.data.pin
          ? `Mã PIN: ${json.data.pin} — đọc cho khách ngay, hệ thống không hiện lại.`
          : "Đã tắt PIN cho link này.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmSubmission() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/confirm`, { method: "POST" });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã xác nhận, bộ ảnh chuyển sang giai đoạn chỉnh ảnh."
          : (json?.error?.message ?? "Không xác nhận được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** CSKH chuyển thư mục ảnh đã chỉnh cho khách: in_retouch → chờ khách duyệt. */
  async function sendRetouched(url: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/retouch-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalDriveUrl: url }),
      });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã gửi. Bộ ảnh chuyển sang chờ khách duyệt — nhắn cho khách vào link xem."
          : (json?.error?.message ?? "Không gửi được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Mở lại cho khách chọn tiếp. Bắt buộc có lý do — route API cũng bắt. */
  async function reopen(reason: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã mở lại. Khách chọn ảnh tiếp được — nhớ báo cho khách."
          : (json?.error?.message ?? "Không mở lại được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Tạo link gửi khách. Link hiện ĐÚNG MỘT LẦN — cơ sở dữ liệu chỉ giữ bản băm.
   *
   * Giữ trong state riêng chứ không nhét vào `notice`: nhắn thông báo nào khác
   * cũng ghi đè `notice`, mà mất link thì phải tạo lại từ đầu.
   */
  async function taoLink() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không tạo được link");
        return;
      }
      // Ghép tên miền ở phía trình duyệt: máy chủ không biết chắc khách vào
      // bằng tên miền nào, đoán sai thì CSKH gửi đi một link chết.
      setLinkMoi(`${window.location.origin}${json.data.duongDan}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Thêm một dòng hàng tay. Hỏi lại bằng con số nếu hạn mức đổi. */
  async function addItem(productId: string, quantity: number) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không thêm được");
        return;
      }
      const { quotaBefore, quotaAfter } = json.data;
      if (quotaBefore !== quotaAfter) {
        setNotice(
          `Hạn mức đã đổi: ${quotaBefore ?? "chưa biết"} → ${quotaAfter ?? "chưa biết"} ảnh. ` +
            "Nhớ báo lại cho khách.",
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Ghi nhận đã thu tiền. Ghi thêm dòng, không sửa đè — bảng là sổ. */
  async function recordPayment(amount: number, method: string, note: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không ghi nhận được");
        return;
      }
      const left = json.data.outstanding as number;
      setNotice(
        left > 0
          ? `Đã ghi. Còn thiếu ${formatCurrencyVND(left)}.`
          : left < 0
            ? `Đã ghi. Khách trả DƯ ${formatCurrencyVND(-left)} — kiểm tra lại giúp.`
            : "Đã ghi. Khách đã trả đủ.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const overCount = detail.quotaKnown && detail.includedQuota !== null
    ? Math.max(0, detail.selectedCount - detail.includedQuota)
    : null;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold">{detail.title}</h1>
        {detail.contractCodes.length > 0 && (
          <p className="mt-1 select-all font-mono text-xs text-[var(--bb-fg-muted)]">
            {detail.contractCodes.join(" + ")}
          </p>
        )}
      </header>

      {notice && (
        <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">{notice}</p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trạng thái" value={GALLERY_STATUS_LABEL[detail.status] ?? detail.status} />
        <Stat
          label="Hạn mức"
          value={detail.quotaKnown ? String(detail.includedQuota) : "chưa biết"}
        />
        <Stat label="Khách đã chọn" value={String(detail.selectedCount)} />
        <Stat
          label="Vượt hạn mức"
          value={
            overCount === null
              ? "—"
              : overCount === 0
                ? "0"
                : `${overCount} ảnh · ${formatCurrencyVND(overCount * detail.extraPhotoPrice)}`
          }
        />
      </section>

      {!detail.quotaKnown && (
        <p className="rounded-md border border-[var(--bb-warning)] p-3 text-sm">
          Bộ ảnh này <strong>chưa rõ hạn mức</strong>, nên khách <strong>không chọn ảnh
          được</strong>. Thêm dòng <em>Edit file</em> bên dưới với số ảnh trong gói, hoặc
          bổ sung bên Lark rồi đồng bộ lại.
        </p>
      )}

      {(detail.dueAmount !== 0 || detail.paidAmount !== 0) && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Tiền phát sinh</h2>
          <p className="mt-1 text-sm">
            Phải thu <strong>{formatCurrencyVND(detail.dueAmount)}</strong> · đã thu{" "}
            <strong>{formatCurrencyVND(detail.paidAmount)}</strong> ·{" "}
            {detail.outstanding > 0 ? (
              <span className="text-[var(--bb-danger)]">
                còn thiếu <strong>{formatCurrencyVND(detail.outstanding)}</strong>
              </span>
            ) : detail.outstanding < 0 ? (
              <span className="text-[var(--bb-danger)]">
                khách trả DƯ <strong>{formatCurrencyVND(-detail.outstanding)}</strong>
              </span>
            ) : (
              <span>đã trả đủ</span>
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
            Tiền thu ngoài app. Đây chỉ là chỗ đánh dấu đã thu. Ghi sai thì ghi thêm
            một dòng trừ kèm lý do — dòng cũ không sửa được.
          </p>
          <PaymentForm
            disabled={busy}
            suggested={detail.outstanding > 0 ? detail.outstanding : 0}
            onSubmit={(a, m, n) => void recordPayment(a, m, n)}
          />
        </section>
      )}

      <section>
        <h2 className="text-base font-medium">Thành phần hợp đồng</h2>
        {detail.items.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
            Chưa có dòng hàng nào. Nhập mã hợp đồng rồi chạy đồng bộ, hoặc thêm tay.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {detail.items.map((item) => (
              <li key={item.id} className="rounded-md border border-[var(--bb-border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {item.name} <span className="text-[var(--bb-fg-muted)]">×{item.quantity}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {item.totalPrice !== null && (
                      <span className="text-sm">{formatCurrencyVND(item.totalPrice)}</span>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeItem("DELETE", { itemId: item.id })}
                        className="text-xs text-[var(--bb-danger)] underline"
                      >
                        bỏ
                      </button>
                    )}
                  </span>
                </div>

                {item.components.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 pl-4">
                    {item.components.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {c.name} <span className="text-[var(--bb-fg-muted)]">×{c.quantity}</span>
                          {c.kind === "edited_photo" && (
                            <span className="ml-2 text-xs text-[var(--bb-fg-muted)]">
                              (đây là hạn mức ảnh)
                            </span>
                          )}
                        </span>
                        {!locked && c.kind === "edited_photo" && (
                          <QuantityEditor
                            value={c.quantity}
                            disabled={busy}
                            onSubmit={(q) =>
                              void changeItem("PATCH", { itemId: c.id, quantity: q })
                            }
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {!locked && detail.catalog.length > 0 && (
          <AddItemForm
            catalog={detail.catalog}
            disabled={busy}
            // Bộ ảnh chưa rõ hạn mức thì thứ CSKH cần thêm gần như luôn là
            // dòng ảnh chỉnh sửa — chọn sẵn giúp.
            preferKind={detail.quotaKnown ? undefined : "edited_photo"}
            onSubmit={(id, q) => void addItem(id, q)}
          />
        )}
      </section>

      {(detail.status === "in_retouch" ||
        detail.status === "awaiting_approval" ||
        detail.revisions.length > 0) && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Vòng duyệt ảnh đã chỉnh</h2>

          {/* Vòng đang mở nằm TRÊN CÙNG, không nằm dưới lịch sử. Người chỉnh ảnh
              mở màn này để biết phải làm gì, không phải để đọc lại lịch sử. */}
          {detail.revisions
            .filter((r) => r.resolved_at === null)
            .map((r) => (
              <p
                key={r.round}
                className="mt-3 rounded-md border border-[var(--bb-warning)] p-3 text-sm"
              >
                <strong>Khách yêu cầu sửa (vòng {r.round}):</strong> {r.note}
              </p>
            ))}

          {detail.status === "in_retouch" && (
            <RetouchSender
              defaultUrl={detail.finalDriveUrl ?? ""}
              disabled={busy}
              onSubmit={(u) => void sendRetouched(u)}
            />
          )}

          {detail.status === "awaiting_approval" && (
            <p className="mt-3 text-sm text-[var(--bb-fg-muted)]">
              Đã gửi khách, đang chờ khách duyệt. Khách bấm duyệt thì bộ ảnh chuyển sang
              in; khách yêu cầu sửa thì quay lại đây kèm lời nhắn.
            </p>
          )}

          {detail.revisions.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--bb-fg-muted)]">
                Lịch sử yêu cầu sửa ({detail.revisions.length} vòng)
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {detail.revisions.map((r) => (
                  <li key={r.round} className="text-sm">
                    <span className="text-[var(--bb-fg-muted)]">
                      Vòng {r.round} · {new Date(r.created_at).toLocaleDateString("vi-VN")}
                      {r.resolved_at ? " · đã xử lý" : " · đang chờ"}
                    </span>
                    <br />
                    {r.note}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {(detail.status === "expired" || detail.status === "submitted") && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Mở lại cho khách chọn tiếp</h2>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
            {detail.status === "expired"
              ? "Bộ ảnh đã quá hạn nên khách không thao tác được nữa."
              : "Khách đã chốt nhưng chưa xác nhận. Mở lại nếu khách muốn đổi ý."}
          </p>
          <ReopenForm disabled={busy} onSubmit={(r) => void reopen(r)} />
        </section>
      )}

      <section className="rounded-lg border border-[var(--bb-border)] p-4">
        <h2 className="text-base font-medium">Link gửi khách</h2>

        {linkMoi ? (
          <div className="mt-3">
            <p className="text-sm">
              Sao link này dán vào cột <em>link app</em> bên Lark. Đóng màn hình là
              <strong> không xem lại được</strong> — hệ thống không lưu link, chỉ lưu bản băm.
            </p>
            <textarea
              readOnly
              rows={2}
              value={linkMoi}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Link gửi khách"
              className="mt-2 w-full select-all rounded border border-[var(--bb-border)] p-2 font-mono text-xs"
            />
          </div>
        ) : (
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
            {detail.shareLink
              ? "Bộ ảnh đã có link đang dùng. Tạo link mới sẽ thu hồi link cũ — dùng khi nghi link cũ lọt ra ngoài."
              : detail.photoCount === 0
                ? "Chưa có ảnh nào. Đồng bộ ảnh từ Drive xong rồi hãy tạo link."
                : "Chưa có link nào cho bộ ảnh này."}
          </p>
        )}

        <button
          type="button"
          disabled={busy || detail.photoCount === 0}
          onClick={() => void taoLink()}
          className="mt-3 rounded-md bg-[var(--bb-accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {detail.shareLink ? "Tạo link mới (thu hồi link cũ)" : "Tạo link gửi khách"}
        </button>
      </section>

      <section className="flex flex-wrap gap-3">
        {detail.shareLink && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void togglePin()}
            className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm"
          >
            {detail.shareLink.requiresPin ? "Tắt mã PIN" : "Bật mã PIN"}
          </button>
        )}

        {detail.status === "submitted" && (
          <div className="flex flex-col gap-2">
            {/* Báo, KHÔNG chặn. Máy không quyết thay người ở bước này — nhưng
                để CSKH bấm qua mà không thấy con số thì đúng bằng không có. */}
            {detail.outstanding > 0 && (
              <p className="rounded-md border border-[var(--bb-warning)] p-3 text-sm">
                Khách còn thiếu <strong>{formatCurrencyVND(detail.outstanding)}</strong>.
                Thu xong thì ghi nhận ở mục <em>Tiền phát sinh</em> phía trên rồi hãy
                chuyển giai đoạn.
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmSubmission()}
              className="rounded-md bg-[var(--bb-accent)] px-3 py-2 text-sm text-white"
            >
              Xác nhận và chuyển sang chỉnh ảnh
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Ô sửa số lượng: nhập rồi bấm lưu, không tự gửi theo từng ký tự. */
function QuantityEditor({
  value,
  disabled,
  onSubmit,
}: {
  value: number;
  disabled?: boolean;
  onSubmit: (quantity: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);

  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= 1;

  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        name="quantity"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        className="w-16 rounded border border-[var(--bb-border)] px-2 py-1 text-sm"
        aria-label="Số ảnh trong gói"
      />
      <button
        type="button"
        disabled={disabled || !valid || parsed === value}
        onClick={() => onSubmit(parsed)}
        className="text-xs underline disabled:opacity-40"
      >
        lưu
      </button>
    </span>
  );
}

/**
 * Ô nhập link thư mục ảnh đã chỉnh.
 *
 * Nút gửi TẮT khi ô trống. Route API cũng chặn, nhưng để bấm được rồi mới báo
 * lỗi thì nhân viên đã kịp nghĩ là mình gửi xong.
 */
function RetouchSender({
  defaultUrl,
  disabled,
  onSubmit,
}: {
  defaultUrl: string;
  disabled?: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = React.useState(defaultUrl);
  // Chỉ là để bật/tắt nút. Route API mới kiểm thật — màn hình không phải
  // ranh giới an ninh.
  const trimmed = url.trim();
  const valid = trimmed.startsWith("http") && trimmed.length > 12 && !trimmed.includes(" ");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="url"
        name="finalDriveUrl"
        value={url}
        disabled={disabled}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link thư mục ảnh đã chỉnh"
        aria-label="Link thư mục ảnh đã chỉnh"
        className="min-w-64 flex-1 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
      />
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(trimmed)}
        className="rounded-md bg-[var(--bb-accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
      >
        Gửi file đã chỉnh cho khách
      </button>
    </div>
  );
}

/**
 * Ô ghi lý do mở lại.
 *
 * Không có nút "mở lại" trần. Mở lại là đảo ngược một quyết định của khách, và
 * sáu tháng sau câu hỏi "sao bộ này mở lại" chỉ trả lời được nếu lúc đó có
 * người viết vào.
 */
function ReopenForm({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const trimmed = reason.trim();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="reason"
        maxLength={500}
        value={reason}
        disabled={disabled}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do mở lại (khách xin thêm thời gian…)"
        aria-label="Lý do mở lại"
        className="min-w-64 flex-1 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
      />
      <button
        type="button"
        disabled={disabled || trimmed.length === 0}
        onClick={() => onSubmit(trimmed)}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Mở lại cho khách chọn
      </button>
    </div>
  );
}

/**
 * Ô ghi nhận đã thu tiền.
 *
 * Số tiền điền sẵn bằng số còn thiếu — trường hợp thường gặp nhất là khách trả
 * đúng số còn thiếu, và bắt CSKH gõ lại con số đang hiện ngay phía trên là cách
 * chắc chắn để thỉnh thoảng gõ nhầm.
 */
function PaymentForm({
  disabled,
  suggested,
  onSubmit,
}: {
  disabled?: boolean;
  suggested: number;
  onSubmit: (amount: number, method: string, note: string) => void;
}) {
  const [amount, setAmount] = React.useState(suggested > 0 ? String(suggested) : "");
  const [method, setMethod] = React.useState("tien_mat");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    setAmount(suggested > 0 ? String(suggested) : "");
  }, [suggested]);

  const parsed = Number(amount);
  const amountOk = Number.isInteger(parsed) && parsed !== 0;
  // Dòng trừ tiền bắt buộc có lý do — route cũng chặn.
  const valid = amountOk && (parsed > 0 || note.trim().length > 0);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">
        Số tiền
        <input
          type="number"
          name="amount"
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value)}
          className="w-36 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Hình thức
        <select
          name="method"
          value={method}
          disabled={disabled}
          onChange={(e) => setMethod(e.target.value)}
          className="rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        Ghi chú
        <input
          type="text"
          name="note"
          maxLength={500}
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          placeholder={parsed < 0 ? "Bắt buộc: lý do trừ tiền" : "Mã giao dịch, ghi chú…"}
          className="rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(parsed, method, note.trim())}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Ghi nhận đã thu
      </button>
    </div>
  );
}

/** Tên tiếng Việt của loại sản phẩm. */
const KIND_LABEL: Record<string, string> = {
  shoot_package: "Gói chụp",
  edited_photo: "Ảnh chỉnh sửa",
  print: "Hàng in",
  addon: "Mua thêm",
  service: "Dịch vụ",
};

/**
 * Thêm một dòng hàng tay.
 *
 * Màn hình từ trước vẫn bảo CSKH "thêm dòng Edit file bên dưới" và "thêm tay"
 * mà KHÔNG có nút nào để làm — đường POST có sẵn, giao diện thiếu. Chín bộ ảnh
 * đang bị chặn vì chưa rõ hạn mức và CSKH không có cách gỡ. Bảo người ta làm
 * một việc rồi không đưa chỗ để làm là cách chắc chắn để họ đi sửa thẳng cơ sở
 * dữ liệu.
 */
function AddItemForm({
  catalog,
  disabled,
  preferKind,
  onSubmit,
}: {
  catalog: CatalogProduct[];
  disabled?: boolean;
  preferKind?: string;
  onSubmit: (productId: string, quantity: number) => void;
}) {
  const macDinh = React.useMemo(
    () => catalog.find((p) => p.kind === preferKind)?.id ?? catalog[0]?.id ?? "",
    [catalog, preferKind],
  );
  const [productId, setProductId] = React.useState(macDinh);
  const [qty, setQty] = React.useState("1");

  React.useEffect(() => setProductId(macDinh), [macDinh]);

  const parsed = Number(qty);
  const valid = productId !== "" && Number.isInteger(parsed) && parsed >= 1;

  const theoLoai = React.useMemo(() => {
    const nhom = new Map<string, CatalogProduct[]>();
    for (const p of catalog) {
      const list = nhom.get(p.kind) ?? [];
      list.push(p);
      nhom.set(p.kind, list);
    }
    return [...nhom.entries()];
  }, [catalog]);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--bb-border)] pt-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs">
        Thêm dòng hàng
        <select
          name="productId"
          value={productId}
          disabled={disabled}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
        >
          {theoLoai.map(([kind, items]) => (
            <optgroup key={kind} label={KIND_LABEL[kind] ?? kind}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Số lượng
        <input
          type="number"
          min={1}
          name="quantity"
          value={qty}
          disabled={disabled}
          onChange={(e) => setQty(e.target.value)}
          className="w-20 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(productId, parsed)}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Thêm
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--bb-border)] p-3">
      <div className="text-xs text-[var(--bb-fg-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
