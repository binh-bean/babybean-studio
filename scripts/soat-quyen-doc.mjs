/**
 * Đo THẬT vai trò nào đọc được bao nhiêu dòng ở bảng nào.
 *
 * OWNER: PM. Task BB-124.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải ĐO chứ không ĐỌC chính sách
 * ---------------------------------------------------------------------------
 * Chính sách PERMISSIVE cộng dồn với nhau bằng OR. Đọc một chính sách rồi kết
 * luận là sai, vì có thể còn chính sách thứ hai lỏng hơn ở ngay cạnh — đúng
 * chuyện đã xảy ra với `activity_logs`, nơi một migration "drop policy if
 * exists" gọi nhầm tên, chạy thành công và không xoá gì.
 *
 * Chạy script này ra ba phát hiện mà đọc chính sách không thấy:
 *   - `settings`: cả CHÍN vai trò đọc được hết, kể cả CTV thời vụ
 *   - `deliveries`, `shoots`, `activity_logs`: CTV đọc dữ liệu khách
 *   - `notifications`: con số 0 là do bảng rỗng, không phải do bị chặn
 *
 * ---------------------------------------------------------------------------
 * An toàn khi chạy
 * ---------------------------------------------------------------------------
 * Mỗi vai trò dựng một nhân viên giả trong một giao dịch rồi HUỶ giao dịch —
 * không để lại dòng nào. Nhưng nó vẫn là ghi tạm, nên chỉ chạy trên bb-dev.
 *
 * Mỗi bảng có savepoint riêng: một truy vấn lỗi làm hỏng cả giao dịch và mọi
 * truy vấn sau đó lỗi theo. Bản đầu của script này in "cấm" cho tám bảng liền
 * nhau — toàn số giả, và suýt thành một phát hiện tưởng tượng.
 *
 *   node --env-file-if-exists=.env.local scripts/soat-quyen-doc.mjs
 */

import { Client } from "pg";

const ROLES = ["owner", "admin", "branch_manager", "cs", "photographer",
               "retoucher", "accountant", "viewer", "photoshop_ctv"];

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Thiếu SUPABASE_DB_URL. Script này chỉ chạy trên bb-dev.");
  process.exit(1);
}

const c = new Client({ connectionString: url });
await c.connect();

const { rows: tbl } = await c.query(
  "select tablename from pg_tables where schemaname='public' order by tablename");
const TABLES = tbl.map((r) => r.tablename);

const { rows: br } = await c.query("select id from branches order by name limit 1");
if (br.length === 0) {
  console.error("Cần ít nhất một chi nhánh. Chạy npm run db:seed trước.");
  process.exit(1);
}
const branchId = br[0].id;

const tong = {};
for (const t of TABLES) {
  const { rows } = await c.query(`select count(*)::int n from ${t}`);
  tong[t] = rows[0].n;
}

const ketQua = {};
for (const role of ROLES) {
  await c.query("BEGIN");
  const { rows: u } = await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'soat.' || gen_random_uuid() || '@staff.babybeanstudio.vn',
             '', now(), now(), now())
     returning id`);
  const id = u[0].id;
  await c.query(
    `insert into staff_profiles (id, full_name, email, role, is_active)
     select $1, 'Nhân viên đo thử', email, $2::staff_role, true from auth.users where id = $1`,
    [id, role]);
  await c.query("insert into staff_branches (staff_id, branch_id) values ($1,$2)", [id, branchId]);

  await c.query("SET LOCAL ROLE authenticated");
  await c.query(`SET LOCAL request.jwt.claims = '{"sub":"${id}","role":"authenticated"}'`);

  ketQua[role] = {};
  for (const t of TABLES) {
    await c.query("SAVEPOINT s");
    try {
      const { rows } = await c.query(`select count(*)::int n from ${t}`);
      ketQua[role][t] = rows[0].n;
      await c.query("RELEASE SAVEPOINT s");
    } catch {
      ketQua[role][t] = -1;
      await c.query("ROLLBACK TO SAVEPOINT s");
    }
  }
  await c.query("ROLLBACK");
}

const w = Math.max(...TABLES.map((t) => t.length));
console.log("");
console.log("Số dòng mỗi vai trò ĐỌC được. HẾT = thấy toàn bộ bảng.");
console.log("Bảng rỗng cho số 0 — số 0 đó KHÔNG chứng minh là bị chặn.");
console.log("");
console.log("bảng".padEnd(w) + " tổng " + ROLES.map((r) => r.slice(0, 6).padStart(7)).join(""));
for (const t of TABLES) {
  const cells = ROLES.map((r) => {
    const n = ketQua[r][t];
    const s = n === -1 ? "cấm" : n === tong[t] && n > 0 ? "HẾT" : String(n);
    return s.padStart(7);
  });
  const canhBao = tong[t] === 0 ? "  (bảng rỗng)" : "";
  console.log(t.padEnd(w) + String(tong[t]).padStart(5) + " " + cells.join("") + canhBao);
}

await c.end();
