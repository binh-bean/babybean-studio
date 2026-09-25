/**
 * Nối `MauCanhBao` (xanh/cam/đỏ/tím — logic thuần ở trang-thai-hau-ky.ts)
 * sang biến màu CSS và câu chữ cho người đọc.
 *
 * OWNER: DEV-FE. Task BB-200 (3/3) — phần giao diện.
 *
 * VÌ SAO TÁCH RIÊNG: `trang-thai-hau-ky.ts` là toán thuần, không được đụng
 * luật (theo brief BB-200). Bảng chữ + biến CSS là chuyện MÀN HÌNH — nếu chủ
 * studio đổi chữ ("Nguy hiểm" → "Khẩn"), sửa ở đây, không đụng file luật.
 *
 * `aria-label`/`title` bắt buộc đi kèm chấm màu: chấm màu một mình không
 * đọc được bằng trình đọc màn hình, và với người mù màu thì xanh/cam/đỏ/tím
 * gần như không phân biệt được nếu không có chữ đi kèm.
 */

import type { MauCanhBao } from "./trang-thai-hau-ky";

export interface CanhBaoUi {
  /** Biến CSS token cho chấm/viền màu — đã khai ở src/styles/tokens.css. */
  mauToken: string;
  /** Câu ngắn cho aria-label/title. */
  nhan: string;
}

const BANG: Record<MauCanhBao, CanhBaoUi> = {
  xanh: { mauToken: "var(--bb-success)", nhan: "An toàn" },
  cam: { mauToken: "var(--bb-warning)", nhan: "Cảnh báo" },
  do: { mauToken: "var(--bb-danger)", nhan: "Nguy hiểm" },
  tim: { mauToken: "var(--bb-urgent)", nhan: "Phải xong trong ngày" },
};

/** `null` (chưa có mức cảnh báo từ Lark) trả về `null` — màn hình không vẽ chấm. */
export function canhBaoUi(mau: MauCanhBao | null): CanhBaoUi | null {
  if (!mau) return null;
  return BANG[mau];
}
