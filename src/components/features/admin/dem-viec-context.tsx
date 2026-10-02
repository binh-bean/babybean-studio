"use client";

/**
 * BB-359 — kết quả đếm "Việc cần xử lý" dùng CHUNG cho huy hiệu menu, dòng phụ lời
 * chào và thẻ "Cần xử lý ngay" của Bàn làm việc, và số trên từng tab của trang Việc
 * cần xử lý. `AdminLayoutShell` tính MỘT lần (`demViecCanXuLy`) rồi đặt vào đây; các
 * màn chỉ đọc. Xem chú thích BB-359 ở src/lib/utils/viec-can-xu-ly-tabs.ts.
 */

import { createContext, useContext } from "react";
import type { KetQuaDemViec } from "@/lib/utils/viec-can-xu-ly-tabs";

const DemViecContext = createContext<KetQuaDemViec | null>(null);

export const DemViecProvider = DemViecContext.Provider;

/** `null` = chưa đếm xong (hoặc mọi nguồn hỏng) — màn tự ẩn số, không hiện 0 giả. */
export function useDemViecCanXuLy(): KetQuaDemViec | null {
  return useContext(DemViecContext);
}
