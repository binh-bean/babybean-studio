/**
 * Báo cáo: link gửi khách sắp hết hạn, và đã hết hạn.
 *
 * OWNER: DEV-FE. Task BB-186.
 *
 * ---------------------------------------------------------------------------
 * Bảng này để GỌI ĐIỆN, không phải để đọc
 * ---------------------------------------------------------------------------
 * Chủ studio hỏi: *"khi hết hạn có ai nhận được thông báo không, CSKH có biết
 * trên giao diện không?"* — trước bản vá thì không, cả hai.
 *
 * Nên bảng này xếp theo thứ tự việc phải làm trước: link đã chết đứng đầu, rồi
 * tới link chết trong tuần này. Mỗi dòng có đủ thứ để nhấc máy lên gọi ngay —
 * tên nhà, số điện thoại bấm được — và một đường sang màn chi tiết, nơi có nút
 * *Mở khoá link cũ* của BB-188.
 *
 * ---------------------------------------------------------------------------
 * Hai thứ cố ý KHÔNG có ở đây
 * ---------------------------------------------------------------------------
 * **Không có mã link.** Sau khi bỏ PIN, chuỗi đó là thứ duy nhất che ảnh của
 * một nhà; sáu ký tự đầu đủ để đối chiếu khi khách đọc link qua điện thoại.
 *
 * **Không có nút Mở khoá hàng loạt.** Mở lại link là mở lại cho bất kỳ ai đang
 * cầm chuỗi đó. Một nút mở cả trăm nhà bằng một cú bấm là thứ chỉ cần bấm nhầm
 * một lần.
 */

"use client";

import React from "react";
import Link from "next/link";

interface Item {
  shareLinkId: string;
  galleryId: string;
  galleryTitle: string;
  branchName: string | null;
  contractCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  tokenPrefix: string | null;
  viewCount: number;
  createdAt: string;
  expiresAt: string;
  conLaiNgay: number;
  daChet: boolean;
}

interface Tong {
  daChet: number;
  trong7Ngay: number;
  tatCa: number;
  chuaAiMo: number;
}

const CUA_SO = [7, 14, 30, 60];

export function LinkSapHetHanReport() {
  const [soNgay, setSoNgay] = React.useState(14);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tong, setTong] = React.useState<Tong | null>(null);
  const [items, setItems] = React.useState<Item[]>([]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/reports/link-sap-het-han?soNgay=${soNgay}`);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error?.message ?? "Không tải được báo cáo");
          return;
        }
        setError(null);
        setTong(json.data.tong);
        setItems(json.data.items);
      } catch {
        if (alive) setError("Mất kết nối, thử lại giúp.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [soNgay]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Link gửi khách sắp hết hạn</h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Hạn đếm từ <strong>ngày cấp link</strong>, không phải ngày chụp. Hết hạn thì ba
          mẹ bấm vào thấy trang báo hết hạn — và không ai được báo trước, nên bảng này là
          chỗ duy nhất biết trước.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--bb-fg-muted)]">Nhìn trước:</span>
        {CUA_SO.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSoNgay(n)}
            className={
              n === soNgay
                ? "rounded-full bg-[var(--bb-accent)] px-3 py-1 text-white"
                : "rounded-full border border-[var(--bb-border)] px-3 py-1"
            }
          >
            {n} ngày
          </button>
        ))}
      </div>

      {tong && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Đã hết hạn"
            value={String(tong.daChet)}
            emphasis
            hint="ba mẹ đang không vào được"
          />
          <Stat label="Chết trong 7 ngày" value={String(tong.trong7Ngay)} />
          <Stat label="Tổng trong bảng" value={String(tong.tatCa)} />
          <Stat
            label="Khách chưa mở lần nào"
            value={String(tong.chuaAiMo)}
            hint="cả bộ có thể chưa ai trong nhà nhìn thấy"
          />
        </section>
      )}

      {loading ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải báo cáo…</p>
      ) : error ? (
        <p className="text-sm text-[var(--bb-danger)]">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Không có link nào hết hạn trong {soNgay} ngày tới. Thử cửa sổ dài hơn nếu muốn
          nhìn xa.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left">
                <Th>Tình trạng</Th>
                <Th>Khách</Th>
                <Th>Điện thoại</Th>
                <Th>Bộ ảnh</Th>
                <Th>Chi nhánh</Th>
                <Th>Mã hợp đồng</Th>
                <Th className="text-right">Đã mở</Th>
                <Th>Hạn</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.shareLinkId} className="border-b border-[var(--bb-border)]">
                  <td className="py-2 pr-3">
                    <span
                      className="inline-block rounded-full border px-2 py-0.5 text-xs"
                      style={{
                        borderColor: it.daChet
                          ? "var(--bb-danger)"
                          : it.conLaiNgay <= 7
                            ? "var(--bb-warning)"
                            : "var(--bb-border)",
                      }}
                    >
                      {it.daChet
                        ? `chết ${Math.abs(it.conLaiNgay)} ngày`
                        : `còn ${it.conLaiNgay} ngày`}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/galleries/${it.galleryId}`}
                      className="underline underline-offset-2"
                    >
                      {it.customerName ?? "—"}
                    </Link>
                  </td>
                  {/* Bấm được: CSKH mở bảng này trên điện thoại ở quầy. */}
                  <td className="py-2 pr-3">
                    {it.customerPhone ? (
                      <a
                        href={`tel:${it.customerPhone}`}
                        className="underline underline-offset-2"
                      >
                        {it.customerPhone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">{it.galleryTitle}</td>
                  <td className="py-2 pr-3">{it.branchName ?? "—"}</td>
                  <td className="select-all py-2 pr-3 font-mono text-xs">
                    {it.contractCode ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">{it.viewCount}</td>
                  <td className="py-2 pr-3">{ngay(it.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
        Bấm tên khách để sang màn chi tiết bộ ảnh. Ở đó có nút{" "}
        <strong>Mở khoá link cũ</strong> — nó <strong>giữ nguyên địa chỉ</strong>, nên biểu
        tượng ba mẹ đã lưu ngoài màn hình điện thoại vẫn dùng được. Đừng bấm{" "}
        <em>Tạo link mới</em> cho việc này: nó đổi địa chỉ và làm biểu tượng đó chết.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--bb-border)] p-3">
      <div className="text-xs text-[var(--bb-fg-muted)]">{label}</div>
      <div className={emphasis ? "mt-1 text-lg font-semibold" : "mt-1 text-lg"}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--bb-fg-muted)]">{hint}</div>}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 pr-3 font-medium ${className ?? ""}`}>{children}</th>;
}

function ngay(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}
