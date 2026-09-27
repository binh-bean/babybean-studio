/**
 * BB-295 — màn khách: bìa, lưới, hộp chốt, trạng thái sau chốt, chân trang,
 * chuông. Xem `4-cham-lai-doc-lap.md` (báo cáo chấm độc lập 27/09/2026) và
 * `LUAT-DOT-8.md` cho nguồn việc và luật chung của đợt.
 *
 * Các mục đã có phép thử SẴN CÓ (không lặp lại ở đây, chỉ cập nhật cho khớp
 * chữ mới khi cần — xem diff của đợt này):
 *   - #6 (hộp chốt gộp một lời nhắc, ô tích hệ thiết kế), #25 (chọn bìa phản
 *     hồi lạc quan) → tests/e2e/bb-202-album.spec.ts.
 *   - #20 (chuông: tiêu đề, nút đóng, câu trống) → tests/e2e/bb-246-thong-bao-day.spec.ts.
 *   - #14 (không vẽ thẻ rỗng khi đang chỉnh) → tests/unit/bb-295-review-panel.test.ts.
 *
 * Phép thử ở ĐÂY canh các mục CHƯA có phép thử nào chạm tới:
 *   - #15: khối "Ảnh đã hoàn thiện" có nút "Tải cả bộ" khi bộ ảnh đã giao
 *     (delivered) VÀ app có đường tải cả bộ; ẩn bộ lọc Đã chọn/Chưa chọn khi
 *     bộ ảnh đã khoá.
 *   - #24: chân trang hiện Zalo khi `branches.zalo_oa` có dữ liệu thật.
 *   - #7: dòng phụ bìa là ngày chụp dd/mm/yyyy, không còn ghép tên chi nhánh.
 *
 * Fixture BB-295 (dữ liệu giả — AGENTS.md §6): tạo CHI NHÁNH GIẢ riêng (không
 * đụng 3 chi nhánh thật) vì cần đặt `zalo_oa` — không được sửa chi nhánh thật.
 * Dọn theo đúng id đã tạo trong `afterAll`.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0901${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-295 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

test.describe("BB-295: màn khách — trạng thái đã giao, chân trang", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let shootId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    // Dọn rác fixture cũ để lại (chạy hỏng giữa chừng lần trước).
    await pg.query(
      `delete from galleries where title like 'Fixture BB-295%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from branches where code like 'FIXTURE-BB295%' and created_at < now() - interval '6 hours'`,
    );

    // Chi nhánh GIẢ riêng — không đụng 3 chi nhánh thật (AGENTS.md §6: không
    // sửa dòng thật; cần `zalo_oa` thật có dữ liệu để đo #24 nên phải tự tạo).
    const { rows: brRows } = await pg.query(
      `insert into branches (code, name, address, hotline, zalo_oa)
       values ($1,$2,$3,$4,$5) returning id`,
      [
        `FIXTURE-BB295-${runId}`,
        `${NHAN} Chi nhánh`,
        "123 Đường Giả Định, Quận Giả",
        "0901000099",
        "https://zalo.me/fixture-bb295",
      ],
    );
    branchId = brRows[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    // #7 — `babyName`/`shootDate` (route.ts) đọc qua join `babies`/`shoots`,
    // KHÔNG phải cột trực tiếp trên `galleries`.
    const { rows: babyRows } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [customerId, `${NHAN} Bé`, "Bé Fixture 295"],
    );
    babyId = babyRows[0].id;
    const { rows: shootRows } = await pg.query(
      `insert into shoots (branch_id, customer_id, baby_id, shoot_date) values ($1,$2,$3,'2026-09-12') returning id`,
      [branchId, customerId, babyId],
    );
    shootId = shootRows[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,$4,$5,'delivered',$6,'https://example.com/x',3,10,20000,true)
       returning id`,
      [branchId, customerId, babyId, shootId, NHAN, `fixture-bb295e2e-${runId}`],
    );
    galleryId = g[0].id;

    for (let i = 1; i <= 3; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb295e2e-${runId}-${i}`, `BB295_${String(i).padStart(3, "0")}.jpg`, i],
      );
    }

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from selections where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from notifications where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (shootId) await pg.query("delete from shoots where id = $1", [shootId]).catch(() => {});
    if (babyId) await pg.query("delete from babies where id = $1", [babyId]).catch(() => {});
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (branchId) await pg.query("delete from branches where id = $1", [branchId]).catch(() => {});
    await pg.end();
  });

  for (const [ten, khoBiet] of [
    ["điện thoại", DIEN_THOAI],
    ["máy tính", MAY_TINH],
  ] as const) {
    test(`#15 — Đã giao: khối "Ảnh đã hoàn thiện" có nút "Tải cả bộ"; ẩn bộ lọc Đã chọn/Chưa chọn (${ten})`, async ({
      page,
    }) => {
      await page.setViewportSize(khoBiet);
      await page.goto(`/g/${maLink}`);

      await page.locator("#dau-luoi-anh").scrollIntoViewIfNeeded();

      // #15 — bộ ảnh đã khoá (delivered) thì "Đã chọn"/"Chưa chọn" không còn
      // là việc cần làm — chỉ còn "Tất cả".
      const loc = page.locator("nav[aria-label='Lọc ảnh']");
      await expect(loc.getByText("Tất cả", { exact: false })).toBeVisible();
      await expect(loc.getByText("Đã chọn", { exact: false })).toHaveCount(0);
      await expect(loc.getByText("Chưa chọn", { exact: false })).toHaveCount(0);

      // #15 — khối "Ảnh đã hoàn thiện" + nút "Tải cả bộ" (download_enabled=true).
      await expect(page.getByText("Ảnh đã hoàn thiện")).toBeVisible();
      await expect(page.getByTestId("nut-tai-ca-bo-da-giao")).toBeVisible();
    });
  }

  test("#24 — chân trang hiện Zalo khi branches.zalo_oa có dữ liệu thật", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await expect(page.locator("footer").getByText("Zalo:", { exact: false })).toBeVisible();
    await expect(page.locator("footer a[href='https://zalo.me/fixture-bb295']")).toBeVisible();
  });

  test("#7 — dòng phụ bìa là ngày chụp dd/mm/yyyy, không ghép tên chi nhánh", async ({ page }) => {
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);
    const bia = page.getByTestId("bia-bo-anh");
    await expect(bia).toBeVisible();
    // shoot_date '2026-09-12' -> "12/09/2026" (BB-295 mục #7: gạch chéo, không
    // còn ghép " · " + tên chi nhánh trên cùng dòng — chi nhánh đã dời xuống
    // chân trang).
    await expect(bia.getByText("12/09/2026", { exact: true })).toBeVisible();
    // Tên chi nhánh không còn ghép trên dòng phụ bìa (đã dời xuống chân trang).
    await expect(bia.getByText(`${NHAN} Chi nhánh`)).toHaveCount(0);
  });
});
