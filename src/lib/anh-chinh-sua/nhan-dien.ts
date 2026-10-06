/**
 * BB-371 — ảnh chỉnh sửa trong link Drive: toán thuần (không mạng, không DB).
 *
 * Chủ studio 06/10/2026: thợ chỉnh ảnh bỏ ảnh đã chỉnh vào một THƯ MỤC CON của
 * chính link Drive bộ ảnh (vd. "anh chinh sua"). Đồng bộ Drive kéo cả thư mục
 * con xuống (`photos.subfolder`), nên 15 tấm chỉnh hiện thành một chip lọc lẫn
 * với 281 tấm gốc trong lưới chọn ảnh — và khách thấy ảnh chỉnh TRƯỚC khi CSKH
 * kịp kiểm.
 *
 * Tệp này trả lời bốn câu, cùng một chỗ cho route khách, route quản trị, route
 * ảnh và phép thử:
 *   1. Thư mục con này có phải thư mục ảnh chỉnh sửa không? (`laThuMucChinhSua`)
 *   2. Ảnh chỉnh nào ứng với ảnh gốc nào? (`ghepAnhChinhVoiGoc`)
 *   3. Khách đã được thấy tấm ảnh chỉnh này chưa? (`khachThayAnhChinh`)
 *   4. Khách xin sửa lần N thì cột Trạng Thái bên Lark ghi gì? (`trangThaiLarkTheoLanSua`)
 */

