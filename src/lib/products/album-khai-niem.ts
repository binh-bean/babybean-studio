/**
 * BB-390 — KHÁI NIỆM "ALBUM" cho đúng lời anh (Bản yêu cầu, P0), luật THUẦN.
 *
 * Anh, nguyên văn:
 *
 *     "album ảnh là một quyển album được ghép từ 20-30 ảnh đã chỉnh sửa hoặc
 *      chưa chỉnh sửa hoặc chỉnh sửa một phần và được in ra thành quyển. Mỗi
 *      một album sẽ có một ảnh bìa. Có hai nhiệm vụ chính: một là gợi ý chọn
 *      ảnh bìa cho album nếu trong gói khách hàng có album; hai là bán album —
 *      mở màn bán hàng chứ không phải chọn ảnh để mua album."
 *
 * Nên app chỉ có HAI việc với album:
 *   1. Album TRONG GÓI → bước "Chọn ảnh bìa album" (Bean gợi ý, ba mẹ chọn 1).
 *      Ruột album (số tấm theo khổ — BB-398) Bean/CSKH sắp từ ảnh chỉnh + suất "Ảnh album không
 *      chỉnh sửa" (BB-374) — ba mẹ KHÔNG xếp từng tấm vào cuốn.
 *   2. BÁN album (gói không có, hoặc muốn thêm cuốn) → MÀN BÁN HÀNG: giới thiệu
 *      cuốn album + giá trong danh mục + nút "Đặt album". Không bắt chọn tấm.
 *
 * Mọi quyết định "hiện hay không / gợi ý tấm nào / đặt thế nào" nằm ở đây để
 * phép thử thuần canh được (tests/unit/bb-390-album.test.ts), component chỉ gọi.
 */

import { canGanAnh, type NhomSanPham } from "./nhom-san-pham";

// ---------------------------------------------------------------------------
// 1. Khi nào hiện bước "Chọn ảnh bìa album"
// ---------------------------------------------------------------------------

/** `myRole` của phiên: "owner" | "co_editor" | "suggester" | "viewer" (chuỗi lạ = không quyết). */
export type VaiTroBoAnh = string | null | undefined;

/**
 * Bước chọn bìa chỉ hiện khi CẢ BA đúng:
 *   - gói có ít nhất một dòng album (album TRONG GÓI);
 *   - bộ ảnh còn mở (đã chốt/đã giao thì bìa đã nằm trong đơn, không đổi nữa);
 *   - người đang xem là người quyết đơn (chủ link hoặc người cùng chọn) — người
 *     thân chỉ xem / chỉ gợi ý không quyết bìa của cuốn album trong gói.
 */
export function coBuocChonBiaAlbum(input: {
  soAlbumTrongGoi: number;
  khoa: boolean;
  vaiTro: VaiTroBoAnh;
}): boolean {
  if (input.soAlbumTrongGoi <= 0) return false;
  if (input.khoa) return false;
  return input.vaiTro === "owner" || input.vaiTro === "co_editor";
}

// ---------------------------------------------------------------------------
// 2. Gợi ý bìa — hướng ảnh (dọc / ngang / vuông) từ dữ liệu kích thước THẬT
// ---------------------------------------------------------------------------

export type HuongAnh = "doc" | "ngang" | "vuong";

/** Lệch dưới 5% coi như vuông — ảnh máy ảnh 3:2 / 4:3 / 4:5 đều vượt xa ngưỡng này. */
const NGUONG_VUONG = 0.05;

/** Hướng của một tấm theo `width`/`height`. Thiếu số liệu → `null` (không đoán). */
export function huongAnh(width: number | null | undefined, height: number | null | undefined): HuongAnh | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const tiLe = width / height;
  if (Math.abs(tiLe - 1) < NGUONG_VUONG) return "vuong";
  return tiLe > 1 ? "ngang" : "doc";
}

