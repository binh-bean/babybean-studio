/**
 * BB-399 — DỊCH VỤ "LÀM ẢNH NHANH" (anh chốt 08/10/2026).
 *
 *   "Dịch vụ làm ảnh nhanh khi khách chọn hình, với giá lấy từ Lark, với mô tả dịch vụ làm
 *    nhanh hơn timeline tiêu chuẩn."  Trả ảnh chỉnh TIÊU CHUẨN = 14 ngày sau khi khách chốt
 *    danh sách; LÀM ẢNH NHANH = 5 ngày.
 *
 * Tệp này là HÀM THUẦN (không mạng, không cơ sở dữ liệu) — màn khách, màn nhân viên, route
 * và phép thử dùng chung. Phần đọc DB ở `lam-anh-nhanh-server.ts`.
 *
 * ---------------------------------------------------------------------------
 * Nhận diện sản phẩm — BỀN khi Lark đổi tên
 * ---------------------------------------------------------------------------
 * Sản phẩm là dòng "Làm ảnh nhanh" của bảng "🎁Sản Phẩm Dịch Vụ" bên Lark (Phân Loại Sản Xuất
 * "Phát Sinh" → `products.kind = 'addon'`, `scripts/sync-lark-catalog.mjs`). GIÁ luôn đọc từ
 * `products.list_price` (đồng bộ từ Lark) — không viết cứng 500.000 ở bất cứ đâu.
 *
 * Hai bậc, bậc trên thắng:
 *   1. GHIM theo record id Lark — cài đặt `dich_vu.lam_anh_nhanh_lark_id` (migration 0105 tự
 *      ghim theo tên lúc áp; Admin sửa được ở Cài đặt). Có ghim thì CHỈ tin ghim: Lark đổi tên
 *      sản phẩm vẫn nhận đúng; ghim trỏ vào sản phẩm đã ngừng bán thì ô làm nhanh ẨN (không
 *      lặng lẽ rơi về một sản phẩm khác cùng tên).
 *      Cài đặt theo CHI NHÁNH (dòng `settings.branch_id`) thắng dòng chung — phép thử trình
 *      duyệt dùng đường này để trỏ chi nhánh Fixture vào sản phẩm "Fixture Làm ảnh nhanh" mà
 *      không đụng khách thật.
 *   2. Chưa ghim → tên chuẩn hoá đúng bằng "lam anh nhanh" (bỏ dấu, chữ thường, gộp khoảng
 *      trắng), loại `addon`/`service`, không phải hàng THỬ ("Fixture …"/"Test …").
 *
 * Dịch vụ này KHÔNG đi qua `sanPhamBanChoKhach()` (luật bán 3 nhóm in/album/khung): nó không
 * gắn ảnh, không nằm trong cửa hàng; chỉ bán ở hộp chốt đợt 1, hộp chốt đợt mua thêm và thẻ
 * sau chốt. Mỗi bộ ảnh mua MỘT lần.
 *
 * ---------------------------------------------------------------------------
 * Tiền — đi đúng luồng sản phẩm mua thêm có sẵn
 * ---------------------------------------------------------------------------
 * Mua = một dòng `selection_addons` (không `photo_id`, đúng `dot`, đơn giá chốt lúc mua). Nhờ
 * vậy nó tự vào: tạm tính/tổng mua thêm của màn khách, "Tiền sản phẩm" (BB-360) của màn tiền,
 * đối chiếu hoá đơn BB-395 (khớp dòng "Làm ảnh nhanh" trên hoá đơn Lark theo record id). Nó là
 * TIỀN SẢN PHẨM (không phải tiền ảnh) — nên theo công tắc `thanh_toan.thu_san_pham_qua_app`
 * như ảnh in/khung/album: tắt (mặc định) = thu qua Lark, không vào "Phải thu" của app.
 */

/** Cài đặt: số ngày trả ảnh chỉnh tiêu chuẩn (sau khi khách chốt danh sách). */
export const KHOA_SO_NGAY_TRA_TIEU_CHUAN = "hau_ky.so_ngay_tra_tieu_chuan";
/** Cài đặt: số ngày trả ảnh chỉnh khi mua "Làm ảnh nhanh". */
export const KHOA_SO_NGAY_LAM_NHANH = "hau_ky.so_ngay_lam_nhanh";
/** Cài đặt: record id Lark của sản phẩm "Làm ảnh nhanh" (ghim). Rỗng = tìm theo tên. */
export const KHOA_SAN_PHAM_LAM_NHANH = "dich_vu.lam_anh_nhanh_lark_id";

export const SO_NGAY_TRA_TIEU_CHUAN_MAC_DINH = 14;
export const SO_NGAY_LAM_NHANH_MAC_DINH = 5;
export const SO_NGAY_TRA_TOI_DA = 60;

