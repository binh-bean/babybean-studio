/**
 * BB-328 — trang gốc công khai từng liệt kê "Fixture DANHGIA5-… Chi nhánh":
 * chi nhánh do phép thử e2e dựng trên cùng cơ sở dữ liệu, bị bỏ lại khi một
 * lượt chạy dừng giữa chừng. Khách nhìn thấy tên rác đó ngay trang đầu.
 *
 * Mọi fixture chi nhánh trong `tests/**` đặt tên bắt đầu bằng "Fixture" và mã
 * bắt đầu bằng "FIXTURE-" hoặc "FX" (FXDG5-, FX321K-). Lọc theo cả hai, không
 * phân biệt hoa thường, để một fixture đặt tên lệch một chữ vẫn không lọt.
 */
export interface ChiNhanhThoi {
  name: string | null;
  code?: string | null;
}

const TEN_FIXTURE = /^\s*fixture\b/i;
const MA_FIXTURE = /^\s*(fixture|fx)/i;

export function laChiNhanhCongKhai(b: ChiNhanhThoi): boolean {
  const ten = b.name?.trim() ?? "";
  if (!ten) return false;
  if (TEN_FIXTURE.test(ten)) return false;
  if (b.code && MA_FIXTURE.test(b.code)) return false;
  return true;
}
