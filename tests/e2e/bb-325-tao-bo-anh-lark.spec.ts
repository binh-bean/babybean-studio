/**
 * BB-325 — tạo bộ ảnh neo vào Lark + "tên hiển thị" (tên mẹ làm tiêu đề quản trị).
 *
 *  1. Dán link Drive của thư mục ĐÃ có bộ ảnh → thuật sĩ nói rõ BỘ NÀO và có
 *     link mở bộ đó (trước: chặn bằng một câu không giải thích, ở bước cuối).
 *  2. Bước Thông tin: không còn ô gõ tay tên/SĐT/gói; tra Lark (giả lập route
 *     tra-lark — e2e không đọc Lark thật) → điền sẵn thông tin; bước Luật chọn
 *     giá ảnh thêm mặc định "50.000" (có dấu chấm ngăn nghìn), không phải 40.000.
 *  3. Danh sách + chi tiết: tiêu đề là TÊN MẸ; dòng thông tin có tên bé và mã
 *     hóa đơn; bộ chưa gắn dòng Lark hiện khối "Gắn dòng Hậu Kỳ".
 *
 * Dữ liệu: "Fixture BB-325 …" dữ liệu giả, dọn theo id ở afterAll.
 * Chạy: `PW_PORT=3190 npx playwright test tests/e2e/bb-325-tao-bo-anh-lark.spec.ts --workers=1`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-325 ${runId}`;
const TEN_ME = `${NHAN} Mẹ Mai`;
const MA_HD = `HD_FIXTURE325#${runId}`;
const THU_MUC = `FIXTUREBB325${runId}folder`;
const emailOwner = `test_bb325_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";
const soGia = () => `0907${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-325", () => {
  let pg: Client;
  let branchId = "";
  let ownerId = "";
  let custId = "";
  let babyId = "";
  let galId = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query("select id from branches where name not like 'Fixture%' order by name limit 1");
    branchId = br[0].id;

    const ownerRes = await suKienAdmin().auth.admin.createUser({ email: emailOwner, password, email_confirm: true });
    if (ownerRes.error) throw ownerRes.error;
    ownerId = ownerRes.data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      ownerId,
      `${NHAN} Owner`,
      emailOwner,
    ]);

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, TEN_ME, soGia()],
    );
    custId = kh[0].id;
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [custId, `${NHAN} Bé`, "Na"],
    );
    babyId = be[0].id;
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id, drive_folder_url,
                              lark_contract_code, lark_contract_codes)
       values ($1,$2,$3,$4,'draft',$5,$6,$7,array[$7]) returning id`,
      [branchId, custId, babyId, MA_HD, THU_MUC, `https://drive.google.com/drive/folders/${THU_MUC}`, MA_HD],
    );
    galId = g[0].id;
  });

  test.afterAll(async () => {
    if (galId) {
      await pg.query("delete from activity_logs where gallery_id = $1", [galId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galId]).catch(() => {});
      await pg.query("delete from galleries where id = $1", [galId]);
    }
    if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    if (custId) await pg.query("delete from customers where id = $1", [custId]).catch(() => {});
    if (ownerId) await pg.query("delete from staff_profiles where id = $1", [ownerId]).catch(() => {});
    await pg.end();
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("1. thư mục đã có bộ ảnh → nói rõ bộ nào, có link mở", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    // Chờ thuật sĩ đã hydrate (nó tự gọi /options trong useEffect) rồi mới gõ —
    // gõ trước lúc hydrate thì React không nhận giá trị, nút vẫn khoá.
    const daHydrate = page.waitForResponse((r) => r.url().includes("/api/admin/galleries/options"));
    await page.goto("/admin/galleries/create", { waitUntil: "domcontentloaded" });
    await daHydrate;
    await page.getByPlaceholder("https://drive.google.com/drive/folders/…").fill(
      `https://drive.google.com/drive/folders/${THU_MUC}`,
    );
    await page.getByRole("button", { name: "Kiểm tra thư mục" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "đã được gắn" });
    await expect(alert).toContainText("đã được gắn với bộ ảnh");
    await expect(alert).toContainText(TEN_ME);
    const moBo = alert.getByRole("link", { name: /Mở bộ ảnh/ });
    await expect(moBo).toHaveAttribute("href", `/admin/galleries/${galId}`);
  });

  test("2. bước Thông tin lấy từ Lark; giá ảnh thêm mặc định 50.000", async ({ page }) => {
    await page.route("**/api/admin/galleries/preview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { folderId: "x", folderName: "Thư mục giả", fileCount: 3, subfolders: [], sample: [] },
        }),
      }),
    );
    await page.route("**/api/admin/galleries/tra-lark", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            dong: [
              {
                recordId: "recFIXTURE325",
                maHoaDon: "HD_20260901#01",
                tenMe: "Nguyễn Thị Mai",
                soDienThoai: "0901000001",
                tenBe: "Bé Na",
                goiChup: "Baby 02",
                ngayChup: "2026-09-01",
                tongFileEdit: 15,
                trangThai: "",
                linkLark: "https://lark.example/base/x?record=recFIXTURE325",
                boAnhDaCo: null,
              },
            ],
          },
        }),
      }),
    );
    await dangNhapNhanVien(page, emailOwner, password);
    // Chờ thuật sĩ đã hydrate (nó tự gọi /options trong useEffect) rồi mới gõ —
    // gõ trước lúc hydrate thì React không nhận giá trị, nút vẫn khoá.
    const daHydrate = page.waitForResponse((r) => r.url().includes("/api/admin/galleries/options"));
    await page.goto("/admin/galleries/create", { waitUntil: "domcontentloaded" });
    await daHydrate;
    await page.getByPlaceholder("https://drive.google.com/drive/folders/…").fill(
      "https://drive.google.com/drive/folders/FIXTUREBB325khacfolder",
    );
    await page.getByRole("button", { name: "Kiểm tra thư mục" }).click();
    await expect(page.getByText("Thư mục giả")).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    // Không còn ô gõ tay tên khách / gói chụp.
    await expect(page.getByPlaceholder("Nguyễn Thị Mai")).toHaveCount(0);
    const tiepTuc = page.getByRole("button", { name: "Tiếp tục" });
    await expect(tiepTuc).toBeDisabled();

    const chon = page.locator("select").first();
    await chon.selectOption({ index: 1 });
    await page.locator('input[name="maHoaDon"]').fill("HD_20260901#01");
    await page.locator('input[name="soDienThoai"]').fill("0901000001");
    await page.getByRole("button", { name: "Tra Lark" }).click();

    await expect(page.getByText("Thông tin từ Lark")).toBeVisible();
    await expect(page.getByText("Nguyễn Thị Mai")).toBeVisible();
    await expect(page.getByText("Baby 02")).toBeVisible();
    await expect(page.getByRole("link", { name: /Mở dòng trên Lark/ })).toHaveAttribute(
      "href",
      "https://lark.example/base/x?record=recFIXTURE325",
    );
    await expect(tiepTuc).toBeEnabled();
    await tiepTuc.click();

    await expect(page.locator('input[name="giaAnhThem"]')).toHaveValue("50.000");
    await page.locator('input[name="giaAnhThem"]').fill("65000");
    await expect(page.locator('input[name="giaAnhThem"]')).toHaveValue("65.000");
  });

  test("3. danh sách + chi tiết: tiêu đề là TÊN MẸ, dòng thông tin có tên bé + mã hóa đơn", async ({ page }) => {
    await dangNhapNhanVien(page, emailOwner, password);
    await page.goto("/admin/galleries", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Tìm theo/).first().fill(TEN_ME);
    const hang = page.getByRole("link", { name: TEN_ME, exact: true }).first();
    await expect(hang).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(new RegExp(`Bé Na · .*${MA_HD.replace(/[#]/g, "\\#")}`)).first()).toBeVisible();

    await page.goto(`/admin/galleries/${galId}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 });
    await expect(page.locator("h1").first()).toHaveText(TEN_ME);
    await expect(page.getByTestId("gan-dong-lark")).toBeVisible();
  });
});
