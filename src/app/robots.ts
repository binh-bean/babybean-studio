import type { MetadataRoute } from "next";

/**
 * App này KHÔNG được lên máy tìm kiếm.
 *
 * OWNER: DEV-FE. Chủ studio chốt 15.09.2026.
 *
 * hauky.babybeanstudio.vn là chỗ làm việc của nhân viên và chỗ ba mẹ chọn ảnh
 * con mình. Không có gì ở đây đáng để tìm thấy từ Google, mà lại có rất nhiều
 * thứ không nên: tên khách, mã hợp đồng, đường dẫn tới bộ ảnh.
 *
 * babybeanstudio.vn — trang giới thiệu — mới là nơi cần được tìm thấy. Chặn ở
 * đây là dọn đường cho nó, chứ không phải giấu diếm gì.
 *
 * Đây KHÔNG phải hàng rào an ninh: máy quét không tử tế thì vẫn vào. Hàng rào
 * thật là phiên đăng nhập đã ký ở /api/auth và luật quyền trong cơ sở dữ liệu.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
