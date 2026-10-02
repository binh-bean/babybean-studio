/**
 * Luật "đợt chọn" — mua thêm ảnh theo từng đợt, tách khỏi giao diện và cơ sở dữ
 * liệu để phép thử gọi đúng hàm mà route và màn hình cùng dùng.
 *
 * OWNER: DEV-BE. Task BB-321. Chủ studio 29/09/2026 (luật doanh thu):
 *
 *     "Khách đã chốt đợt 1 và CSKH đã xác nhận thì ảnh đợt 1 bị KHOÁ; muốn đổi
 *      phải xin mở lại. Còn mua thêm ở đợt 2, đợt 3… thì khách vẫn chọn ảnh và
 *      chốt từng đợt riêng. Đó là doanh thu — app không được cản."
 *
 * Tệp này KHÔNG import gì phía máy chủ (không `server-only`, không supabase):
 * màn khách (client component) và route cùng import được.
 *
 * ---------------------------------------------------------------------------
 * Tóm tắt mô hình (chi tiết ở db/migrations/0077-dot-chon-anh.sql)
 * ---------------------------------------------------------------------------
 *   · Đợt 1 = lượt chọn + chốt hiện có. KHÔNG có dòng ở `selection_rounds`.
 *   · Đợt N ≥ 2 = một dòng `selection_rounds` + ảnh/sản phẩm có `dot = N`.
 *   · Dòng của đợt ≥ 2 chỉ tồn tại khi đợt `cho_xac_nhan` / `da_xac_nhan` ⇒ luôn khoá.
 *   · Bị từ chối / mở lại ⇒ dòng ảnh bị xoá, ảnh "trả về cho khách"; khách chốt
 *     lại thành đợt MỚI (số đợt luôn tăng, không dùng lại số cũ).
 */

import { vi } from "@/i18n";
import { isGalleryLocked } from "@/lib/gallery-status";
import { laKhoaTheoLark } from "@/lib/lark/trang-thai-hau-ky";

// ---------------------------------------------------------------------------
// Trạng thái đợt
// ---------------------------------------------------------------------------

export const TRANG_THAI_DOT = ["cho_xac_nhan", "da_xac_nhan", "tu_choi", "da_mo_lai"] as const;
export type TrangThaiDot = (typeof TRANG_THAI_DOT)[number];

/** Bản tóm tắt tối thiểu của một đợt — đủ cho mọi hàm thuần bên dưới. */
export interface DotTomTat {
  soDot: number;
  trangThai: TrangThaiDot;
}

/** Ảnh/sản phẩm của đợt còn nằm trong `selection_items`/`selection_addons` (tức KHOÁ). */
export function dotDangKhoa(trangThai: TrangThaiDot): boolean {
  return trangThai === "cho_xac_nhan" || trangThai === "da_xac_nhan";
}

/** Đợt đã được trả về cho khách chọn lại (từ chối hoặc mở lại). */
export function dotDaTraLai(trangThai: TrangThaiDot): boolean {
  return trangThai === "tu_choi" || trangThai === "da_mo_lai";
}

// ---------------------------------------------------------------------------
// Khi nào màn khách vào chế độ "Chọn thêm ảnh"
// ---------------------------------------------------------------------------

/**
 * Từ lúc CSKH đã xác nhận đợt 1 (bộ ảnh rời `submitted` sang `in_retouch`) tới
 * hết vòng đời, khách ở chế độ "Chọn thêm ảnh".
 *
 * `submitted` CỐ Ý không có ở đây: migration 0060 (chủ studio 22/09/2026) chốt
 * "mở tự do cho tới khi nhân sự chốt" — trước khi CSKH xác nhận, khách vẫn sửa
 * thẳng đợt 1 được, không cần đợt 2. `expired`/`archived` cũng không: đó là link
 * hết hạn, không phải khách đã chốt.
 */
export const TRANG_THAI_CHON_THEM = ["in_retouch", "awaiting_approval", "approved", "delivered"] as const;

