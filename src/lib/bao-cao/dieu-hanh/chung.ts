/**
 * BB-380 — tiện ích nhỏ dùng chung cho các báo cáo điều hành.
 */
import type { NguCanhBaoCao, TheSoBaoCao } from "../loai";
import { chenhLechPhanTram } from "../ky";

/** Người xem có quyền xem tiền không. `quyen` bỏ trống (gọi nội bộ) = có. */
export function xemDuocTien(ctx: NguCanhBaoCao): boolean {
  return !ctx.quyen || ctx.quyen.includes("reports:financial");
}

export const CHU_AN_TIEN = "Cần quyền xem doanh thu";

/** Dựng một thẻ số có so kỳ trước. `null` = chưa đủ dữ liệu → "—". */
export function theSo(
  nhan: string,
  giaTri: number | null,
  donVi: string,
  opts: {
    kyTruoc?: number | null;
    coKyTruoc?: boolean;
    tangLaTot?: boolean;
    maChiTiet?: string;
    giaiThich?: string;
  } = {},
): TheSoBaoCao {
  const coSo = giaTri !== null;
  const the: TheSoBaoCao = {
    nhan,
    giaTri: coSo ? giaTri : "—",
    donVi: coSo ? donVi : undefined,
    tangLaTot: opts.tangLaTot ?? true,
    maChiTiet: opts.maChiTiet,
    giaiThich: opts.giaiThich,
  };
  if (opts.coKyTruoc) {
    the.kyTruoc = opts.kyTruoc ?? "—";
    the.chenhLechPhanTram =
      coSo && opts.kyTruoc !== null && opts.kyTruoc !== undefined ? chenhLechPhanTram(giaTri, opts.kyTruoc) : null;
  }
  return the;
}

export function soNgay(n: number | null): string | number {
  return n === null ? "—" : n;
}
