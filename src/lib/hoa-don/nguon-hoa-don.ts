/**
 * BB-395 — NGUỒN HOÁ ĐƠN: hợp đồng chung giữa app và nơi lập hoá đơn/phiếu thu.
 *
 * Hôm nay nguồn là Lark (`nguon-hoa-don-lark.ts`). Sau này app thay Lark tự lập hoá
 * đơn/phiếu thu thì viết MỘT nguồn mới thoả `NguonHoaDon` rồi trả nó từ
 * `chonNguonHoaDon` — route, màn hình và hàm đối chiếu (`doi-chieu-hoa-don.ts`)
 * không đổi một dòng. Xem `docs/27-xac-nhan-bang-hoa-don.md`.
 *
 * Luật cho mọi nguồn:
 *   · Chỉ ĐỌC. Không nguồn nào ghi ngược ra nơi lập hoá đơn.
 *   · Tiền là số nguyên đồng (đã parse; nguồn nào trả chuỗi số thì nguồn đó tự parse).
 *   · `khoaKhachNguon` là KHOÁ ĐÃ CHUẨN HOÁ theo đúng cách app lưu `customers.lark_customer_key`
 *     — không bao giờ mang tên/SĐT khách ra khỏi tệp nguồn.
 *   · Hỏng/chậm → ném `LoiNguonHoaDon` (route báo câu thân thiện, không ghi gì).
 *
 * Tệp này không import gì phía máy chủ — phép thử thuần import được.
 */
import { dangChayPhepThu, khongGuiRaLarkThat } from "@/lib/kiem-thu";

/** Tên nguồn. Thêm nguồn mới thì thêm tên vào đây. */
export type TenNguonHoaDon = "lark" | "fixture";

export type PhuongThucPhieuThu = "tien_mat" | "chuyen_khoan" | "khac";

export interface PhieuThuChuan {
  /** Mã phiếu thu ở nguồn, vd `THU-20261002#10691`. */
  ma: string;
  soTien: number;
  phuongThuc: PhuongThucPhieuThu;
  /** Chữ gốc ở nguồn (vd "Chuyển Khoản") — chỉ để hiển thị. */
  phuongThucGoc: string;
  /** ISO hoặc null. KHÔNG dùng để kiểm thứ tự (phiếu thu có thể lập trước hoá đơn). */
  ngay: string | null;
}

/**
 * Loại dòng — nguồn tự phân loại (nó biết tên sản phẩm/cột phân loại của mình):
 *   · `file_chinh` — "Edit file": số lượng = số file chỉnh thêm (nâng hạn mức).
 *   · `san_pham`   — sản phẩm có tiền (album, khung, UV…): đối chiếu theo `idSanPhamNguon`.
 *   · `dich_vu`    — dòng đánh dấu dịch vụ 0 đồng (vd "Dịch vụ Hậu Kỳ"): KHÔNG đối chiếu.
 */
export type LoaiDongHoaDon = "file_chinh" | "san_pham" | "dich_vu";

export interface DongHoaDonChuan {
  /** Mã dòng ở nguồn, vd `HD_20260910#5071_12648` (hậu tố là STT toàn bảng, không phải 1,2,3). */
  maDong: string;
  loai: LoaiDongHoaDon;
  /** Id sản phẩm Ở NGUỒN (Lark: record id bảng Sản Phẩm) — app ánh xạ qua `products.lark_record_id`. */
  idSanPhamNguon: string | null;
  tenSanPham: string;
  soLuong: number;
  /** Thành tiền sau giảm (giá chốt cuối). 0 khi nguồn để trống. */
  thanhTien: number;
}

export interface HoaDonChuan {
  ma: string;
  nguon: TenNguonHoaDon;
  tongPhaiThu: number;
  daThu: number;
  /** Còn lại do NGUỒN tính (Lark đã tính tips). ≤ 0 mới đủ điều kiện; < 0 = thu dư. */
  conLai: number;
  /** Chữ trạng thái gốc, vd "Đã thu hết ☑️☑️☑️" — chỉ để hiển thị. */
  trangThai: string;
  phieuThu: PhieuThuChuan[];
  dong: DongHoaDonChuan[];
  /** Khoá khách ĐÃ CHUẨN HOÁ (cùng cách với `customers.lark_customer_key`); null = nguồn không có. */
  khoaKhachNguon: string | null;
  /** Bản ghi Hậu Kỳ hoá đơn trỏ tới (gợi ý chọn bộ, KHÔNG phải khoá — một HĐ có thể trỏ 2 dòng). */
  maHauKyNguon: string[];
}

