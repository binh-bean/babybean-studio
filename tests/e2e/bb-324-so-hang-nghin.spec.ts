/**
 * BB-324 mục 2 — mọi số ≥ 1.000 và mọi số tiền có dấu chấm hàng nghìn.
 *
 * Bảng điều khiển và Báo cáo cố tình LOẠI mọi bộ ảnh "Fixture…" khỏi số liệu
 * (`locBoAnhThat`, BB-260/270) — fixture không thể tự hiện lên hai màn đó. Nên:
 *   - Bảng điều khiển + Báo cáo: lấy PHẢN HỒI THẬT của API rồi thay một con số
 *     bằng số lớn (chặn ở biên mạng, không giả lập gì trong app) — kiểm màn
 *     hiển thị "1.234", "12.500.000", trục biểu đồ "1.000".
 *   - Chi tiết bộ ảnh: bộ fixture thật trong DB với photo_count = 1234 — đi
 *     trọn đường DB → API → màn, phải thấy "1.234".
 *
 * Fixture "Fixture BB-324-…", xoá theo id ở afterAll.
 * Chạy: `PW_PORT=3186 npx playwright test tests/e2e/bb-324-so-hang-nghin.spec.ts --workers=1`.
 */

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-324-${runId}`;
const email = `test_bb324_${runId}@demo.babybean.vn`;
const password = `Bb324-${runId}-Aa1!`;

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/** Lấy phản hồi thật của API, cho `sua` đổi JSON, trả lại cho trang. */
async function suaPhanHoi(page: Page, mau: string, sua: (json: { data: Record<string, unknown> }) => void) {
  await page.route(mau, async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (res.ok() && json?.data) sua(json);
    await route.fulfill({ response: res, json });
  });
}

test.describe("BB-324: dấu chấm hàng nghìn trên màn quản trị", () => {
  let client: Client;
  let userId = "";
  let khach = "";
  let bo = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const branchId = br[0].id;

    const { data, error } = await suKienAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`,
      [userId, `${NHAN} NV`, email],
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId],
    );

    const { rows: k } = await client.query(
      "insert into customers (branch_id, full_name) values ($1,$2) returning id",
      [branchId, `${NHAN} Khách`],
    );
    khach = k[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1234) returning id`,
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb324-so-${runId}`],
    );
    bo = g[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (bo) await client.query("delete from galleries where id = $1", [bo]);
      if (khach) await client.query("delete from customers where id = $1", [khach]);
      if (userId) await client.query("delete from staff_branches where staff_id = $1", [userId]);
      if (userId) await client.query("delete from staff_profiles where id = $1", [userId]);
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  test("Bảng điều khiển: thẻ số 1.234 và tiền mua thêm 12.500.000 ₫", async ({ page }) => {
    await suaPhanHoi(page, "**/api/admin/dashboard?*", (json) => {
      const d = json.data as {
        stats: Record<string, number>;
        muaThem7Ngay: Record<string, unknown>;
      };
      d.stats.waitingForSelection = 1234;
      d.muaThem7Ngay = {
        ...d.muaThem7Ngay,
        tongTien: 12_500_000,
        soDon: 3,
        soGiaDinh: 2,
        chenhLechPhanTram: null,
        theoNgay: [],
        coCau: [],
      };
    });
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin");

    const the = page.getByTestId("the-so-bang-dieu-khien").filter({ hasText: "Chờ khách chọn" });
    await expect(the).toContainText("1.234", { timeout: 20_000 });
    await expect(the).not.toContainText("1234");
    await expect(page.getByText(/^12\.500\.000\s*₫$/).first()).toBeVisible();
    await page.screenshot({ path: "test-results/bb-324/bang-dieu-khien.png", fullPage: true });
  });

  test("Báo cáo: thẻ số, ô bảng và trục biểu đồ có dấu chấm", async ({ page }) => {
    await suaPhanHoi(page, "**/api/admin/bao-cao/tien-do-chon-anh?*", (json) => {
      const kq = (json.data as { ketQua: Record<string, unknown> }).ketQua as {
        theSo: { giaTri: number | string }[];
        bang?: { cot: string[]; dong: (string | number | null)[][] };
        bieuDo?: { loai: string; nhan: string[]; chuoi: { ten: string; giaTri: number[] }[] };
      };
      kq.theSo[0]!.giaTri = 1234;
      kq.bang = { cot: ["Chi nhánh", "Đã gửi link"], dong: [["Chi nhánh thử", 2500]] };
      kq.bieuDo = {
        loai: "cot",
        nhan: ["23/09", "24/09", "25/09", "26/09", "27/09", "28/09", "29/09"],
        chuoi: [{ ten: "Bộ chốt", giaTri: [1500, 3200, 800, 2100, 0, 2700, 1200] }],
      };
    });
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/bao-cao?ma=tien-do-chon-anh");

    await expect(page.getByTestId("the-so-bao-cao").first()).toContainText("1.234", { timeout: 20_000 });
    await expect(page.locator("table td", { hasText: "2.500" })).toBeVisible();
    // Trục Y: mốc 0, 1.000, 2.000, 3.000, 4.000 — không còn "1000".
    const trucY = await page.locator("svg[aria-label='Biểu đồ báo cáo'] > g > text").allTextContents();
    expect(trucY).toContain("1.000");
    expect(trucY).not.toContain("1000");
    await page.screenshot({ path: "test-results/bb-324/bao-cao.png", fullPage: true });
    await page.locator("svg[aria-label='Biểu đồ báo cáo']").screenshot({ path: "test-results/bb-324/bao-cao-bieu-do.png" });
    await page.locator("table").first().screenshot({ path: "test-results/bb-324/bao-cao-bang.png" });
  });

  test("Chi tiết bộ ảnh (fixture thật, 1234 ảnh): 'Ảnh trong bộ' là 1.234", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    await page.goto(`/admin/galleries/${bo}`);
    const the = page.getByTestId("the-so-lieu").filter({ hasText: "Ảnh trong bộ" });
    await expect(the).toContainText("1.234", { timeout: 20_000 });
    await expect(the).not.toContainText("1234");
  });
});
