#!/usr/bin/env node
/**
 * link-staff — nối một tài khoản đăng nhập đã tạo trong Supabase với hồ sơ
 * nhân sự, để nó dùng được ứng dụng.
 *
 * OWNER: PM. Dùng để mở tài khoản đầu tiên.
 *
 * Vì sao cần: tài khoản đăng nhập nằm ở Supabase Auth, còn vai trò và chi
 * nhánh nằm ở bảng staff_profiles của mình. Có cái đầu mà thiếu cái sau thì
 * đăng nhập được nhưng requireStaff() vẫn từ chối — vào rồi mà không làm gì
 * được, và thông báo lỗi không nói cho bạn biết vì sao.
 *
 * Sau khi có tài khoản chủ studio đầu tiên, mọi tài khoản sau cấp thẳng trong
 * màn hình /admin/staff, không cần script này nữa.
 *
 * Script KHÔNG đụng tới mật khẩu. Bạn đặt mật khẩu trong bảng điều khiển
 * Supabase; ở đây chỉ gắn vai trò và chi nhánh.
 *
 * Cách dùng:
 *   npm run staff:link -- chu@babybeanstudio.vn "Nguyễn Văn A" owner
 */

import pg from "pg";

const [email, fullName, role = "owner"] = process.argv.slice(2);

const VALID_ROLES = [
  "owner", "admin", "branch_manager", "cs",
  "photographer", "retoucher", "accountant", "viewer",
];

if (!email || !fullName) {
  console.error("Thiếu tham số.\n");
  console.error('  npm run staff:link -- <email> "<Họ tên>" [vai trò]\n');
  console.error(`Vai trò hợp lệ: ${VALID_ROLES.join(", ")}`);
  process.exit(2);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`Vai trò "${role}" không hợp lệ. Chọn một trong: ${VALID_ROLES.join(", ")}`);
  process.exit(2);
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Thiếu SUPABASE_DB_URL. Kiểm tra .env.local.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const { rows: users } = await client.query(
    "select id, email, email_confirmed_at from auth.users where lower(email) = lower($1)",
    [email],
  );

  if (users.length === 0) {
    console.error(`\nKhông tìm thấy tài khoản đăng nhập nào có email ${email}.\n`);
    console.error("Tạo nó trước trong Supabase:");
    console.error("  Authentication → Users → Add user → Create new user");
    console.error("  Nhớ bật 'Auto Confirm User'.\n");
    process.exit(1);
  }

  const user = users[0];

  if (!user.email_confirmed_at) {
    console.warn(`\nCảnh báo: tài khoản chưa được xác nhận (Auto Confirm User chưa bật).`);
    console.warn("Đăng nhập có thể bị từ chối. Vào Supabase bật xác nhận cho tài khoản này.\n");
  }

  const { rows: existing } = await client.query(
    "select id, role, is_active from staff_profiles where id = $1",
    [user.id],
  );

  if (existing.length > 0) {
    await client.query(
      "update staff_profiles set full_name = $2, role = $3, is_active = true, updated_at = now() where id = $1",
      [user.id, fullName, role],
    );
    console.info(`\nĐã cập nhật hồ sơ sẵn có: ${fullName} — vai trò ${role}, đang hoạt động.`);
  } else {
    await client.query(
      "insert into staff_profiles (id, full_name, email, role, is_active) values ($1, $2, $3, $4, true)",
      [user.id, fullName, user.email, role],
    );
    console.info(`\nĐã tạo hồ sơ nhân sự: ${fullName} — vai trò ${role}.`);
  }

  // owner và admin thấy mọi chi nhánh nên không cần gán; các vai khác thì gán
  // hết cho đủ dùng, chủ studio chỉnh lại sau trong /admin/staff.
  if (role !== "owner" && role !== "admin") {
    const { rows: branches } = await client.query("select id, name from branches");
    for (const b of branches) {
      await client.query(
        "insert into staff_branches (staff_id, branch_id) values ($1, $2) on conflict do nothing",
        [user.id, b.id],
      );
    }
    console.info(`Đã gán ${branches.length} chi nhánh. Chỉnh lại trong /admin/staff nếu cần.`);
  }

  console.info(`\nXong. Đăng nhập bằng: ${user.email}\n`);
} catch (err) {
  console.error("link-staff lỗi:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
