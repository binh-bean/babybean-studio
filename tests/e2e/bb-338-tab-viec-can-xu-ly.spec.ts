/**
 * BB-338 mục 4 — ảnh anh chụp iPhone 01/10/2026 ("sắp xếp thanh tiến trình trên
 * iphone") là HÀNG TAB của "Việc cần xử lý": các tab xuống dòng tự do, ô to ô
 * nhỏ, so le. Bản vá: điện thoại = lưới hai cột đều nhau.
 *
 * Kiểm ở 375×812 và 390×844: mọi tab cùng bề ngang, chỉ có HAI vị trí cột, không
 * tab nào tràn khỏi màn. Chụp RIÊNG hàng tab (không chụp nội dung có tên khách)
 * vào babybean-assets/BB-338/.
 *
 * Nhân viên thử: "Fixture BB-338 NV" (khuôn bb-327), dọn ở afterAll.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb338_${runId}@demo.babybean.vn`;
const password = "Password123!";

function thuMucAnh(): string {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    const thu = path.join(d, "babybean-assets");
    if (fs.existsSync(thu)) return path.join(thu, "BB-338");
    d = path.dirname(d);
  }
  return path.resolve(__dirname, "../../test-results/BB-338");
}
const THU_MUC_ANH = thuMucAnh();

test.describe("BB-338: hàng tab Việc cần xử lý trên iPhone", () => {
  let client: Client;
  let userId = "";
  const quanTri = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    fs.mkdirSync(THU_MUC_ANH, { recursive: true });
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query(
      "select id from branches where name not like 'Fixture%' order by name limit 1",
    );
    const { data, error } = await quanTri().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    await client.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userId,
      "Fixture BB-338 NV",
      email,
    ]);
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userId,
      br[0].id,
    ]);
  });

  test.afterAll(async () => {
    if (client) {
      if (userId) {
        await client.query("delete from activity_logs where actor_id = $1", [userId]).catch(() => {});
        await client.query("delete from staff_branches where staff_id = $1", [userId]);
        await client.query("delete from staff_profiles where id = $1", [userId]);
      }
      await client.end();
    }
    if (userId) await quanTri().auth.admin.deleteUser(userId);
  });

  test("hai cột đều nhau ở 375 và 390", async ({ page }) => {
    test.setTimeout(120_000);
    await dangNhapNhanVien(page, email, password);
    for (const kho of [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(kho);
      await page.goto("/admin/viec-can-xu-ly");
      const hang = page.getByRole("tablist").first();
      await expect(hang).toBeVisible({ timeout: 30_000 });
      const tabs = hang.getByRole("tab");
      const n = await tabs.count();
      expect(n).toBeGreaterThanOrEqual(2);
      const xs = new Set<number>();
      const rong = new Set<number>();
      for (let i = 0; i < n; i++) {
        const h = (await tabs.nth(i).boundingBox())!;
        xs.add(Math.round(h.x));
        rong.add(Math.round(h.width));
        expect(h.x + h.width, `tab ${i + 1} tràn màn ${kho.width}`).toBeLessThanOrEqual(kho.width);
      }
      expect(xs.size, "chỉ có hai cột").toBe(2);
      expect(rong.size, "mọi tab cùng bề ngang").toBe(1);
      await hang.screenshot({ path: `${THU_MUC_ANH}/4-tab-viec-can-xu-ly-${kho.width}.png` });
    }
  });
});