export interface NguonHoaDon {
  ten: TenNguonHoaDon;
  /** null = không có hoá đơn mã này. Ném `LoiNguonHoaDon` khi nguồn hỏng/chậm. */
  layHoaDon(ma: string): Promise<HoaDonChuan | null>;
}

export type MaLoiNguon = "CHUA_CAU_HINH" | "CHAM" | "LOI_NGUON";

export class LoiNguonHoaDon extends Error {
  constructor(
    public readonly maLoi: MaLoiNguon,
    message: string,
  ) {
    super(message);
    this.name = "LoiNguonHoaDon";
  }
}

/** Câu thân thiện cho nhân viên theo mã lỗi nguồn. */
export function cauLoiNguon(e: unknown): string {
  if (e instanceof LoiNguonHoaDon) {
    if (e.maLoi === "CHUA_CAU_HINH") return "Máy chủ chưa cấu hình kết nối Lark. Báo Admin giúp.";
    if (e.maLoi === "CHAM") return "Lark đang chậm, chưa đọc được hoá đơn. Thử lại sau ít phút — chưa có gì được ghi.";
    return `Không đọc được hoá đơn từ Lark (${e.message}). Chưa có gì được ghi.`;
  }
  return "Không đọc được hoá đơn. Chưa có gì được ghi.";
}

// ---------------------------------------------------------------------------
// Mã hoá đơn
// ---------------------------------------------------------------------------

const MAU_MA_HOA_DON = /^HD_\d{8}#\d{1,7}$/;

/** Chuẩn hoá mã nhân viên gõ ("hd_20260910#5071 " → "HD_20260910#5071"); sai dạng → null. */
export function chuanHoaMaHoaDon(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const ma = raw.trim().toUpperCase();
  return MAU_MA_HOA_DON.test(ma) ? ma : null;
}

/** Mã dành cho nguồn giả (năm 2099, số bắt đầu bằng 9). Không bao giờ trùng mã thật. */
export const MAU_MA_FIXTURE = /^HD_20990101#9\d{3}$/;

// ---------------------------------------------------------------------------
// Nguồn giả (Fixture) — dùng trong phép thử và phép thử trình duyệt
// ---------------------------------------------------------------------------

/**
 * Khoá khách của các hoá đơn giả. Phép thử e2e đặt `customers.lark_customer_key` của khách
 * Fixture bằng đúng khoá này; khách khác → `KHOA_KHACH_FIXTURE_KHAC`.
 */
export const KHOA_KHACH_FIXTURE = "fx395khach01";
export const KHOA_KHACH_FIXTURE_KHAC = "fx395khach99";
/**
 * BB-397: khách mà app CHƯA nối khoá (e2e để `lark_customer_key` NULL). Hoá đơn gốc 9011 + hoá
 * đơn phát sinh 9012 cùng khách này → app khớp qua hoá đơn gốc rồi tự nối khoá.
 */
export const KHOA_KHACH_FIXTURE_CHUA_NOI = "fx397khach02";
/** Bản ghi Hậu Kỳ mà hoá đơn giả 9009 trỏ tới (e2e đặt cho `galleries.lark_hauky_record_id`). */
export const MA_HAU_KY_FIXTURE = "FX_HK_395_B";

function phieu(ma: string, soTien: number): PhieuThuChuan {
  return { ma, soTien, phuongThuc: "chuyen_khoan", phuongThucGoc: "Chuyển Khoản", ngay: "2099-01-01T00:00:00.000Z" };
}

