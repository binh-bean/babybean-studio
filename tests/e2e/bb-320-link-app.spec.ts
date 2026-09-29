/**
 * BB-320 (Link app) — link phải LUÔN hiện ở thẻ "Link app" của chi tiết bộ ảnh,
 * kèm nút "Chép link"; và nút chép ở danh sách chỉ bấm được khi bộ có link.
 *
 * Ba ca, dữ liệu Fixture, KHÔNG chạm Lark thật (PHEP_THU_TRINH_DUYET=1 chặn ghi
 * Lark; bộ Fixture cũng không có dòng Hậu Kỳ để ghi):
 *   1. Trọn luồng: bộ chưa có link → menu ⋯ "Tạo link app" → link hiện kèm nút
 *      "Chép link" → bấm chép, clipboard đúng địa chỉ → TẢI LẠI trang → link vẫn
 *      hiện đúng cùng địa chỉ (đây là điều chủ dự án hỏi "đã nhắc 2 lần").
 *   2. Link cũ không khôi phục được (không có dòng share_link_ma): hiện MỘT câu
 *      ngắn + nút "Tạo link mới" ngay trong thẻ, không để trống.
 *   3. Danh sách: bộ có link → nút "Sao chép link app" bấm được và chép đúng /g/<mã>;
 *      bộ chưa có link → nút mờ, có chú thích.
 *
 * Chạy riêng: PW_PORT=3180 npx playwright test tests/e2e/bb-320-link-app.spec.ts --workers=1
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { maHoaMaLink } from "../../src/lib/auth/ma-link-loi";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb320_${runId}@demo.babybean.vn`;
const password = "Password123!";
const NHAN = `Fixture BB-320 link ${runId}`;
const bam = (s: string) => createHash("sha256").update(s).digest("hex");

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("BB-320: Link app luôn hiện, chép được, tải lại vẫn còn", () => {
  let pg: Client;
  let userId = "";
  const khachIds: string[] = [];
  let branchId = "";
  const boAnh: Record<"moi" | "cu" | "coLink" | "khongLink", string> = { moi: "", cu: "", coLink: "", khongLink: "" };
  let maCoLink = "";
  const tenKhach = (k: string) => `${NHAN} ${k}`;

  async function taoBo(khoa: keyof typeof boAnh, tenKh: string) {
    const { rows: cu } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, tenKh, `09013${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`],
    );
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3,15) returning id`,
      [branchId, cu[0].id, `${NHAN} ${khoa}`, `fx-bb320-${khoa}-${Date.now()}`],
    );
    boAnh[khoa] = g[0].id;
    khachIds.push(cu[0].id);
    return { customerId: cu[0].id as string, galleryId: g[0].id as string };
  }

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      userId,
      `Test BB320 ${runId}`,
      email,
    ]);
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    // "moi": chưa có link. "cu": có link nhưng KHÔNG có share_link_ma (tạo trước BB-201).
    // "coLink": có link + bản mã. "khongLink": danh sách — nút chép phải mờ.
    for (const [khoa, ten] of [
      ["moi", tenKhach("moi")],
      ["cu", tenKhach("cu")],
      ["coLink", tenKhach("colink")],
      ["khongLink", tenKhach("khonglink")],
    ] as const) {
      await taoBo(khoa, ten);
    }

    const maCu = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-320 cu','active')`,
      [boAnh.cu, bam(maCu), maCu.slice(0, 6)],
    );

    maCoLink = randomBytes(32).toString("base64url");
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-320 co','active') returning id`,
      [boAnh.coLink, bam(maCoLink), maCoLink.slice(0, 6)],
    );
    await pg.query(`insert into share_link_ma (share_link_id, ma_hoa) values ($1,$2)`, [sl[0].id, maHoaMaLink(maCoLink)]);
  });

  test.afterAll(async () => {
    for (const id of Object.values(boAnh)) {
      if (!id) continue;
      await pg.query(
        "delete from share_link_ma where share_link_id in (select id from share_links where gallery_id = $1)",
        [id],
      );
      await pg.query("delete from share_links where gallery_id = $1", [id]);
      await pg.query("delete from activity_logs where entity_id = $1", [id]).catch(() => {});
      await pg.query("delete from galleries where id = $1", [id]);
    }
    for (const id of khachIds) {
      await pg.query("delete from customers where id = $1", [id]);
    }
    if (userId) {
      await adminAuth().auth.admin.deleteUser(userId);
      await pg.query("delete from staff_profiles where id = $1", [userId]);
    }
    await pg.end();
  });

  test("1. tạo link → hiện kèm nút Chép link → chép đúng → TẢI LẠI vẫn còn đúng link đó", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${boAnh.moi}`);
    await expect(page.getByRole("heading", { name: "Link app" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Chưa có link nào cho bộ ảnh này.")).toBeVisible();

    await page.getByRole("button", { name: "Thao tác khác" }).click();
    await page.getByRole("menuitem", { name: "Tạo link app" }).click();

    // Link hiện NGAY kèm nút Chép link (không chỉ một textarea không có nút).
    const oLink = page.getByRole("textbox", { name: "Link app" });
    await expect(oLink).toBeVisible({ timeout: 30_000 });
    const diaChi = await oLink.inputValue();
    expect(diaChi).toMatch(/\/g\/[A-Za-z0-9_-]{43}$/);
    const nutChep = page.getByRole("button", { name: "Chép link" });
    await expect(nutChep).toBeVisible();
    await nutChep.click();
    await expect(page.getByRole("button", { name: "Đã chép" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(diaChi);

    // App đã LƯU địa chỉ: có đúng một dòng share_link_ma cho bộ này.
    const { rows } = await pg.query(
      `select count(*)::int n from share_link_ma m join share_links l on l.id = m.share_link_id
        where l.gallery_id = $1 and l.status = 'active'`,
      [boAnh.moi],
    );
    expect(rows[0].n).toBe(1);

    // TẢI LẠI: link vẫn hiện đúng cùng địa chỉ, nút Chép vẫn chạy.
    await page.reload();
    const oLinkSau = page.getByRole("textbox", { name: "Link app" });
    await expect(oLinkSau).toBeVisible({ timeout: 30_000 });
    expect(await oLinkSau.inputValue()).toBe(diaChi);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Chép link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(diaChi);
    // Không còn câu "link cũ không khôi phục được" cạnh link hiện được.
    await expect(page.getByTestId("link-cu-khong-khoi-phuc")).toHaveCount(0);
    await page.screenshot({ path: "test-results/bb-320/link-app-sau-tai-lai.png" });
  });

  test("2. link cũ không khôi phục được: một câu ngắn + nút Tạo link mới ngay trong thẻ", async ({ page }) => {
    test.setTimeout(60_000);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/admin/galleries/${boAnh.cu}`);
    const khoi = page.getByTestId("link-cu-khong-khoi-phuc");
    await expect(khoi).toBeVisible({ timeout: 30_000 });
    await expect(khoi).toContainText("App không giữ được địa chỉ link này");
    await expect(khoi.getByRole("button", { name: "Tạo link mới" })).toBeVisible();
    // Không có ô địa chỉ nào (không bịa link).
    await expect(page.getByRole("textbox", { name: "Link app" })).toHaveCount(0);
  });

  test("3. danh sách: bộ có link chép đúng /g/<mã>, bộ chưa có link thì nút mờ + chú thích", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await dangNhapNhanVien(page, email, password);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");
    const oTim = page.getByPlaceholder("Tìm theo tên bé, tên khách, số điện thoại…");

    const dongCo = page.getByRole("row", { name: tenKhach("colink") });
    await oTim.fill(tenKhach("colink"));
    await expect(dongCo).toBeVisible({ timeout: 20_000 });
    const nutCo = dongCo.getByRole("button", { name: "Sao chép link app" });
    await expect(nutCo).toBeEnabled();
    // Clipboard dùng chung giữa các ca: đặt dấu hiệu trước, để không đọc nhầm link của ca 1 còn sót lại.
    await page.evaluate(() => navigator.clipboard.writeText("chua-chep"));
    await nutCo.click();
    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 })
      .not.toBe("chua-chep");
    const daChep = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(daChep).pathname, "phải là link app /g/<mã>, không phải link Drive hay link quản trị").toBe(`/g/${maCoLink}`);

    await oTim.fill(tenKhach("khonglink"));
    const dongKhong = page.getByRole("row", { name: tenKhach("khonglink") });
    await expect(dongKhong).toBeVisible({ timeout: 20_000 });
    const nutKhong = dongKhong.getByRole("button", { name: "Sao chép link app" });
    await expect(nutKhong).toBeDisabled();
    await expect(nutKhong).toHaveAttribute("title", /Chưa có link app/);
  });
});
