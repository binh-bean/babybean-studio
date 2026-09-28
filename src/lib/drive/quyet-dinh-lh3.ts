/**
 * BB-314 — quyết định THUẦN cho câu hỏi "điều hướng 302 sang lh3, hay đi tiếp
 * qua proxy (hàm Vercel)" trong `src/app/api/img/[photoId]/route.ts`.
 *
 * OWNER: DEV-INT (cùng chủ `src/app/api/img/**`).
 *
 * Tách khỏi tệp route: Next.js CHỈ cho một `route.ts` export các tên hàm xử
 * lý (GET/POST/…) và vài export cấu hình đã biết (`runtime`, `maxDuration`…)
 * — `next build` (không phải `tsc --noEmit` trần) sinh kiểu kiểm tra riêng
 * cho việc này và CHẶN mọi export khác. Đặt hàm thuần ở đây vừa qua được cổng
 * đó, vừa cho phép thử đơn vị canh đúng LOGIC này mà không cần cơ sở dữ liệu,
 * phiên đăng nhập hay mạng thật.
 *
 * Hàm này KHÔNG quyết định quyền xem — quyền đã xét XONG ở một khối khác
 * (staff/gallery-session, trong `GET` của route.ts) TRƯỚC KHI route gọi tới
 * hàm này. Đừng gọi hàm này thay cho khối xét quyền đó.
 *
 * width<=800 (lưới/thu nhỏ): điều hướng, TRỪ hai trường hợp:
 *   - `taiVe` (?tai=1): tải bản GỐC (=s0), không phải bản thu nhỏ theo `width`.
 *   - `quaProxy` (?qua=1): trình duyệt đã thử lh3 một lần và lỗi (xem
 *     `luoi-anh.tsx`/`photo-lightbox.tsx` — onError), quay lại đường proxy.
 * width>=1600 (bìa, BB-311): không bao giờ điều hướng — còn cần đọc/ghi bộ
 * nhớ đệm Storage (khối `laAnhBia` trong `GET`).
 */
export function nenDieuHuongLh3(width: number, taiVe: boolean, quaProxy: boolean): boolean {
  return width <= 800 && !taiVe && !quaProxy;
}
