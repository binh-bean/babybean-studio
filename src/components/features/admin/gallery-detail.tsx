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
}

const LOCKED = ["submitted", "in_retouch", "delivered", "archived"];

export function GalleryDetail({ galleryId }: { galleryId: string }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

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

  const locked = LOCKED.includes(detail.status);

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
        <Stat label="Trạng thái" value={detail.status} />
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmSubmission()}
            className="rounded-md bg-[var(--bb-accent)] px-3 py-2 text-sm text-white"
          >
            Xác nhận và chuyển sang chỉnh ảnh
          </button>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--bb-border)] p-3">
      <div className="text-xs text-[var(--bb-fg-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
