import type { ReactNode } from "react";
import { Fraunces } from "next/font/google";

/**
 * Khung chung cho mọi màn ba mẹ nhìn thấy.
 *
 * OWNER: DEV-FE. Chủ studio duyệt hướng "cuốn album kỷ niệm" ngày 23/09/2026:
 * nền kem, chữ có chân cho tên bé, ảnh lên trước chữ.
 *
 * Phông Fraunces CHỈ nạp ở đây, không nạp ở gốc: màn quản trị không dùng tới,
 * và mỗi phông thêm là thêm một tệp mà điện thoại của CSKH phải tải.
 * Fraunces có bộ chữ tiếng Việt đầy đủ dấu — đã kiểm trong danh mục phông của
 * next/font trước khi chọn.
 */
const fraunces = Fraunces({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <div className={`${fraunces.variable} giao-dien-khach`}>{children}</div>;
}
