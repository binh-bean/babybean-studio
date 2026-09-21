import { test, expect } from '@playwright/test';
import * as pg from 'pg';

test('Chụp màn hình Bảng điều khiển BB-060', async ({ browser }) => {
  test.setTimeout(120000);
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  const { rows } = await client.query(`
    select u.email from auth.users u
    join public.staff_profiles s on s.id = u.id
    where s.role in ('owner', 'admin', 'cs')
    limit 1
  `);
  await client.end();
  
  const email = rows[0].email;

  const runScreenshot = async (name: string, viewport: {width: number, height: number}) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', '123456');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin');
    await expect(page.locator('h1').filter({ hasText: 'Bảng điều khiển' })).toBeVisible({ timeout: 30000 });
    
    await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      rows.forEach(tr => {
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
