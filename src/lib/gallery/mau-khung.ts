/**
 * Danh sách mẫu khung THAM KHẢO cho màn "treo ảnh của con lên tường" (BB-222).
 *
 * OWNER: DEV-FE. Chủ studio 25/09/2026: "mẫu mã khung rất nhiều, thay đổi
 * liên tục nên CHỈ ĐỂ THAM KHẢO; bảng mẫu khung tôi sẽ cập nhật ngày mai."
 * Vì vậy đây là MỘT tệp dữ liệu duy nhất — thêm mẫu mới chỉ thêm một dòng
 * vào mảng `MAU_KHUNG` bên dưới, KHÔNG phải sửa component
 * `man-treo-tuong.tsx` hay `khung-tren-tuong.ts`.
 *
 * ---------------------------------------------------------------------------
 * Cách thêm một mẫu khung mới
 * ---------------------------------------------------------------------------
 * 1. Chụp/tạo một ảnh vuông (khuyến nghị 1200×1200 trở lên) đúng GÓC
 *    TRÊN-TRÁI của khung thật: nhìn thẳng (không phối cảnh chéo), đường ghép
 *    hai cạnh là đường chéo 45°, bên trong khung để trống (nền trơn, không
 *    có ảnh) — như 4 ảnh gốc trong `babybean-assets/BB-220/`.
 * 2. Đo bằng mắt/pixel (dùng PIL: `python`) xem nẹp khung bắt đầu ở pixel nào
 *    (outer_x, outer_y tính từ góc trên-trái ảnh gốc) và bề rộng nẹp là bao
 *    nhiêu pixel (`width_px`, đo dọc theo cạnh trên VÀ cạnh trái, lấy trung
 *    bình nếu lệch nhau chút ít).
 * 3. Cắt một ô vuông cạnh `T = width_px + ~200` bắt đầu từ (outer_x, outer_y)
 *    — đủ chỗ cho một đoạn nẹp thẳng ngoài góc chéo. Thu nhỏ ô vuông đó (ví
 *    dụ còn 220×220), rồi LẬT để dựng đủ 4 góc: trên-trái = ảnh gốc, trên-phải
 *    = lật ngang, dưới-trái = lật dọc, dưới-phải = lật cả hai — ghép thành một
 *    ảnh vuông 440×440 (script mẫu: xem lịch sử commit thêm BB-222, tìm
 *    `build_khung.py`). Nén JPEG/WebP còn ≤ ~80KB, đặt vào `public/tuong/khung/`.
 * 4. `slicePx` = bề rộng nẹp SAU KHI thu nhỏ (tỉ lệ theo bước 3), dùng thẳng
 *    cho CSS `border-image-slice` (đơn vị px, vì ảnh không đổi cỡ khi hiển
 *    thị — border-image-width mới là thứ co theo `vienCm`).
 * 5. `vienCm` = bề rộng nẹp NGOÀI ĐỜI (cm), đo tay hoặc theo thông số nhà máy —
 *    KHÔNG suy từ `slicePx` (ảnh có thể chụp phối cảnh khác tỉ lệ thật).
 * 6. Thêm một object vào mảng `MAU_KHUNG`. Không cần sửa gì khác — màn treo
 *    tường tự đọc mảng này để vẽ hàng chọn mẫu và tính khung có vừa tường
 *    không (`tinhKhungTrenTuong(..., vienCm)`).
 */

export interface MauKhung {
  /** Mã ổn định — dùng làm `key` React, KHÔNG đổi sau khi đã thêm (tránh vỡ state đã lưu tạm). */
  ma: string;
  /** Tên tiếng Việt hiện cho ba mẹ chọn. */
  ten: string;
  /** Đường dẫn ảnh trong `public/`, ví dụ "/tuong/khung/khung-den.jpg". */
  anh: string;
  /** Bề rộng nẹp trong chính ảnh `anh` (px) — dùng cho CSS border-image-slice. */
  slicePx: number;
  /** Bề rộng nẹp ngoài đời (cm) — dùng để tính border-image-width hiển thị và kiểm "có vừa tường không". */
  vienCm: number;
}

/**
 * 4 mẫu tham khảo đầu tiên (BB-220, ảnh AI tạo — không phải ảnh khách, được
 * phép đưa vào repo). Số đo `slicePx`/`vienCm` xem hướng dẫn ở đầu tệp.
 */
export const MAU_KHUNG: MauKhung[] = [
  {
    ma: "khung-den",
    ten: "Khung đen",
    anh: "/tuong/khung/khung-den.jpg",
    slicePx: 113,
    vienCm: 2.5,
  },
  {
    ma: "khung-go-soi",
    ten: "Khung gỗ sồi",
    anh: "/tuong/khung/khung-go-soi.jpg",
    slicePx: 128,
    vienCm: 2.5,
  },
  {
    ma: "khung-trang",
    ten: "Khung trắng",
    anh: "/tuong/khung/khung-trang.jpg",
    slicePx: 109,
    vienCm: 2.5,
  },
  {
    ma: "khung-vien-vang",
    ten: "Khung viền vàng",
    anh: "/tuong/khung/khung-vien-vang.jpg",
    slicePx: 92,
    vienCm: 1,
  },
];

export const MAU_KHUNG_MAC_DINH: MauKhung = MAU_KHUNG[0]!;
