/**
 * Mẫu chữ điền sẵn cho ảnh bìa bộ ảnh — tiêu đề + lời.
 *
 * OWNER: DEV-BE/DEV-FE. Task BB-215.
 * Spec: lời chủ studio 24/09/2026 (xem docs/briefs/BB-215-*.md) — "đoạn text ở
 * ảnh bìa cần được thay đổi cho phù hợp với từng bộ ảnh theo ngôn ngữ thiết kế
 * high fashion, CSKH tùy chỉnh được (đoạn text có điền sẵn)".
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách riêng tệp thuần, không nằm trong route hay component
 * ---------------------------------------------------------------------------
 * Cả API PATCH lẫn màn quản trị đều cần đúng một danh sách mẫu — API để không
 * cho CSKH gửi lên một chuỗi còn nguyên "{tenBe}" chưa điền, màn quản trị để
 * vẽ các "chip" bấm điền. Một tệp không import React, không import Supabase,
 * kiểm bằng phép thử thuần không cần mock gì.
 *
 * ---------------------------------------------------------------------------
 * Luật không được phá
 * ---------------------------------------------------------------------------
 * 1. Không mẫu nào được để lọt "{...}" ra màn hình khi dữ liệu thiếu — đó là
 *    lỗi lộ mã nguồn ra trước mặt khách, xấu hơn cả câu mặc định cũ.
 * 2. Không bao giờ trả về chuỗi bắt đầu bằng "HD_" (mã hợp đồng). 234/488 bộ
 *    ảnh (đo 23/09/2026) chưa gắn tên bé — mẫu KHÔNG được đoán bừa từ tiêu đề
 *    bộ ảnh, vì tiêu đề của chúng chính là mã hợp đồng đó.
 */

export interface DuLieuBia {
  /** Tên bé, đã rút gọn (nickname ưu tiên hơn họ tên đầy đủ). `null` nếu chưa gắn. */
  tenBe: string | null;
  /** Ngày chụp, dạng ISO. `null` nếu chưa có lịch. */
  ngayChup: string | null;
  /** Tên chi nhánh, ví dụ "Pasteur". */
  chiNhanh: string | null;
}

export interface MauChuBia {
  /** Khoá ổn định để màn quản trị đánh dấu chip đang chọn. */
  id: string;
  /** Nhãn ngắn hiện trên chip, không phải nội dung đầy đủ. */
  nhan: string;
  /** Mẫu tiêu đề — có thể chứa {tenBe}, {thangNam}, {chiNhanh}. */
  tieuDe: string;
  /** Mẫu lời — cùng cú pháp điền chỗ trống với tiêu đề. */
  loi: string;
  /** Mẫu này có dùng được khi KHÔNG có tên bé không. */
  canKhongTenBe: boolean;
}

/**
 * Tám mẫu, giọng biên tập tạp chí thời trang: ngắn, không sến, không emoji.
 *
 * Bốn mẫu đầu cần {tenBe} — chỉ dùng khi bộ ảnh đã gắn tên bé. Bốn mẫu sau
 * dùng được cho MỌI bộ ảnh, kể cả 234 bộ chưa gắn tên (đo 23/09/2026).
 */
export const MAU_CHU_BIA: MauChuBia[] = [
  {
    id: "mua-dau-tien",
    nhan: "Mùa đầu tiên",
    tieuDe: "Mùa đầu tiên của {tenBe}",
    loi: "Những khoảnh khắc nhỏ, lưu lại cho một đời.",
    canKhongTenBe: false,
  },
  {
    id: "chan-dung-nho",
    nhan: "Chân dung nhỏ",
    tieuDe: "{tenBe}, một chân dung",
    loi: "Ánh sáng studio, và một gương mặt chưa từng biết đặt để.",
    canKhongTenBe: false,
  },
  {
    id: "theo-thang-nam",
    nhan: "Theo tháng năm",
    tieuDe: "{tenBe} · {thangNam}",
    loi: "Một buổi chụp, một mốc thời gian ba mẹ giữ lại cho con.",
    canKhongTenBe: false,
  },
  {
    id: "tai-chi-nhanh",
    nhan: "Theo chi nhánh",
    tieuDe: "{tenBe} tại {chiNhanh}",
    loi: "Studio Baby Bean {chiNhanh} — nơi buổi chụp này diễn ra.",
    canKhongTenBe: false,
  },
  {
    id: "khoanh-khac-cua-con",
    nhan: "Khoảnh khắc của con",
    tieuDe: "Khoảnh khắc của con",
    loi: "Những khoảnh khắc nhỏ, lưu lại cho một đời.",
    canKhongTenBe: true,
  },
  {
    id: "mot-buoi-chup",
    nhan: "Một buổi chụp, một câu chuyện",
    tieuDe: "Một buổi chụp, một câu chuyện",
    loi: "Ba mẹ thong thả chọn — mỗi tấm ảnh là một cách kể khác của cùng một ngày.",
    canKhongTenBe: true,
  },
  {
    id: "studio-chan-dung",
    nhan: "Studio chân dung",
    tieuDe: "Studio chân dung · {chiNhanh}",
    loi: "Ánh sáng dịu, khung hình gọn — một bộ ảnh gia đình đúng chất Baby Bean.",
    canKhongTenBe: true,
  },
  {
    id: "luu-giu-hom-nay",
    nhan: "Lưu giữ hôm nay",
    tieuDe: "Lưu giữ, cho một ngày sau",
    loi: "{soAnh} tấm ảnh đã sẵn sàng. Ba mẹ chọn lấy những khoảnh khắc muốn giữ.",
    canKhongTenBe: true,
  },
];