function hdGia(
  so: string,
  p: { file?: number; tienFile?: number; phieu?: number[]; conLai?: number; khach?: string; hauKy?: string[] },
): HoaDonChuan {
  const ma = `HD_20990101#${so}`;
  const file = p.file ?? 0;
  const tienFile = p.tienFile ?? file * 50_000;
  const dsPhieu = (p.phieu ?? [tienFile]).map((t, i) => phieu(`THU-20990101#9${so}${i}`, t));
  const daThu = dsPhieu.reduce((s, x) => s + x.soTien, 0);
  const conLai = p.conLai ?? tienFile - daThu;
  return {
    ma,
    nguon: "fixture",
    tongPhaiThu: tienFile,
    daThu,
    conLai,
    trangThai: conLai > 0 ? (daThu > 0 ? "Còn nợ" : "Chưa thu") : conLai < 0 ? "Thu dư của KH" : "Đã thu hết ☑️☑️☑️",
    phieuThu: dsPhieu,
    dong: [
      ...(file > 0
        ? [{ maDong: `${ma}_1${so}`, loai: "file_chinh" as const, idSanPhamNguon: "FX_EDIT_FILE", tenSanPham: "Edit file", soLuong: file, thanhTien: tienFile }]
        : []),
      { maDong: `${ma}_2${so}`, loai: "dich_vu", idSanPhamNguon: "FX_DV_HAU_KY", tenSanPham: "Dịch vụ Hậu Kỳ", soLuong: 1, thanhTien: 0 },
    ],
    khoaKhachNguon: p.khach ?? KHOA_KHACH_FIXTURE,
    maHauKyNguon: p.hauKy ?? [],
  };
}

/**
 * Hoá đơn giả — hình mẫu theo hoá đơn phát sinh hậu kỳ thật (26 file × 50.000 = 1.300.000,
 * một phiếu thu chuyển khoản, một dòng "Dịch vụ Hậu Kỳ" 0 đồng), đổi sang mã 2099.
 */
export const HOA_DON_FIXTURE: Readonly<Record<string, HoaDonChuan>> = Object.freeze(
  Object.fromEntries(
    [
      hdGia("9001", { file: 26 }), // mẫu: khớp khi khách chọn vượt 26
      hdGia("9002", { file: 2 }), // khớp 2 file
      hdGia("9003", { file: 5 }), // thừa khi khách vượt ít hơn 5
      hdGia("9004", { file: 1 }), // bổ sung cho ca thiếu
      hdGia("9005", { file: 3, phieu: [] }), // chưa có phiếu thu
      hdGia("9006", { file: 3, phieu: [50_000] }), // còn nợ 100.000
      hdGia("9007", { file: 2, khach: KHOA_KHACH_FIXTURE_KHAC }), // khách khác
      hdGia("9008", { file: 2, phieu: [150_000] }), // thu dư 50.000
      hdGia("9009", { file: 2, hauKy: [MA_HAU_KY_FIXTURE] }), // khách 2 bộ: trỏ dòng Hậu Kỳ của bộ thứ hai
      hdGia("9010", { file: 2, tienFile: 90_000 }), // đợt 2 (2 ảnh × 50.000 trên app) — giá hoá đơn 45.000/ảnh
      hdGia("9011", { khach: KHOA_KHACH_FIXTURE_CHUA_NOI }), // BB-397: hoá đơn GỐC (gói chụp) của bộ có khách chưa nối khoá
      hdGia("9012", { file: 2, khach: KHOA_KHACH_FIXTURE_CHUA_NOI }), // BB-397: phát sinh cùng khách với 9011
    ].map((h) => [h.ma, h]),
  ),
);

export const nguonHoaDonFixture: NguonHoaDon = {
  ten: "fixture",
  async layHoaDon(ma: string) {
    const h = HOA_DON_FIXTURE[ma];
    return h ? structuredClone(h) : null;
  },
};

/**
 * Nhà máy chọn nguồn. Phép thử (Vitest) và phép thử trình duyệt (`PHEP_THU_TRINH_DUYET=1`)
 * LUÔN dùng nguồn giả — mã thật cũng chỉ ra "không tìm thấy", không bao giờ gọi Lark.
 * `taoLark` truyền vào để tệp này không import mã Lark (giữ tên bảng/trường ở một tệp).
 */
export function chonNguonHoaDon(taoLark: () => NguonHoaDon): NguonHoaDon {
  if (dangChayPhepThu() || khongGuiRaLarkThat()) return nguonHoaDonFixture;
  return taoLark();
}
