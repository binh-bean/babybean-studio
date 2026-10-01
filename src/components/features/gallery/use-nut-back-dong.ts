"use client";

/**
 * BB-338 mục 2e — anh báo 01/10/2026: "chọn ảnh mà không muốn chọn nữa thì
 * không thoát ra được". Các màn phủ toàn trang (mua thêm, chọn tấm, mời người
 * thân) chỉ có nút "Đóng" nhỏ ở góc; bấm nút back của điện thoại thì trình
 * duyệt rời hẳn bộ ảnh.
 *
 * Hook này: khi một lớp phủ MỞ, đẩy một mục lịch sử mang số lớp (`bbLop`).
 * Nút back của điện thoại bật mục đó ra → lớp có số lớn hơn mục hiện tại tự
 * đóng (lớp trong đóng trước, lớp ngoài vẫn mở). Nút "Đóng"/"Huỷ" trên màn
 * gọi hàm trả về: đóng ngay và gỡ luôn mục lịch sử của chính lớp đó.
 *
 * Mục lịch sử chép lại `history.state` hiện có (giữ các khoá nội bộ của
 * Next.js) và giữ nguyên địa chỉ — không đổi trang, không tải lại.
 */

import { useCallback, useEffect, useRef } from "react";

let soLopDangMo = 0;

function lopCua(state: unknown): number {
  const v = (state as { bbLop?: unknown } | null)?.bbLop;
  return typeof v === "number" ? v : 0;
}

export function useNutBackDong(mo: boolean, onDong: () => void): () => void {
  const onDongRef = useRef(onDong);
  onDongRef.current = onDong;
  const lopRef = useRef(0);

  useEffect(() => {
    if (!mo || typeof window === "undefined") return;
    soLopDangMo += 1;
    const lop = soLopDangMo;
    lopRef.current = lop;
    try {
      window.history.pushState({ ...(window.history.state ?? {}), bbLop: lop }, "");
    } catch {
      // Trình duyệt chặn pushState (hiếm) — nút Đóng vẫn chạy bình thường.
    }
    const khiBack = (e: PopStateEvent) => {
      if (lopCua(e.state) < lop) onDongRef.current();
    };
    window.addEventListener("popstate", khiBack);
    return () => {
      window.removeEventListener("popstate", khiBack);
      soLopDangMo = Math.max(0, lop - 1);
      lopRef.current = 0;
    };
  }, [mo]);

  return useCallback(() => {
    const lop = lopRef.current;
    onDongRef.current();
    if (lop > 0 && typeof window !== "undefined" && lopCua(window.history.state) === lop) {
      window.history.back();
    }
  }, []);
}
