/**
 * BB-325 — ô nhập số tiền có dấu chấm ngăn nghìn ("50.000"), kiểu Việt Nam.
 * `<input type="number">` không hiện được dấu ngăn nghìn, nên ô giá dùng
 * `type="text" inputMode="numeric"` và hai hàm thuần này để hiện/đọc.
 */
import { formatSo } from "./dinh-dang";

/** 50000 → "50.000". */
export function dinhDangNghin(n: number): string {
  return formatSo(Math.max(0, Math.round(n)));
}

/** "50.000" / "50000đ" → 50000; chuỗi không có chữ số → 0. */
export function docSoNghin(s: string): number {
  const so = (s ?? "").replace(/\D/g, "");
  return so ? Number(so) : 0;
}
