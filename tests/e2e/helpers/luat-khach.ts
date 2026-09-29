/**
 * BB-319 — SÁU LUẬT theo LỚP lỗi cho màn khách, ở dạng hàm thuần.
 *
 * OWNER: QA-BOT. Không import Playwright: `bb-319-luat-lop-khach.spec.ts` áp
 * các luật này lên số đo THẬT của 24 khung hình (xem `man-khach.ts`), còn
 * `tests/unit/bb-319-luat-khach.test.ts` canh chính các hàm đếm/tách câu.
 *
 * Mỗi luật trả về DANH SÁCH VI PHẠM (chuỗi mô tả) — rỗng là đạt.
 */

/** Luật 1 — ký hiệu kích thước: hai con số nối bằng chữ "x" là sai, phải là "×". */
export const KY_HIEU_X = /\d\s*[xX]\s*\d/;

/** Luật 2 — lề ngang điện thoại của nội dung, và lề riêng của lưới ảnh (một token). */
export const LE_DT = 24;
export const LE_LUOI_DT = 8;
/** Lề trang máy tính (lưới trang 1600 px, `lg:px-10`). */
export const LE_MT = 40;

/**
 * Luật 3 — một thang chữ. Mỗi cỡ là một vai:
 * 11 nhãn hoa · 12 chú thích nhỏ · 13 chú thích · 14 nút/chip · 15 thân ·
 * 16 thân lớn/logo dính · 18 logo · 20 H3 · 22 số đếm · 24 phụ đề bìa ·
 * 28 H2 · 32 H1 dt · 36 tiêu đề đã giao dt · 40 H1 · 48 · 56 · 64 · 84 (bìa).
 */
export const THANG_CHU = [11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 84] as const;

/** Màu nút chính duy nhất — mực #2E2A27. */
export const MAU_NUT_CHINH = "rgb(46, 42, 39)";

/** Luật 4 — trần số chữ một câu. */
export const TRAN_CHU_MOT_CAU = 12;

/** Luật 4 — chữ nội bộ không được lộ ra màn khách. */
export const CHU_NOI_BO: RegExp[] = [
  /hạn mức/i,
  /\bsuất\b/i,
  /\bCSKH\b/,
  /Edit file/i,
  /\bquota\b/i,
  /\bgallery\b/i,
  /\bLark\b/,
  /\bnull\b|\bundefined\b|\bNaN\b/,
];

/**
 * Đếm chữ tiếng Việt: mỗi âm tiết cách nhau bởi khoảng trắng là một chữ; bỏ
 * những mẩu không có chữ cái/chữ số (dấu "·", "—", "₫", "×3" vẫn tính vì có số).
 */
export function demChu(cau: string): number {
  return cau
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Tách một đoạn thành câu: sau dấu . ! ? … (theo sau là khoảng trắng hoặc hết
 * đoạn), và ở các dấu ngăn danh sách "·" "|". Dấu "—" KHÔNG ngắt câu (người chấm
 * vòng 6 đếm "…chưa đủ ảnh — …để sau cũng được" là MỘT câu 25 chữ).
 * Dấu chấm giữa hai chữ số (100.000) không ngắt câu vì sau nó không có khoảng trắng.
 */
export function tachCau(doan: string): string[] {
  return doan
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+|\s[·|]\s/)
    .map((c) => c.trim())
    .filter((c) => c && /[\p{L}\p{N}]/u.test(c));
}

export function cauQuaDai(doan: string, tran = TRAN_CHU_MOT_CAU): string[] {
  return tachCau(doan).filter((c) => demChu(c) > tran);
}

export function chuNoiBo(doan: string): string[] {
  return CHU_NOI_BO.filter((re) => re.test(doan)).map((re) => `${re.source} trong "${doan.slice(0, 80)}"`);
}

/** Luật 5 — tiền: "1.234.567 ₫" (dấu chấm nghìn, một khoảng trắng, ký hiệu ₫ đứng SAU). */
export function tienSaiDinhDang(chu: string): string[] {
  const loi: string[] = [];
  const re = /(\S*\d\S*)(\s*)₫/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chu))) {
    const so = m[1] ?? "";
    const khoang = m[2] ?? "";
    if (!/^\d{1,3}(\.\d{3})*$/.test(so) || !/^[\s ]$/.test(khoang)) loi.push(m[0]);
  }
  return loi;
}
