"use client";

/**
 * Giữ focus bên trong một hộp thoại đang mở (BB-277).
 *
 * OWNER: cùng chủ vùng với component gọi hook này — hook chỉ đọc/di chuyển
 * focus trong DOM, không đụng logic nghiệp vụ nào.
 *
 * Ba việc, đúng ba điều BB-277 đòi hỏi cho "cửa hàng, chọn bìa, chuông":
 *  1. Mở ra thì focus phần tử bấm-được ĐẦU TIÊN trong hộp thoại (không tự ý
 *     rời khỏi hộp).
 *  2. Tab / Shift+Tab quẩn trong hộp — chạm biên thì vòng lại đầu/cuối, không
 *     thoát ra phần tử nằm sau lưng lớp phủ.
 *  3. Esc đóng hộp thoại, và khi đóng (Esc hoặc nút Đóng) focus TRẢ LẠI đúng
 *     phần tử đã mở nó.
 *
 * Không quản `overflow` của `body` hay logic đóng/mở nào khác — mỗi component
 * gọi hook này giữ nguyên phần đó của mình, hook chỉ lo mỗi việc focus.
 */
import { useEffect, useRef, type RefObject } from "react";
import { useLopHopThoai } from "./lop-hop-thoai";

type PhimVao = Pick<KeyboardEvent, "key" | "preventDefault">;

/**
 * BB-398 vòng 2 — bộ xử lý phím của một hộp thoại: CHỈ khi hộp đang là lớp TRÊN CÙNG
 * (`lop-hop-thoai.ts`). Màn treo tường / album trên bàn mở đè lên cửa hàng thì Esc và
 * Tab thuộc về màn đó — cửa hàng bên dưới không đóng, không kéo focus về.
 */
export function taoXuLyPhimHopThoai<E extends PhimVao>(opts: {
  laTren: () => boolean;
  onDong: () => void;
  xuLyTab: (e: E) => void;
}): (e: E) => void {
  return (e) => {
    if (!opts.laTren()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      opts.onDong();
      return;
    }
    if (e.key === "Tab") opts.xuLyTab(e);
  };
}

const CHON_PHAN_TU_CO_THE_FOCUS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function layDanhSachFocusDuoc(goc: HTMLElement): HTMLElement[] {
  return Array.from(goc.querySelectorAll<HTMLElement>(CHON_PHAN_TU_CO_THE_FOCUS)).filter(
    (el) => el.offsetParent !== null, // bỏ phần tử đang ẩn (display:none / tấm con chưa mở)
  );
}

export function useBayFocusHopThoai(
  mo: boolean,
  onDong: () => void,
  hopRef: RefObject<HTMLElement | null>,
): void {
  const phanTuTruocKhiMoRef = useRef<HTMLElement | null>(null);
  const onDongRef = useRef(onDong);
  onDongRef.current = onDong;
  // Đăng ký TRƯỚC effect gắn phím bên dưới (cùng component → chạy theo thứ tự khai báo).
  const laTren = useLopHopThoai(mo);

  useEffect(() => {
    if (!mo) return;

    phanTuTruocKhiMoRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus phần tử đầu tiên trong hộp — không có thì focus chính khung hộp
    // (gán tabindex tạm để nhận focus, vẫn giữ trong luồng Tab bình thường).
    const hop = hopRef.current;
    if (hop) {
      const dauTien = layDanhSachFocusDuoc(hop)[0];
      if (dauTien) {
        dauTien.focus();
      } else {
        if (!hop.hasAttribute("tabindex")) hop.setAttribute("tabindex", "-1");
        hop.focus();
      }
    }

    const xuLyTab = (e: KeyboardEvent) => {
      const hienTai = hopRef.current;
      if (!hienTai) return;
      const phanTu = layDanhSachFocusDuoc(hienTai);
      if (phanTu.length === 0) {
        e.preventDefault();
        hienTai.focus();
        return;
      }
      const dau = phanTu[0]!;
      const cuoi = phanTu[phanTu.length - 1]!;
      const dangO = document.activeElement;
      if (e.shiftKey) {
        if (dangO === dau || !hienTai.contains(dangO)) {
          e.preventDefault();
          cuoi.focus();
        }
      } else if (dangO === cuoi || !hienTai.contains(dangO)) {
        e.preventDefault();
        dau.focus();
      }
    };
    const khiGoPhim = taoXuLyPhimHopThoai<KeyboardEvent>({
      laTren,
      onDong: () => onDongRef.current(),
      xuLyTab,
    });

    // Capture phase: chặn Tab thoát khỏi hộp trước khi trình duyệt tự tính
    // phần tử kế tiếp trong toàn trang.
    document.addEventListener("keydown", khiGoPhim, true);
    return () => {
      document.removeEventListener("keydown", khiGoPhim, true);
      const veLai = phanTuTruocKhiMoRef.current;
      if (veLai && document.contains(veLai)) veLai.focus();
    };
  }, [mo, hopRef, laTren]);
}
