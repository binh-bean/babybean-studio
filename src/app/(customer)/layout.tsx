import type { ReactNode } from "react";

/**
 * Khung chung cho mọi màn ba mẹ nhìn thấy.
 *
 * OWNER: DEV-FE. Chủ studio duyệt hướng "cuốn album kỷ niệm" ngày 23/09/2026:
 * nền kem, chữ có chân cho tên bé, ảnh lên trước chữ.
 *
 * BB-305 (28/09/2026) — LUẬT PHÔNG mới của admin: chỉ Playfair Display (logo
 * BABY BEAN, tiêu đề lớn) + Be Vietnam Pro (mọi nội dung còn lại), không
 * nghiêng, dùng chung cho cả màn khách lẫn quản trị. Phông Fraunces trước đây
 * CHỈ nạp ở tệp này riêng cho màn khách đã bị loại hẳn: Playfair Display đã
 * nạp sẵn ở gốc (`src/app/layout.tsx`), nên không cần nạp gì thêm ở đây —
 * khách tải nhẹ hơn một tệp phông.
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <div className="giao-dien-khach">{children}</div>;
}
