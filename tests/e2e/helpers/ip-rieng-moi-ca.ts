/**
 * Mỗi ca thử mở link album từ MỘT ĐỊA CHỈ IP RIÊNG.
 *
 * OWNER: QA-BOT. Task BB-160.
 *
 * `POST /api/auth/gallery` chỉ cho 10 lần mở link trên một IP trong 15 phút
 * (docs/05-rbac.md §5). Trình duyệt thử chạy ngay trên máy, nên mọi ca đều đi
 * từ `::1`: cả bộ e2e ăn CHUNG một túi 10 lượt, và túi đó còn tính 15 phút sau
 * khi chạy xong.
 *
 * Đã xảy ra thật 16.09.2026: ca 1 của BB-160 xanh, ca 2 và ca 3 đỏ vì 429 —
 * màn khách hiện "Không tìm thấy bộ ảnh / Bạn thao tác quá nhanh", nên thanh
 * "Tải cả bộ" và thẻ ảnh không bao giờ hiện. Chạy lại trong vòng 15 phút thì
 * đỏ ngay từ ca 1. Cả bộ chỉ đang xanh nhờ vừa vặn 8 lượt dưới 10.
 *
 * KHÔNG nới hạn mức, cũng không xoá bảng nhật ký: hạn mức đó chặn người dò mã
 * link của khách thật, còn nhật ký là vết kiểm toán của người khác. Thay vào
 * đó mỗi ca đi từ một IP riêng — đúng như thật, mỗi ba mẹ một máy một mạng.
 *
 * Dải ngẫu nhiên mỗi lần chạy nên hai lần chạy liền nhau không giẫm lên nhau,
 * cùng cách `tests/security/gallery-auth.test.ts` đã chốt ở BB-136.
 */

import { test as goc, expect } from "@playwright/test";

const daiIp = `10.${((process.pid ?? 1) % 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
let dem = 0;

export const test = goc.extend({
  // Ghi đè tuỳ chọn `extraHTTPHeaders` bằng một fixture, không dùng
  // `browser.newContext()` tự tạo: làm thế là mất sạch tuỳ chọn trong
  // playwright.config.ts, kể cả baseURL, và mọi `page.goto("/g/...")` sẽ hỏng.
  //
  // Tham số thứ hai của fixture tên `dung` chứ không phải `use`: eslint
  // react-hooks nhìn `use(...)` là hook React gọi sai chỗ và báo lỗi. Playwright
  // truyền theo vị trí, không theo tên.
  extraHTTPHeaders: async ({ extraHTTPHeaders }, dung) => {
    dem += 1;
    await dung({ ...extraHTTPHeaders, "x-forwarded-for": `${daiIp}.${dem}` });
  },
});

export { expect };
