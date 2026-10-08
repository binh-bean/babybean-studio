/**
 * BB-400 — MỘT luật cho mọi lượt chọn ảnh: lượt nào có công cụ nào.
 *
 * OWNER: DEV-FE. Anh yêu cầu 08/10/2026: "lượt sau chỉ còn thả tim, không còn đủ
 * chức năng như lượt đầu… các lượt chọn của gia đình cũng cần giống nhau".
 *
 * Trước BB-400 mỗi màn tự quyết công cụ của mình bằng những điều kiện rải rác
 * (`laNguoiXem ? undefined : …`, `soSanhBat={false}` cứng ở màn đợt…), nên màn
 * "Chọn thêm ảnh · Đợt N" rơi mất ghi chú, so sánh, đặt in theo ảnh, xem trên
 * tường, tải ảnh. Nay màn chính (`gallery-app.tsx`) và màn đợt
 * (`man-chon-them-dot.tsx`) cùng hỏi hàm này; khác nhau chỉ còn ở VAI và ở luật
 * tiền của đợt — không ở chỗ "màn nào quên dựng nút nào".
 *
 * Luật vai ở đây CHÉP ĐÚNG luật máy chủ (máy chủ vẫn là chỗ chặn thật), không nới:
 *   - tim + ghi chú: `EDITING_ROLES` (owner, co_editor, suggester) — `/api/g/selection`;
 *     người xem (viewer) có tim GIA ĐÌNH riêng (`/api/g/tim-gia-dinh`), không ghi chú.
 *   - mua thêm theo ảnh: `/api/g/addons` chặn viewer; viewer gửi YÊU CẦU qua `/api/g/mua-them`.
 *   - ảnh album không chỉnh: owner + co_editor (`/api/g/album-khong-chinh`).
 *   - chốt: `SUBMIT_ROLES` (owner) — cả đợt 1 lẫn `/api/g/dot-chon/chot`.
 */

import { vi } from "@/i18n";

/** Năm kiểu lượt chọn khách gặp. */
export type NguCanhLuotChon =
  /** Ba mẹ chọn đợt 1 (trong gói, có hạn mức). */
  | "dot1"
  /** Ba mẹ chọn thêm đợt 2, 3… (mỗi ảnh mới tính tiền — `tinhTienDot`). */
  | "dotThem"
  /** Người thân gợi ý (`suggester`). */
  | "goiY"
  /** Người cùng chọn (`co_editor`). */
  | "cungChon"
  /** Gia đình được mời (`viewer`, link "Mời ông bà"). */
  | "giaDinh";

export function nguCanhTuVai(vai: string | null | undefined, opts?: { dotThem?: boolean }): NguCanhLuotChon {
  switch (vai ?? "owner") {
    case "viewer":
      return "giaDinh";
    case "suggester":
      return "goiY";
    case "co_editor":
      return "cungChon";
    default:
      return opts?.dotThem ? "dotThem" : "dot1";
  }
}

export interface CongCuLuotChon {
  /** Thả tim trên thẻ ảnh và trong xem lớn (viewer: tim gia đình của riêng họ). */
  tim: boolean;
  /** Ô "Ghi chú cho thợ chỉnh ảnh" trong xem lớn (sửa được; bộ khoá thì chỉ đọc). */
  ghiChu: boolean;
  /** Xem lớn / vuốt / phóng to — mọi lượt đều có. */
  xemLon: true;
  /** Nút "So sánh" + màn so sánh 2–4 tấm. */
  soSanh: boolean;
  /** Bảng "Tấm này dùng cho…" (nút "Đặt in") trong xem lớn. */
  sanPhamTheoAnh: boolean;
  /**
   * "Xem trên tường / bàn nhà" — BB-400 vòng 4 (anh 08/10): MỌI vai, MỌI lượt (đợt 1, đợt N,
   * gợi ý, gia đình, bộ đã chốt/đã giao, ảnh chỉnh). XEM không bao giờ đòi đã chọn; ĐẶT mua
   * trong màn treo theo quyền vai (`datTuManTreo`).
   */
  xemTuong: boolean;
  /** Nút tải ảnh (chỉ khi bộ ảnh cho tải). */
  tai: boolean;
  /** Chip lọc + dấu "Gia đình thích" (tim của người được mời) — người QUYẾT đơn mới cần thấy. */
  giaDinhThich: boolean;
  /** Suất "Ảnh album không chỉnh sửa" (BB-374) — chỉ đợt 1, không cho người gợi ý. */
  albumKhongChinh: boolean;
  /** Nút chốt của lượt (đợt 1 hoặc đợt N). */
  chot: boolean;
  /** Mua thêm qua yêu cầu gửi Bean (viewer) thay vì giỏ của ba mẹ. */
  muaQuaYeuCau: boolean;
}

