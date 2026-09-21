import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_screenshot_${runId}@demo.babybean.vn`;
const password = "Password123!";
const hoTen = `Test Screenshot ${runId}`;
let userId = "";

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function capture() {
  const admin = adminAuth();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pgClient.connect();
  
  // Lấy 1 chi nhánh
  const { rows: br } = await pgClient.query("select id from branches limit 1");
  const branchId = br[0].id;
  
  await pgClient.query(
    `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
    [userId, hoTen, email],
  );
  await pgClient.query(
    `insert into staff_branches (staff_id, branch_id) values ($1,$2)`,
    [userId, branchId],
  );

  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Login
  await page.goto("http://localhost:3000/login");
  await page.fill('input[placeholder="linh.q1"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin/galleries");
  
  // Tạo action giả thay vì UI vì đổi chi nhánh UI phức tạp? 
  // "làm một thao tác thật (đổi chi nhánh một tài khoản thử) và chụp dòng nhật ký vừa sinh ra. Che tên và email thật."
  // Đổi chi nhánh từ API luôn, để có log.
  
  const { data: dummyData, error: dummyErr } = await admin.auth.admin.createUser({
    email: 'dummy@demo.babybean.vn',
    password: 'Password123!',
    email_confirm: true,
  });
  if (dummyErr) throw dummyErr;
  const dummyStaffId = dummyData.user.id;
  
  await pgClient.query(`
    insert into staff_profiles (id, full_name, email, role) values ($1, 'Dummy Khách Thử', 'dummy@demo.babybean.vn', 'cs')
    on conflict do nothing
  `, [dummyStaffId]);
  
  // Hit API to change branch
  const cookie = await page.context().cookies();
  const cookieStr = cookie.map(c => `${c.name}=${c.value}`).join('; ');
  
  const res = await fetch(`http://localhost:3000/api/admin/staff/${dummyStaffId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieStr
    },
    body: JSON.stringify({ role: 'cs', branchIds: [branchId] })
  });
  console.log("Change branch API status:", res.status);
  
  // Now go to /admin/reports/nhat-ky
  await page.goto("http://localhost:3000/admin/reports/nhat-ky");
  // wait for table to load
  await page.waitForSelector("table tbody tr");
  
  await page.screenshot({ path: "nhat-ky-1.png", fullPage: true });

  await admin.auth.admin.deleteUser(userId);
  await admin.auth.admin.deleteUser(dummyStaffId);
  
  await pgClient.query(`delete from staff_branches where staff_id = $1`, [userId]);
  await pgClient.query(`delete from staff_profiles where id = $1`, [userId]);
  await pgClient.query(`delete from staff_profiles where id = $1`, [dummyStaffId]);
  
  await pgClient.end();
  await browser.close();
}

capture().catch(console.error);
