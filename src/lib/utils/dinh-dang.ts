/**
 * Định dạng dùng chung — BB-287 (ban đầu cho màn khách, nay dùng chung cả
 * quản trị: `customers-manager.tsx`, `gallery-detail.tsx` đã import từ đây).
 *
 * Trước bản vá, mỗi màn tự viết ngày/kích thước theo cách riêng:
 *   - `toLocaleDateString("vi-VN")` in ra "27/9/2026" (KHÔNG có số 0 đệm),
 *     trong khi quản trị và bản vẽ đều dùng "27/09/2026".
 *   - Kích thước sản phẩm lẫn cả "x" ("40x60") lẫn "×" ("15×21") tuỳ nơi gõ.
 *
 * Các hàm dưới đây là NGUỒN DUY NHẤT cho những việc này — đổi định dạng thì
 * chỉ sửa ở đây, không tự viết `toLocaleDateString` hay nối chuỗi ở nơi khác.
 */

import { tenChatLieuChoKhach, tenCoChatLieuChoKhach, vietHoaChuDau } from "@/lib/products/nhom-san-pham";
import { vi } from "@/i18n/vi";
import { hienTieuDeBoAnh, tachMaHoaDon } from "@/lib/utils/ma-hoa-don";

/** "27/9/2026" -> "27/09/2026". Nhận Date hoặc chuỗi ISO. */
export function formatNgayVN(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const ngay = String(d.getDate()).padStart(2, "0");
  const thang = String(d.getMonth() + 1).padStart(2, "0");
  const nam = d.getFullYear();
  return `${ngay}/${thang}/${nam}`;
}

function hai(n: number): string {
  return String(n).padStart(2, "0");
}

