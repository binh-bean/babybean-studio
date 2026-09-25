/**
 * Toán thuần: đặt một khung ảnh (cm) lên mảng tường trống của một ảnh phòng
 * (px), cho màn "treo ảnh của con lên tường" (BB-217).
 *
 * OWNER: DEV-FE. Không gọi mạng, không đụng DOM — chỉ số vào số ra, để phép
 * thử đơn vị canh được và component chỉ việc vẽ đúng con số trả ra.
 *
 * ---------------------------------------------------------------------------
 * Ba luật, đúng thứ tự ưu tiên
 * ---------------------------------------------------------------------------
 * 1. LUÔN nằm trong mảng tường trống — vẽ khung đè lên tranh/ổ điện/mép tường
 *    thật là phản tác dụng của cả màn này (chủ studio: "phải thấy nó trên
 *    tường" — thấy sai thì khỏi bán).
 * 2. Mép dưới khung cách đỉnh đồ vật (đáy mảng tường trống) khoảng 20cm —
 *    khoảng cách treo tranh thật ba mẹ quen mắt.
 * 3. Nếu 20cm làm khung tràn lên khỏi đỉnh mảng tường, CO khoảng cách đó lại
 *    (không co khung) — vẫn ưu tiên luật 1. Ca thật: `hanh-lang-doc` có
 *    ~143cm tường trống trên bàn console; 80×120 dọc CÓ khung (125cm) thì
 *    chỉ còn ~18cm, khung sát đỉnh mảng tường chứ không lùi đủ 20cm.
 *
 * Khung KHÔNG vừa (kể cả co hết khoảng cách xuống 0 vẫn tràn, hoặc bề ngang
 * rộng hơn mảng tường) thì trả `{ vua: false }` — giao diện ẩn cỡ đó cho
 * phòng đó, không vẽ khung tràn tường.
 */

import type { AnhPhong } from "./phong-treo";

/**
 * Cỡ khung theo cm, dạng "40x60" — đúng như cột `size` của bảng `products`
 * (đồng bộ từ Lark). KHÔNG khoá cứng vài cỡ: danh mục thật có từ 15x21 tới
 * 120x180, và gói hay có cỡ nhỏ (Gỗ 30x45, Tráng gương 20x30) — khoá cứng thì
 * ba mẹ không bao giờ thấy đúng tấm được in trong gói của mình trên tường.
 */
export type CoKhungCm = string;

/** "40x60" → cạnh ngắn/dài. Viết ngược ("60x40") vẫn hiểu đúng. Sai dạng → null. */
export function tachCoKhung(co: string): { canhNgan: number; canhDai: number } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(co);
  if (!m) return null;
  const a = Number((m[1] ?? "").replace(",", "."));
  const b = Number((m[2] ?? "").replace(",", "."));
  if (!(a > 0 && b > 0)) return null;
  return { canhNgan: Math.min(a, b), canhDai: Math.max(a, b) };
}

/** Các cỡ đọc được trong danh mục, không trùng, nhỏ trước lớn sau. */
export function cacCoTuDanhMuc(sizes: ReadonlyArray<string | null | undefined>): CoKhungCm[] {
  const ds = new Map<string, number>();
  for (const s of sizes) {
    if (!s) continue;
    const c = tachCoKhung(s);
    if (c) ds.set(s, c.canhNgan * c.canhDai);
  }
  return [...ds.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
}

/**
 * Viền "Khung HQ" (khung là phần BỌC NGOÀI tấm ảnh — mua riêng, gắn cùng tấm
 * ảnh, xem `src/lib/products/nhom-san-pham.ts`). Chưa có số đo viền thật từ
 * studio nên dùng ước lượng hợp lý cho khung viền mảnh (không phải khung bo
 * to kiểu tranh sơn dầu): 2.5cm mỗi cạnh, cộng dồn cả hai bên là 5cm mỗi
 * chiều. Sai số này chỉ ảnh hưởng khi `coKhung = true` — đổi số ở đây, không
 * chép lại nơi khác.
 */
export const VIEN_KHUNG_CM_MOI_CANH = 2.5;

/** Khoảng cách mục tiêu từ mép dưới khung tới đỉnh đồ vật (đáy mảng tường trống). */
export const KHOANG_CACH_MUC_TIEU_CM = 20;

export interface KhungTrenTuong {
  vua: true;
  hinh: { x: number; y: number; rong: number; cao: number };
}

export interface KhungKhongVua {
  vua: false;
  /** Vì sao không vừa — để giao diện/console dò lỗi, không bắt buộc hiện cho khách. */
  lyDo: "rong_qua_kho" | "cao_qua_kho" | "co_khong_doc_duoc";
}

export type KetQuaKhungTrenTuong = KhungTrenTuong | KhungKhongVua;

/**
 * @param phong Số liệu đo tay của một ảnh phòng (`PHONG_TREO[...].doc | .ngang`).
 * @param co Cỡ khung ("40x60"…).
 * @param huongKhung "doc" = treo dọc (cạnh ngắn nằm ngang), "ngang" = treo
 *   ngang (cạnh dài nằm ngang) — theo hướng ảnh của bé, KHÔNG theo khổ ảnh
 *   phòng. Đề bài: "ảnh dọc 40×60 = rộng 40 cao 60".
 * @param coKhung Có mua "Khung HQ" bọc ngoài không — cộng thêm viền vào kích
 *   thước thật trước khi kiểm tra có vừa tường không.
 */
export function tinhKhungTrenTuong(
  phong: AnhPhong,
  co: CoKhungCm,
  huongKhung: "doc" | "ngang",
  coKhung: boolean
): KetQuaKhungTrenTuong {
  const kichThuoc = tachCoKhung(co);
  if (!kichThuoc) return { vua: false, lyDo: "co_khong_doc_duoc" };
  const { canhNgan, canhDai } = kichThuoc;
  const rongCmTam = huongKhung === "doc" ? canhNgan : canhDai;
  const caoCmTam = huongKhung === "doc" ? canhDai : canhNgan;

  const vienCm = coKhung ? VIEN_KHUNG_CM_MOI_CANH * 2 : 0;
  const rongCm = rongCmTam + vienCm;
  const caoCm = caoCmTam + vienCm;

  const { pxMoiCm, tuong } = phong;
  const rongPx = rongCm * pxMoiCm;
  const caoPx = caoCm * pxMoiCm;

  if (rongPx > tuong.rong) return { vua: false, lyDo: "rong_qua_kho" };
  if (caoPx > tuong.cao) return { vua: false, lyDo: "cao_qua_kho" };

  // Luật 2 + 3: khoảng cách mục tiêu 20cm, co lại nếu tường không đủ chỗ —
  // nhưng không bao giờ âm (khung không được lùi xuống DƯỚI đáy mảng tường).
  const khoangCachMucTieuPx = KHOANG_CACH_MUC_TIEU_CM * pxMoiCm;
  const khoangCachToiDaPx = tuong.cao - caoPx;
  const khoangCachPx = Math.min(khoangCachMucTieuPx, khoangCachToiDaPx);

  const y = tuong.y + tuong.cao - caoPx - khoangCachPx;
  const x = tuong.x + (tuong.rong - rongPx) / 2;

  return {
    vua: true,
    hinh: { x, y, rong: rongPx, cao: caoPx },
  };
}
