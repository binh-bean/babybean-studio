/**
 * BB-377 — ảnh chỉnh sửa THEO ĐỢT: ảnh trong gói và ảnh MUA THÊM (hàm thuần,
 * không mạng, không DB — phép thử gọi thẳng và kiểm ngược được).
 *
 * Anh 06/10: "App dụng thêm logic vào cả phần ảnh gia đình chọn mua thêm." Ảnh
 * mua thêm đến từ hai đường:
 *   1. ba mẹ chọn thêm theo đợt (BB-321): `selection_rounds` đợt ≥ 2 còn khoá
 *      (`cho_xac_nhan` / `da_xac_nhan`), ảnh ở `anh_ids`;
 *   2. người thân được mời đề xuất (BB-345): `yeu_cau_mua_them` loại `chinh_sua`
 *      đã chốt (`da_chot` / `da_thanh_toan`), ảnh ở `anh_ids`, link ở `share_link_id`.
 *
 * Thợ chỉnh bỏ ảnh đã chỉnh của mọi đợt vào CÙNG một thư mục "ảnh chỉnh sửa"
 * của link Drive. Tấm chỉnh ghép về ảnh gốc theo tên (`ghepAnhChinhVoiGoc`), ảnh
 * gốc nằm trong đợt nào thì tấm chỉnh thuộc đợt đó. Không nằm trong đợt mua thêm
 * nào (hoặc không ghép được ảnh gốc) → "Trong gói".
 *
 * Mỗi đợt mua thêm có vòng duyệt RIÊNG (bảng `anh_chinh_dot`, migration 0095):
 * CSKH gửi riêng, khách duyệt/xin sửa riêng, KHÔNG đụng trạng thái bộ ảnh (bộ đã
 * duyệt/đã giao vẫn giữ nguyên). Ảnh trong gói đi đúng vòng BB-371 cũ.
 * Chưa áp 0095 → mọi tấm đi vòng cũ (một mốc gửi, theo trạng thái bộ), đợt chỉ
 * còn là NHÃN.
 */

import { khachThayAnhChinh } from "./nhan-dien";

/** Khoá đợt của ảnh trong gói (đợt 1 / lượt chọn gốc). */
export const KHOA_TRONG_GOI = "goc";

