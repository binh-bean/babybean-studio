/**
 * BB-202 — "album ảnh" đúng nghĩa (docs/19 mục 1, chốt chủ studio 26/09/2026).
 *
 * Hai luồng:
 *   1. Gói CÓ album trong hợp đồng → ba mẹ thả tim vài tấm → bấm Chốt bị dẫn
 *      tới khối "Chọn ảnh bìa album" (bắt buộc) → chọn một gợi ý → chốt lại
 *      thành công.
 *   2. Cửa hàng (mua thêm): sản phẩm nhóm album chỉ có nút "Mua" (số lượng),
 *      KHÔNG mở bước chọn ảnh — khác hẳn ảnh in/khung.
 *
 * Ca 1 cần bảng `album_covers` (migration 0075) — CHƯA ĐƯỢC ÁP lên bb-dev tại
 * thời điểm viết phép thử này. Ca tự dò bảng, thiếu thì `test.skip` kèm lý do
 * "chờ Opus áp 0075", không giả vờ xanh, không đỏ oan cả bộ.
 *
 * Fixture BB-202 (dữ liệu giả — AGENTS.md §6), dọn theo ĐÚNG id đã tạo.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-202 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const CHO_ANH = 20_000;

test.describe("BB-202: bìa album trong gói + album mua thêm chỉ đặt mua", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  let albumProductId = "";
  let bangDaCo = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(
      `delete from galleries where title like 'Fixture BB-202%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-202%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: t } = await pg.query("select to_regclass('public.album_covers') as t");
    bangDaCo = t[0]?.t !== null;

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: sp } = await pg.query(
      `select id from products
        where is_active and material ilike '%album%' and list_price is not null
          and price_confidence >= 0.8 and price_samples >= 5
        limit 1`,
    );
    albumProductId = sp[0]?.id ?? "";

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, soGia],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',5,10,20000) returning id`,
      [branchId, customerId, NHAN, `fixture-bb202e2e-${runId}`],
    );
    galleryId = g[0].id;

    if (albumProductId) {
      await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
         values ($1,$2,1,500000)`,
        [galleryId, albumProductId],
      );
      // Gói thật có dòng "ảnh chỉnh sửa" cạnh album; thiếu nó thì hạn mức
      // "chưa biết" và app CHẶN thả tim (Opus soát BB-202 — số đếm kẹt ở 0).
      await pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
         select $1, id, 10, 0 from products
          where is_active and kind = 'edited_photo' order by id limit 1`,
        [galleryId],
      );
    }

    for (let i = 1; i <= 5; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb202e2e-${runId}-${i}`, `BB202_${String(i).padStart(3, "0")}.jpg`, i],
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
      await pg.query("delete from album_covers where gallery_id = $1", [galleryId]).catch(() => {});
      await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from gallery_items where gallery_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  // Ca cửa hàng chạy TRƯỚC: ca chọn bìa chốt thành công sẽ KHOÁ bộ ảnh dùng chung,
  // bộ đã khoá thì không còn nút "Mua thêm" (Opus soát BB-202).
  //
  // ĐỔI Ở BB-279 (27/09/2026): trước đây mỗi nhóm trong cửa hàng là một danh
  // sách PHẲNG `<li>` từng sản phẩm, mỗi dòng có nút riêng ("Mua" cho album,
  // "Chọn ảnh" cho ảnh in/khung). Từ BB-279, mỗi nhóm là MỘT bộ cấu hình
  // (`cua-hang.tsx`): chọn kích thước/chất liệu bằng chip rồi MỘT nút duy
  // nhất cho tổ hợp đang chọn — "Thêm vào giỏ" cho nhóm không gắn ảnh (album,
  // đúng luật BB-202: chỉ đặt mua, không chọn ảnh), "Chọn ảnh" cho nhóm gắn
  // ảnh (ảnh in/khung). Ca này viết lại để đo đúng luật đó qua giao diện MỚI,
  // không còn giả định có `<li>` liệt kê từng sản phẩm.
  test("2. Cửa hàng — nhóm Album: nút 'Thêm vào giỏ' trực tiếp, KHÔNG có bước 'Chọn ảnh'", async ({
    page,
  }) => {
    test.skip(!albumProductId, "bb-dev hiện không có sản phẩm album nào đủ điều kiện bán.");

    await page.goto(`/g/${maLink}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // BB-258: thanh nổi (chứa "Mua thêm") ẨN khi bìa tràn màn còn hiện — cuộn
    // xuống lưới ảnh như khách thật rồi mới tìm nút (cùng cách bb-248 làm).
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));

    // Mở cửa hàng qua nút nổi "Mua thêm" (cùng lối vào bb-248/bb-245 dùng).
    await page.getByRole("button", { name: /Mua thêm/i }).first().click();
    const cuaHang = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await expect(cuaHang).toBeVisible();

    // Chuyển sang nhóm Album.
    await cuaHang.getByRole("button", { name: "Album", exact: true }).click();

    // Nhóm Album KHÔNG gắn ảnh (BB-202: chỉ đặt mua) -> nút phải là
    // "Thêm vào giỏ", KHÔNG BAO GIỜ là "Chọn ảnh" (đó là nút của nhóm
    // ảnh in/khung, canGanAnh=true).
    await expect(cuaHang.getByRole("button", { name: "Chọn ảnh", exact: true })).toHaveCount(0);
    const nutThem = cuaHang.getByRole("button", { name: "Thêm vào giỏ" });
    await expect(nutThem).toBeVisible();

    await nutThem.click();

    // KHÔNG có lưới chọn ảnh nào mở ra — bấm "Thêm vào giỏ" là xong luôn.
    await expect(page.getByRole("dialog", { name: "Chọn ảnh để đặt in" })).toHaveCount(0);

    // Đơn phải ghi nhận THẬT trong cơ sở dữ liệu: một dòng selection_addons,
    // KHÔNG gắn ảnh nào (photo_id null — "chỉ đặt mua", ảnh để CSKH trao đổi
    // sau). Kiểm bằng dữ liệu thật thay vì đọc lại đúng chữ trên màn hình, vì
    // sau khi tải lại dữ liệu server, tab đang xem trong cửa hàng có thể quay
    // về nhóm đầu tiên — đó không phải điều phép thử này canh.
    await expect
      .poll(
        async () => {
          const { rows } = await pg.query(
            // Cửa hàng chọn sẵn cỡ album đầu tiên của nó — không nhất thiết trùng
            // `albumProductId` (lấy "một album bất kỳ" chỉ để biết có hàng bán).
            // Canh đúng điều cần canh: có MỘT dòng mua thêm là album, không ảnh.
            `select sa.quantity, sa.photo_id from selection_addons sa
               join selections s on s.id = sa.selection_id
               join products p on p.id = sa.product_id
              where s.gallery_id = $1 and p.material ilike '%album%'`,
            [galleryId],
          );
          return rows[0] ?? null;
        },
        { timeout: 15_000, message: "Chưa thấy dòng selection_addons cho album vừa mua" },
      )
      .toMatchObject({ quantity: 1, photo_id: null });
  });

  test("1. Bộ có album trong gói: thả tim 3 tấm → Chốt bị dẫn tới chọn bìa → chọn 1 gợi ý → chốt thành công", async ({
    page,
  }) => {
    test.skip(
      !bangDaCo,
      "Bảng album_covers (migration 0075) chưa được áp lên bb-dev — chờ Opus áp rồi chạy lại ca này.",
    );
    test.skip(!albumProductId, "bb-dev hiện không có sản phẩm album nào đủ điều kiện bán.");

    await page.goto(`/g/${maLink}`);

    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });

    // Thả tim 3 tấm đầu tiên.
    const nutChon = page.locator('button[aria-label="Chọn ảnh này"]');
    const dem = page.getByTestId("dem-da-chon");
    await nutChon.nth(0).click();
    await expect(dem).toHaveText("1", { timeout: 10_000 });
    await nutChon.nth(1).click();
    await expect(dem).toHaveText("2", { timeout: 10_000 });
    await nutChon.nth(2).click();
    await expect(dem).toHaveText("3", { timeout: 10_000 });

    // Khối "Chọn ảnh bìa album" phải hiện ngay trên trang (bắt buộc, chưa chọn).
    await expect(page.getByText("Chọn ảnh bìa album")).toBeVisible();
    await expect(page.getByText("Chưa chọn ảnh bìa")).toBeVisible();

    // Bấm Chốt — phải bị chặn, dẫn ba mẹ quay lại khối chọn bìa.
    // BB-258: thanh nổi (nút Chốt) ẩn khi bìa tràn màn còn chiếm phần lớn khung
    // nhìn — cuộn xuống lưới như khách thật rồi mới bấm.
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bean BB-202");
    // BB-295 mục #6 — ô tích đổi từ `<input>` thô sang `Checkbox` dùng chung
    // (input thật `sr-only`, ô vuông hiển thị là `<span>` anh em cùng trong
    // `<label>`). `.check()` bấm thẳng vào toạ độ input ẩn nên bị `<span>`
    // che, treo tới hết timeout (bắt được khi chạy lại phép thử này sau khi
    // đổi component — xem bàn giao). Chuột thật bấm vào `<label>`/`<span>`
    // vẫn kích hoạt input qua ngữ nghĩa `<label>` chuẩn của trình duyệt —
    // đây chỉ là cách Playwright định vị theo role, dùng `force` để bấm
    // thẳng vào input thay vì đợi nó "nhận được sự kiện chuột".
    await page.getByRole("checkbox").setChecked(true, { force: true });
    // BB-295 mục #6 — báo cáo chấm độc lập: hai hộp đỏ trùng ý gộp thành
    // một lời nhắc dịu ("Còn thiếu ảnh bìa album") với một nút "Chọn bìa
    // ngay" (trước là "Ba mẹ chưa chọn ảnh bìa cho:" + "Đi tới chọn bìa").
    //
    // BB-310 mục 2 — báo cáo chấm độc lập vòng 4: câu cũ đứng cạnh câu "để
    // sau cũng được, CSKH sẽ hỏi lại" (dành cho sản phẩm thiếu ảnh, KHÔNG
    // chặn) làm ba mẹ hiểu nhầm bìa album cũng để sau được. Đổi chữ rõ ràng
    // hơn, GIỮ NGUYÊN quy tắc (bìa album vẫn bắt buộc). Chữ này lặp lại ở cả
    // khối nhắc lẫn dòng lý do khoá nút (cố ý) — `.first()` tránh strict mode.
    // BB-317 K-e — dòng yêu cầu gọi đúng tên sản phẩm (một dòng, không lặp dưới nút).
    await expect(page.getByTestId("ly-do-khoa-nut-chot")).toHaveText(/^Chọn ảnh bìa cho .+ để chốt\.$/);
    // Nút Xác nhận phải bị khoá lại — không cho chốt khi còn thiếu bìa — và
    // lý do khoá phải hiện ngay dưới nút (BB-295 mục #6).
    await expect(page.getByRole("button", { name: "Xác nhận" })).toBeDisabled();

    await page.getByTestId("nut-chon-bia-ngay").click();

    // Chọn MỘT gợi ý làm bìa.
    const nutBia = page.locator('button[aria-label^="Chọn ảnh bìa"]').first();
    await nutBia.waitFor({ state: "visible", timeout: 10_000 });
    await nutBia.click();

    // BB-295 mục #25 — phản hồi lạc quan ngay khi bấm (không chờ máy chủ ghi
    // xong): trước là "Đang chọn: <tên tệp>", nay "✓ Đã chọn làm bìa".
    await expect(page.getByText("Đã chọn làm bìa")).toBeVisible();

    // Chốt lại — lần này phải QUA được.
    // BB-258: thanh nổi (nút Chốt) ẩn khi bìa tràn màn còn chiếm phần lớn khung
    // nhìn — cuộn xuống lưới như khách thật rồi mới bấm.
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bean BB-202");
    await page.getByRole("checkbox").setChecked(true, { force: true });
    // BB-310 mục 2 — chọn bìa xong mở lại hộp chốt phải thấy NGAY hộp đã hết
    // khoá (cập nhật lạc quan tại chỗ, không chờ tải lại toàn bộ — xem
    // `chonBiaAlbum` ở `gallery-app.tsx`).
    await expect(page.getByTestId("ly-do-khoa-nut-chot")).toHaveCount(0);
    await page.getByRole("button", { name: "Xác nhận" }).click();

    await expect
      .poll(
        async () => {
          const { rows } = await pg.query("select status::text s from galleries where id=$1", [
            galleryId,
          ]);
          return rows[0]?.s;
        },
        { timeout: 15_000 },
      )
      .toBe("submitted");
  });

});
