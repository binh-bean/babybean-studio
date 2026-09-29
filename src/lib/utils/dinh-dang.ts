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
 * Chuẩn hoá kích thước in ("10x15", "10 x 15", "10×15") về một dạng duy nhất
 * "10×15" — dấu nhân đúng kiểu in ấn, không phải chữ "x" của bàn phím.
 */
export function formatKichThuoc(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/(\d)\s*[xX]\s*(\d)/g, "$1×$2");
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
 */
export function coChuTieuDeBia(tieuDe: string): CoChuTieuDeBia {
  const n = tieuDe.trim().length;
  if (n <= 10) return { mobile: 44, sm: 52, lg: 64, xl: 84 };
  if (n <= 16) return { mobile: 38, sm: 44, lg: 54, xl: 68 };
  if (n <= 22) return { mobile: 32, sm: 38, lg: 46, xl: 56 };
  return { mobile: 27, sm: 32, lg: 38, xl: 46 };
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
  const ten = tinhTenBiaTuDuLieu(input.babyNickname, input.babyFullName) || input.customerName?.trim() || "";
  if (ten) {
    const goi = input.packageName?.trim();
    return { tieuDe: goi ? `${goi} · ${ten}` : ten, laMaHopDong: false };
  }
  return { tieuDe: input.duPhong, laMaHopDong: true };
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
  if (!dau) return "Chọn ảnh bìa album để chốt.";
  return con.length === 0
    ? `Chọn ảnh bìa cho ${dau} để chốt.`
    : `Chọn ảnh bìa cho ${dau} và ${con.length} album nữa để chốt.`;
}

/**
 * BB-317 K-e — dòng LỜI NHẮC cho sản phẩm in còn thiếu ảnh (không chặn chốt):
 * "Ảnh in 15×21 còn thiếu 1 ảnh, bổ sung sau được." Cuốn album rỗng không có
 * "số ảnh thiếu" rõ ràng nên nói "chưa có ảnh".
 */
export function cauNhacThieuAnh(tenSanPham: string, soThieu: number, laAlbum = false): string {
  const ten = tenSanPham.trim() || "Sản phẩm";
  return laAlbum
    ? `${ten} chưa có ảnh, bổ sung sau được.`
    : `${ten} còn thiếu ${Math.max(1, soThieu)} ảnh, bổ sung sau được.`;
}