/**
 * Trạng thái app còn "cũ" mà Lark có thể đã đi xa hơn (BB-285): app ghi
 * ready/in_review/submitted nhưng CSKH đã chốt bên Lark.
 */
const TRANG_THAI_APP_CON_CU = ["ready", "in_review", "submitted"] as const;

/**
 * Bộ ảnh có ở chế độ "Chọn thêm ảnh" không.
 *
 * Chủ studio 29/09/2026: chế độ này chỉ mở SAU KHI CSKH chốt (đợt 1 khoá). Có hai
 * cách "CSKH chốt":
 *   1. Trong app: bộ ảnh sang `in_retouch` trở đi.
 *   2. Bên Lark: cột trạng thái hậu kỳ đã ở "Đã chọn hình" trở đi
 *      (`laKhoaTheoLark`, giai đoạn ≥ 2) dù app còn ghi ready/in_review/submitted.
 *      Đúng luật khoá của BB-285 (`isGalleryLocked(status, larkMa)`) — dùng lại
 *      cùng hàm quyết định Lark, không viết luật thứ hai.
 */
export function dangCheDoChonThem(status: string, larkMa?: string | null): boolean {
  if ((TRANG_THAI_CHON_THEM as readonly string[]).includes(status)) return true;
  return (
    (TRANG_THAI_APP_CON_CU as readonly string[]).includes(status) && !!larkMa && laKhoaTheoLark(larkMa)
  );
}

// ---------------------------------------------------------------------------
// Số đợt kế tiếp
// ---------------------------------------------------------------------------

/**
 * Số đợt cho lượt chốt mới = lớn nhất đã dùng + 1, tối thiểu 2. Đếm CẢ đợt bị từ
 * chối/đã mở lại: số đợt không bao giờ dùng lại, để Lark/CSKH nói "đợt 3" thì
 * luôn chỉ đúng một thứ.
 */
export function soDotKeTiep(cacDot: ReadonlyArray<{ soDot: number }>): number {
  return Math.max(1, ...cacDot.map((d) => d.soDot)) + 1;
}

// ---------------------------------------------------------------------------
// Tiền của một đợt
// ---------------------------------------------------------------------------

export interface TienDot {
  /** Số ảnh của đợt này phải TÍNH TIỀN — từ đợt 2, MỌI ảnh mới đều tính tiền. */
  soAnhTinhTien: number;
  /** soAnhTinhTien × giá mỗi ảnh. */
  tienAnh: number;
  tienSanPham: number;
  tong: number;
}

/**
 * Tiền của đợt đang chốt.
 *
 * Chủ studio 29/09/2026: đợt 2 trở đi tính tiền TỪ ẢNH ĐẦU TIÊN. Phần gói còn
 * trống ở đợt 1 KHÔNG được dùng ở đợt 2 (bản đầu của BB-321 tính theo lát và cho
 * dùng phần trống — đã bỏ). Muốn dùng hết hạn mức gói thì khách chọn đủ ở đợt 1
 * hoặc nhờ studio chọn bổ sung (xem `kiemTraNhoStudioChon`).
 *
 * `daChonTruoc` và `hanMuc` giữ trong kiểu để bên gọi cũ không vỡ biên dịch,
 * nhưng KHÔNG còn ảnh hưởng tới tiền.
 */
export function tinhTienDot(p: {
  soAnhMoi: number;
  /** @deprecated không còn dùng — đợt ≥ 2 tính tiền từ ảnh đầu tiên. */
  daChonTruoc?: number;
  /** @deprecated không còn dùng — đợt ≥ 2 tính tiền từ ảnh đầu tiên. */
  hanMuc?: number | null;
  giaMoiAnh: number;
  tienSanPham: number;
}): TienDot {
  const soAnhTinhTien = Math.max(0, p.soAnhMoi);
  const tienAnh = soAnhTinhTien * Math.max(0, p.giaMoiAnh);
  const tienSanPham = Math.max(0, p.tienSanPham);
  return { soAnhTinhTien, tienAnh, tienSanPham, tong: tienAnh + tienSanPham };
}