/**
 * Hướng BÌA của một cuốn album, suy từ khổ trong danh mục ("20x20", "25×25").
 *
 *   - Khổ VUÔNG ("20x20", "25×25") → bìa vuông.
 *   - Khổ CHỮ NHẬT ("15x21", "20x30", cả cách ghi ngược "30x20") → cuốn ĐỨNG,
 *     bìa DỌC. BB-391 — anh chốt 07/10: album khổ chữ nhật của studio luôn là
 *     cuốn đứng, nên thứ tự hai số trong danh mục không đổi hướng bìa.
 *   - Không đọc được khổ → `null` (luật gợi ý không ưu tiên hướng nào).
 */
export function huongBiaTuKhoAlbum(size: string | null | undefined): HuongAnh | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(size ?? "");
  if (!m) return null;
  const a = Number(m[1]!.replace(",", "."));
  const b = Number(m[2]!.replace(",", "."));
  if (!a || !b) return null;
  return a === b ? "vuong" : "doc";
}

/** Tìm khổ "AxB" nằm trong tên dòng hợp đồng, vd "Album (Ultra HD) 20x20". */
export function khoTrongTen(ten: string | null | undefined): string | null {
  const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i.exec(ten ?? "");
  return m ? `${m[1]}x${m[2]}` : null;
}

/**
 * Tấm có HỢP khổ bìa không — CHỈ dùng làm nhánh phụ khi xếp gợi ý, không loại
 * tấm nào (ảnh dọc/ngang cắt vuông vẫn làm bìa vuông được).
 *   - Bìa vuông: ảnh vuông hợp nhất.
 *   - Bìa dọc/ngang: cùng hướng là hợp.
 *   - Không biết hướng bìa hoặc hướng ảnh → trung tính (`false`).
 */
export function hopKhoBia(anh: HuongAnh | null, bia: HuongAnh | null): boolean {
  if (!anh || !bia) return false;
  return anh === bia;
}

// ---------------------------------------------------------------------------
// 3. Bán album — chỉ mục có trong danh mục hậu kỳ, đặt KHÔNG kèm ảnh
// ---------------------------------------------------------------------------

/**
 * BB-398 — SỐ ẢNH MỘT CUỐN THEO KHỔ (anh 08/10/2026), nguồn DUY NHẤT. Thay hằng
 * chung "20–30 tấm" cũ (BB-390): mỗi khổ một khoảng riêng. Không phải số trang in.
 *
 *     15×21: 20–25 ảnh · 20×20: 25–30 ảnh · 25×25: 30–35 ảnh
 *     30×30: 35–40 ảnh · 20×30: 30–35 ảnh
 *
 * Khoá là khổ CHUẨN HOÁ (số nhỏ trước, `chuanKhoAlbum`) — album chữ nhật luôn là
 * cuốn đứng (BB-391), nên "30x20" và "20x30" là một khổ.
 */
export const SO_ANH_THEO_KHO_ALBUM: Readonly<Record<string, { min: number; max: number }>> = {
  "15x21": { min: 20, max: 25 },
  "20x20": { min: 25, max: 30 },
  "25x25": { min: 30, max: 35 },
  "30x30": { min: 35, max: 40 },
  "20x30": { min: 30, max: 35 },
};

/** "20×30", "30 x 20", "20X30" → "20x30" (số nhỏ trước). Không đọc được → `null`. */
export function chuanKhoAlbum(size: string | null | undefined): string | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(?:cm)?\s*$/i.exec(size ?? "");
  if (!m) return null;
  const a = Number(m[1]!.replace(",", "."));
  const b = Number(m[2]!.replace(",", "."));
  if (!a || !b) return null;
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/** Khoảng số ảnh của một khổ album. Khổ không có trong bảng → `null` (không hiện số, không đoán). */
export function soAnhCuaKhoAlbum(size: string | null | undefined): { min: number; max: number } | null {
  const kho = chuanKhoAlbum(size);
  return kho ? (SO_ANH_THEO_KHO_ALBUM[kho] ?? null) : null;
}

