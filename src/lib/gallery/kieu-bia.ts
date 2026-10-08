/**
 * BB-396 — kiểu bìa bộ ảnh (`galleries.cover_layout`, migration 0069).
 *
 * Một nguồn duy nhất cho: danh sách 4 kiểu + tên tiếng Việt (ô chọn trong trình
 * thiết kế bìa, dòng tóm tắt ở trang chi tiết), luật "giá trị null/lạ → Bên
 * cạnh", và bộ prop bìa dựng từ dữ liệu bộ ảnh mà CẢ màn khách (`gallery-app.tsx`)
 * LẪN khung xem trước quản trị (`bia-bo-anh-editor.tsx`) cùng truyền vào
 * `BiaBoAnh` — để xem trước đúng như ba mẹ thấy.
 *
 * Trước BB-396 màn khách không truyền `coverLayout` (khách luôn thấy "Bên cạnh"),
 * nên BB-370 phải bỏ ô chọn kiểu khỏi trình thiết kế. Tệp thuần: không React,
 * không Supabase — phép thử thuần đọc trực tiếp.
 */
import { COVER_LAYOUTS, type CoverLayout } from "@/types/domain";

export type KieuBia = CoverLayout;

/** Kiểu mặc định — bìa chia đôi theo bản vẽ BB-297. */
export const KIEU_BIA_MAC_DINH: KieuBia = "ben-canh";

/** Thứ tự hiện trong trình thiết kế: mặc định đứng đầu. */
export const KIEU_BIA: ReadonlyArray<{ id: KieuBia; ten: string }> = [
  { id: "ben-canh", ten: "Bên cạnh" },
  { id: "tap-chi", ten: "Tạp chí" },
  { id: "toi-gian", ten: "Tối giản" },
  { id: "de-cheo", ten: "Đè chéo" },
];

/** Giá trị cột `cover_layout` → kiểu bìa thật sự dựng. `null`/rỗng/lạ → "ben-canh". */
export function kieuBiaHopLe(v: unknown): KieuBia {
  return typeof v === "string" && (COVER_LAYOUTS as readonly string[]).includes(v)
    ? (v as KieuBia)
    : KIEU_BIA_MAC_DINH;
}

/** Tên tiếng Việt của kiểu bìa (đã chuẩn hoá: null → "Bên cạnh"). */
export function tenKieuBia(v: unknown): string {
  const id = kieuBiaHopLe(v);
  return KIEU_BIA.find((k) => k.id === id)?.ten ?? "Bên cạnh";
}

/** Dữ liệu bộ ảnh mà bìa đọc — tên trường theo API (`/api/g/gallery`, `/api/admin/galleries/[id]/items`). */
export interface NguonBia {
  coverHeadline?: string | null;
  coverLayout?: string | null;
  sessionType?: string | null;
  shootDate?: string | null;
  welcomeMessage?: string | null;
  status?: string | null;
}

/**
 * Phần prop của `BiaBoAnh` dựng THUẦN từ dữ liệu bộ ảnh. Màn khách và khung
 * xem trước quản trị cùng gọi hàm này, nên không thể một bên đọc kiểu bìa mà
 * bên kia quên (đúng lỗi khiến BB-370 phải bỏ ô chọn kiểu).
 *
 * Bộ ĐÃ GIAO: `BiaBoAnh` dựng thiết kế "Đã hoàn thiện" cố định, thắng mọi kiểu
 * bìa (luật có sẵn từ BB-298, giữ nguyên) — `coverLayout` vẫn truyền đúng giá
 * trị đã lưu, component tự bỏ qua ở trạng thái đó.
 */
export function propBiaTuBoAnh(n: NguonBia) {
  return {
    coverHeadline: n.coverHeadline ?? null,
    coverLayout: kieuBiaHopLe(n.coverLayout),
    sessionType: n.sessionType ?? null,
    ngayChup: n.shootDate ?? null,
    loiChao: n.welcomeMessage ?? null,
    trangThai: n.status ?? null,
  };
}