// ---------------------------------------------------------------------------
// Khoá theo đợt
// ---------------------------------------------------------------------------

/**
 * Ảnh thuộc đợt `dot` có đang khoá không.
 *
 *   · Đợt ≥ 2: LUÔN khoá (dòng chỉ tồn tại khi đợt đang chờ/đã xác nhận).
 *   · Đợt 1: khoá theo trạng thái bộ ảnh — đúng luật cũ (`isGalleryLocked`,
 *     migration 0060: khoá từ lúc CSKH xác nhận, không phải lúc khách bấm Chốt).
 */
export function anhDangKhoa(dot: number, trangThaiBoAnh: string, larkMa?: string | null): boolean {
  if (dot >= 2) return true;
  return isGalleryLocked(trangThaiBoAnh, larkMa);
}

export function nhanKhoaAnh(dot: number): string {
  return `Đã chốt đợt ${dot}`;
}

export interface KetQuaChonThem {
  /** Ảnh được phép chọn ở đợt mới (đã bỏ trùng). */
  hopLe: string[];
  /** Ảnh đã nằm trong một đợt khác — KHÔNG chọn lại được. */
  biKhoa: Array<{ photoId: string; dot: number }>;
}

/**
 * Phân loại danh sách ảnh khách gửi lên khi chốt đợt mới.
 *
 * `daCo` = mọi ảnh ĐÃ nằm trong `selection_items` của lượt chọn (photoId → số
 * đợt). Ảnh đã có ở bất kỳ đợt nào đều bị khoá: đổi chúng phải đi đường xin mở
 * lại, KHÔNG đi đường mua thêm.
 */
export function phanLoaiAnhChonThem(
  photoIds: ReadonlyArray<string>,
  daCo: ReadonlyMap<string, number>,
): KetQuaChonThem {
  const daXet = new Set<string>();
  const hopLe: string[] = [];
  const biKhoa: KetQuaChonThem["biKhoa"] = [];
  for (const id of photoIds) {
    if (daXet.has(id)) continue;
    daXet.add(id);
    const dot = daCo.get(id);
    if (dot === undefined) hopLe.push(id);
    else biKhoa.push({ photoId: id, dot });
  }
  return { hopLe, biKhoa };
}

// ---------------------------------------------------------------------------
// Mở lại (nút của CSKH)
// ---------------------------------------------------------------------------

/**
 * Trạng thái mà CSKH mở lại được. Trước BB-321 chỉ có `expired`/`submitted`;
 * nay thêm `in_retouch` (kèm cảnh báo hậu kỳ có thể đã chỉnh). `delivered` cố ý
 * KHÔNG có: khách muốn thêm thì mua đợt mới, không mở lại.
 */
export const TRANG_THAI_MO_LAI_DUOC = ["submitted", "expired", "in_retouch"] as const;

export function laTrangThaiMoLaiDuoc(status: string): boolean {
  return (TRANG_THAI_MO_LAI_DUOC as readonly string[]).includes(status);
}

export const CANH_BAO_MO_LAI_HAU_KY =
  "Hậu kỳ có thể đã bắt đầu chỉnh — mở lại để khách đổi ảnh đợt đã chốt";

export interface LuaChonMoLai {
  /** Có nút "Mở lại" hoạt động được không. */
  duoc: boolean;
  /** Khi `duoc = false`: câu giải thích hiện thay cho nút (không bao giờ để nút chết). */
  lyDoKhong: string | null;
  /** Cảnh báo phải hiện TRƯỚC khi bấm (chỉ `in_retouch`). */
  canhBao: string | null;
  /** Các đợt đang khoá có thể mở lại (luôn có đợt 1). */
  cacDot: Array<{ soDot: number; nhan: string }>;
  /** Đợt chọn sẵn: đợt khoá GẦN NHẤT (đợt cao nhất), không có thì đợt 1. */
  dotMacDinh: number;
}

