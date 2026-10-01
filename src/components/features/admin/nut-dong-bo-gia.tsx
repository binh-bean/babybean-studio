"use client";

/**
 * BB-343 — nút "Đồng bộ giá ngay" + dòng "Lần đồng bộ giá gần nhất".
 *
 * Gọi `POST /api/admin/san-pham/dong-bo-gia` (đọc bảng Sản phẩm bên Lark, ghi
 * `products`, không ghi ngược Lark). Server giới hạn 1 lần / phút; nút ở đây
 * cũng tự khoá 60 giây sau mỗi lần bấm để khỏi bấm hụt.
 */
import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatNgayGioVN } from "@/lib/utils/dinh-dang";

import type { LanDongBoGanNhat } from "@/lib/lark/doc-lan-dong-bo-gia";

const KHOA_NUT_MS = 60_000;

export function NutDongBoGia({ ganNhat }: { ganNhat: LanDongBoGanNhat | null }) {
  const router = useRouter();
  const [gan, setGan] = React.useState<LanDongBoGanNhat | null>(ganNhat);
  const [dang, setDang] = React.useState(false);
  const [khoaDen, setKhoaDen] = React.useState(0);
  const [bayGio, setBayGio] = React.useState(() => Date.now());
  const [cau, setCau] = React.useState<{ ok: boolean; text: string } | null>(null);

  // Đồng hồ chỉ chạy khi nút đang bị khoá.
  React.useEffect(() => {
    if (khoaDen <= Date.now()) return;
    const t = setInterval(() => setBayGio(Date.now()), 1000);
    return () => clearInterval(t);
  }, [khoaDen]);

  const conLaiGiay = Math.max(0, Math.ceil((khoaDen - bayGio) / 1000));

  async function dongBo() {
    setDang(true);
    setCau(null);
    setKhoaDen(Date.now() + KHOA_NUT_MS);
    setBayGio(Date.now());
    try {
      const res = await fetch("/api/admin/san-pham/dong-bo-gia", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCau({ ok: false, text: json?.error?.message ?? "Chưa đồng bộ được giá, thử lại giúp" });
        return;
      }
      const d = json?.data as { luc: string; soGiaDoi: number; soBat: number; soTat: number };
      setGan({ luc: d.luc, soGiaDoi: d.soGiaDoi });
      const phan = [`Đã đồng bộ: ${d.soGiaDoi} giá đổi`];
      if (d.soBat > 0) phan.push(`${d.soBat} sản phẩm bật lại`);
      if (d.soTat > 0) phan.push(`${d.soTat} sản phẩm tắt`);
      setCau({ ok: true, text: phan.join(", ") + "." });
      router.refresh();
    } catch {
      setCau({ ok: false, text: "Mất kết nối, thử lại giúp" });
    } finally {
      setDang(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p data-testid="lan-dong-bo-gia-gan-nhat" className="text-sm text-[var(--bb-fg-muted)]">
        {gan
          ? `Lần đồng bộ giá gần nhất: ${formatNgayGioVN(gan.luc)} · ${gan.soGiaDoi} giá đổi`
          : "Chưa có lần đồng bộ giá nào."}
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="nut-dong-bo-gia"
          disabled={dang || conLaiGiay > 0}
          onClick={() => void dongBo()}
        >
          {dang ? "Đang đồng bộ…" : conLaiGiay > 0 ? `Đồng bộ giá ngay (${conLaiGiay}s)` : "Đồng bộ giá ngay"}
        </Button>
        {cau && (
          <span role="status" className={`text-xs ${cau.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"}`}>
            {cau.text}
          </span>
        )}
      </span>
    </div>
  );
}
