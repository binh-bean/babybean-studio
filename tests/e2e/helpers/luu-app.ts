/**
 * BB-378 — lời mời "lưu app ra màn hình chính" nay hiện ĐÚNG LÚC (lần mở thứ 2 /
 * đã có tim / đã xem-chọn vài tấm — `src/lib/utils/luu-app-dung-luc.ts`), không
 * còn hiện ngay ở lượt mở đầu tiên của một trình duyệt mới.
 *
 * Phép thử nào cần lời mời có mặt để đo việc KHÁC (vị trí, chữ, tấm hướng dẫn)
 * gọi hàm này trước `page.goto`: máy này "đã từng mở một lần" — phiên của ca thử
 * là lần mở thứ 2, đúng cảnh ba mẹ quay lại xem ảnh. Chỉ đặt khi chưa có, để tải
 * lại trang trong cùng ca không đặt lại bộ đếm.
 */
import type { Page } from "@playwright/test";

export async function daMoLanTruoc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      if (!window.localStorage.getItem("bb_luu_app_so_lan_mo")) window.localStorage.setItem("bb_luu_app_so_lan_mo", "1");
    } catch {
      // Bộ nhớ bị chặn: lời mời rơi về luật tín hiệu trong phiên, ca thử tự báo.
    }
  });
}