/**
 * Nút "Mở lại" nên hiện thế nào. MỘT nguồn cho route (kiểm) lẫn banner + form +
 * menu quản trị (hiển thị) — hai bên không thể lệch nhau.
 *
 *   · `submitted`, `expired`: chỉ có đợt 1 (bộ ảnh chưa xác nhận / link hết hạn).
 *   · `in_retouch`: đợt 1 + mọi đợt ≥ 2 đang khoá (chờ hoặc đã xác nhận).
 */
export function luaChonMoLai(status: string, cacDot: ReadonlyArray<DotTomTat>): LuaChonMoLai {
  if (!laTrangThaiMoLaiDuoc(status)) {
    return {
      duoc: false,
      lyDoKhong: giaiThichKhongMoLaiDuoc(status),
      canhBao: null,
      cacDot: [],
      dotMacDinh: 1,
    };
  }

  const dotKhoa = status === "in_retouch"
    ? cacDot.filter((d) => dotDangKhoa(d.trangThai)).map((d) => d.soDot).sort((a, b) => a - b)
    : [];

  const danhSach = [
    { soDot: 1, nhan: "Đợt 1 (ảnh trong gói)" },
    ...dotKhoa.map((n) => ({ soDot: n, nhan: `Đợt ${n} (mua thêm)` })),
  ];

  return {
    duoc: true,
    lyDoKhong: null,
    canhBao: status === "in_retouch" ? CANH_BAO_MO_LAI_HAU_KY : null,
    cacDot: danhSach,
    dotMacDinh: dotKhoa.length > 0 ? (dotKhoa[dotKhoa.length - 1] ?? 1) : 1,
  };
}

/** Câu giải thích cho trạng thái KHÔNG mở lại được — hiện thay cho nút chết. */
export function giaiThichKhongMoLaiDuoc(status: string): string {
  switch (status) {
    case "delivered":
      return (
        "Bộ ảnh đã giao nên không mở lại được. Khách muốn thêm ảnh thì chọn thêm " +
        "ở một đợt mới (mục \"Chọn thêm ảnh\" trên màn của khách), rồi CSKH xác nhận đợt đó."
      );
    case "awaiting_approval":
    case "approved":
      return (
        "Bộ ảnh đã chỉnh xong và chờ khách duyệt / chuyển in nên không mở lại chọn ảnh được. " +
        "Khách muốn sửa ảnh đã chỉnh thì dùng yêu cầu sửa; muốn thêm ảnh thì chọn thêm ở đợt mới."
      );
    case "in_review":
    case "ready":
      return "Bộ ảnh đang mở, khách vẫn chọn được — không cần mở lại.";
    case "archived":
      return "Bộ ảnh đã lưu trữ nên không mở lại được.";
    default:
      return "Trạng thái này chưa mở lại được.";
  }
}

// ---------------------------------------------------------------------------
// Chữ hiển thị cho khách
// ---------------------------------------------------------------------------

export function nhanTrangThaiDotChoKhach(trangThai: TrangThaiDot, lyDoTuChoi?: string | null): string {
  switch (trangThai) {
    case "cho_xac_nhan":
      return vi.gallery.loiBean.dotChoXacNhan;
    case "da_xac_nhan":
      return vi.gallery.loiBean.dotDaXacNhan;
    case "tu_choi":
      return lyDoTuChoi ? vi.gallery.loiBean.dotChuaNhanLyDo.replace("{lyDo}", lyDoTuChoi) : vi.gallery.loiBean.dotChuaNhan;
    case "da_mo_lai":
      return vi.gallery.loiBean.dotDaMoLai;
  }
}

// ---------------------------------------------------------------------------
// Đợt 1 chọn THIẾU so với hạn mức: nhờ studio chọn bổ sung
// ---------------------------------------------------------------------------

export const CAU_DONG_Y_STUDIO_CHON =
  "Tôi đồng ý với ảnh Bean chọn dùm và không đổi lại";

export type KetQuaKiemTra =
  | { ok: true }
  | { ok: false; code: "INVALID_INPUT"; message: string; chiTiet: Record<string, unknown> };