// ---------------------------------------------------------------------------
// 1. Nhận diện thư mục ảnh chỉnh sửa
// ---------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt (cả dạng dựng sẵn NFC lẫn dạng tổ hợp NFD của máy Mac), viết thường, gọn khoảng trắng. */
export function boDau(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cụm từ (đã bỏ dấu) đánh dấu thư mục ảnh chỉnh sửa. So theo NGUYÊN TỪ (\b),
 * không theo chuỗi con: "credit" không được khớp "edit".
 *
 * CỐ Ý KHÔNG có "anh chinh" trần: bỏ dấu thì "Ảnh chính" (ảnh chính, ảnh gốc
 * nổi bật) và "Ảnh chỉnh" trùng nhau. Có dấu thì phân biệt được — xem
 * `CO_DAU_CHINH` bên dưới; không dấu thì phải có thêm "sửa"/"đã".
 */
const CUM_TU_CHINH_SUA =
  /\b(chinh sua|da chinh|anh sua|edit|edits|edited|editing|retouch|retouched|retouching|hau ky|hauky)\b/;

/** "chỉnh" CÓ DẤU HỎI (không phải "chính" dấu sắc) — so trên dạng NFC, viết thường. */
const CO_DAU_CHINH = /(^|[^\p{L}])chỉnh($|[^\p{L}])/u;

export function laThuMucChinhSua(tenThuMuc: string | null | undefined): boolean {
  if (!tenThuMuc) return false;
  const nfc = tenThuMuc.normalize("NFC").toLowerCase();
  if (CO_DAU_CHINH.test(nfc)) return true;
  return CUM_TU_CHINH_SUA.test(boDau(tenThuMuc));
}

/** Lọc danh sách thư mục con: phần ảnh gốc (chip lọc) và phần ảnh chỉnh sửa. */
export function tachThuMuc(cacThuMuc: readonly string[]): { goc: string[]; chinhSua: string[] } {
  const goc: string[] = [];
  const chinhSua: string[] = [];
  for (const t of cacThuMuc) (laThuMucChinhSua(t) ? chinhSua : goc).push(t);
  return { goc, chinhSua };
}

// ---------------------------------------------------------------------------
// 2. Ghép ảnh chỉnh ↔ ảnh gốc theo tên tệp
// ---------------------------------------------------------------------------

export interface TepAnh {
  id: string;
  fileName: string;
}

/** Tên không đuôi, viết thường, dạng NFC. */
function than(ten: string): string {
  return ten.normalize("NFC").replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase().trim();
}

/**
 * Bỏ đuôi phần mềm chỉnh ảnh hay thêm vào: "-Edit", "_edited", " copy",
 * "(1)", "-2" (Lightroom xuất bản thứ hai), "_cs", "_final"… lặp tới khi hết.
 */
export function thanGoc(ten: string): string {
  let s = than(ten);
  for (let i = 0; i < 5; i++) {
    let t = s
      .replace(/\s*\(\d+\)$/, "")
      .replace(/[\s_.-]*(edit|edited|edits|retouch|retouched|final|copy|ban sao|bản sao|chinh sua|chỉnh sửa|cs|fix|v\d{1,2})$/i, "");
    // "IMG_1234-2" (bản xuất thứ hai) → "img_1234"; nhưng "Set 2" giữ nguyên — chỉ bỏ số
    // phụ khi phần còn lại vẫn mang một dãy số ảnh ≥ 3 chữ số.
    const boSoPhu = t.replace(/[\s_-]+\d{1,2}$/, "");
    if (boSoPhu !== t && /\d{3,}/.test(boSoPhu)) t = boSoPhu;
    t = t.trim();
    if (t === s) break;
    s = t;
  }
  return s;
}

/** Dãy số dài nhất (≥ 3 chữ số) trong tên — "IMG_1234-Edit" → "1234". */
function daySo(ten: string): string | null {
  const cac = than(ten).match(/\d{3,}/g);
  if (!cac) return null;
  return cac.reduce((a, b) => (b.length > a.length ? b : a)).replace(/^0+(?=\d{3})/, "");
}

/**
 * Ghép mỗi ảnh chỉnh với ảnh gốc cùng tên. Ba tầng, tầng sau chỉ dùng khi tầng
 * trước không ra; tầng nào ra NHIỀU ảnh gốc (mơ hồ) thì coi như không ghép —
 * ghép nhầm là cho khách so trước/sau với ảnh của tấm khác, tệ hơn không so.
 *   1. trùng tên (bỏ đuôi tệp, không phân biệt hoa thường)
 *   2. trùng tên sau khi bỏ hậu tố chỉnh ảnh ("-Edit", "(1)"…)
 *   3. trùng dãy số dài nhất ("DSC01234.jpg" ↔ "1234 da chinh.jpg")
 */
export function ghepAnhChinhVoiGoc(
  anhChinh: readonly TepAnh[],
  anhGoc: readonly TepAnh[],
): Map<string, string | null> {
  const theoThan = new Map<string, string[]>();
  const theoThanGoc = new Map<string, string[]>();
  const theoSo = new Map<string, string[]>();
  const them = (m: Map<string, string[]>, k: string | null, id: string) => {
    if (!k) return;
    const ds = m.get(k);
    if (ds) ds.push(id);
    else m.set(k, [id]);
  };
  for (const g of anhGoc) {
    them(theoThan, than(g.fileName), g.id);
    them(theoThanGoc, thanGoc(g.fileName), g.id);
    them(theoSo, daySo(g.fileName), g.id);
  }
  const motCai = (ds: string[] | undefined): string | null | undefined =>
    ds === undefined ? undefined : ds.length === 1 ? ds[0]! : null;

  const ketQua = new Map<string, string | null>();
  for (const c of anhChinh) {
    let id = motCai(theoThan.get(than(c.fileName)));
    if (id === undefined) id = motCai(theoThanGoc.get(thanGoc(c.fileName)));
    if (id === undefined) {
      const so = daySo(c.fileName);
      id = so ? motCai(theoSo.get(so)) : undefined;
    }
    ketQua.set(c.id, id ?? null);
  }
  return ketQua;
}

// ---------------------------------------------------------------------------
// 3. Cổng: khách đã được thấy tấm ảnh chỉnh này chưa?
// ---------------------------------------------------------------------------

/**
 * Trạng thái bộ ảnh mà khách ĐƯỢC xem ảnh chỉnh: CSKH đã bấm "Gửi khách duyệt"
 * (→ `awaiting_approval`) hoặc đã qua bước duyệt. `in_retouch` (kể cả sau khi
 * khách xin sửa) thì ẩn: thợ đang thay tấm mới, CSKH chưa kiểm.
 */
export const TRANG_THAI_KHACH_XEM_ANH_CHINH = ["awaiting_approval", "approved", "delivered"] as const;

/**
 * Khách thấy tấm ảnh chỉnh này khi:
 *   - bộ ảnh ở trạng thái khách được xem ảnh chỉnh, VÀ
 *   - CSKH đã gửi (`guiLuc`), VÀ tấm ảnh có mặt trong app TRƯỚC lúc gửi.
 *
 * Điều kiện thứ ba chặn đúng chỗ dễ rò: thợ thả thêm ảnh vào thư mục trong lúc
 * khách đang duyệt — đồng bộ kéo về là khách thấy ngay, chưa ai kiểm. Nay tấm
 * mới chờ tới lượt "Gửi khách duyệt" kế tiếp.
 */
export function khachThayAnhChinh(
  trangThaiBo: string,
  guiLuc: string | null | undefined,
  anhTaoLuc: string | null | undefined,
): boolean {
  if (!(TRANG_THAI_KHACH_XEM_ANH_CHINH as readonly string[]).includes(trangThaiBo)) return false;
  if (!guiLuc || !anhTaoLuc) return false;
  const g = new Date(guiLuc).getTime();
  const a = new Date(anhTaoLuc).getTime();
  if (Number.isNaN(g) || Number.isNaN(a)) return false;
  return a <= g;
}

/**
 * Trạng thái bộ ảnh mà CSKH bấm "Gửi khách duyệt" được. `submitted` = ba mẹ đã
 * chốt mà CSKH chưa bấm Xác nhận (ảnh chủ studio 06/10: thanh tiến độ kẹt "Chờ
 * xác nhận" dù ảnh chỉnh đã về) — route gửi khách xác nhận luôn rồi mới gửi.
 */
export const TRANG_THAI_GUI_DUOC = ["submitted", "in_retouch", "awaiting_approval"] as const;

/** Ảnh chỉnh CSKH chưa gửi khách (mới về sau lần gửi gần nhất, hoặc chưa gửi lần nào). */
export function laAnhChuaGui(guiLuc: string | null | undefined, anhTaoLuc: string | null | undefined): boolean {
  if (!guiLuc) return true;
  if (!anhTaoLuc) return false;
  return new Date(anhTaoLuc).getTime() > new Date(guiLuc).getTime();
}

// ---------------------------------------------------------------------------
// 4. Số lần sửa → trạng thái Hậu Kỳ bên Lark
// ---------------------------------------------------------------------------

/**
 * Cột "Trạng Thái" bảng Hậu Kỳ có HAI lựa chọn cho sửa (docs/21 phụ lục, mã
 * trong `TRANG_THAI_LARK`): "Sửa" (optjhQwMrT) cho lần đầu, "Sửa lần 2, 3, 4"
 * (optW0pvHGd) cho mọi lần sau. `nhan` là chữ hiện cho nhân viên ("Sửa lần 3").
 */
export function trangThaiLarkTheoLanSua(lan: number): { ma: "optjhQwMrT" | "optW0pvHGd"; nhan: string } {
  const n = Number.isFinite(lan) ? Math.max(1, Math.floor(lan)) : 1;
  if (n === 1) return { ma: "optjhQwMrT", nhan: "Sửa" };
  return { ma: "optW0pvHGd", nhan: `Sửa lần ${n}` };
}

// ---------------------------------------------------------------------------
// 5. Yêu cầu sửa chi tiết — kiểm dữ liệu khách gửi
// ---------------------------------------------------------------------------

/** Một vùng khoanh trên ảnh: tâm (x, y) và bán kính r, theo TỈ LỆ khung ảnh 0..1. */
export interface VungKhoanh {
  x: number;
  y: number;
  r: number;
}

export const TOI_DA_VUNG = 10;
export const TOI_DA_ANH_MAU = 3;
export const TOI_DA_GHI_CHU = 1000;
export const TOI_DA_ANH_SUA = 60;

/** Giữ vùng khoanh hợp lệ (trong khung), cắt tối đa `TOI_DA_VUNG`, làm tròn 4 chữ số. */
export function chuanHoaVung(v: unknown): VungKhoanh[] {
  if (!Array.isArray(v)) return [];
  const ra: VungKhoanh[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const { x: cx, y: cy, r } = x as Record<string, unknown>;
    if (typeof cx !== "number" || typeof cy !== "number" || typeof r !== "number") continue;
    if (![cx, cy, r].every(Number.isFinite)) continue;
    if (cx < 0 || cx > 1 || cy < 0 || cy > 1 || r <= 0 || r > 0.5) continue;
    ra.push({ x: Math.round(cx * 1e4) / 1e4, y: Math.round(cy * 1e4) / 1e4, r: Math.round(r * 1e4) / 1e4 });
    if (ra.length >= TOI_DA_VUNG) break;
  }
  return ra;
}

export interface MucSua {
  photoId: string;
  tenAnh: string;
  ghiChu: string;
  vung: VungKhoanh[];
  anhMau: string[];
}

/**
 * Ghép ghi chú chung + ghi chú từng tấm thành MỘT đoạn chữ cho
 * `revision_requests.note` (cột bắt buộc, có từ BB-121). Đây cũng là bản lùi
 * khi bảng chi tiết chưa có (migration 0091 chưa áp): người chỉnh ảnh vẫn đọc
 * được đủ chữ khách viết.
 */
export function ghepGhiChu(ghiChuChung: string, cacMuc: readonly MucSua[]): string {
  const dong: string[] = [];
  const chung = ghiChuChung.trim();
  if (chung) dong.push(chung);
  for (const m of cacMuc) {
    const phan: string[] = [];
    if (m.ghiChu.trim()) phan.push(m.ghiChu.trim());
    if (m.vung.length) phan.push(`đã khoanh ${m.vung.length} vùng`);
    if (m.anhMau.length) phan.push(`kèm ${m.anhMau.length} ảnh mẫu`);
    dong.push(`• ${m.tenAnh}: ${phan.join(" · ") || "cần sửa"}`);
  }
  return dong.join("\n");
}

/** Ảnh mẫu tối đa 5 MB (khớp `file_size_limit` của bucket ở 0091). */
export const TOI_DA_BYTE_ANH_MAU = 5 * 1024 * 1024;

/** Đuôi tệp theo CHỮ KÝ byte đầu — không tin kiểu khai báo của trình duyệt. */
export function kieuTheoChuKy(b: Uint8Array): "jpg" | "png" | "webp" | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const ascii = (tu: number, den: number) => String.fromCharCode(...b.slice(tu, den));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heif)$/.test(ascii(8, 12))) return "heic";
  return null;
}

