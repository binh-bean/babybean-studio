/**
 * BB-327 — "Xin mở lại" chạy trọn vòng, đúng ca chủ studio vấp 29/09/2026:
 *
 *   khách chốt → CSKH xác nhận (in_retouch) + Lark đã "Đã chọn hình"
 *   → khách XIN mở lại → CSKH bấm "Mở lại" NGAY TRONG Việc cần xử lý
 *   → khách TICK và BỎ TICK được → khách chốt lại.
 *
 * Trước bản vá: sau khi mở lại, luật khoá theo Lark (BB-285) vẫn thấy giai đoạn
 * ≥ 2 nên mọi lượt tick trả GALLERY_LOCKED — khách không đổi được gì.
 *
 * Dữ liệu: toàn bộ "Fixture BB-327 …", dọn theo id ở afterAll. Lark không bị
 * ghi: máy chủ phép thử chạy với PHEP_THU_TRINH_DUYET=1 (playwright.config.ts).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-327 MoLai ${runId}`;
const CHO_ANH = 30_000;
const email = `test_bb327_${runId}@demo.babybean.vn`;
const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const LARK_DA_CHON_HINH = "optl5DyKLx";

test.describe("BB-327: khách xin mở lại → CSKH mở lại → khách tick/bỏ tick → chốt lại", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  const quanTri = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query(
      "select id from branches where name not like 'Fixture%' order by name limit 1",
    );
    branchId = br[0].id;

    const { data, error } = await quanTri().auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user!.id;
    await client.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      userId,
      `${NHAN} NV`,
      email,
    ]);
    await client.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      userId,
      branchId,
    ]);

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/bb327',3,5,50000,false) returning id`,
      [branchId, customerId, `${NHAN} Bộ`, `fixture-bb327-${runId}`],
    );
    galleryId = g[0].id;
    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb327-${runId}-${i}`, `BB327_000${i}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) {
        await client.query("delete from activity_logs where entity_id = $1 or gallery_id = $1", [galleryId]);
        await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]).catch(() => {});
        await client.query("delete from selections where gallery_id = $1", [galleryId]);
        await client.query("delete from share_links where gallery_id = $1", [galleryId]);
        await client.query("delete from photos where gallery_id = $1", [galleryId]);
        await client.query("delete from galleries where id = $1", [galleryId]);
      }
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) {
        await client.query("delete from staff_branches where staff_id = $1", [userId]);
        await client.query("delete from staff_profiles where id = $1", [userId]);
      }
      await client.end();
    }
    if (userId) await quanTri().auth.admin.deleteUser(userId);
  });

  test("mở lại từ Việc cần xử lý rồi khách đổi ảnh được", async ({ page, context }) => {
    const trangThai = async () =>
      (await client.query("select status::text s from galleries where id=$1", [galleryId])).rows[0]?.s;

    // 1. Khách chọn 2 tấm đầu và chốt.
    await page.goto(`/g/${maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    const nutTim = /^(Chọn ảnh này|Bỏ chọn)$/;
    const cacTheAnh = page.getByTestId("the-anh");
    await cacTheAnh.nth(0).getByRole("button", { name: nutTim }).click();
    await cacTheAnh.nth(1).getByRole("button", { name: nutTim }).click();
    const dem = page.getByTestId("dem-da-chon");
    await expect(dem).toHaveText("2", { timeout: 10_000 });
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Fixture");
    await tickHopChotDot1(page);
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect.poll(trangThai, { timeout: 20_000 }).toBe("submitted");

    // 2. CSKH đã xác nhận + Lark đã sang "Đã chọn hình" từ hôm qua (đúng dữ liệu thật).
    await client.query(
      `update galleries set status='in_retouch', lark_trang_thai=$2, lark_trang_thai_tu=now() - interval '1 day'
       where id=$1`,
      [galleryId, LARK_DA_CHON_HINH],
    );

    // 3. Khách xin mở lại (cùng phiên link của khách).
    const xin = await page.request.post("/api/g/xin-sua-lai", { data: { lyDo: "Fixture BB-327 đổi một tấm" } });
    expect(xin.ok()).toBe(true);

    // 4. CSKH bấm "Mở lại" ngay trong Việc cần xử lý — không mở từng bộ ảnh.
    const nv = await context.newPage();
    await dangNhapNhanVien(nv, email, password);
    await nv.goto("/admin/viec-can-xu-ly?tab=yeu-cau-mo-lai");
    const dong = nv.getByTestId("dong-yeu-cau-mo-lai").filter({ hasText: `${NHAN} Bộ` });
    await expect(dong).toBeVisible({ timeout: 30_000 });
    await dong.getByRole("button", { name: "Mở lại cho khách" }).click();
    await dong.getByRole("button", { name: "Xác nhận mở lại" }).click();
    await expect.poll(trangThai, { timeout: 15_000 }).toBe("in_review");
    await expect(dong).toHaveCount(0, { timeout: 15_000 });

    // 5. Khách bỏ tick tấm 2, tick tấm 3 — phải ghi được (trước bản vá: GALLERY_LOCKED).
    await page.goto(`/g/${maLink}`);
    await page.locator('img[src*="/api/img/"]').first().waitFor({ state: "visible", timeout: CHO_ANH });
    await cacTheAnh.nth(1).getByRole("button", { name: nutTim }).click();
    await cacTheAnh.nth(2).getByRole("button", { name: nutTim }).click();
    await expect(dem).toHaveText("2", { timeout: 10_000 });
    await expect
      .poll(
        async () =>
          (
            await client.query(
              `select p.file_name from selection_items si
                 join selections s on s.id = si.selection_id and s.is_primary
                 join photos p on p.id = si.photo_id
                where s.gallery_id = $1 and si.mark = 'selected' order by p.file_name`,
              [galleryId],
            )
          ).rows.map((r) => r.file_name),
        { timeout: 15_000 },
      )
      .toEqual(["BB327_0001.jpg", "BB327_0003.jpg"]);

    // 6. Khách chốt lại.
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    const ten = page.locator("#confirm-name-input");
    if (await ten.isVisible()) {
      await ten.fill("Mẹ Fixture sửa");
      await tickHopChotDot1(page);
    }
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect.poll(trangThai, { timeout: 20_000 }).toBe("submitted");
  });
});