/** `dot:<số đợt>` (BB-321) hoặc `mt:<id yeu_cau_mua_them>` (BB-345). */
const KHOA_MUA_THEM_RE = /^(dot:[2-9][0-9]{0,2}|mt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function laKhoaMuaThem(khoa: unknown): khoa is string {
  return typeof khoa === "string" && KHOA_MUA_THEM_RE.test(khoa);
}

/**
 * Trạng thái bộ ảnh mà vòng duyệt ảnh MUA THÊM chạy được: đúng tập "chế độ chọn
 * thêm" của BB-321 (`TRANG_THAI_CHON_THEM`) — đợt mua thêm chỉ tồn tại từ đây.
 * Chép lại ở đây (không import `dot-chon.ts`) để tệp này không kéo theo luật Lark.
 */
export const TRANG_THAI_VONG_MUA_THEM = ["in_retouch", "awaiting_approval", "approved", "delivered"] as const;

export interface NhomMuaThem {
  khoa: string;
  /** "Mua thêm đợt 2" / "Mua thêm (gia đình đề xuất)". */
  nhan: string;
  /** Nhãn link mời của người thân đã đề xuất (BB-345), không có thì null. */
  deXuatBoi: string | null;
  /** Id ẢNH GỐC thuộc đợt. */
  anhGocIds: string[];
}

export interface DotChonTho {
  soDot: number;
  trangThai: string;
  anhIds: readonly string[] | null;
}

export interface YeuCauMuaThemTho {
  id: string;
  loai: string | null;
  trangThai: string;
  anhIds: readonly string[] | null;
  nhanLink: string | null;
  coLink: boolean;
}

/** Trạng thái đợt chọn còn KHOÁ ảnh (ảnh đã mua). Đợt bị từ chối/mở lại thì ảnh đã trả về. */
const DOT_DA_MUA = ["cho_xac_nhan", "da_xac_nhan"];
/** Yêu cầu chỉnh sửa của người thân đã chốt mua. `moi`/`da_lien_he` chưa phải mua, `huy` thì thôi. */
const YEU_CAU_DA_MUA = ["da_chot", "da_thanh_toan"];

/**
 * Các nhóm mua thêm của một bộ ảnh, theo thứ tự hiển thị: đợt chọn (tăng dần), rồi
 * yêu cầu của người thân (theo thứ tự đưa vào). Nhãn yêu cầu người thân đánh số khi
 * có nhiều hơn một.
 */
export function dungNhomMuaThem(dot: readonly DotChonTho[], yeuCau: readonly YeuCauMuaThemTho[]): NhomMuaThem[] {
  const nhom: NhomMuaThem[] = [];
  for (const d of [...dot].sort((a, b) => a.soDot - b.soDot)) {
    if (d.soDot < 2 || !DOT_DA_MUA.includes(d.trangThai) || !d.anhIds?.length) continue;
    nhom.push({ khoa: `dot:${d.soDot}`, nhan: `Mua thêm đợt ${d.soDot}`, deXuatBoi: null, anhGocIds: [...d.anhIds] });
  }
  const yc = yeuCau.filter((y) => y.loai === "chinh_sua" && YEU_CAU_DA_MUA.includes(y.trangThai) && !!y.anhIds?.length);
  yc.forEach((y, i) => {
    const so = yc.length > 1 ? ` ${i + 1}` : "";
    nhom.push({
      khoa: `mt:${y.id}`,
      nhan: y.coLink ? `Mua thêm${so} (gia đình đề xuất)` : `Mua thêm${so}`,
      deXuatBoi: y.coLink ? (y.nhanLink?.trim() || "link mời") : null,
      anhGocIds: [...y.anhIds!],
    });
  });
  return nhom;
}

/** Ảnh gốc này thuộc đợt nào. Nhóm đầu tiên chứa nó thắng (đợt chọn trước yêu cầu người thân). */
export function khoaCuaAnhGoc(gocId: string | null | undefined, nhom: readonly NhomMuaThem[]): string {
  if (!gocId) return KHOA_TRONG_GOI;
  for (const n of nhom) if (n.anhGocIds.includes(gocId)) return n.khoa;
  return KHOA_TRONG_GOI;
}

export function nhanCuaKhoa(khoa: string | null | undefined, nhom: readonly NhomMuaThem[]): string {
  if (!khoa || khoa === KHOA_TRONG_GOI) return "Trong gói";
  return nhom.find((n) => n.khoa === khoa)?.nhan ?? "Mua thêm";
}

/** Một dòng `anh_chinh_dot` (0095): mốc CSKH gửi và mốc khách duyệt của một đợt mua thêm. */
export interface MocDot {
  guiLuc: string | null;
  duyetLuc: string | null;
}

export interface DauVaoThayTheoDot {
  trangThaiBo: string;
  khoa: string;
  /** Mốc gửi chung (ảnh trong gói, BB-371). */
  mocChung: string | null | undefined;
  /** Mốc từng đợt mua thêm. `null` = CHƯA ÁP 0095 → mọi tấm đi luật cũ. */
  mocDot: ReadonlyMap<string, MocDot> | null;
  anhTaoLuc: string | null | undefined;
}

/**
 * Khách đã được thấy tấm ảnh chỉnh này chưa.
 *   - trong gói, hoặc chưa áp 0095: đúng luật BB-371 (`khachThayAnhChinh`);
 *   - mua thêm: bộ ở giai đoạn có đợt mua thêm, CSKH đã gửi ĐÚNG đợt này, và tấm có
 *     trong app trước lúc gửi. Mốc gửi chung (trong gói) KHÔNG mở ảnh mua thêm, mốc
 *     của đợt này không mở ảnh của đợt khác.
 */
export function khachThayAnhChinhTheoDot(v: DauVaoThayTheoDot): boolean {
  if (v.mocDot === null || !laKhoaMuaThem(v.khoa)) return khachThayAnhChinh(v.trangThaiBo, v.mocChung, v.anhTaoLuc);
  if (!(TRANG_THAI_VONG_MUA_THEM as readonly string[]).includes(v.trangThaiBo)) return false;
  const gui = v.mocDot.get(v.khoa)?.guiLuc;
  if (!gui || !v.anhTaoLuc) return false;
  const g = Date.parse(gui);
  const a = Date.parse(v.anhTaoLuc);
  if (Number.isNaN(g) || Number.isNaN(a)) return false;
  return a <= g;
}

/** Mốc gửi áp cho tấm ảnh thuộc `khoa` (để tính "chưa gửi" ở màn quản trị). */
export function mocGuiCuaKhoa(
  khoa: string,
  mocChung: string | null | undefined,
  mocDot: ReadonlyMap<string, MocDot> | null,
): string | null {
  if (mocDot === null || !laKhoaMuaThem(khoa)) return mocChung ?? null;
  return mocDot.get(khoa)?.guiLuc ?? null;
}

export type TrangThaiDuyetDot = "chua_gui" | "cho_duyet" | "dang_sua" | "da_duyet";

/**
 * Vòng duyệt của MỘT đợt mua thêm:
 *   chua_gui  — CSKH chưa gửi đợt này lần nào;
 *   dang_sua  — ba mẹ đã xin sửa, vòng sửa của đợt còn mở (thợ đang làm);
 *   da_duyet  — ba mẹ duyệt SAU lần gửi gần nhất;
 *   cho_duyet — đã gửi, chờ ba mẹ duyệt hoặc xin sửa.
 */
export function trangThaiDuyetDot(moc: MocDot | null | undefined, coVongSuaMo: boolean): TrangThaiDuyetDot {
  if (!moc?.guiLuc) return "chua_gui";
  if (coVongSuaMo) return "dang_sua";
  if (moc.duyetLuc && Date.parse(moc.duyetLuc) >= Date.parse(moc.guiLuc)) return "da_duyet";
  return "cho_duyet";
}

/**
 * Trạng thái của nhóm "Trong gói" suy từ trạng thái bộ ảnh (BB-371): bộ chờ duyệt
 * thì chờ duyệt, đang chỉnh mà có vòng sửa mở thì đang sửa, đã duyệt/đã giao thì xong.
 */
export function trangThaiDuyetTrongGoi(trangThaiBo: string, coVongSuaMo: boolean): TrangThaiDuyetDot {
  if (trangThaiBo === "awaiting_approval") return "cho_duyet";
  if (trangThaiBo === "approved" || trangThaiBo === "delivered") return "da_duyet";
  if (trangThaiBo === "in_retouch" && coVongSuaMo) return "dang_sua";
  return "chua_gui";
}

/**
 * CSKH bấm "Gửi khách duyệt" cho một đợt mua thêm được không: đợt có ảnh, bộ ở giai
 * đoạn có đợt mua thêm, và — nếu đợt đang chờ duyệt / đã duyệt — phải có tấm MỚI
 * chưa gửi (gửi lại y nguyên là báo khách vô cớ).
 */
export function guiDuocDotMuaThem(p: {
  trangThaiBo: string;
  soAnh: number;
  soChuaGui: number;
  trangThai: TrangThaiDuyetDot;
}): boolean {
  if (p.soAnh === 0) return false;
  if (!(TRANG_THAI_VONG_MUA_THEM as readonly string[]).includes(p.trangThaiBo)) return false;
  if (p.trangThai === "cho_duyet" || p.trangThai === "da_duyet") return p.soChuaGui > 0;
  return true;
}

/** Chỉ người nhận link CHÍNH (owner) được duyệt / xin sửa — người thân (viewer) và mọi vai khác thì không. */
export function duocQuyetAnhChinh(vai: string | null | undefined): boolean {
  return vai === "owner";
}

/**
 * Lần sửa đếm theo BỘ ẢNH, không theo đợt: dòng Hậu Kỳ bên Lark chỉ có MỘT cột
 * Trạng Thái cho cả bộ ("Sửa" → "Sửa lần 2, 3, 4"). Đợt mua thêm không có dòng
 * Hậu Kỳ riêng (BB-321: CSKH tự cập nhật hợp đồng, app không đẩy đợt lên Lark).
 */
export function lanSuaKeTiep(cacVong: readonly { round: number | null | undefined }[]): number {
  return Math.max(0, ...cacVong.map((v) => (Number.isFinite(v.round) ? Number(v.round) : 0))) + 1;
}

/** Gom tấm ảnh theo khoá đợt, giữ thứ tự: Trong gói trước, rồi đúng thứ tự `nhom`. */
export function gomTheoDot<T extends { khoa: string }>(
  anh: readonly T[],
  nhom: readonly NhomMuaThem[],
): { khoa: string; nhan: string; deXuatBoi: string | null; anh: T[] }[] {
  const thuTu = [KHOA_TRONG_GOI, ...nhom.map((n) => n.khoa)];
  const ra = thuTu.map((khoa) => ({
    khoa,
    nhan: nhanCuaKhoa(khoa, nhom),
    deXuatBoi: nhom.find((n) => n.khoa === khoa)?.deXuatBoi ?? null,
    anh: anh.filter((a) => a.khoa === khoa),
  }));
  return ra.filter((g) => g.anh.length > 0);
}
