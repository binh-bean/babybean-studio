"use client";

/**
 * BB-399 — "Làm ảnh nhanh" trên màn khách (anh chốt 08/10/2026).
 *
 *   · `OLamAnhNhanh`          — ô chọn trong hộp chốt đợt 1 và hộp chốt đợt mua thêm. Không tích
 *                               sẵn. Không có sản phẩm đang bán → ẩn. Bộ đã mua → "Đã chọn làm
 *                               ảnh nhanh", không bán lần hai.
 *   · `TheLamAnhNhanhSauChot` — sau khi chốt: câu hạn trả "Bean trả ảnh chỉnh trong khoảng N
 *                               ngày" (14 hoặc 5 theo bộ) + nút mua làm nhanh nếu còn mua được
 *                               (chỉ người nhận link chính).
 *
 * Giá và số ngày đều đọc từ dữ liệu máy chủ (`/api/g/gallery` → `lamAnhNhanh`): giá là
 * `products.list_price` đồng bộ từ Lark, số ngày từ Cài đặt. Không viết cứng con số nào.
 */

import React from "react";
import { Check, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatNgayVN } from "@/lib/utils/dinh-dang";
import { giuA } from "@/lib/utils/giu-a";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";
import { vi } from "@/i18n";
import type { HanTra, LamAnhNhanhKhach } from "@/lib/dich-vu/lam-anh-nhanh";

const t = vi.gallery.lamNhanh;

/** "Bean ưu tiên chỉnh, ba mẹ nhận ảnh trong khoảng 5 ngày thay vì 14 ngày tiêu chuẩn ạ." */
export function cauMoTaLamNhanh(tt: Pick<LamAnhNhanhKhach, "soNgayNhanh" | "soNgayTieuChuan">): string {
  return giuA(t.moTa.replace("{nhanh}", String(tt.soNgayNhanh)).replace("{tieuChuan}", String(tt.soNgayTieuChuan)));
}

/** "Bean trả ảnh chỉnh trong khoảng N ngày, dự kiến ngày dd/mm/yyyy ạ." (không có ngày → bỏ vế sau). */
export function cauHanTra(han: Pick<HanTra, "soNgay" | "hanTra">): string {
  const ngay = han.hanTra ? formatNgayVN(han.hanTra) : "";
  return giuA(
    ngay
      ? t.hanTra.replace("{n}", String(han.soNgay)).replace("{ngay}", ngay)
      : t.hanTraKhongNgay.replace("{n}", String(han.soNgay)),
  );
}

export function OLamAnhNhanh({
  thongTin,
  chon,
  onChon,
}: {
  thongTin: LamAnhNhanhKhach | null | undefined;
  chon: boolean;
  onChon: (v: boolean) => void;
}) {
  if (!thongTin) return null;
  if (thongTin.daMua) {
    return (
      <div
        data-testid="lam-nhanh-da-chon"
        className="mt-3 flex items-start gap-2.5 rounded-2xl border border-border p-3.5 text-[13px] leading-relaxed"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bb-accent-sage,#7a9482)]" aria-hidden="true" />
        <span className="min-w-0">
          <b className="font-semibold">{t.daChon}</b>
          <span className="block text-muted-foreground">
            {giuA(t.daChonMoTa.replace("{n}", String(thongTin.soNgayNhanh)))}
          </span>
        </span>
      </div>
    );
  }
  if (!thongTin.coBan) return null;
  return (
    <label
      data-testid="o-lam-anh-nhanh"
      data-gia={thongTin.gia}
      className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border p-3.5 text-[13px] leading-relaxed"
    >
      <Checkbox checked={chon} onCheckedChange={onChon} className="mt-0.5" aria-label={t.ten} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <b className="font-semibold">{t.ten}</b>
          <span data-testid="gia-lam-anh-nhanh" className="whitespace-nowrap font-semibold tabular-nums">
            · {formatCurrencyVND(thongTin.gia)}
          </span>
        </span>
        <span data-testid="mo-ta-lam-anh-nhanh" className="block text-pretty text-muted-foreground">
          {cauMoTaLamNhanh(thongTin)}
        </span>
      </span>
    </label>
  );
}

export function TheLamAnhNhanhSauChot({
  thongTin,
  hanTra,
  laChuBo,
  onDaMua,
}: {
  thongTin: LamAnhNhanhKhach | null | undefined;
  /** Hạn đang áp (mặc định `thongTin.hanTra`); màn cảm ơn truyền hạn tạm khi dữ liệu chưa tải lại. */
  hanTra?: Pick<HanTra, "soNgay" | "hanTra"> | null;
  /** Người nhận link chính — chỉ người này mua được. */
  laChuBo: boolean;
  onDaMua?: () => void | Promise<void>;
}) {
  const [dangGui, setDangGui] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [xong, setXong] = React.useState<string | null>(null);
  const han = hanTra ?? thongTin?.hanTra ?? null;
  if (!thongTin || !han) return null;

  async function mua() {
    setDangGui(true);
    setLoi(null);
    try {
      const res = await goiApiKhach("/api/g/lam-anh-nhanh", { method: "POST" });
      const json = (await res.json().catch(() => null)) as {
        data?: { soNgay?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? t.loiKhongCoSanPham);
        return;
      }
      setXong(giuA(t.daMuaXong.replace("{n}", String(json?.data?.soNgay ?? thongTin!.soNgayNhanh))));
      await onDaMua?.();
    } catch {
      setLoi(vi.gallery.loiBean.khongKetNoi);
    } finally {
      setDangGui(false);
    }
  }

  const coTheMua = laChuBo && thongTin.muaSauChot && !xong;
  return (
    <div data-testid="the-lam-anh-nhanh" className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-left text-[14px] leading-relaxed">
      <p data-testid="cau-han-tra" className="text-pretty">
        {thongTin.daMua && (
          <Zap className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-hidden="true" />
        )}
        {cauHanTra(han)}
      </p>
      {xong && (
        <p role="status" className="mt-2 text-[13px] text-muted-foreground">
          {xong}
        </p>
      )}
      {coTheMua && (
        <div className="mt-3 border-t border-[var(--bb-border)] pt-3">
          <p className="font-medium">{t.theTieuDe}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{cauMoTaLamNhanh(thongTin)}</p>
          <button
            type="button"
            data-testid="nut-mua-lam-anh-nhanh"
            onClick={() => void mua()}
            disabled={dangGui}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#2e2a27] px-4 text-[14px] font-medium transition hover:bg-[#2e2a27]/5 disabled:opacity-50"
          >
            {dangGui && <Spinner className="h-4 w-4" />}
            {dangGui ? t.dangGui : t.nutMua.replace("{gia}", formatCurrencyVND(thongTin.gia))}
          </button>
        </div>
      )}
      {loi && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--bb-danger)]">
          {loi}
        </p>
      )}
    </div>
  );
}