/** Trạng thái bộ ảnh còn MUA THÊM làm nhanh được sau khi đã chốt (studio chưa gửi ảnh chỉnh). */
export const TRANG_THAI_MUA_SAU_CHOT: readonly string[] = ["submitted", "in_retouch"];
/** Trạng thái bộ ảnh mà hạn trả ảnh chỉnh còn ý nghĩa (đã chốt, chưa gửi duyệt/giao). */
export const TRANG_THAI_CON_HAN_TRA: readonly string[] = ["submitted", "in_retouch"];

/**
 * BB-399 vòng 3 — anh 08/10: "quản trị có CÔNG TẮC tắt/mở khi cần thiết nếu hậu kỳ đang quá
 * tải". Mặc định BẬT: thiếu dòng / giá trị lạ đều coi là bật — chỉ đúng `false` mới tắt. Tắt thì
 * khách không thấy ô/thẻ mua và mọi API mua từ chối nhã nhặn; bộ ĐÃ mua giữ nguyên nhãn + hạn.
 */
export const KHOA_BAT_LAM_NHANH = "dich_vu.lam_anh_nhanh_bat";
export function laBatLamNhanh(v: unknown): boolean {
  return v !== false;
}

/**
 * Ai được bật/tắt công tắc: Admin / Quản lý — `settings:system` (owner, admin) hoặc
 * `settings:branch:write` (branch_manager). CSKH (`settings:branch:read`) chỉ xem.
 */
export function duocDoiCongTacLamNhanh(permissions: readonly string[]): boolean {
  return permissions.includes("settings:system") || permissions.includes("settings:branch:write");
}

/**
 * Bộ làm nhanh cần nhân viên xử lý TRƯỚC: đã mua làm nhanh VÀ bộ còn trong giai đoạn chờ trả ảnh
 * chỉnh (đã chốt, chưa gửi duyệt/giao). Bộ đã giao vẫn giữ nhãn "Làm nhanh" nhưng không ưu tiên.
 */
export function laUuTienLamNhanh(lamNhanh: boolean | null | undefined, trangThai: string | null | undefined): boolean {
  return !!lamNhanh && TRANG_THAI_CON_HAN_TRA.includes(String(trangThai ?? ""));
}

const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

/** Số nguyên 1..60 thì giữ; còn lại (thiếu dòng, chữ, số lẻ, âm) về mặc định. */
export function chuanHoaSoNgayTra(v: unknown, macDinh: number): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= SO_NGAY_TRA_TOI_DA ? v : macDinh;
}

export interface CaiDatHauKy {
  soNgayTieuChuan: number;
  soNgayNhanh: number;
}

/** Đọc hai số ngày từ giá trị `settings.value` đã lấy ra (thiếu/lạ → 14 / 5). */
export function docCaiDatHauKy(giaTri: { tieuChuan?: unknown; nhanh?: unknown }): CaiDatHauKy {
  return {
    soNgayTieuChuan: chuanHoaSoNgayTra(giaTri.tieuChuan, SO_NGAY_TRA_TIEU_CHUAN_MAC_DINH),
    soNgayNhanh: chuanHoaSoNgayTra(giaTri.nhanh, SO_NGAY_LAM_NHANH_MAC_DINH),
  };
}

/** Ghim hợp lệ: chuỗi id Lark (chữ, số, `_`, `-`), không rỗng. */
export function chuanHoaGhim(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : null;
}

function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tên có đúng là "Làm ảnh nhanh" không (bỏ dấu, không phân biệt hoa/thường, gộp khoảng trắng). */
export function laTenLamNhanh(ten: string | null | undefined): boolean {
  return boDau(ten ?? "") === "lam anh nhanh";
}

const laHangThu = (ten: string | null | undefined) => /^(fixture|test|mẫu kiểm thử)\s/i.test((ten ?? "").trim());

export interface SanPhamDichVu {
  id: string;
  name: string | null;
  kind: string | null;
  lark_record_id: string | null;
  list_price: number | string | null;
  is_active: boolean | null;
}

const coGiaBan = (p: SanPhamDichVu) => p.list_price !== null && p.list_price !== undefined && Number(p.list_price) > 0;

/**
 * Chọn sản phẩm "Làm ảnh nhanh" ĐANG BÁN trong danh sách ứng viên (xem đầu tệp).
 * Trả null khi không có — màn khách ẩn ô, route từ chối.
 */
