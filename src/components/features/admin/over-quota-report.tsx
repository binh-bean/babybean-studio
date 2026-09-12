/**
 * Báo cáo: bộ ảnh đã chọn vượt hạn mức mà chưa thu tiền.
 *
 * OWNER: DEV-FE. Task BB-120.
 * Spec: docs/15 mục 6.3
 *
 * ---------------------------------------------------------------------------
 * Con số này là SÀN, và màn hình phải nói ra điều đó
 * ---------------------------------------------------------------------------
 * Đây là con số dùng để đòi tiền khách. Chỉ cần một khách phản bác đúng một
 * lần là không ai dám mở bảng này nữa. Nên hai điều dưới đây hiện NGAY CẠNH số
 * tiền, không giấu trong tài liệu:
 *
 *   - Bộ ảnh chưa biết hạn mức KHÔNG vào báo cáo, nhưng được đếm riêng. Không
 *     đếm riêng thì người đọc tưởng những bộ đó không nợ gì.
 *   - Bộ ảnh khách chưa chọn xong thì chưa tính.
 *
 * ---------------------------------------------------------------------------
 * Mã hợp đồng là chỗ bấu víu
 * ---------------------------------------------------------------------------
 * Bộ ảnh nhập từ Lark đang che tên và số điện thoại khách (docs/16 mục 7.3),
 * nên mã hợp đồng là thứ duy nhất tra ngược được sang Lark. Cột đó phải chọn
 * và sao chép được, đừng cắt ngắn.
 */

"use client";

import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";

interface ReportItem {
  galleryId: string;
  galleryTitle: string;
  branchName: string;
  contractCode: string | null;
  shootDate: string | null;
  quota: number | null;
  selectedCount: number;
  overCount: number;
  addonCount: number;
  unbilledCount: number;
  unbilledAmount: number;
}

interface ReportSummary {
  albumCount: number;
  unbilledPhotoCount: number;
  totalUnbilledAmount: number;
  missingQuotaCount: number;
}

export function OverQuotaReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [items, setItems] = React.useState<ReportItem[]>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/over-quota");
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error?.message ?? "Không tải được báo cáo");
          return;
        }
        setSummary(json.data.summary);
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
  }, []);

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải báo cáo…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!summary) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Ảnh đã giao vượt hạn mức chưa thu tiền</h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Bộ ảnh khách đã chọn nhiều hơn số ảnh đã trả tiền, và chưa mua thêm.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bộ ảnh" value={String(summary.albumCount)} />
        <Stat label="Ảnh chưa thu" value={String(summary.unbilledPhotoCount)} />
        <Stat
          label="Tiền chưa thu"
          value={formatCurrencyVND(summary.totalUnbilledAmount)}
          emphasis
        />
        <Stat
          label="Chưa rõ hạn mức"
          value={String(summary.missingQuotaCount)}
          hint="không nằm trong số tiền bên cạnh"
        />
      </section>

      {/* Câu này đứng ngay dưới con số, không nằm trong chú thích cuối trang. */}
      <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
        Số tiền trên là <strong>mức tối thiểu</strong>. Bộ ảnh chưa rõ hạn mức và bộ
        khách chưa chọn xong đều không được tính vào đây.
        {summary.missingQuotaCount > 0 && (
          <>
            {" "}
            Hiện có <strong>{summary.missingQuotaCount}</strong> bộ chưa rõ hạn mức —
            bổ sung dòng <em>Edit file</em> bên Lark thì chúng sẽ vào báo cáo.
          </>
        )}
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Chưa có bộ ảnh nào vượt hạn mức mà chưa thu tiền.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left">
                <Th>Mã hợp đồng</Th>
                <Th>Chi nhánh</Th>
                <Th>Ngày chụp</Th>
                <Th className="text-right">Hạn mức</Th>
                <Th className="text-right">Đã chọn</Th>
                <Th className="text-right">Đã mua thêm</Th>
                <Th className="text-right">Chưa thu</Th>
                <Th className="text-right">Thành tiền</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.galleryId} className="border-b border-[var(--bb-border)]">
                  {/* select-all để CSKH bôi đen một phát rồi dán vào ô tìm kiếm bên Lark */}
                  <td className="select-all py-2 pr-3 font-mono text-xs">
                    {it.contractCode ?? "—"}
                  </td>
                  <td className="py-2 pr-3">{it.branchName}</td>
                  <td className="py-2 pr-3">{formatDate(it.shootDate)}</td>
                  <td className="py-2 pr-3 text-right">{it.quota ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{it.selectedCount}</td>
                  <td className="py-2 pr-3 text-right">{it.addonCount}</td>
                  <td className="py-2 pr-3 text-right font-medium">{it.unbilledCount}</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrencyVND(it.unbilledAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN");
}
