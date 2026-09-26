/**
 * BB-254 — "Mời ông bà cùng xem": ba mẹ tự mời trong app; ông bà/người thân
 * được mời thì XEM và MUA, không chọn ảnh, không thấy tiền của ba mẹ.
 *
 * Luồng canh, theo đúng khuôn BB-245 (tests/e2e/bb-245-moi-mua-lan-hai.spec.ts):
 *
 *   1. Ba mẹ mở link chính, bấm "Mời" → nhập nhãn "Bà nội" → lấy link.
 *   2. Mở link đó ở CONTEXT TRÌNH DUYỆT KHÁC (phiên riêng, không dùng chung
 *      cookie với ba mẹ) → thấy ảnh, KHÔNG thấy tiền, KHÔNG có nút chốt/mời.
 *   3. Ông bà gửi yêu cầu mua khung cho 1 tấm, kèm tên + SĐT.
 *   4. Ba mẹ thu hồi link → link ông bà mở lại báo hết hiệu lực.
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-254 …", xoá sạch ở afterAll (AGENTS.md §6).
 * Bảng `yeu_cau_mua_them`/cột BB-254 (migration 0072/0073) có thể CHƯA áp lên
 * môi trường chạy thử — phần kiểm DB sau khi gửi tự bỏ qua khi thiếu, ghi rõ
 * lý do.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-254 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-254: mời ông bà cùng xem", () => {
  let pg: Client;
  let coBang = false;
  let coCotNguoiMua = false;
  let spGanAnh = "";
  let galleryId = "";
  let customerId = "";
  let maLinkBaMe = "";

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(
      `delete from galleries where title like 'Fixture BB-254%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-254%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: bangKiem } = await pg.query(`select to_regclass('public.yeu_cau_mua_them') as bang`);
    coBang = bangKiem[0]?.bang !== null;
    if (coBang) {
      const { rows: cotKiem } = await pg.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'yeu_cau_mua_them' and column_name = 'ten_nguoi_mua'`,
      );
      coCotNguoiMua = cotKiem.length > 0;
    }

    const { rows: sp } = await pg.query(
      `select id from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
          and (material ilike 'khung%' or kind = 'print')
        order by list_price limit 1`,
    );
    spGanAnh = sp[0]?.id ?? "";

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, NHAN, soGia()],
    );
    customerId = kh[0].id;

    // 'in_review' — bộ ảnh đang mở cho khách xem, CHƯA duyệt (đúng cửa sổ của
    // ông bà, khác luật ba mẹ ở BB-245).
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',1) returning id`,
      [br[0].id, customerId, NHAN, `fixture-bb254e2e-${runId}`],
    );
    galleryId = g[0].id;

    const { rows: ph } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'BB254_001.jpg','image/jpeg',1,'active') returning id`,
      [galleryId, `fixture-bb254e2e-${runId}`],
    );

    maLinkBaMe = randomBytes(32).toString("base64url");
    const { rows: lk } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active') returning id`,
      [galleryId, sha256(maLinkBaMe), maLinkBaMe.slice(0, 6), NHAN],
    );
    await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true)`,
      [galleryId, lk[0].id],
    );
    void ph;
  });

  test.afterAll(async () => {
    if (coBang) await pg.query("delete from yeu_cau_mua_them where gallery_id = $1", [galleryId]);
    await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await pg.query("delete from selections where gallery_id = $1", [galleryId]);
    await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
    await pg.query("delete from photos where gallery_id = $1", [galleryId]);
    await pg.query("delete from galleries where id = $1", [galleryId]);
    await pg.query("delete from customers where id = $1", [customerId]);
    await pg.end();
  });

  test("ba mẹ mời, ông bà xem+mua ẩn danh tiền, ba mẹ thu hồi thì link hết hiệu lực", async ({
    page,
    browser,
  }) => {
    // 1. Ba mẹ mở link chính, mời "Bà nội".
    await page.goto(`/g/${maLinkBaMe}`);
    await expect(page.getByText("Mời ông bà cùng xem")).toBeVisible();
    await page.getByRole("button", { name: "Mời", exact: true }).click();

    const oNhap = page.getByPlaceholder("Ví dụ: Bà nội");
    await oNhap.fill("Bà nội");
    await page.getByRole("button", { name: "Tạo link" }).click();

    await expect(page.getByText("Đã tạo link cho")).toBeVisible();
    const khoiDiaChi = page.locator("p.break-all");
    await expect(khoiDiaChi).toBeVisible();
    const diaChi = (await khoiDiaChi.textContent())?.trim() ?? "";
    const khopMa = diaChi.match(/\/g\/(\S+)$/);
    expect(khopMa, `Không đọc được mã link từ "${diaChi}"`).toBeTruthy();
    const maLinkOngBa = khopMa![1];

    await page.getByRole("button", { name: "Đóng" }).click();

    // 2. Ông bà mở link ở PHIÊN RIÊNG (context khác — không chung cookie ba mẹ).
    const ctxOngBa = await browser.newContext();
    const pageOngBa = await ctxOngBa.newPage();
    await pageOngBa.goto(`/g/${maLinkOngBa}`);

    // Lưới ảnh dùng alt chung "Ảnh N" (không phải tên tệp) — xem luoi-anh.tsx.
    await expect(pageOngBa.getByAltText("Ảnh 1")).toBeVisible();
    await expect(pageOngBa.getByText("Link này để xem ảnh cùng gia đình")).toBeVisible();

    // KHÔNG thấy tiền của ba mẹ, KHÔNG có nút chọn/chốt/mời.
    await expect(pageOngBa.getByRole("button", { name: "Chốt danh sách" })).toHaveCount(0);
    await expect(pageOngBa.getByText("Mời ông bà cùng xem")).toHaveCount(0);
    await expect(pageOngBa.getByTestId("dem-da-chon")).toHaveCount(0);

    // 3. Ông bà gửi yêu cầu mua khung cho 1 tấm, kèm tên + SĐT.
    test.skip(!spGanAnh, "Không có sản phẩm gắn-ảnh đủ điều kiện bán trong bb-dev — bỏ qua ca mua thêm.");

    // Thẻ thu gọn hiện `tieuDe` làm đoạn văn, nút bấm luôn là "Xem thêm"
    // (xem moi-mua-lan-hai.tsx) — mở ra mới thấy tiêu đề đầy đủ trên header.
    await expect(pageOngBa.getByText("Đặt in ảnh này / Mua thêm")).toBeVisible();
    await pageOngBa.getByRole("button", { name: "Xem thêm" }).click();
    await expect(pageOngBa.getByRole("heading", { name: "Đặt in ảnh này / Mua thêm" })).toBeVisible();

    let daChonAnh = false;
    for (const nhom of ["Khung ảnh", "Ảnh in và ảnh phóng"]) {
      const nutNhom = pageOngBa.getByRole("button", { name: nhom, exact: true });
      await nutNhom.click();
      // exact: true — "Chọn ảnh" không exact còn khớp cả "Bắt đầu chọn ảnh"
      // của nút bìa bộ ảnh (BiaBoAnh, hiện khi bộ ảnh chưa khoá).
      const nutChonAnh = pageOngBa.getByRole("button", { name: "Chọn ảnh", exact: true }).first();
      if ((await nutChonAnh.count()) > 0) {
        await nutChonAnh.click();
        const tamAnh = pageOngBa.getByAltText("BB254_001.jpg").last();
        await tamAnh.click();
        daChonAnh = true;
        break;
      }
    }
    test.skip(!daChonAnh, "Không có sản phẩm nào cần gắn ảnh trong danh mục — bỏ qua.");

    await pageOngBa.getByPlaceholder("Tên người mua").fill("Fixture Bà Nội");
    await pageOngBa.getByPlaceholder("Số điện thoại (10 số)").fill(soGia());

    const nutGui = pageOngBa.getByRole("button", { name: "Gửi yêu cầu cho studio" });
    await expect(nutGui).toBeEnabled();
    await nutGui.click();

    if (coBang) {
      await expect(pageOngBa.getByText("Đã gửi, studio sẽ gọi sớm")).toBeVisible();
      if (coCotNguoiMua) {
        const { rows } = await pg.query(
          "select ten_nguoi_mua, sdt_nguoi_mua from yeu_cau_mua_them where gallery_id = $1",
          [galleryId],
        );
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0].ten_nguoi_mua).toBe("Fixture Bà Nội");
      } else {
        test.info().annotations.push({
          type: "skip-db-check",
          description: "Cột ten_nguoi_mua/sdt_nguoi_mua (migration 0073) chưa áp — bỏ qua kiểm DB, chờ Opus áp.",
        });
      }
    } else {
      test.info().annotations.push({
        type: "skip-db-check",
        description: "Bảng yeu_cau_mua_them (migration 0072) chưa áp — bỏ qua kiểm DB, chờ Opus áp.",
      });
    }

    // 4. Ba mẹ thu hồi link — quay lại phiên ba mẹ.
    await page.goto(`/g/${maLinkBaMe}`);
    await page.getByRole("button", { name: "Mời", exact: true }).click();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Thu hồi" }).click();
    await expect(page.getByText("Bà nội").first()).toBeVisible(); // dòng vẫn còn, nay "Đã thu hồi"
    await expect(page.getByText("Đã thu hồi")).toBeVisible();

    await ctxOngBa.close();
    const ctxSau = await browser.newContext();
    const pageSau = await ctxSau.newPage();
    await pageSau.goto(`/g/${maLinkOngBa}`);
    // `/api/auth/gallery` CỐ Ý trả NOT_FOUND (không phải LINK_EXPIRED) cho
    // link ĐÃ THU HỒI — quyết định BB-183: không chỉ đường cho người đang
    // cầm một link lẽ ra không nên còn giữ. Link ông bà dùng ĐÚNG cơ chế này.
    await expect(pageSau.getByRole("heading", { name: "Không tìm thấy bộ ảnh" })).toBeVisible();
    await ctxSau.close();
  });
});