export function chonSanPhamLamNhanh(ds: readonly SanPhamDichVu[], ghim: string | null): SanPhamDichVu | null {
  const dangBan = ds.filter((p) => p.is_active === true && coGiaBan(p));
  if (ghim) return dangBan.find((p) => p.lark_record_id === ghim) ?? null;
  const theoTen = dangBan
    .filter((p) => (p.kind === "addon" || p.kind === "service") && laTenLamNhanh(p.name) && !laHangThu(p.name))
    .sort((a, b) => a.id.localeCompare(b.id));
  return theoTen[0] ?? null;
}

/**
 * Một dòng đã mua (`selection_addons` → `products`) có phải "Làm ảnh nhanh" không. Dùng để
 * biết bộ đã mua chưa và để màn nhân viên gắn nhãn — nhận CẢ mọi ghim (chung + chi nhánh) LẪN
 * tên chuẩn: dòng mua từ trước khi đổi ghim vẫn được nhận ra.
 */
export function laSanPhamLamNhanh(
  p: { name: string | null; lark_record_id: string | null } | null | undefined,
  cacGhim: ReadonlySet<string>,
): boolean {
  if (!p) return false;
  if (p.lark_record_id && cacGhim.has(p.lark_record_id)) return true;
  return laTenLamNhanh(p.name);
}

export interface HanTra {
  /** Số ngày Bean hẹn (14 hoặc 5 theo cài đặt). */
  soNgay: number;
  lamNhanh: boolean;
  /** Hạn trả dự kiến (ISO). null khi chưa chốt. */
  hanTra: string | null;
}

/**
 * Hạn trả ảnh chỉnh dự kiến.
 *   · Không làm nhanh: ngày chốt + số ngày tiêu chuẩn.
 *   · Làm nhanh mua LÚC chốt: ngày chốt + số ngày làm nhanh.
 *   · Làm nhanh mua SAU khi chốt: tính từ lúc mua, nhưng không muộn hơn hạn tiêu chuẩn
 *     (mua muộn không được làm hạn xa hơn khi không mua).
 * "Dự kiến", không hứa cứng — màn hình luôn nói "khoảng".
 */
export function tinhHanTra(p: {
  chotLuc: string | Date | null | undefined;
  lamNhanh: boolean;
  muaNhanhLuc?: string | Date | null;
  soNgayTieuChuan: number;
  soNgayNhanh: number;
}): HanTra {
  const soNgay = p.lamNhanh ? p.soNgayNhanh : p.soNgayTieuChuan;
  const chot = p.chotLuc ? new Date(p.chotLuc).getTime() : NaN;
  if (!Number.isFinite(chot)) return { soNgay, lamNhanh: p.lamNhanh, hanTra: null };
  const tieuChuan = chot + p.soNgayTieuChuan * MOT_NGAY_MS;
  if (!p.lamNhanh) return { soNgay, lamNhanh: false, hanTra: new Date(tieuChuan).toISOString() };
  const mua = p.muaNhanhLuc ? new Date(p.muaNhanhLuc).getTime() : NaN;
  const batDau = Number.isFinite(mua) ? Math.max(chot, mua) : chot;
  const han = Math.min(batDau + p.soNgayNhanh * MOT_NGAY_MS, tieuChuan);
  return { soNgay, lamNhanh: true, hanTra: new Date(han).toISOString() };
}

export type LyDoKhongBan = "khong_co_san_pham" | "da_mua" | "qua_giai_doan" | "tam_dung";

/**
 * Luật bán cho route mua SAU khi chốt (`/api/g/lam-anh-nhanh`). Thứ tự: không có sản phẩm →
 * đã mua (không bán lần hai) → bộ đã qua giai đoạn chỉnh (studio đã gửi ảnh, mua nhanh vô nghĩa).
 */
export function xetMuaSauChot(p: {
  coSanPham: boolean;
  daMua: boolean;
  trangThaiBo: string;
  /** BB-399 vòng 3 — công tắc `dich_vu.lam_anh_nhanh_bat` (tắt = hậu kỳ quá tải, tạm ngưng nhận). */
  bat?: boolean;
}): { ok: true } | { ok: false; lyDo: LyDoKhongBan } {
  if (p.daMua) return { ok: false, lyDo: "da_mua" };
  if (p.bat === false) return { ok: false, lyDo: "tam_dung" };
  if (!p.coSanPham) return { ok: false, lyDo: "khong_co_san_pham" };
  if (!TRANG_THAI_MUA_SAU_CHOT.includes(p.trangThaiBo)) return { ok: false, lyDo: "qua_giai_doan" };
  return { ok: true };
}