/** "25–30 ảnh" cho một khổ; khổ không có trong bảng → `null`. */
export function nhanSoAnhAlbum(size: string | null | undefined): string | null {
  const k = soAnhCuaKhoAlbum(size);
  return k ? `${k.min}–${k.max} ảnh` : null;
}

/**
 * Khoảng CHUNG khi chưa biết khổ (vd lời giới thiệu chung, hoặc gói có nhiều cuốn khác khổ):
 * suy từ chính bảng trên (nhỏ nhất → lớn nhất), không phải một hằng thứ hai.
 */
export function khoangSoAnhChung(): { min: number; max: number } {
  const ds = Object.values(SO_ANH_THEO_KHO_ALBUM);
  return { min: Math.min(...ds.map((k) => k.min)), max: Math.max(...ds.map((k) => k.max)) };
}

/**
 * Cụm số ảnh cho một NHÓM cuốn (theo khổ từng cuốn): mọi cuốn cùng một khoảng → khoảng đó
 * ("25–30 ảnh"); khác nhau hoặc có cuốn không rõ khổ → nói chung ("20–40 ảnh tuỳ khổ").
 */
export function nhanSoAnhChoCacCuon(sizes: ReadonlyArray<string | null | undefined>): string {
  const nhan = new Set(sizes.map((s) => nhanSoAnhAlbum(s)));
  if (nhan.size === 1) {
    const [mot] = Array.from(nhan);
    if (mot) return mot;
  }
  const c = khoangSoAnhChung();
  return `${c.min}–${c.max} ảnh tuỳ khổ`;
}

export interface SanPhamAlbumTrongDanhMuc {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
}

/** "tờ Album (Ultra HD)" là TỜ RUỘT thêm vào một cuốn, không phải một cuốn. */
export function laToRuotAlbum(sp: { name: string; material: string | null }): boolean {
  const s = `${sp.material ?? ""} ${sp.name}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
  return /\bto\s+album\b|\bto\s*\(ultra/.test(s);
}

/**
 * Các CUỐN album bày trên màn bán hàng: lấy từ danh mục ĐÃ LỌC của máy chủ
 * (`catalogue` của `/api/g/gallery` — đã qua `sanPhamBanChoKhach`, tức chỉ mục
 * có trong bảng giá hậu kỳ), giữ nhóm album, bỏ tờ ruột, bỏ mục giá ≤ 0 (giá
 * chưa nhập — không bịa giá). Sắp theo giá tăng dần, cùng giá thì theo tên.
 */
export function cuonAlbumDangBan<T extends SanPhamAlbumTrongDanhMuc>(danhMuc: readonly T[]): T[] {
  return danhMuc
    .filter((sp) => sp.nhom === "album" && !laToRuotAlbum(sp) && sp.unitPrice > 0)
    .slice()
    .sort((a, b) => a.unitPrice - b.unitPrice || a.name.localeCompare(b.name, "vi"));
}

export interface DonDatAlbum {
  productId: string;
  /** Số lượng TUYỆT ĐỐI gửi `/api/g/addons` (route nhận tổng, không cộng dồn). */
  soLuong: number;
  /** Album đặt KHÔNG gắn ảnh — Bean/CSKH sắp ảnh cùng ba mẹ sau. */
  photoId: null;
}

/**
 * Lệnh "Đặt album" — đi đúng đường đặt mua thêm sẵn có (`/api/g/addons`, một
 * dòng giỏ không ảnh). Ba mẹ KHÔNG phải chọn từng tấm ruột ở bước này.
 */
export function donDatAlbum(productId: string, soCuonDaDat: number): DonDatAlbum {
  return { productId, soLuong: Math.max(0, Math.floor(soCuonDaDat)) + 1, photoId: null };
}

/** Bước bán album có đòi chọn ảnh không — luôn KHÔNG (cùng luật `canGanAnh`). */
export function banAlbumCanChonAnh(): boolean {
  return canGanAnh("album");
}
