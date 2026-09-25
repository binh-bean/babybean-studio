/**
 * BB-217 + BB-218 — hai màn toàn màn hình mới của khách: so sánh nhiều tấm và
 * treo ảnh lên tường. Agent làm hai việc này không viết phép thử trình duyệt;
 * phép thử này canh những chỗ Claude sửa lúc soát:
 *
 * - So sánh: bỏ bớt còn 1 tấm phải ĐÓNG hẳn màn so sánh. Bản agent chỉ ẩn nó
 *   (trạng thái "đang mở" vẫn bật), nên đánh dấu thêm một tấm ở lưới thì màn
 *   so sánh tự bật lên không báo trước.
 * - Treo tường: mở được từ bảng sản phẩm của tấm ĐÃ CHỌN, có ảnh phòng + khung,
 *   có nút cỡ lấy từ danh mục thật, và Esc chỉ đóng màn treo tường chứ không
 *   đóng luôn màn xem lớn bên dưới.
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-217-218 …", xoá sạch ở afterAll. Ảnh thử
 * trỏ tới tệp Drive không có thật — ảnh vỡ, nhưng thẻ ảnh và các nút vẫn dựng,
 * đủ cho những gì phép thử này canh.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
// Số giả MỚI mỗi lượt: số cố định va nhau khi hai worktree chạy cùng tệp
// (uq_customers_phone_branch) — xảy ra 25/09/2026 khi agent BB-222 chạy song song.
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-217-218 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-217 + BB-218: so sánh nhiều tấm, treo ảnh lên tường", () => {
  let pg: Client;
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-217-218%' and created_at < now() - interval '1 hour'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-217-218%' and created_at < now() - interval '1 hour'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3,10,50000,false) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb217-${runId}`],
    );
    galleryId = g[0].id;
    // Ảnh dọc (2000×3000) — màn treo tường chọn hướng khung theo tấm của bé.
    for (let i = 1; i <= 3; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         values ($1,$2,$3,'image/jpeg',$4,'active',2000,3000)`,
        [galleryId, `bb217-${runId}-${i}.jpg`, `BB217_000${i}.jpg`, i],
      );
    }
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-217-218','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      // selection_items/placements/addons đi theo selections (on delete cascade).
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  test("so sánh: bỏ còn 1 tấm thì đóng hẳn, đánh dấu thêm không tự bật lại", async ({ page }) => {
    await page.goto(`/g/${maLink}`);
    const the = page.getByTestId("the-anh");
    await expect(the).toHaveCount(3);

    await page.getByRole("button", { name: "So sánh", exact: true }).click();
    await the.nth(0).click();
    await the.nth(1).click();
    await page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ }).click();

    const manSoSanh = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
    await expect(manSoSanh).toBeVisible();
    await expect(manSoSanh.locator("img")).toHaveCount(2);

    await manSoSanh.getByRole("button", { name: "Bỏ khỏi so sánh" }).first().click();
    await expect(manSoSanh).toBeHidden();

    // Chỗ lỗi cũ: tấm thứ hai đủ điều kiện "≥ 2 tấm" và màn so sánh bật lại.
    await the.nth(2).click();
    await expect(page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(manSoSanh).toBeHidden();
  });

  test("treo tường: mở từ tấm đã chọn, có khung, Esc chỉ đóng một lớp", async ({ page }) => {
    await page.goto(`/g/${maLink}`);
    const tamDau = page.getByTestId("the-anh").first();
    await tamDau.getByRole("button", { name: "Chọn ảnh này" }).click();
    await expect(tamDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();

    await tamDau.click();
    const anhLon = page.getByRole("dialog").first();
    await expect(anhLon).toBeVisible();
    await page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first().click();

    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(manTuong).toBeVisible();
    // Ảnh phòng thật (public/tuong) + tấm của bé trong khung.
    await expect(manTuong.locator('img[src*="/tuong/"]').first()).toBeVisible();
    await expect(manTuong.locator('img[src*="/api/img/"]')).toHaveCount(1);
    // Nút cỡ đọc từ danh mục: phải có ít nhất một cỡ, và có cỡ ngoài bộ ba cũ.
    const nutCo = manTuong.getByRole("button", { name: /^\d+×\d+ cm$/ });
    expect(await nutCo.count()).toBeGreaterThan(0);
    const tenCo = await nutCo.allTextContents();
    expect(tenCo.some((t) => !["40×60 cm", "50×75 cm", "60×90 cm"].includes(t.trim()))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(manTuong).toBeHidden();
    await expect(page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first()).toBeVisible();
  });

  test("treo tường: bật Khung hiện hàng mẫu, chọn mẫu khác đổi border-image, thấy câu tham khảo", async ({
    page,
  }) => {
    test.slow();
    await page.goto(`/g/${maLink}`);
    // Tấm THỨ BA — ca "treo tường" trước trong tệp này chỉ đụng tấm đầu
    // (tấm 0), ca "so sánh" chỉ dùng để mở màn so sánh (không commit trạng
    // thái "đã chọn"). Dùng tấm 2 để không phụ thuộc việc chọn có lưu chung
    // theo bộ ảnh (server) hay theo phiên (trình duyệt) giữa các ca.
    const tamDau = page.getByTestId("the-anh").nth(2);
    // `.isVisible()` không CHỜ — gọi ngay sau goto dễ hỏi sớm hơn lúc hydrate
    // xong và luôn trả false. Chờ thẻ hiện ra trước, rồi mới đọc trạng thái nút.
    // Nút CHỈ có icon (không có chữ) — nhãn nằm ở aria-label, không phải
    // textContent (từng đọc nhầm textContent, luôn rỗng, nên đã đổi qua đếm
    // locator theo role trực tiếp).
    await expect(tamDau).toBeVisible();
    const nutChon = tamDau.getByRole("button", { name: "Chọn ảnh này" });
    if ((await nutChon.count()) > 0) {
      await nutChon.click();
    }
    await expect(tamDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();

    await tamDau.click();
    await page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first().click();

    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(manTuong).toBeVisible();

    const bocKhung = manTuong.getByText("Bọc khung HQ");
    // Không có danh mục "khung" cho ca test này thì bỏ qua — chỉ chạy khi có.
    if ((await bocKhung.count()) === 0) return;

    await bocKhung.click();

    const nutMau = manTuong.getByRole("button", { name: "Khung đen", exact: true });
    await expect(nutMau).toBeVisible();
    await expect(nutMau).toHaveAttribute("aria-pressed", "true");

    // BB-243: bảng đã gọn lại — câu "chỉ để tham khảo" gấp sau nút "Chi tiết",
    // không còn hiện ngay khi bật Khung nữa.
    await expect(manTuong.getByText(/chỉ để tham khảo/)).toHaveCount(0);
    await manTuong.getByRole("button", { name: "Chi tiết" }).click();
    await expect(manTuong.getByText(/chỉ để tham khảo/)).toBeVisible();

    // Khung đang vẽ bằng border-image — đọc border-image-source của khối bọc
    // ảnh (chính là div cha của thẻ <img> tấm ảnh khách, có border-image).
    const anhKhach = manTuong.locator('img[src*="/api/img/"]');
    const khoiBocKhung = anhKhach.locator("xpath=ancestor::div[contains(@style,'border-image')][1]");
    const nguonBanDau = await khoiBocKhung.evaluate(
      (el) => getComputedStyle(el).borderImageSource,
    );
    expect(nguonBanDau).toContain("khung-den.jpg");

    await manTuong.getByRole("button", { name: "Khung trắng", exact: true }).click();
    await expect(nutMau).toHaveAttribute("aria-pressed", "false");
    const nguonSau = await khoiBocKhung.evaluate(
      (el) => getComputedStyle(el).borderImageSource,
    );
    expect(nguonSau).toContain("khung-trang.jpg");
    expect(nguonSau).not.toBe(nguonBanDau);
  });

  test("BB-242: Ghim & vuốt — ghim tấm không đổi khi vuốt tấm kia sang tấm kế, số x/y đổi", async ({
    page,
  }) => {
    await page.goto(`/g/${maLink}`);
    const the = page.getByTestId("the-anh");
    await expect(the).toHaveCount(3);

    // Thả tim cả 3 tấm: chỉ đánh dấu ĐÚNG 2 tấm để so sánh (tối thiểu) làm
    // "Ghim & vuốt" vuốt trong các tấm đã thả tim (3 tấm, trừ tấm ghim), không chỉ 2
    // tấm đang so sánh — xem danhSachVuotGhim trong so-sanh.ts. Đã CHỌN từ
    // ca thử khác trong cùng tệp này thì bỏ qua (đợi thẻ hiện ra trước khi
    // đọc trạng thái nút — gọi ngay sau goto dễ hỏi sớm hơn lúc hydrate xong).
    for (let i = 0; i < 3; i++) {
      await expect(the.nth(i)).toBeVisible();
      const nutChonI = the.nth(i).getByRole("button", { name: "Chọn ảnh này" });
      if ((await nutChonI.count()) > 0) await nutChonI.click();
      await expect(the.nth(i).getByRole("button", { name: "Bỏ chọn" })).toBeVisible();
    }

    await page.getByRole("button", { name: "So sánh", exact: true }).click();
    await the.nth(0).click();
    await the.nth(1).click();
    await page.getByRole("button", { name: /Đã chọn 2 tấm để so sánh/ }).click();

    const manSoSanh = page.getByRole("dialog", { name: "So sánh nhiều tấm" });
    await expect(manSoSanh).toBeVisible();

    await manSoSanh.getByRole("button", { name: "Ghim & vuốt" }).click();
    // Tấm ghim (đầu danh sách so sánh) mặc định — nút của NÓ có nhãn "Bỏ
    // ghim". Không dò theo aria-pressed="true" chung chung: nút chuyển chế
    // độ ở đầu ("Ghim & vuốt") CŨNG có aria-pressed="true" khi đang bật chế
    // độ này, khớp nhầm phần tử khác trong cùng màn.
    const nutGhim = manSoSanh.getByRole("button", { name: "Bỏ ghim" });
    await expect(nutGhim).toBeVisible();
    const anhGhimTruoc = await nutGhim.locator("xpath=parent::div//img").getAttribute("src");

    const demChu = manSoSanh.getByText(/^\d+ \/ \d+$/);
    const demTruoc = (await demChu.textContent())?.trim();
    // 3 tấm đã thả tim, TRỪ tấm đang ghim (Opus soát: không vuốt tới chính
    // tấm ghim) → danh sách vuốt còn 2; đứng ở tấm đánh dấu thứ hai.
    expect(demTruoc).toBe("1 / 2");

    await manSoSanh.getByRole("button", { name: "Tấm sau" }).click();
    const demSau = (await demChu.textContent())?.trim();
    expect(demSau).toBe("2 / 2");
    expect(demSau).not.toBe(demTruoc);

    // Tấm ghim vẫn đứng yên — cùng đúng một ảnh trước và sau khi vuốt tấm kia.
    const anhGhimSau = await nutGhim.locator("xpath=parent::div//img").getAttribute("src");
    expect(anhGhimSau).toBe(anhGhimTruoc);
  });

  test("BB-243: Ẩn bảng — bảng biến mất, ảnh phòng còn; bấm tấm của bé mở xem lớn, Esc về màn tường", async ({
    page,
  }) => {
    await page.goto(`/g/${maLink}`);
    const tamDau = page.getByTestId("the-anh").first();
    await expect(tamDau).toBeVisible();
    const nutChon = tamDau.getByRole("button", { name: "Chọn ảnh này" });
    if ((await nutChon.count()) > 0) await nutChon.click();
    await expect(tamDau.getByRole("button", { name: "Bỏ chọn" })).toBeVisible();

    await tamDau.click();
    await page.getByRole("button", { name: /Xem trên tường nhà mình/ }).first().click();

    const manTuong = page.getByRole("dialog", { name: "Xem ảnh trên tường" });
    await expect(manTuong).toBeVisible();

    const anhPhong = manTuong.locator('img[src*="/tuong/"]').first();
    await expect(anhPhong).toBeVisible();
    const tieuDeBang = manTuong.getByText("Treo lên tường nhà mình");
    await expect(tieuDeBang).toBeVisible();

    await manTuong.getByRole("button", { name: "Ẩn bảng" }).click();
    await expect(tieuDeBang).toBeHidden();
    await expect(anhPhong).toBeVisible();

    await manTuong.getByRole("button", { name: "Hiện bảng" }).click();
    await expect(tieuDeBang).toBeVisible();

    // Bấm tấm của bé trong khung — mở hộp thoại xem lớn.
    await manTuong.getByRole("button", { name: "Xem lớn ảnh của bé" }).click();
    const xemLon = page.getByRole("dialog", { name: "Xem lớn ảnh của bé" });
    await expect(xemLon).toBeVisible();

    // Esc chỉ đóng LỚP xem lớn — màn tường bên dưới vẫn mở.
    await page.keyboard.press("Escape");
    await expect(xemLon).toBeHidden();
    await expect(manTuong).toBeVisible();
  });
});