/**
 * Khách chốt đợt 1 khi số ảnh đã chọn ÍT HƠN hạn mức có thể nhờ studio chọn bổ
 * số ảnh còn thiếu. Điều kiện:
 *   · chỉ có nghĩa khi còn thiếu (`soAnhThieu > 0`); hết thiếu thì lời nhờ bị bỏ qua;
 *   · đã nhờ thì BẮT BUỘC tick "đồng ý với ảnh studio chọn dùm và không đổi lại".
 *
 * Trả `soNho` = số ảnh nhờ studio chọn (do MÁY CHỦ tính, không tin số khách gửi).
 */
export function kiemTraNhoStudioChon(p: {
  soAnhThieu: number;
  nho: boolean;
  dongY: boolean;
}): { ok: true; soNho: number } | Extract<KetQuaKiemTra, { ok: false }> {
  if (!p.nho || p.soAnhThieu <= 0) return { ok: true, soNho: 0 };
  if (!p.dongY) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: vi.gallery.loiBean.canTickDongY.replace("{cau}", CAU_DONG_Y_STUDIO_CHON),
      chiTiet: { loai: "thieu_dong_y_anh_studio_chon", soAnhThieu: p.soAnhThieu },
    };
  }
  return { ok: true, soNho: p.soAnhThieu };
}

// ---------------------------------------------------------------------------
// Sản phẩm in CHƯA GẮN ẢNH khi chốt
// ---------------------------------------------------------------------------

// Câu RÚT GỌN anh (chủ dự án) chốt 29/09/2026 khi duyệt bản vẽ BB-321 (≤ 12 chữ).
export const CAU_BIET_ANH_IN_CHAM = "Tôi biết chưa chọn ảnh in thì nhận ảnh chậm hơn";

/**
 * Chốt (đợt 1 và mọi đợt) mà còn sản phẩm in chưa có ảnh thì BẮT BUỘC khách tick
 * `CAU_BIET_ANH_IN_CHAM`. Không có sản phẩm nào chưa gắn ảnh thì không đòi gì.
 */
export function kiemTraSanPhamInChuaAnh(p: { soChuaAnh: number; biet: boolean }): KetQuaKiemTra {
  if (p.soChuaAnh <= 0 || p.biet) return { ok: true };
  return {
    ok: false,
    code: "INVALID_INPUT",
    message: `Còn ${p.soChuaAnh} sản phẩm in chưa chọn ảnh — ba mẹ tick "${CAU_BIET_ANH_IN_CHAM}" mới chốt được, hoặc chọn ảnh in trước nhé`,
    chiTiet: { loai: "thieu_biet_anh_in_cham", soSanPhamInChuaAnh: p.soChuaAnh },
  };
}

/**
 * Đếm sản phẩm in chưa gắn ảnh của đợt 1.
 *   · Ảnh in / khung trong gói (số lượng Q): chưa xếp = max(0, Q − số tấm đã xếp).
 *   · Album (một CUỐN, không có "đủ tấm"): chưa có tấm nào thì tính cả Q cuốn.
 *   · Album mua thêm và sản phẩm mua thêm cần ảnh mà chưa có ảnh: tính số lượng.
 */
export function demSanPhamInChuaAnh(p: {
  hangTrongGoi: ReadonlyArray<{ galleryItemId: string; quantity: number; nhom: string }>;
  /** galleryItemId → số tấm ảnh đã xếp vào dòng đó. */
  soXepTheoHang: ReadonlyMap<string, number>;
  /** Mua thêm: mỗi dòng đã có ảnh gắn chưa. */
  muaThem: ReadonlyArray<{ soLuong: number; daCoAnh: boolean }>;
}): number {
  let dem = 0;
  for (const h of p.hangTrongGoi) {
    const daXep = p.soXepTheoHang.get(h.galleryItemId) ?? 0;
    if (h.nhom === "album") {
      if (daXep === 0) dem += h.quantity;
    } else {
      dem += Math.max(0, h.quantity - daXep);
    }
  }
  for (const m of p.muaThem) if (!m.daCoAnh) dem += m.soLuong;
  return dem;
}
