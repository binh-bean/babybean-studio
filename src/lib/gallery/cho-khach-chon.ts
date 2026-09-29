/**
 * "Còn chờ khách chọn ảnh" — MỘT công thức cho Bảng điều khiển và Báo cáo.
 *
 * BB-318 (Q-d). BB-285 sửa thẻ "Chờ khách chọn" ở Bảng điều khiển: một bộ app
 * còn ghi `ready`/`in_review` mà Lark đã sang "Đã chọn hình" (tên trên Lark) trở lên, hoặc đã
 * quá 60 ngày ở "Đã gửi file gốc" (đóng theo quy định), thì KHÔNG còn là chờ
 * khách chọn. Báo cáo "Tiến độ chọn ảnh" (BB-260) khi đó vẫn đếm thẳng theo
 * `status` của app, nên hai màn nói hai sự thật khác nhau về cùng một bộ.
 * Điều kiện này tách ra để cả hai gọi chung — không tự tính lại ở nơi khác.
 *
 * Chỉ lọc phần Lark; việc bộ có nằm ở `ready`/`in_review` hay không vẫn do
 * chỗ gọi quyết định (Bảng điều khiển đếm cả hai, Báo cáo tách riêng từng loại).
 */

import { laKhoaTheoLark, qua60NgayFileGoc } from "@/lib/lark/trang-thai-hau-ky";

export interface DongLarkCuaBo {
  lark_trang_thai: string | null;
  lark_trang_thai_tu: string | null;
}

export function conChoKhachChonTheoLark(g: DongLarkCuaBo, homNay: Date): boolean {
  if (laKhoaTheoLark(g.lark_trang_thai)) return false;
  if (qua60NgayFileGoc(g.lark_trang_thai, g.lark_trang_thai_tu ? new Date(g.lark_trang_thai_tu) : null, homNay)) {
    return false;
  }
  return true;
}
