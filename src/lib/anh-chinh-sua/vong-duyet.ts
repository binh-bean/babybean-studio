/**
 * BB-384 — vòng khách duyệt ảnh chỉnh LUÔN đi trong app (hàm thuần, không mạng,
 * không DB — phép thử gọi thẳng và kiểm ngược được).
 *
 * Anh 07/10 (ảnh chụp màn khách): bộ ở bước "Duyệt ảnh" vẫn hiện khung cũ BB-121 —
 * link "Mở thư mục ảnh đã chỉnh" (Drive), hai nút "Duyệt, cho in"/"Yêu cầu sửa" với
 * một ô chữ chung — vì CSKH gửi bằng đường dán link Drive (`retouch-done`), app
 * không có ảnh chỉnh nào để khách xem. Thanh đáy còn ghi "5 / 5 tấm · Đủ trong gói ·
 * Yêu cầu sửa lại" — luồng xin MỞ LẠI DANH SÁCH CHỌN, sai ngữ cảnh ở bước duyệt.
 *
 * Luật ở đây trả lời bốn câu, cùng một chỗ cho màn khách, route và phép thử:
 *   1. Vùng duyệt trên màn khách vẽ khối nào? (`khoiVungDuyet`)
 *   2. Thanh đáy ở bước duyệt nói gì, nút chính dẫn đâu? (`thanhDayBuocDuyet`)
 *   3. Máy chủ có nhận quyết định duyệt/xin sửa "trong gói" không? (`kiemQuyetTrongGoi`)
 *   4. Màn quản trị có phải cảnh báo "khách chưa xem được ảnh chỉnh" không? (`canhBaoKhachChuaXem`)
 * và hai câu cho lời mời in thêm sau khi duyệt (BB-245 / bh-04):
 *   5. Có mời in thêm không? (`hienLoiMoiInThem`) — tấm nào, sản phẩm nào?
 */

/** Giai đoạn Lark "Đã gửi duyệt" (TRANG_THAI_LARK, docs/21) — Lark nói đã gửi khách duyệt. */
export const GIAI_DOAN_LARK_GUI_DUYET = 5;

export type KhoiVungDuyet =
  /** Ảnh chỉnh CSKH đã gửi, khách xem/duyệt/xin sửa từng tấm ngay trong app. */
  | "anh_trong_app"
  /** Bộ ở bước duyệt (app hoặc Lark) mà app chưa có ảnh chỉnh để xem: lời Bean, KHÔNG nút. */
  | "dang_chuan_bi"
  /** Thông tin (đang chỉnh, đã nhận yêu cầu sửa, đã duyệt, lịch sử) — không nút quyết. */
  | "thong_tin"
  | null;

export function khoiVungDuyet(p: {
  status: string;
  soAnhChinhTrongApp: number;
  /** Giai đoạn Lark (`giaiDoanTienDo`), null = chưa đọc được Lark. */
  giaiDoan: number | null | undefined;
  coVongSuaMo: boolean;
}): KhoiVungDuyet {
  if (p.soAnhChinhTrongApp > 0) return "anh_trong_app";
  if (p.status === "awaiting_approval") return "dang_chuan_bi";
  // Đồng bộ trạng thái Lark: Lark đã "Đã gửi duyệt" mà app còn đang chỉnh, chưa có
  // ảnh chỉnh trong app, và không phải đang sửa theo yêu cầu của ba mẹ.
  if (p.status === "in_retouch" && p.giaiDoan === GIAI_DOAN_LARK_GUI_DUYET && !p.coVongSuaMo) {
    return "dang_chuan_bi";
  }
  if (["in_retouch", "approved", "delivered"].includes(p.status)) return "thong_tin";
  return null;
}

export interface ThanhDayDuyet {
  /** Dòng trái của thanh: thay "5 / 5 tấm · Đủ trong gói". */
  dong: string;
  /** Nút chính; null = không có nút (đang chuẩn bị ảnh — không duyệt mù). */
  nut: string | null;
}

