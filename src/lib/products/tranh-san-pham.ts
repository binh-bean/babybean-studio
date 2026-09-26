/**
 * Chọn tranh minh hoạ (BB-248) cho một sản phẩm/nhóm sản phẩm trong cửa hàng.
 *
 * OWNER: DEV-FE. Task BB-248. Chủ studio vừa vẽ 6 tranh màu nước cùng phong
 * cách "hành trình" (`public/hanh-trinh/`), đặt ở `public/san-pham/`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG chỉ map theo `NhomSanPham`
 * ---------------------------------------------------------------------------
 * `nhomSanPham()` (`src/lib/products/nhom-san-pham.ts`) gộp CẢ khung ảnh và
 * tranh canvas vào chung một nhóm `"khung"` — đọc đúng mã: chất liệu bắt đầu
 * bằng "khung" (vd. "Khung HQ", "Khung kim loại") mới vào nhóm `khung`; hàm
 * đó KHÔNG hề tách canvas ra thành một nhóm riêng, "Canvas"/"Tráng canvas" là
 * chất liệu IN (rơi vào nhóm `anh_in` qua nhánh `kind === "print"`), không
 * qua nhánh `cl.startsWith("khung")`. Vậy trong dữ liệu thật hiện có, sản
 * phẩm "canvas" nằm ở nhóm `anh_in`, không phải `khung`.
 *
 * Đề bài chốt: exception "canvas" chỉ áp dụng CHO NHÁNH `khung` (một khung
 * bọc-canvas, ví dụ "Khung canvas 40x60", vẫn ra tranh canvas thay vì khung
 * thường). Nhóm `anh_in`/`album` không kiểm "canvas" — dù dữ liệu thật hiện
 * tại xếp mọi chất liệu in-trên-canvas vào nhóm `anh_in` (qua nhánh
 * `kind === "print"` của `nhomSanPham()`, không có nhánh nào tách canvas
 * riêng), sản phẩm đó vẫn ra `sp-anh-in` — đúng nghĩa "tấm ảnh in", không
 * phải "khung tranh". Đây là quyết định có chủ đích theo đúng chữ đề bài,
 * không phải sơ suất.
 */

import type { NhomSanPham } from "./nhom-san-pham";

/** Bỏ dấu tiếng Việt để so khớp không phân biệt dấu/hoa-thường. */
function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/**
 * Tên tệp tranh (không kèm hậu tố `-320`/`-640.webp`) cho một sản phẩm.
 *
 * - `anh_in` → `sp-anh-in`
 * - `album` → `sp-album-dat-mua` (BB-202: album mua thêm giờ CHỈ ĐẶT MUA,
 *   không còn bước đưa ảnh — tranh riêng "đặt mua" khác tranh "sp-album" cũ,
 *   để không gợi ý nhầm là còn thao tác chọn ảnh sau khi mua)
 * - `khung` → `sp-khung-anh`, TRỪ khi material hoặc name chứa "canvas" (không
 *   phân biệt hoa/thường, bỏ dấu) → `sp-tranh-canvas`.
 */
export function tranhCuaSanPham(
  nhom: NhomSanPham,
  material: string | null,
  name: string,
): string {
  // Opus soát: canvas trong dữ liệu thật rơi vào nhóm `anh_in` (in lên canvas,
  // kind = print) chứ hiếm khi là `khung` — kiểm canvas TRƯỚC nhóm, không thì
  // tranh canvas gần như không bao giờ hiện.
  if (nhom !== "album" && boDau(`${material ?? ""} ${name}`).includes("canvas")) {
    return "sp-tranh-canvas";
  }
  switch (nhom) {
    case "anh_in":
      return "sp-anh-in";
    case "album":
      return "sp-album-dat-mua";
    case "khung":
      return "sp-khung-anh";
  }
}
