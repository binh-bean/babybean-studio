/**
 * BB-374 — "Ảnh album không chỉnh sửa": luật THUẦN (không đụng cơ sở dữ liệu).
 *
 * Anh chốt 06/10/2026: gói Baby 1 / Baby 2 chỉ có 5 / 15 file chỉnh sửa, mà một cuốn
 * album cần ~20 ảnh. Khách không muốn trả 50.000 ₫/file chỉnh cho phần thiếu — họ chỉ
 * cần thêm ảnh để IN vào album, không cần chỉnh. CSKH thêm dòng "Ảnh album không chỉnh
 * sửa ×N" vào thành phần hợp đồng; khách được chọn thêm ĐÚNG N tấm:
 *
 *   · giá 0 ₫, KHÔNG cộng vào hạn mức chỉnh sửa, KHÔNG làm "Phải thu" đổi;
 *   · một tấm không thể vừa "chỉnh sửa" (thả tim, trong hạn mức) vừa "không chỉnh";
 *   · thợ/CSKH thấy rõ tấm nào KHÔNG cần chỉnh.
 *
 * Lưu ở bảng riêng `anh_album_khong_chinh` (migration 0093), KHÔNG ở `selection_items`
 * — mọi chỗ tính hạn mức/tiền đều đếm `selection_items.mark = 'selected'`, nên tấm
 * "không chỉnh" đứng ngoài bảng đó thì không bao giờ thành tiền vượt hạn mức.
 */

/** Loại sản phẩm (enum `product_kind`, thêm ở 0092). */
export const LOAI_ALBUM_KHONG_CHINH = "album_unedited" as const;

/** Tên sản phẩm trong danh mục (0093). Chỉ để hiển thị/tra cứu — nhận diện bằng `kind`. */
export const TEN_SAN_PHAM_ALBUM_KHONG_CHINH = "Ảnh album không chỉnh sửa";

/** Nhãn cho thợ/CSKH ở danh sách xuất, màn chi tiết, file "Thông tin chi tiết". */
export const NHAN_KHONG_CHINH = "Không chỉnh — cho album";

/** Nhãn ngắn trên ô ảnh của khách. */
export const NHAN_KHACH_KHONG_CHINH = "Cho album · không chỉnh sửa";

export function laSanPhamAlbumKhongChinh(kind: string | null | undefined): boolean {
  return kind === LOAI_ALBUM_KHONG_CHINH;
}

/** Hình dạng tối thiểu của dòng hợp đồng (hai tầng) — khớp `getGalleryContractSummary().items`. */
export interface DongHopDongCoLoai {
  kind: string;
  quantity: number;
  components?: Array<{ kind: string; quantity: number }>;
}

/**
 * Số suất "Ảnh album không chỉnh sửa" của bộ = tổng `quantity` các dòng loại này, ở CẢ
 * HAI tầng (dòng CSKH thêm tay là dòng cha; nếu sau này gói chụp có sẵn thành phần này
 * thì nó là dòng con). Số lạ (âm, NaN) không được cộng.
 */
export function soSuatAlbumKhongChinh(items: DongHopDongCoLoai[] | null | undefined): number {
  let n = 0;
  const cong = (r: { kind: string; quantity: number }) => {
    if (!laSanPhamAlbumKhongChinh(r.kind)) return;
    const q = Number(r.quantity);
    if (Number.isInteger(q) && q > 0) n += q;
  };
  for (const it of items ?? []) {
    cong(it);
    for (const c of it.components ?? []) cong(c);
  }
  return n;
}

export type LyDoKhongChonDuoc =
  | "KHONG_CO_SUAT" // bộ không có dòng "Ảnh album không chỉnh sửa"
  | "HET_SUAT" // đã chọn đủ N tấm
  | "DANG_LA_ANH_CHINH"; // tấm này đang thả tim (ảnh chỉnh sửa trong hạn mức)

/**
 * Có cho thêm MỘT tấm vào suất "không chỉnh" không. Máy chủ (route khách) và màn khách
 * dùng chung — màn khách để làm mờ nút, máy chủ để chặn thật.
 *
 * `daCoTamNay` = tấm đã nằm trong suất rồi → chọn lại là không đổi gì (idempotent), luôn được.
 */
export function kiemChonAlbumKhongChinh(p: {
  soSuat: number;
  soDaChon: number;
  daCoTamNay: boolean;
  laAnhChinhSua: boolean;
}): LyDoKhongChonDuoc | null {
  if (p.daCoTamNay) return null;
  if (p.laAnhChinhSua) return "DANG_LA_ANH_CHINH";
  if (!(p.soSuat > 0)) return "KHONG_CO_SUAT";
  if (p.soDaChon >= p.soSuat) return "HET_SUAT";
  return null;
}

/** Câu báo cho ba mẹ (giọng Bean, có "ạ") theo lý do — dùng ở route khách. */
export const CAU_LY_DO_KHACH: Record<LyDoKhongChonDuoc, string> = {
  KHONG_CO_SUAT: "Bộ ảnh của ba mẹ chưa có suất ảnh album không chỉnh sửa ạ.",
  HET_SUAT: "Ba mẹ đã chọn đủ số tấm cho album rồi ạ. Bỏ bớt một tấm để chọn tấm khác ạ.",
  DANG_LA_ANH_CHINH:
    "Tấm này đang là ảnh chỉnh sửa trong gói ạ. Ba mẹ bỏ tim tấm này trước nếu muốn đưa vào album không chỉnh ạ.",
};

/**
 * Tách ảnh khách chọn thành hai nhóm KHÔNG giao nhau, theo đúng luật "một tấm không
 * thể vừa chỉnh vừa không chỉnh": tấm đã thả tim (`selected`) là ẢNH CHỈNH SỬA, kể cả
 * khi (do đua mạng) nó còn sót trong danh sách "không chỉnh" — tính tiền theo hướng
 * an toàn cho studio, và màn hình/tệp xuất không bao giờ ghi một tấm hai lần.
 */
export function tachAnhChinhVaKhongChinh<T extends { photoId: string }>(
  anhChinhSua: T[],
  photoIdsKhongChinh: Iterable<string>,
): { chinhSua: T[]; khongChinh: string[] } {
  const daChinh = new Set(anhChinhSua.map((a) => a.photoId));
  const khongChinh: string[] = [];
  const thay = new Set<string>();
  for (const id of photoIdsKhongChinh) {
    if (daChinh.has(id) || thay.has(id)) continue;
    thay.add(id);
    khongChinh.push(id);
  }
  return { chinhSua: anhChinhSua, khongChinh };
}
