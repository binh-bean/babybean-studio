/**
 * Tab "Ảnh chỉnh sửa" ở /admin/viec-can-xu-ly (BB-371).
 *
 * Mỗi bộ ảnh một dòng: ảnh chỉnh mới về chờ CSKH kiểm rồi gửi khách, hoặc ba
 * mẹ vừa xin sửa. Bấm dòng mở đúng bộ ảnh — nơi có khối "Ảnh chỉnh sửa" để xem
 * từng tấm và bấm "Gửi khách duyệt".
 */

"use client";

import React from "react";
import Link from "next/link";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { CARD_TITLE_CLASS } from "./page-header";
import { formatNgayVN, formatSo } from "@/lib/utils/dinh-dang";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";
import { NhanNhaBoAnh } from "./nhan-nha-bo-anh";
import { NutNhanKhach } from "./nut-nhan-khach";
import { KhoiCongTacLamNhanh, NhanLamNhanh } from "./nhan-lam-nhanh";
import { xepLamNhanhLenDau } from "@/lib/dich-vu/lam-anh-nhanh";
import type { NhaCuaBo } from "@/lib/gia-dinh/nha-cua-bo";

interface DongViec {
  loai: "cho_gui" | "khach_sua";
  galleryId: string;
  title: string;
  soAnh: number;
  lan?: number;
  /** BB-377 — đợt mua thêm của dòng việc. */
  nhanDot?: string;
  khoa?: string;
  luc: string;
}

export function moTaViec(v: Pick<DongViec, "loai" | "soAnh" | "lan" | "nhanDot">): string {
  const dot = v.nhanDot ? ` (${v.nhanDot})` : "";
  if (v.loai === "cho_gui") return `Có ${formatSo(v.soAnh)} ảnh chỉnh sửa${dot} — kiểm rồi gửi khách`;
  const tam = v.soAnh > 0 ? ` · ${formatSo(v.soAnh)} tấm` : "";
  return `Khách yêu cầu sửa lần ${v.lan ?? 1}${dot}${tam}`;
}

export function AnhChinhSuaReport() {
  const [items, setItems] = React.useState<DongViec[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nha, setNha] = React.useState<Record<string, NhaCuaBo>>({});
  /** BB-404 — link chat riêng của khách theo bộ (API trả kèm `chatTheoBo`). */
  const [chatTheoBo, setChatTheoBo] = React.useState<Record<string, string | null>>({});
  /** BB-399 — bộ khách mua "Làm ảnh nhanh": nhãn + xếp lên đầu. */
  const [lamNhanh, setLamNhanh] = React.useState<Record<string, { hanTra: string | null; uuTien?: boolean }>>({});

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/anh-chinh-sua", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setError(null);
      setItems(json.data.items ?? []);
      setNha(json.data.nha ?? {});
      setChatTheoBo(json.data.chatTheoBo ?? {});
      setLamNhanh(json.data.lamNhanh ?? {});
    } catch {
      setError("Mất kết nối, thử lại giúp.");
    }
  }, []);

  React.useEffect(() => {
    void tai();
  }, [tai]);
  useCapNhatTucThi("nhan-vien", () => void tai());

  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!items) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Ảnh chỉnh sửa</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Ảnh chỉnh mới về từ thư mục Drive chỉ tới tay khách khi CSKH bấm “Gửi khách duyệt”. Khách xin sửa thì
          xem từng tấm, vùng khoanh và ảnh mẫu trong bộ ảnh.
        </p>
      </header>
      {/* BB-399 vòng 3 — công tắc nhận làm nhanh (hậu kỳ quá tải) + số bộ làm nhanh đang chờ. */}
      <KhoiCongTacLamNhanh />
      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có ảnh chỉnh nào đang chờ.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {xepLamNhanhLenDau(items, (v) => !!lamNhanh[v.galleryId]?.uuTien).map((v) => (
            <li key={`${v.loai}-${v.galleryId}-${v.khoa ?? ""}`} data-testid="dong-anh-chinh-sua" data-loai={v.loai} data-khoa={v.khoa ?? "goc"}>
              {/* BB-404 — icon "Nhắn khách" đứng CẠNH liên kết cả dòng (không lồng <a> trong <a>). */}
              <div className="flex items-center hover:bg-[var(--bb-surface-2)]">
              <Link
                href={`/admin/galleries/${encodeURIComponent(v.galleryId)}#anh-chinh-sua`}
                className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{hienTieuDeBoAnh(v.title)}</span>
                  <span className={v.loai === "khach_sua" ? "ml-2 text-[var(--bb-danger)]" : "ml-2 text-[var(--bb-fg-muted)]"}>
                    {moTaViec(v)}
                  </span>
                </span>
                <span className="text-xs text-[var(--bb-fg-muted)]">{formatNgayVN(v.luc)}</span>
              </Link>
              <span className="shrink-0 pr-2">
                <NutNhanKhach url={chatTheoBo[v.galleryId]} gonNho />
              </span>
              </div>
              <NhanNhaBoAnh nha={nha[v.galleryId]} className="px-4 pb-3" />
              {lamNhanh[v.galleryId] && (
                <div className="px-4 pb-3">
                  <NhanLamNhanh lamNhanh uuTien={lamNhanh[v.galleryId]?.uuTien ?? false} hanTra={lamNhanh[v.galleryId]?.hanTra ?? null} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