/** "09/2026" từ một chuỗi ISO. `null` nếu không đọc được ngày. */
function thangNamDep(ngayChup: string | null): string | null {
  if (!ngayChup) return null;
  const d = new Date(ngayChup);
  if (Number.isNaN(d.getTime())) return null;
  const hai = (n: number) => String(n).padStart(2, "0");
  return `${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Điền chỗ trống của một mẫu bằng dữ liệu thật.
 *
 * Trả `null` nếu mẫu cần một trường mà dữ liệu không có — gọi nơi KHÔNG được
 * để lọt "{...}" ra màn hình. `soAnh` truyền riêng vì nó không thuộc `DuLieuBia`
 * (dữ liệu bìa cố định của bộ ảnh, còn số ảnh đổi theo lần đồng bộ).
 */
export function dienMau(
  mau: MauChuBia,
  du: DuLieuBia,
  soAnh?: number,
): { tieuDe: string; loi: string } | null {
  const thangNam = thangNamDep(du.ngayChup);

  const cacO: Record<string, string | null> = {
    tenBe: du.tenBe,
    chiNhanh: du.chiNhanh,
    thangNam,
    soAnh: soAnh != null ? soAnh.toLocaleString("vi-VN") : null,
  };

  function dien(mauChu: string): string | null {
    let hong = false;
    const ra = mauChu.replace(/\{(\w+)\}/g, (khop, ten) => {
      const gt = cacO[ten];
      if (gt == null || gt === "") {
        hong = true;
        return khop;
      }
      return gt;
    });
    return hong ? null : ra;
  }

  const tieuDe = dien(mau.tieuDe);
  const loi = dien(mau.loi);
  if (tieuDe == null || loi == null) return null;

  // Luật 2: không bao giờ để lọt mã hợp đồng — phòng xa, dù không mẫu nào ở
  // trên tham chiếu tới `title`/mã hợp đồng, một mẫu thêm sau này có thể lỡ tay.
  if (tieuDe.startsWith("HD_") || loi.startsWith("HD_")) return null;

  return { tieuDe, loi };
}

/**
 * Chọn mẫu MẶC ĐỊNH theo dữ liệu có sẵn — dùng khi CSKH mở màn "Bìa bộ ảnh"
 * lần đầu, trước khi tự bấm chip nào khác.
 *
 * Có tên bé thì ưu tiên mẫu "Mùa đầu tiên" (ấm, đúng cho phần lớn buổi chụp
 * trẻ em). Chưa có tên bé thì "Khoảnh khắc của con" — câu chung đã dùng làm
 * mặc định ở màn khách từ trước, giữ nguyên để không đổi cảm giác cho những bộ
 * đã gửi khách.
 */
export function chonMauMacDinh(du: DuLieuBia): MauChuBia {
  if (du.tenBe) {
    return MAU_CHU_BIA.find((m) => m.id === "mua-dau-tien")!;
  }
  return MAU_CHU_BIA.find((m) => m.id === "khoanh-khac-cua-con")!;
}

/**
 * Mẫu dùng được với dữ liệu hiện có — để màn quản trị chỉ bày chip điền được.
 *
 * "Dùng được" nghĩa là `dienMau` ra một kết quả thật, không chỉ nhìn cờ
 * `canKhongTenBe`: một mẫu không cần tên bé vẫn có thể cần {chiNhanh}, và bộ
 * ảnh có thể chưa có cả hai.
 */
export function mauDungDuoc(du: DuLieuBia, soAnh?: number): MauChuBia[] {
  return MAU_CHU_BIA.filter((m) => dienMau(m, du, soAnh) !== null);
}