/**
 * Công cụ của một lượt. `khoa` = bộ ảnh đã khoá ở lượt này (đợt 1 đã chốt/giao) — khoá
 * không giấu công cụ XEM (so sánh, xem lớn, tải), chỉ giấu việc GHI (tim, ghi chú vẫn
 * hiện chỉ đọc theo luật cũ của `PhotoLightbox`).
 */
export function congCuLuotChon(
  nc: NguCanhLuotChon,
  opts: { choPhepTai: boolean; /** Bộ ảnh đã sang chọn thêm đợt N (đợt 1 khoá). */ dotThem?: boolean },
): CongCuLuotChon {
  const laGiaDinh = nc === "giaDinh";
  /*
    BB-400 vòng 2 — người cùng chọn / người gợi ý ở đợt N: tim là GỢI Ý chung (tim gia đình,
    `/api/g/tim-gia-dinh`), ba mẹ thấy trên lưới đợt rồi tự đưa vào đợt. Ghi chú, giỏ sản
    phẩm, xem trên tường đều là phần của NHÁP ĐỢT — nằm trên máy ba mẹ, đi cùng tiền lúc
    chốt — nên vai này không có (không nới: chỉ ba mẹ chốt và trả tiền).
  */
  const goiYDotN = opts.dotThem === true && (nc === "goiY" || nc === "cungChon");
  return {
    tim: true,
    ghiChu: !laGiaDinh && !goiYDotN,
    xemLon: true,
    soSanh: true,
    sanPhamTheoAnh: !goiYDotN,
    xemTuong: true,
    tai: opts.choPhepTai,
    giaDinhThich: !laGiaDinh && !goiYDotN,
    albumKhongChinh: !opts.dotThem && (nc === "dot1" || nc === "cungChon"),
    chot: nc === "dot1" || nc === "dotThem",
    muaQuaYeuCau: laGiaDinh,
  };
}

/**
 * BB-400 vòng 4 — nút ĐẶT ở màn "Xem trên tường / bàn nhà" theo vai + trạng thái. Xem luôn
 * được; đặt thì:
 *   - "gio": thêm vào giỏ của lượt (đợt 1 còn mở; giỏ của đợt N; giỏ yêu cầu của gia đình);
 *   - "dotMoi": bộ đã khoá nhưng ba mẹ mua thêm được → nút dẫn sang "Chọn thêm ảnh" (đợt N);
 *   - "goiY": người cùng chọn / người gợi ý khi bộ đã sang đợt N → "Gợi ý tấm này";
 *   - "giaDinh": gia đình được mời ở trang chính → mở màn mua của gia đình với tấm này;
 *   - "chiXem": không có đường đặt (vd. bộ đóng, chưa tới đợt N) — chỉ một dòng giải thích.
 */
export type CachDatTuManTreo = "gio" | "dotMoi" | "goiY" | "giaDinh" | "chiXem";

export function cachDatTuManTreo(p: {
  nguCanh: NguCanhLuotChon;
  /** Đang ở màn có giỏ riêng của lượt (màn đợt N của ba mẹ / màn mua của gia đình). */
  trongManGio?: boolean;
  /** Đợt 1 đã khoá (đã chốt / đã giao). */
  khoa: boolean;
  /** Bộ đã sang chọn thêm đợt N (máy chủ nói `cheDoChonThem`). */
  dotMoiMo: boolean;
  /** Bộ còn mở cho gia đình gửi yêu cầu (`dangMoChoKhachXem`). */
  moChoGiaDinh: boolean;
}): CachDatTuManTreo {
  if (p.trongManGio) return p.nguCanh === "goiY" || p.nguCanh === "cungChon" ? "goiY" : "gio";
  if (p.nguCanh === "giaDinh") return p.moChoGiaDinh ? "giaDinh" : "chiXem";
  if (!p.khoa) return "gio";
  if (!p.dotMoiMo) return "chiXem";
  return p.nguCanh === "dot1" || p.nguCanh === "dotThem" ? "dotMoi" : "goiY";
}

/**
 * BB-400 vòng 2 — ai được GHI tim gia đình / gợi ý (`POST /api/g/tim-gia-dinh`):
 *   - viewer (gia đình được mời): luôn (như BB-345);
 *   - co_editor / suggester: CHỈ khi bộ đã sang đợt N (đợt 1 khoá — đường `/api/g/selection`
 *     của họ đã đóng); đợt 1 họ chọn thẳng vào danh sách như cũ;
 *   - owner: không bao giờ (tim của ba mẹ là `selection_items`, chốt đợt mới là việc của ba mẹ).
 */
export function duocGhiTimGiaDinh(vai: string, dangCheDoChonThem: boolean): boolean {
  if (vai === "viewer") return true;
  if (vai === "co_editor" || vai === "suggester") return dangCheDoChonThem;
  return false;
}

