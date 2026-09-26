/**
 * BB-060 — chụp màn hình Bảng điều khiển ở ba cỡ máy.
 *
 * ---------------------------------------------------------------------------
 * Sửa lại 24/09/2026 (BB-214e) — phép thử lỗi thời, không phải lỗi mã
 * ---------------------------------------------------------------------------
 * Hai chỗ hỏng, cả hai đều ở PHÉP THỬ, đối chiếu với error-context.md:
 *
 *   1. `page.fill('input[name="email"]', ...)` — form đăng nhập hiện tại
 *      (`src/app/(auth)/login/page.tsx`) không còn input nào mang `name`:
 *      cả hai ô là component <Input> điều khiển bằng React state thuần, không
 *      `name="email"` / `name="password"`. Selector này không bao giờ khớp
 *      → timeout 120s đúng như đã thấy. `tests/e2e/bb-186-link-sap-het-han.spec.ts`
 *      (đang xanh) đăng nhập bằng `input[type="text"], input:not([type="password"])`
 *      — sửa theo đúng cách đó.
 *
 *   2. Query bất kỳ nhân viên owner/admin/cs THẬT trong bb-dev rồi đăng nhập
 *      bằng mật khẩu đoán cứng `'123456'`. bb-dev là dữ liệu thật (AGENTS.md
 *      §6) — nhân viên thật không mang mật khẩu đó, và phép thử không được
 *      phép tạo phụ thuộc vào một tài khoản mình không kiểm soát được mật
 *      khẩu. Đổi sang dựng một tài khoản Fixture BB-060 tạm thời trong
 *      `beforeAll`/`afterAll`, đúng khuôn `bb-186-link-sap-het-han.spec.ts`
 *      đang dùng.
 *
 * Ý phép thử giữ nguyên: đăng nhập, vào Bảng điều khiển, che tên khách/bé
 * thật bằng dữ liệu giả ngay trên DOM trước khi chụp, lưu ba ảnh theo cỡ máy.
 */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { dangNhapNhanVien } from './helpers/dang-nhap-thu-lai';

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb060_${runId}@demo.babybean.vn`;
const password = 'Password123!';
let userId = '';

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe('BB-060: chụp màn hình Bảng điều khiển', () => {
  let pg: Client;

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, `Test BB060 ${runId}`, email],
    );
  });

  test.afterAll(async () => {
    if (userId) {
      await pg.query('delete from staff_profiles where id = $1', [userId]);
      await adminAuth().auth.admin.deleteUser(userId);
    }
    await pg.end();
  });

  test('Chụp màn hình Bảng điều khiển BB-060', async ({ browser }) => {
    test.setTimeout(120000);

    const runScreenshot = async (name: string, viewport: { width: number; height: number }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();

      // Đăng nhập xong rơi thẳng vào /admin/galleries, không phải /admin —
      // xem chú thích trong src/app/(auth)/login/page.tsx ("Về thẳng Quản lý
      // bộ ảnh, KHÔNG về /admin ... Đổi lại thành /admin khi BB-060 làm xong
      // Bảng điều khiển"). Đích đăng nhập là quyết định sản phẩm, phép thử
      // này không đổi nó — chỉ xác nhận đăng nhập thành công rồi TỰ điều
      // hướng sang đúng màn cần chụp.
      await dangNhapNhanVien(page, email, password, { sauKhiVao: '**/admin/galleries' });
      await page.goto('/admin');

      // `toBeAttached`, không `toBeVisible`: cái h1 này mang `hidden lg:block`
      // — cố ý ẩn dưới màn hình rộng (tên màn hiện qua breadcrumb/topbar
      // riêng ở đó, xem admin-breadcrumb.tsx). Kiểm hiện diện trong DOM là đủ
      // để biết đã tới đúng trang, không phụ thuộc luật CSS theo từng cỡ máy
      // mà cả ba lượt chụp (desktop/tablet/mobile) đều phải chạy qua.
      await expect(page.locator('h1').filter({ hasText: 'Bảng điều khiển' })).toBeAttached({
        timeout: 30000,
      });

      await page.evaluate(() => {
        const rows = document.querySelectorAll('tbody tr');
        rows.forEach((tr) => {
          const titleCell = tr.querySelector('td:nth-child(1) .font-medium');
          if (titleCell) titleCell.textContent = 'Bé Nguyễn Văn A';
          const nameCell = tr.querySelector('td:nth-child(2)');
          if (nameCell) nameCell.textContent = 'Nguyễn Thị B';
        });
      });

      await page.waitForTimeout(1000);
      // Lưu vào thư mục public để dễ truy cập
      await page.screenshot({ path: `public/screenshots/dashboard-${name}.png`, fullPage: true });
      await context.close();
    };

    await runScreenshot('desktop', { width: 1280, height: 800 });
    await runScreenshot('tablet', { width: 768, height: 1024 });
    await runScreenshot('mobile', { width: 375, height: 667 });
  });
});