/**
 * Thanh đáy ở BƯỚC DUYỆT. `null` = không phải bước duyệt → giữ thanh chọn ảnh cũ.
 * Bước duyệt = bộ đang chờ khách duyệt (`awaiting_approval`). Có ảnh chỉnh trong app
 * thì nút chính dẫn vào khối duyệt; chưa có thì chỉ có lời Bean, không nút.
 */
export function thanhDayBuocDuyet(p: {
  status: string;
  soAnhChinhTrongApp: number;
  /**
   * BB-402 — số đợt mua thêm đang chờ ba mẹ duyệt ảnh chỉnh (bộ gốc có thể đã duyệt /
   * đã giao). Có đợt chờ duyệt thì thanh đáy là thanh DUYỆT của đợt đó, không phải
   * "Chọn thêm ảnh" hay "Yêu cầu sửa lại".
   */
  soDotMuaThemChoDuyet?: number;
}): ThanhDayDuyet | null {
  if (p.status !== "awaiting_approval") {
    if ((p.soDotMuaThemChoDuyet ?? 0) > 0 && p.soAnhChinhTrongApp > 0) {
      return { dong: "Ảnh chỉnh mua thêm chờ ba mẹ duyệt", nut: "Xem & duyệt ảnh chỉnh" };
    }
    return null;
  }
  if (p.soAnhChinhTrongApp > 0) {
    return {
      dong: `${p.soAnhChinhTrongApp} ảnh chỉnh chờ ba mẹ duyệt`,
      nut: `Xem & duyệt ${p.soAnhChinhTrongApp} ảnh chỉnh`,
    };
  }
  return { dong: "Bean đang chuẩn bị ảnh để ba mẹ duyệt", nut: null };
}

/**
 * Máy chủ (`/api/g/review`, vòng TRONG GÓI) chỉ nhận quyết định khi ba mẹ ĐANG thấy ảnh
 * chỉnh trong app. Bỏ hẳn đường "duyệt mù" theo link Drive: không có tấm nào để xem
 * thì không có gì để duyệt hay chê.
 */
export function kiemQuyetTrongGoi(p: {
  status: string;
  soAnhKhachThay: number;
}): { ok: true } | { ok: false; loi: string } {
  if (p.status !== "awaiting_approval") return { ok: false, loi: "Bộ ảnh chưa tới bước duyệt ảnh đã chỉnh." };
  if (p.soAnhKhachThay <= 0) {
    return { ok: false, loi: "Bean đang chuẩn bị ảnh để ba mẹ duyệt ngay trong app, ba mẹ đợi Bean chút nhé ạ." };
  }
  return { ok: true };
}

export const CANH_BAO_KHACH_CHUA_XEM = "Khách chưa xem được ảnh chỉnh — bấm Đồng bộ ảnh rồi Gửi khách duyệt.";

/**
 * Màn quản trị bộ ảnh: bộ đang ở bước khách duyệt (app `awaiting_approval`, hoặc
 * Lark "Đã gửi duyệt" khi app còn chỉnh) mà khách KHÔNG thấy tấm ảnh chỉnh nào trong app.
 */
export function canhBaoKhachChuaXem(p: {
  status: string;
  giaiDoan: number | null | undefined;
  /** Số ảnh chỉnh trong gói khách đang thấy; null = chưa biết (đang tải) → không cảnh báo. */
  soAnhKhachThay: number | null;
}): string | null {
  if (p.soAnhKhachThay === null || p.soAnhKhachThay > 0) return null;
  const buocDuyet =
    p.status === "awaiting_approval" || (p.status === "in_retouch" && p.giaiDoan === GIAI_DOAN_LARK_GUI_DUYET);
  return buocDuyet ? CANH_BAO_KHACH_CHUA_XEM : null;
}

/**
 * Chặn "Gửi khách duyệt" khi không có ảnh chỉnh (route cũ `retouch-done` lẫn route
 * mới). Trả câu cho nhân viên, null = gửi được.
 */