export type LoaiLoc = "all" | "selected" | "unselected" | "giaDinh";

export interface ChipLoc {
  loai: LoaiLoc;
  nhan: string;
  so: number;
}

/**
 * Hàng chip lọc của một lượt — CÙNG tên, CÙNG thứ tự ở mọi lượt ("nút cùng chỗ cùng tên").
 *
 *   - Ba mẹ / người cùng chọn / người gợi ý (đợt 1 hay đợt N): Tất cả · Đã chọn · Chưa chọn,
 *     thêm "Gia đình thích" khi gia đình đã thả tim tấm nào.
 *   - Bộ đã khoá (đợt 1 xong, chưa vào đợt N): chỉ "Tất cả" (+ "Gia đình thích") — BB-295 #15.
 *   - Gia đình được mời: Tất cả · "Gia đình thích" (= tim CỦA HỌ) khi đã thả tim.
 */
export function chipLocLuotChon(
  nc: NguCanhLuotChon,
  so: { tong: number; daChon: number; giaDinhThich: number; khoa: boolean },
): ChipLoc[] {
  const g = vi.gallery;
  const ds: ChipLoc[] = [{ loai: "all", nhan: g.filterAll, so: so.tong }];
  if (nc === "giaDinh") {
    if (so.daChon > 0) ds.push({ loai: "selected", nhan: g.locGiaDinhThich, so: so.daChon });
    return ds;
  }
  if (!so.khoa) {
    ds.push({ loai: "selected", nhan: g.filterSelected, so: so.daChon });
    ds.push({ loai: "unselected", nhan: g.filterUnselected, so: Math.max(0, so.tong - so.daChon) });
  }
  if (so.giaDinhThich > 0) ds.push({ loai: "giaDinh", nhan: g.locGiaDinhThich, so: so.giaDinhThich });
  return ds;
}

/** Trần một ghi chú — cùng `maxLength` ô ghi chú của màn xem lớn. */
export const GHI_CHU_TOI_DA = 500;

/** Đặt / xoá ghi chú của một tấm trong nháp đợt (chữ trống = xoá). Không đổi object cũ. */
export function datGhiChuNhap(
  ghiChu: Readonly<Record<string, string>> | undefined,
  photoId: string,
  chu: string,
): Record<string, string> {
  const moi = { ...(ghiChu ?? {}) };
  const sach = chu.trim().slice(0, GHI_CHU_TOI_DA);
  if (sach) moi[photoId] = sach;
  else delete moi[photoId];
  return moi;
}

/**
 * Ghi chú gửi kèm lúc chốt đợt: CHỈ của tấm mới còn trong nháp (tấm đã bỏ tim thì ghi chú
 * của nó không đi theo), đúng thứ tự ảnh của đợt.
 */
export function ghiChuGuiKemDot(
  anhNhap: readonly string[],
  ghiChu: Readonly<Record<string, string>> | undefined,
): Array<{ photoId: string; ghiChu: string }> {
  if (!ghiChu) return [];
  return anhNhap.flatMap((photoId) => {
    const chu = ghiChu[photoId]?.trim();
    return chu ? [{ photoId, ghiChu: chu.slice(0, GHI_CHU_TOI_DA) }] : [];
  });
}

/**
 * Phía máy chủ (`chotDotChon`): ghi chú nào được ghi — CHỈ của tấm mới hợp lệ của đợt
 * (`hopLe`), chữ đã cắt trắng, trống thì bỏ. Tấm đã chốt ở đợt trước không bị đổi ghi chú.
 */
export function ghiChuChoAnhMoi(
  ghiChu: ReadonlyArray<{ photoId: string; ghiChu: string }> | undefined,
  hopLe: readonly string[],
): Map<string, string> {
  const duoc = new Set(hopLe);
  const m = new Map<string, string>();
  for (const g of ghiChu ?? []) {
    const chu = g.ghiChu.trim().slice(0, GHI_CHU_TOI_DA);
    if (chu && duoc.has(g.photoId)) m.set(g.photoId, chu);
  }
  return m;
}

/** Lọc một danh sách ảnh theo chip + nhóm ảnh — một hàm cho mọi lượt. */
export function locAnhLuotChon<T extends { id: string; mark?: string | null; subfolder?: string | null }>(
  anh: readonly T[],
  loc: LoaiLoc,
  nhom: string,
  giaDinhThich: ReadonlySet<string>,
): T[] {
  return anh.filter((p) => {
    if (nhom && p.subfolder !== nhom) return false;
    if (loc === "selected") return p.mark === "selected";
    if (loc === "unselected") return p.mark !== "selected";
    if (loc === "giaDinh") return giaDinhThich.has(p.id);
    return true;
  });
}
