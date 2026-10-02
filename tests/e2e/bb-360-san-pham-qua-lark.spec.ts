/**
 * BB-360 — form "Xác nhận thanh toán" ở chi tiết bộ ảnh, cờ `thanh_toan.thu_san_pham_qua_app`
 * ở mặc định (tắt): bộ chỉ mua 2 × 20.000 ảnh in ở đợt 1, không vượt hạn mức →
 *   · dòng "Sản phẩm mua thêm: 40.000 ₫ · thu qua Lark" hiện trong form;
 *   · "Phải thu 0 ₫" và form KHOÁ ("Chưa phát sinh tiền cần thu", BB-344) — hết cảnh
 *     "Mua thêm 40.000 ₫" cạnh "Phải thu 0 ₫" mà không biết vì sao.
 *
 * Fixture "Fixture BB-360-…" (chi nhánh riêng), dọn theo id ở afterAll. Không ghi `settings`
 * (ca bật/tắt cờ ở tests/unit/bb-360-san-pham-qua-lark.test.ts). Không gọi Lark.
 * Kiểm ngược: bỏ `sanPhamQuaLark={…}` ở gallery-detail.tsx → không có dòng → ĐỎ.
 *
 * Chạy: PW_PORT=3243 npx playwright test tests/e2e/bb-360-san-pham-qua-lark.spec.ts --workers=1
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { donTheoChiNhanh } from "../fixtures/bb-344";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const THU_MUC = "test-results/bb-360";
fs.mkdirSync(THU_MUC, { recursive: true });
test.setTimeout(150_000);

const RUN = Math.random().toString(36).slice(2, 8);
const PASSWORD = "Password123!";
let pg: Client;
const id: Record<string, string> = {};
let email = "";

test.beforeAll(async () => {
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const co = await pg.query(`select value from settings where key = 'thanh_toan.thu_san_pham_qua_app' and branch_id is null`);
  test.skip(co.rowCount !== 0 && co.rows[0].value === true, "bb-dev đang BẬT thu sản phẩm qua app — ca này thử mặc định (tắt)");

  id.branch = (await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB360E-${RUN}`, `Fixture BB-360-${RUN} Chi nhánh`])).rows[0].id;
  id.customer = (await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [id.branch, `Fixture BB-360-${RUN} Khách`])).rows[0].id;
  id.product = (
    await pg.query(`insert into products (branch_id, name, kind) values ($1,$2,'print') returning id`, [id.branch, `Fixture BB-360-${RUN} Ảnh in`])
  ).rows[0].id;
  id.gallery = (
    await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price, photo_count)
       values ($1,$2,$3,'submitted',$4,'https://example.com/x',10,50000,0) returning id`,
      [id.branch, id.customer, `Fixture BB-360-${RUN} Chỉ sản phẩm`, `SEED_FOLDER_ID_360E_${RUN}`],
    )
  ).rows[0].id;
  const sl = (
    await pg.query(`insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb360e','owner') returning id`, [
      id.gallery,
      `fixture-bb360e-${RUN}`,
    ])
  ).rows[0].id;
  const sel = (
    await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,now() - interval '1 hour',0,0) returning id`,
      [id.gallery, sl],
    )
  ).rows[0].id;
  await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [sel, id.product]);

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  email = `fixture.bb360.owner.${RUN}@demo.babybean.vn`;
  const r = await supa.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản");
  id.staff = r.data.user.id;
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [id.staff, `Fixture BB-360-${RUN} Chủ`, email]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id.staff, id.branch]);
});

test.afterAll(async () => {
  if (!pg) return;
  // Sản phẩm trỏ tới chi nhánh → xoá TRƯỚC, không thì chi nhánh không xoá được.
  if (id.gallery) await pg.query(`delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)`, [id.gallery]);
  if (id.product) await pg.query(`delete from products where id = $1`, [id.product]);
  if (id.branch) await donTheoChiNhanh(pg, id.branch, id.staff ? [id.staff] : []);
  const { rows } = await pg.query(`select count(*)::int n from branches where code = $1`, [`FXBB360E-${RUN}`]);
  console.info("BB360_E2E_SAU_DON", rows[0].n);
  await pg.end();
  expect(rows[0].n).toBe(0);
});

test("Bộ chỉ mua sản phẩm: dòng 'thu qua Lark' 40.000 ₫, Phải thu 0 ₫, form khoá", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, email, PASSWORD);
  await page.goto(`/admin/galleries/${id.gallery}#thanh-toan`, { waitUntil: "domcontentloaded" });

  const khoi = page.getByTestId("khoi-thanh-toan-chi-tiet");
  await expect(khoi).toBeVisible({ timeout: 40_000 });
  const dong = khoi.getByTestId("dong-san-pham-qua-lark");
  await expect(dong).toBeVisible({ timeout: 20_000 });
  await expect(dong).toHaveText(/^Sản phẩm mua thêm: 40\.000\s?₫ · thu qua Lark$/);
  await expect(khoi).toContainText(/Phải thu 0\s?₫/);
  await expect(khoi.getByTestId("chua-phat-sinh-tien")).toHaveText("Chưa phát sinh tiền cần thu");
  await expect(khoi.getByRole("button", { name: "Ghi nhận đã thu" })).toBeDisabled();

  // Máy chủ cũng nói cùng số (một hàm `layTienCanThu`).
  const res = await page.request.get(`/api/admin/galleries/${id.gallery}/payments`);
  const data = (await res.json()).data;
  expect({ due: data.dueAmount, thu: data.amountToCollect, lark: data.sanPhamQuaLark }).toEqual({ due: 0, thu: 0, lark: 40000 });

  await khoi.screenshot({ path: path.join(THU_MUC, "chi-san-pham-thu-qua-lark.png") });
});