export function lyDoKhongGuiDuoc(soAnhChinh: number): string | null {
  if (soAnhChinh > 0) return null;
  return "Chưa có ảnh trong thư mục ảnh chỉnh sửa của bộ này. Thợ chỉnh bỏ ảnh vào thư mục con “ảnh chỉnh sửa” trên Drive → bấm Đồng bộ ảnh → đợi kéo xong rồi bấm Gửi khách duyệt.";
}

// ---------------------------------------------------------------------------
// Lời mời in thêm sau khi duyệt (bh-04, anh: "Mời mua lần hai khi khách duyệt in
// mà không yêu cầu chỉnh lại, chứ không phải lúc gửi ảnh chỉnh sửa lần đầu.")
// ---------------------------------------------------------------------------

/**
 * Mời đúng LÚC ba mẹ vừa duyệt cho in và không còn tấm nào xin sửa: bộ `approved`
 * (chưa giao) và không có vòng sửa đang mở. Lúc CSKH mới gửi ảnh chỉnh (chờ duyệt)
 * thì KHÔNG mời. Chỉ người nhận link chính.
 */
export function hienLoiMoiInThem(p: { status: string; coVongSuaMo: boolean; laChu: boolean }): boolean {
  return p.laChu && p.status === "approved" && !p.coVongSuaMo;
}

/**
 * 3 tấm đã chỉnh để mời in: ưu tiên tấm ba mẹ CHƯA từng xin sửa (ưng ngay), rồi mới
 * tới tấm đã sửa xong — giữ thứ tự trong bộ. Không có dữ liệu "đẹp nhất" nào khác,
 * nên không bịa thứ hạng.
 */
export function chonAnhMoiIn<T extends { id: string }>(anh: readonly T[], idDaXinSua: ReadonlySet<string>, n = 3): T[] {
  const ung = anh.filter((a) => !idDaXinSua.has(a.id));
  const sua = anh.filter((a) => idDaXinSua.has(a.id));
  return [...ung, ...sua].slice(0, n);
}

export interface SanPhamGoiY {
  productId: string;
  name: string;
  size?: string | null;
  material?: string | null;
  unitPrice: number | null;
  nhom: string | null;
}

/** Nhóm sản phẩm in (danh mục hậu kỳ) được gợi ý sau khi duyệt. */
const NHOM_IN = ["anh_in", "khung", "album"];

/**
 * Sản phẩm in gợi ý: CHỈ mục có trong danh mục (giá lấy từ dữ liệu), nhóm in ảnh,
 * có giá > 0 — không có giá thì không bán (không bịa giá). Giữ thứ tự danh mục.
 */
export function chonSanPhamGoiY<T extends SanPhamGoiY>(danhMuc: readonly T[], n = 3): T[] {
  return danhMuc
    .filter((sp) => NHOM_IN.includes(sp.nhom ?? "") && typeof sp.unitPrice === "number" && sp.unitPrice > 0)
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Xác nhận "Bean đã nhận gì" sau khi ba mẹ xin sửa
// ---------------------------------------------------------------------------

/**
 * Tách `revision_requests.note` (bản ghép của `ghepGhiChu`: ghi chú chung, rồi mỗi tấm
 * một dòng "• <tên>: <ghi chú>") ra để màn khách xác nhận rõ: bao nhiêu tấm, tấm nào
 * nhắn gì, ghi chú chung là gì. Vòng của đợt mua thêm mở đầu bằng "[<nhãn đợt>]".
 */
export function tomTatVongSua(note: string): {
  soTam: number;
  ghiChuChung: string;
  tam: { ten: string; ghiChu: string }[];
} {
  const tam: { ten: string; ghiChu: string }[] = [];
  const chung: string[] = [];
  for (const dong of (note ?? "").split("\n")) {
    const m = /^• (.+?): (.*)$/.exec(dong);
    if (m) tam.push({ ten: m[1]!, ghiChu: m[2]! });
    else if (dong.trim() && !/^\[.+\]$/.test(dong.trim())) chung.push(dong.trim());
  }
  return { soTam: tam.length, ghiChuChung: chung.join("\n"), tam };
}
