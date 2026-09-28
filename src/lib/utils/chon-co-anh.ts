/**
 * Chọn cỡ ảnh (`/api/img?w=`) cho lưới/xem nhỏ theo bề rộng Ô THẬT (px CSS)
 * × DPR bị GIỚI HẠN ở 2 — làm tròn LÊN bậc `THUMBNAIL_WIDTHS` gần nhất.
 *
 * OWNER: DEV-FE. Task BB-311 (P1, mục #5 báo cáo vận hành vòng 4).
 *
 * ---------------------------------------------------------------------------
 * Vì sao giới hạn DPR ở 2, không dùng devicePixelRatio thật
 * ---------------------------------------------------------------------------
 * `srcSet`/`sizes` chuẩn HTML để trình duyệt tự chọn cỡ theo
 * `devicePixelRatio` THẬT — trên điện thoại DPR 3 (đo trong báo cáo vận hành
 * vòng 4), một ô lưới 186px sẽ tự động kéo bản 800w (186×3=558, bậc gần nhất
 * ≥558 là 800). Nhưng ảnh xem LƯỚT không cần nét tới mức DPR 3 — DPR 2
 * (186×2=372, bậc 400w) đã đủ nét cho mắt thường lúc lướt nhanh, và giảm
 * ~67% byte (400w ≈ 45KB so với 800w ≈ 136KB, số đo thật trong báo cáo).
 * Trình duyệt không cho giới hạn DPR qua `sizes` — phải tự tính bằng JS.
 *
 * ---------------------------------------------------------------------------
 * Làm tròn LÊN, không xuống
 * ---------------------------------------------------------------------------
 * Ảnh hơi thừa byte (một vài chục KB) ít gây khó chịu hơn ảnh mờ nhìn thấy rõ
 * bằng mắt thường — nhất là ảnh kỷ niệm gia đình.
 */

import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/types/domain";

/** Trần DPR dùng để tính cỡ ảnh lưới/xem nhỏ — xem giải thích đầu tệp. */
export const DPR_TRAN_CHO_LUOI = 2;

/**
 * @param oPx Bề rộng Ô hiển thị thật, tính bằng px CSS (KHÔNG nhân DPR — hàm
 *   tự nhân). `undefined`/`NaN`/`<= 0` thì trả về cỡ mặc định AN TOÀN (800 —
 *   giữ nguyên hành vi cũ khi chưa đo được kích thước ô, ví dụ lúc ảo hoá
 *   danh sách chưa layout xong).
 * @param dpr `devicePixelRatio` thật của thiết bị. Mặc định đọc
 *   `window.devicePixelRatio` nếu có (trình duyệt); truyền tay khi gọi từ
 *   phép thử (không có `window`) hoặc muốn ép một giá trị cụ thể.
 */
export function chonCoAnhTheoO(oPx: number | undefined, dpr?: number): ThumbnailWidth {
  const CO_MAC_DINH: ThumbnailWidth = 800;
  if (!oPx || !Number.isFinite(oPx) || oPx <= 0) return CO_MAC_DINH;

  const dprThat = dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1) ?? 1;
  const dprGioiHan = Math.min(Math.max(dprThat, 1), DPR_TRAN_CHO_LUOI);
  const canThiet = oPx * dprGioiHan;

  for (const w of THUMBNAIL_WIDTHS) {
    if (w >= canThiet) return w;
  }
  // Ô lớn hơn cả bậc lớn nhất (2048) — trả bậc lớn nhất, không có gì hơn.
  return THUMBNAIL_WIDTHS[THUMBNAIL_WIDTHS.length - 1] as ThumbnailWidth;
}