/** Phần màn khách nhận trong `/api/g/gallery` (`lamAnhNhanh`). null = không có gì để nói. */
export interface LamAnhNhanhKhach {
  /** Có sản phẩm đang bán (ô chọn hiện được). */
  coBan: boolean;
  /** Đơn giá từ `products.list_price` (0 khi không bán). */
  gia: number;
  soNgayNhanh: number;
  soNgayTieuChuan: number;
  /** Bộ đã mua làm nhanh (bất kỳ đợt nào). */
  daMua: boolean;
  /** Còn mua được ở thẻ sau chốt (đã chốt, studio chưa gửi ảnh chỉnh, chưa mua, có bán). */
  muaSauChot: boolean;
  /** Hạn trả dự kiến khi đã chốt (null khi chưa chốt hoặc đã qua giai đoạn chỉnh). */
  hanTra: HanTra | null;
}

/** Tạm tính của hộp chốt đợt 1: tiền ảnh chọn thêm + mua thêm + làm nhanh (nếu tích). */
export function tamTinhHopChot(p: {
  tienAnhThem: number;
  tienMuaThem: number;
  giaLamNhanh: number;
  chonLamNhanh: boolean;
}): number {
  const so = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  return so(p.tienAnhThem) + so(p.tienMuaThem) + (p.chonLamNhanh ? so(p.giaLamNhanh) : 0);
}

/**
 * BB-399 vòng 2 (Claude quyết 08/10) — studio TẶNG làm nhanh: hoá đơn Lark ghi dòng "Làm ảnh
 * nhanh" 0đ. Nguồn hoá đơn xếp mọi dòng 0đ là `dich_vu` (không đối chiếu) → app báo "thiếu" cho
 * dòng làm nhanh đã có trên app. Ngoại lệ ĐÚNG sản phẩm này: dòng `dich_vu` nhận ra là "Làm ảnh
 * nhanh" (cùng luật 2 bậc — ghim record id hoặc tên chuẩn) đổi thành `san_pham` để đối chiếu theo
 * số lượng. Các dòng 0đ khác (vd "Dịch vụ Hậu Kỳ") giữ nguyên `dich_vu` (bỏ qua). Phần ghi sổ
 * không đổi (dòng 0đ).
 */
export function doiDongLamNhanhThanhSanPham<
  D extends { loai: string; idSanPhamNguon: string | null; tenSanPham: string },
  H extends { dong: D[] },
>(hoaDons: readonly H[], cacGhim: ReadonlySet<string>): H[] {
  return hoaDons.map((hd) => ({
    ...hd,
    dong: hd.dong.map((d) =>
      d.loai === "dich_vu" && laSanPhamLamNhanh({ name: d.tenSanPham, lark_record_id: d.idSanPhamNguon }, cacGhim)
        ? { ...d, loai: "san_pham" }
        : d,
    ),
  }));
}

/**
 * BB-399 vòng 2 — dòng trạng thái chỉ đọc cạnh ô record id ở màn Cài đặt: sản phẩm app ĐANG
 * dùng (theo đúng luật 2 bậc), để Admin thấy ngay khi Lark đổi tên/ngừng bán.
 */
export function cauTrangThaiSanPhamLamNhanh(sp: Pick<SanPhamDichVu, "name" | "list_price"> | null): string {
  if (!sp) return "Chưa tìm thấy sản phẩm — khách không thấy ô Làm ảnh nhanh";
  return `Đang dùng: ${sp.name ?? "(không tên)"} · ${Math.round(Number(sp.list_price)).toLocaleString("vi-VN")} ₫`;
}

/**
 * BB-399 vòng 3 — danh sách bộ ảnh phân trang ở MÁY CHỦ (RPC `get_admin_galleries`): bộ ưu tiên
 * làm nhanh lên đầu TRANG ĐẦU, và không lặp lại ở bất kỳ trang nào (kể cả trang đầu, nơi nó vốn
 * nằm giữa). `hangUuTien` = các dòng ưu tiên đã qua đúng bộ lọc của danh sách (route đọc bằng
 * cùng RPC). Con trỏ trang vẫn tính theo số dòng RPC trả (không theo số dòng ghép ra).
 */
export function ghepTrangUuTien<T extends { id?: unknown }>(
  trang: readonly T[],
  hangUuTien: readonly T[],
  idsUuTien: ReadonlySet<string>,
  offset: number,
): T[] {
  const con = trang.filter((r) => !idsUuTien.has(String(r.id)));
  if (offset > 0) return con;
  const daCo = new Set<string>();
  const dau = hangUuTien.filter((r) => {
    const id = String(r.id);
    if (!idsUuTien.has(id) || daCo.has(id)) return false;
    daCo.add(id);
    return true;
  });
  return [...dau, ...con];
}

/** Xếp bộ làm nhanh lên đầu, giữ nguyên thứ tự còn lại (ổn định). */
export function xepLamNhanhLenDau<T>(ds: readonly T[], laNhanh: (x: T) => boolean): T[] {
  return [...ds.filter(laNhanh), ...ds.filter((x) => !laNhanh(x))];
}