function docNgay(input: string | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "string") {
    // "yyyy-mm-dd" trần là NGÀY LỊCH, không phải một thời điểm UTC — dựng theo giờ máy để không lệch ngày.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = typeof input === "string" ? new Date(input) : input;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * BB-318 (Q-c, báo cáo chấm vòng 5) — giờ:phút "09:43". Cùng giờ máy với
 * `formatNgayVN`. Chuỗi rỗng khi không đọc được.
 */
export function formatGioVN(input: string | Date | null | undefined): string {
  const d = docNgay(input);
  return d ? `${hai(d.getHours())}:${hai(d.getMinutes())}` : "";
}

/**
 * BB-318 (Q-c) — ngày kèm giờ: "28/09/2026 09:43". Trước bản vá quản trị có
 * ba cách viết ("9/9/2026", "28/09 09:43", "28/9/2026, 09:43:12") cho cùng một
 * loại thông tin. Chuỗi rỗng khi không đọc được.
 */
export function formatNgayGioVN(input: string | Date | null | undefined): string {
  const d = docNgay(input);
  return d ? `${formatNgayVN(d)} ${formatGioVN(d)}` : "";
}

/**
 * BB-318 (Q-c) — khoảng ngày: cùng năm thì "23/09 – 29/09/2026"; khác năm thì
 * "28/12/2025 – 03/01/2026". Nhận Date hoặc chuỗi ISO / "yyyy-mm-dd". Thiếu một
 * đầu hoặc không đọc được thì trả chuỗi rỗng.
 */
export function formatKhoangNgayVN(
  tu: string | Date | null | undefined,
  den: string | Date | null | undefined,
): string {
  const a = docNgay(tu);
  const b = docNgay(den);
  if (!a || !b) return "";
  if (a.getFullYear() === b.getFullYear()) {
    return `${hai(a.getDate())}/${hai(a.getMonth() + 1)} – ${formatNgayVN(b)}`;
  }
  return `${formatNgayVN(a)} – ${formatNgayVN(b)}`;
}

/**
 * BB-324 — MỘT cách viết số cho mọi màn (quản trị + khách): dấu chấm phân
 * cách hàng nghìn kiểu Việt Nam ("1.234", "12.500.000"), phần lẻ sau dấu phẩy
 * ("12,5"). Anh: "số liệu là số đều phân định hàng nghìn, không để liền".
 *
 * Tự dựng chuỗi, không nhờ `Intl`/`toLocaleString`: kết quả của hai thứ đó
 * tuỳ bộ dữ liệu ICU của máy (máy chủ Node, trình duyệt cũ có thể in
 * "1,234" hoặc "1234"). Không dùng cho SĐT, mã hợp đồng, năm, ngày, id —
 * những thứ đó không phải số lượng.
 *
 * `null`/`undefined`/không phải số → chuỗi rỗng (nơi gọi tự quyết hiện gì).
 */
export function formatSo(n: number | null | undefined, soLe = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  const am = n < 0;
  const [nguyen, le] = Math.abs(n).toFixed(Math.max(0, soLe)).split(".");
  const nhom = (nguyen ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const leGon = le?.replace(/0+$/, "");
  return `${am ? "-" : ""}${nhom}${leGon ? `,${leGon}` : ""}`;
}

/**
 * BB-324 — số tiền: "12.500.000 ₫" (làm tròn tới đồng, khoảng trắng không ngắt
 * dòng trước "₫" để ký hiệu không rơi xuống dòng riêng).
 */
export function formatTien(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return `${formatSo(Math.round(n))} ₫`;
}

/**
 * Chuẩn hoá kích thước in ("10x15", "10 x 15", "10×15") về một dạng duy nhất
 * "10×15" — dấu nhân đúng kiểu in ấn, không phải chữ "x" của bàn phím.
 */
export function formatKichThuoc(input: string | null | undefined): string {
  if (!input) return "";
  // BB-339 — mọi tên sản phẩm lên màn khách đều qua hàm này: "Cavas/Kim tuyến
  // 40x60" (tên Lark) hiện thành "Kim Tuyến 40×60", không lộ chữ "Cavas".
  // BB-361 — chữ đầu viết hoa ("tờ Album …" → "Tờ Album …"); dữ liệu gốc không đổi.
  return vietHoaChuDau(tenCoChatLieuChoKhach(input).replace(/(\d)\s*[xX]\s*(\d)/g, "$1×$2"));
}

/**
 * BB-319 (luật 1) — tên sản phẩm kèm số lượng, MỘT cách viết cho mọi chỗ màn
 * khách: "UV 10×15 ×3" (kích thước qua `formatKichThuoc`, số lượng "×N" liền số,
 * bỏ "×1"). Trước bản vá có ba cách: "UV 10x15 ×3", "UV 10×15 × 3", "×3" xuống dòng.
 */
export function tenKemSoLuong(ten: string, soLuong = 1): string {
  const t = formatKichThuoc(ten.trim());
  return soLuong > 1 ? `${t} ×${soLuong}` : t;
}

const TIEN_TO_NHOM_SAN_PHAM: Record<string, string> = { anh_in: "Ảnh in", album: "Album", khung: "Khung" };

/**
 * BB-319 (luật 1 + 5) — MỘT tên hiển thị cho một sản phẩm ở MỌI chỗ màn khách
 * nhắc tới nó (tiêu đề cửa hàng, dòng giỏ, thông báo "Đã thêm vào giỏ", dòng
 * "Trong giỏ" ở màn xem lớn, hộp chốt): nhóm + chất liệu + kích thước —
 * "Ảnh in UV 10×15". Trước bản vá cùng một món hiện ba tên: "Ảnh in UV" (tiêu
 * đề), "UV 10×15" (giỏ), "3 ảnh Ảnh in UV" (thông báo).
 *
 * Thiếu nhóm/chất liệu (món không còn trong danh mục đang bán) thì rơi về tên
 * gốc đã chuẩn hoá ký hiệu kích thước.
 */
export function tenSanPhamChoKhach(sp: {
  name: string;
  nhom?: string | null;
  material?: string | null;
  size?: string | null;
}): string {
  // Tên nội bộ Lark của file ảnh chỉnh bán thêm ("Edit file") — khách đọc bằng lời của khách.
  if (/^edit file$/i.test(sp.name.trim())) return "Ảnh chỉnh thêm";
  const tienTo = sp.nhom ? TIEN_TO_NHOM_SAN_PHAM[sp.nhom] : undefined;
  const chatLieu = tenChatLieuChoKhach(sp.material?.trim() ?? null);
  if (!tienTo || !chatLieu) return formatKichThuoc(sp.name.trim());
  // BB-361 — chất liệu đã chứa tên nhóm ("Tờ Album (Ultra HD)") thì không ghép thêm "Album" phía trước.
  const dau = chatLieu.toLowerCase().includes(tienTo.toLowerCase()) ? chatLieu : `${tienTo} ${chatLieu}`;
  return sp.size ? `${dau} ${formatKichThuoc(sp.size)}` : dau;
}

/**
 * BB-362 (người chấm vòng 10) — tên một dòng hợp đồng (gallery_items.name, lấy
 * từ Lark) khi hiện ở QUẢN TRỊ: viết hoa chữ đầu + ký hiệu "×" — "tờ Album
 * (Ultra HD) 20x20" → "Tờ Album (Ultra HD) 20×20", cùng kiểu màn khách. Dữ liệu
 * giữ nguyên, chỉ đổi bản hiển thị.
 */
export function tenHienThiSanPham(ten: string): string {
  return vietHoaChuDau(formatKichThuoc(ten.trim()));
}

/**
 * BB-362 (người chấm vòng 10, mục 5) — tên một món IN TRONG GÓI ở màn khách,
 * cùng định dạng `tenSanPhamChoKhach` ("Ảnh in UV 10×15"). Dòng hợp đồng chỉ có
 * tên Lark ("UV 10x15") và nhóm, không có chất liệu/kích thước tách riêng, nên
 * ghép tiền tố nhóm khi tên chưa tự nói nhóm — trước đây khối "Trong gói" hiện
 * "UV 10×15" còn giỏ/xem lớn hiện "Ảnh in UV 10×15" cho cùng một món.
 */
export function tenDongTrongGoiChoKhach(ten: string, nhom?: string | null): string {
  const goc = vietHoaChuDau(formatKichThuoc(tenCoChatLieuChoKhach(ten.trim())));
  const tienTo = nhom ? TIEN_TO_NHOM_SAN_PHAM[nhom] : undefined;
  if (!tienTo) return goc;
  const thuong = goc.toLocaleLowerCase("vi");
  // "Ảnh phóng 30×45", "Tờ Album …", "Khung HQ …" đã tự nói nhóm → giữ nguyên.
  if (thuong.includes(tienTo.toLocaleLowerCase("vi")) || (nhom === "anh_in" && thuong.startsWith("ảnh"))) return goc;
  return `${tienTo} ${goc}`;
}

/**
 * BB-319 (luật 5, K-D1) — nhãn trạng thái của món trong giỏ phải nói ĐÚNG sự
 * thật: mới thêm vào giỏ (đơn chưa gửi) là "Trong giỏ"; chỉ khi ba mẹ đã chốt
 * gửi đơn mới là "Đã đặt mua". Vòng 6 bắt "Đã đặt mua" hiện lúc món mới nằm
 * trong giỏ, trong khi cửa hàng cùng lúc ghi "Đang đặt 3" — ba cách nói cho
 * một trạng thái. Mọi nơi hiện trạng thái giỏ gọi hàm này.
 */
export function nhanTrangThaiGio(donDaGui: boolean): "Đã đặt mua" | "Trong giỏ" {
  return donDaGui ? "Đã đặt mua" : "Trong giỏ";
}

/**
 * BB-319 — dòng chi nhánh trên bìa: "Chi nhánh Pasteur". Tên đã tự có chữ
 * "chi nhánh" (dữ liệu nhập kiểu "Chi nhánh Q1", hay tên mẫu "… Chi nhánh") thì
 * không ghép thêm lần nữa — tránh "Chi nhánh … Chi nhánh".
 */
export function dongChiNhanh(ten: string | null | undefined): string {
  const t = (ten ?? "").trim();
  if (!t) return "";
  return /chi nhánh/i.test(t) ? t : `Chi nhánh ${t}`;
}

/**
 * BB-319 (K-N1) — MỘT chỗ duy nhất đổi ký hiệu kích thước trong TÊN sản phẩm
 * ("UV 10x15", "Album (Ultra HD) 15x21") sang "×" cho MỌI chỗ màn khách hiện tên.
 * Dữ liệu trong cơ sở dữ liệu / từ Lark KHÔNG bị đổi: chỉ bản sao trong bộ nhớ
 * của trình duyệt. Cột `size` giữ nguyên ("10x15") vì mã khác dùng nó làm khoá
 * so khớp; nơi hiện cột `size` đã đi qua `formatKichThuoc`.
 *
 * Chỉ động vào `name` của các mảng sản phẩm mà máy chủ trả cho màn khách, nên
 * mọi phép so sánh `name === name` giữa các mảng đó vẫn đúng (cùng một phép đổi).
 */
export function chuanHoaKyHieuKichThuocTrongGallery<
  T extends {
    contract?: { items: Array<{ name: string; components: Array<{ name: string }> }> };
    albumBia?: Array<{ name: string }>;
    addons?: {
      items: Array<{ name: string }>;
      catalogue?: Array<{ name: string }>;
    };
  },
>(g: T): T {
  const doiTen = <X extends { name: string }>(x: X): X => ({ ...x, name: formatKichThuoc(x.name) });
  return {
    ...g,
    contract: g.contract
      ? {
          ...g.contract,
          items: g.contract.items.map((it) => ({
            ...doiTen(it),
            components: it.components.map(doiTen),
          })),
        }
      : g.contract,
    albumBia: g.albumBia?.map(doiTen),
    addons: g.addons
      ? {
          ...g.addons,
          items: g.addons.items.map(doiTen),
          catalogue: g.addons.catalogue?.map(doiTen),
        }
      : g.addons,
  };
}

/**
 * BB-303 (bản vẽ BB-301) — số điện thoại Việt Nam 10 số hiển thị theo nhóm
 * 4-3-3 ("0901000001" -> "0901 000 001"), thay cho chuỗi liền hoặc font-mono
 * đơn cách — đúng cách người ta đọc số cho nhau qua điện thoại.
 *
 * Chỉ định dạng khi CHẮC là 10 chữ số (đầu số di động/cố định VN sau chuẩn
 * hoá 2018). Số khác độ dài (số bàn cũ, số nước ngoài, dữ liệu bẩn) trả
 * NGUYÊN VĂN — bịa nhóm cho một số không phải 10 số là hiển thị sai còn tệ
 * hơn không định dạng gì.
 */
export function formatSdt(input: string | null | undefined): string {
  if (!input) return "";
  const so = input.replace(/\D/g, "");
  if (so.length !== 10) return input;
  return `${so.slice(0, 4)} ${so.slice(4, 7)} ${so.slice(7, 10)}`;
}

/**
 * BB-308 (vòng 4, mục #8 báo cáo chấm 28/09/2026) — tên gọi của bé, thêm
 * "Bé " ở đầu CHỈ KHI tên chưa tự có sẵn. Trước bản vá, mỗi màn quản trị tự
 * viết `` `Bé ${tenBe}` `` không điều kiện (dashboard.tsx, gallery-detail.tsx,
 * gallery-list.tsx, customers-manager.tsx) — 5 trên 258 bé thật có họ tên bắt
 * đầu bằng "Bé" (vd "Bé Na" đặt thẳng làm `nickname`), nên bốn màn đó cùng
 * hiện "Bé Bé Na" trong khi bìa gửi khách (dùng `tinhBiaMacDinh`,
 * `components/features/gallery/bia-bo-anh.tsx`) chỉ in đúng "Bé Na" — hai nơi
 * nói hai chuỗi khác nhau về CÙNG một bé.
 *
 * MỘT hàm dùng chung cho mọi màn quản trị; màn khách (BB-310) áp cùng hàm
 * này — không viết lại luật ở nơi khác.
 *
 * Chỉ so khớp TỪ ĐẦU TIÊN (không phải mọi vị trí): "Bé Bin của Bé Na" vẫn cần
 * "Bé " ở đầu nếu tên KHÔNG bắt đầu bằng "Bé"/"bé" — nhưng trường hợp thật sự
 * gặp luôn là tên bé đơn, "Na" hoặc "Bé Na", không phải cụm dài.
 *
 * Chữ hoa/thường GIỮ NGUYÊN như đã gõ: "bé na" → "bé na" (không tự viết hoa
 * lại thành "Bé na") — hàm chỉ QUYẾT ĐỊNH có thêm tiền tố hay không, không
 * chuẩn hoá chữ hoa/thường của dữ liệu gốc.
 */
export function tenGoiBe(ten: string | null | undefined): string {
  const daCat = (ten ?? "").trim();
  if (!daCat) return "";
  const tuDau = daCat.split(/\s+/)[0] ?? "";
  if (tuDau.toLowerCase() === "bé") return daCat;
  return `Bé ${daCat}`;
}

/**
 * BB-310 mục 7 — báo cáo chấm độc lập vòng 4: 254/258 bé thật (dữ liệu
 * `bb-dev`, xem `babies` table) không có `nickname`. Bản đầu (28/09/2026
 * sáng) từng rút gọn thành "chữ cuối họ tên" — admin CHỈ ĐẠO LẠI cùng ngày:
 * còn nickname thì dùng nguyên nickname (qua `tenGoiBe`); MẤT nickname thì
 * in NGUYÊN HỌ TÊN ĐẦY ĐỦ làm tiêu đề lớn (không rút gọn, không thêm "Bé "
 * — đó là tên đầy đủ, không phải tên gọi ở nhà). Cỡ chữ co theo độ dài xem
 * `coChuTieuDeBia()` ngay dưới, để họ tên dài không tràn quá 2 dòng.
 */
export function tinhTenBiaTuDuLieu(
  nickname: string | null | undefined,
  hoTenDayDu: string | null | undefined,
): string {
  const nick = nickname?.trim();
  if (nick) return tenGoiBe(nick);
  return hoTenDayDu?.trim() || "";
}

/** Tên dưới biểu tượng màn hình chính khi bộ ảnh không có tên bé. */
export const TEN_NGAN_MAC_DINH = "Baby Bean";
/** Android/iOS cắt tên dưới biểu tượng ở khoảng 12 ký tự. */
const TOI_DA_TEN_NGAN = 12;

function doDai(s: string): number {
  return [...s.normalize("NFC")].length;
}

/**
 * BB-324 — tên ngắn dưới biểu tượng màn hình chính (manifest `short_name`,
 * `apple-mobile-web-app-title`, `<title>` trang khách). Cùng nguồn
 * `tinhTenBiaTuDuLieu`:
 *  - có biệt danh → "Bé Xoài";
 *  - chỉ có họ tên → "Bé" + 1–2 chữ CUỐI (tên gọi), giữ trọn chữ, ≤ 12 ký tự:
 *    "Nguyễn Ngọc Bảo An" → "Bé Bảo An", "Trần Thị Khánh Linh" → "Bé Linh";
 *  - không có tên → "Baby Bean".
 * Trước bản vá: `tenBe.slice(0, 12)` cắt ngang chữ ("Nguyễn Ngọc ").
 * Không bao giờ cắt giữa một chữ — tên một chữ quá dài để hệ điều hành tự cắt.
 */
export function tenNganManHinhChinh(
  nickname: string | null | undefined,
  hoTenDayDu: string | null | undefined,
): string {
  const ten = tinhTenBiaTuDuLieu(nickname, hoTenDayDu).normalize("NFC");
  if (!ten) return TEN_NGAN_MAC_DINH;
  const coBietDanh = !!nickname?.trim();
  if (coBietDanh && doDai(ten) <= TOI_DA_TEN_NGAN) return ten;

  // Bỏ chữ "Bé" có sẵn ở đầu, lấy chữ theo thứ tự ưu tiên: biệt danh giữ chữ
  // ĐẦU ("Bé Bin Béo Ú" → "Bé Bin Béo"), họ tên giữ chữ CUỐI (tên gọi).
  const chu = ten.split(/\s+/).filter(Boolean);
  if (chu[0]?.toLowerCase() === "bé") chu.shift();
  if (chu.length === 0) return ten;
  for (let n = Math.min(2, chu.length); n >= 1; n--) {
    const phan = coBietDanh ? chu.slice(0, n) : chu.slice(-n);
    const ketQua = `Bé ${phan.join(" ")}`;
    if (doDai(ketQua) <= TOI_DA_TEN_NGAN || n === 1) return ketQua;
  }
  return ten;
}

export interface CoChuTieuDeBia {
  /** px ở khổ điện thoại (< 640px). */
  mobile: number;
  /** px từ `sm` (≥640px). */
  sm: number;
  /** px từ `lg` (≥1024px). */
  lg: number;
  /** px từ `xl` (≥1280px). */
  xl: number;
}

/**
 * BB-310 mục 7 (chỉ đạo 28/09/2026) — họ tên đầy đủ in nguyên trên bìa cần
 * co cỡ chữ theo ĐỘ DÀI để không tràn quá 2 dòng ở cả 390px và 1440px (đo
 * bằng số KÝ TỰ, không phải số từ — dấu cách/dấu thanh không phản ánh đúng
 * bề rộng chữ Playfair). Bốn bậc, ứng với 4 mốc cỡ gốc (44/52/64/84px) đã
 * dùng cho tên ngắn ("Bé Na") — tên càng dài, bậc càng nhỏ. Hàm THUẦN để
 * phép thử đơn vị canh đúng ngưỡng, không đọc DOM đo chữ thật (canvas đo
 * chữ không chạy được trong Vitest `environment: node`).
 *
 * BB-319 (luật 3, một thang chữ) — mọi bậc lấy ĐÚNG giá trị của thang chữ màn
 * khách (`tokens.css`, khối "THANG CHỮ"): 28 · 32 · 36 · 40 · 44 · 48 · 56 · 64 · 72 · 84.
 * Bản cũ có 27/38/46/52/54/68 — cỡ lẻ nằm ngoài thang, mỗi độ dài tên một cỡ riêng.
 */
export function coChuTieuDeBia(tieuDe: string): CoChuTieuDeBia {
  const n = tieuDe.trim().length;
  if (n <= 10) return { mobile: 44, sm: 56, lg: 64, xl: 84 };
  if (n <= 16) return { mobile: 36, sm: 44, lg: 56, xl: 72 };
  if (n <= 22) return { mobile: 32, sm: 40, lg: 48, xl: 56 };
  return { mobile: 28, sm: 32, lg: 40, xl: 48 };
}

export interface TieuDeBoAnhQuanTri {
  /** Tiêu đề để hiển thị. */
  tieuDe: string;
  /**
   * true = không có tên bé lẫn tên khách, `tieuDe` đang là mã hợp đồng
   * (hoặc tên bộ ảnh thô khác). Chỗ gọi PHẢI hiện chuỗi này bằng Be Vietnam
   * Pro tabular-nums (lớp `.bb-so`/`PAGE_TITLE_FALLBACK_CLASS`), KHÔNG
   * Playfair Display — mã dạng "HD_20260911#5087" viết serif có số 0 dễ đọc
   * lầm chữ O (báo cáo chấm 28/09/2026, ảnh chụp app thật, Đợt 9).
   */
  laMaHopDong: boolean;
}

/**
 * BB-313 (ảnh chụp app thật Đợt 9, mục 1) — tiêu đề bộ ảnh DÙNG CHUNG cho mọi
 * màn quản trị (chi tiết, danh sách, bảng điều khiển "Việc hôm nay",
 * breadcrumb): TÊN đứng trước — họ tên bé đầy đủ hoặc tên gọi
 * (`tinhTenBiaTuDuLieu`), không có tên bé thì lấy tên khách — mã hợp đồng
 * CHỈ dùng khi không còn tên nào khác để thay.
 *
 * Trước bản vá, bốn màn (`gallery-detail.tsx`, `gallery-list.tsx`,
 * `dashboard.tsx` khối "Việc hôm nay") tự viết lại luật này bốn lần, theo ba
 * cách khác nhau — cả ba đều gọi `tenGoiBe()` (hàm chỉ dành cho NICKNAME,
 * luôn thêm "Bé " trừ khi đã có sẵn) một cách VÔ ĐIỀU KIỆN lên một chuỗi đã
 * bị COALESCE (nickname || họ tên đầy đủ) — bé KHÔNG có nickname thì hoá ra
 * bị thêm "Bé " trước cả HỌ TÊN ĐẦY ĐỦ ("Bé Nguyễn Văn A"), sai luật
 * `tinhTenBiaTuDuLieu` đã chốt (họ tên đầy đủ in NGUYÊN VẸN, không thêm "Bé").
 * Gộp về MỘT hàm — đổi luật thì chỉ sửa ở đây.
 */
export function tinhTieuDeBoAnhQuanTri(input: {
  packageName?: string | null;
  babyNickname?: string | null;
  babyFullName?: string | null;
  customerName?: string | null;
  /** Mã hợp đồng/tên bộ ảnh thô — dùng khi KHÔNG có tên bé lẫn tên khách. */
  duPhong: string;
}): TieuDeBoAnhQuanTri {
  // BB-325 (chỉ đạo "tên hiển thị" 29/09/2026, THAY luật BB-313 "tên bé làm
  // tiêu đề quản trị"): tiêu đề màn QUẢN TRỊ là TÊN MẸ (tên khách). Tên bé,
  // SĐT, mã hóa đơn, gói chụp xuống dòng thông tin (`dongThongTinBoAnhQuanTri`).
  // Màn KHÁCH vẫn gọi tên bé (`tinhTenBiaTuDuLieu`) — không đổi ở đây.
  // Không ghép gói chụp vào tiêu đề nữa: "Gói Cao cấp · Constance Downing"
  // (lỗi.JPG) đọc như tên gói, không phải tên người.
  const ten = tenMeThat(input.customerName) || tinhTenBiaTuDuLieu(input.babyNickname, input.babyFullName) || "";
  if (ten) return { tieuDe: ten, laMaHopDong: false };
  // BB-392 mục 3b: tên bộ cũ dính đuôi số dòng chi tiết hoá đơn → hiển thị sạch (không sửa dữ liệu).
  return { tieuDe: hienTieuDeBoAnh(input.duPhong) || input.duPhong, laMaHopDong: true };
}

/**
 * Tên khách THẬT, hay chuỗi rỗng khi đó là tên che "KH · <mã>" do đồng bộ Lark
 * sinh ra ở môi trường không được nhận tên thật (sync-retouch.ts) — tên che
 * không phải tên người, không được làm tiêu đề.
 */
export function tenMeThat(customerName: string | null | undefined): string {
  const t = customerName?.trim() ?? "";
  return /^KH\s*·/.test(t) ? "" : t;
}

/**
 * BB-325 — dòng thông tin dưới tiêu đề bộ ảnh ở màn quản trị:
 * "tên bé · số điện thoại · mã hóa đơn · gói chụp", chỉ nối phần CÓ dữ liệu.
 * Tên bé đã đứng làm tiêu đề (bộ không có tên mẹ) thì không lặp lại.
 */
export function dongThongTinBoAnhQuanTri(input: {
  tieuDe?: string | null;
  babyNickname?: string | null;
  babyFullName?: string | null;
  customerPhone?: string | null;
  maHoaDon?: string | null;
  packageName?: string | null;
}): string {
  const tenBe = tinhTenBiaTuDuLieu(input.babyNickname, input.babyFullName);
  // BB-392 mục 3b: "HD_…#5074_12654,HD_…#5074_12886" → "HD_…#5074" (chỉ hiển thị).
  const cacMa = tachMaHoaDon(input.maHoaDon);
  const maHoaDon = cacMa.length > 0 ? cacMa.join(" + ") : input.maHoaDon?.trim() || null;
  const phan = [
    tenBe && tenBe !== input.tieuDe ? tenBe : null,
    input.customerPhone ? formatSdt(input.customerPhone) : null,
    maHoaDon && maHoaDon !== input.tieuDe && !(input.tieuDe ?? "").includes(maHoaDon) ? maHoaDon : null,
    input.packageName?.trim() || null,
  ];
  return phan.filter((v): v is string => !!v).join(" · ");
}

/**
 * BB-317 (Cảm xúc, vòng 5) — tiêu đề hộp "Chốt danh sách" gọi TÊN BÉ:
 * "Chốt ảnh cho bé Nguyễn Ngọc Bảo An" (họ tên đầy đủ khi không có nickname,
 * cùng nguồn `tinhTenBiaTuDuLieu`). Tên đã tự có "Bé " ở đầu ("Bé Mít") thì
 * không thêm lần nữa — "Chốt ảnh cho Bé Mít". Không có tên trả chuỗi rỗng để
 * nơi gọi rơi về tiêu đề chung.
 */
export function tieuDeHopChot(tenBe: string | null | undefined): string {
  const ten = (tenBe ?? "").trim();
  if (!ten) return "";
  const tuDau = ten.split(/\s+/)[0] ?? "";
  return tuDau.toLowerCase() === "bé" ? `Chốt ảnh cho ${ten}` : `Chốt ảnh cho bé ${ten}`;
}

/**
 * BB-317 K-e — dòng YÊU CẦU trong hộp chốt: bìa album là bắt buộc, nút Xác nhận
 * khoá tới khi chọn xong. Gọi đúng tên sản phẩm, ≤ 12 chữ ở trường hợp một
 * cuốn; nhiều cuốn thì nêu cuốn đầu rồi đếm phần còn lại.
 */
export function cauYeuCauBiaAlbum(tenAlbum: readonly string[]): string {
  const [dau, ...con] = tenAlbum.map((t) => t.trim()).filter(Boolean);
  // BB-355 — giọng Bean (gọi "ba mẹ", kết "ạ"), câu nằm ở `vi.gallery.loiBean`.
  const L = vi.gallery.loiBean;
  if (!dau) return L.yeuCauBiaAlbumChung;
  return con.length === 0
    ? L.yeuCauBiaAlbum.replace("{ten}", dau)
    : L.yeuCauBiaAlbumNhieu.replace("{ten}", dau).replace("{n}", String(con.length));
}

/**
 * BB-317 K-e — dòng LỜI NHẮC cho sản phẩm in còn thiếu ảnh (không chặn chốt):
 * "Ảnh in 15×21 còn thiếu 1 ảnh, bổ sung sau được." Cuốn album rỗng không có
 * "số ảnh thiếu" rõ ràng nên nói "chưa có ảnh".
 */
export function cauNhacThieuAnh(tenSanPham: string, soThieu: number, laAlbum = false): string {
  const ten = tenSanPham.trim() || "Sản phẩm";
  const L = vi.gallery.loiBean;
  return laAlbum
    ? L.nhacChuaCoAnh.replace("{ten}", ten)
    : L.nhacThieuAnh.replace("{ten}", ten).replace("{n}", String(Math.max(1, soThieu)));
}

/**
 * BB-320 (Ghi nhận vòng 6: "40 ảnh đã chỉnh" so với "12/12") — hai con số ĐẾM
 * HAI THỨ KHÁC NHAU và phải có nhãn nói rõ:
 *
 *  - "12/12" = số tấm khách đã CHỌN / số tấm nằm trong gói (hạn mức) — đếm trên
 *    danh sách chọn (`selections`).
 *  - "40 ảnh" = số ảnh CÓ TRONG BỘ (thư mục ảnh đã chỉnh giao khách) — đếm trên
 *    bảng `photos`, không liên quan tới số đã chọn.
 *
 * Hàm này dựng nhãn cho con số thứ nhất: luôn kèm đơn vị "tấm", và khi chưa biết
 * hạn mức (`?`) thì nói thẳng thay vì để "0/?" trơ trọi.
 */
export function nhanTienDoChon(input: { selectedCount: number; includedQuota: number }): {
  /** Chuỗi ngắn hiển thị trong bảng/thẻ: "12/12 tấm" hoặc "3 tấm". */
  ngan: string;
  /** Giải thích đầy đủ cho tooltip/đọc màn hình. */
  giaiThich: string;
  quotaKnown: boolean;
} {
  const chon = Math.max(0, Math.trunc(input.selectedCount));
  const quota = Math.trunc(input.includedQuota);
  if (quota > 0) {
    return {
      ngan: `${formatSo(chon)}/${formatSo(quota)} tấm`,
      giaiThich: `Khách đã chọn ${formatSo(chon)} trên ${formatSo(quota)} tấm trong gói`,
      quotaKnown: true,
    };
  }
  return {
    ngan: `${formatSo(chon)} tấm`,
    giaiThich: `Khách đã chọn ${formatSo(chon)} tấm — chưa rõ hạn mức trong gói`,
    quotaKnown: false,
  };
}
