/**
 * BB-369 (chủ studio 06/10/2026):
 *  1. Bàn làm việc: khối "Bản ghi mới từ Lark" ra CÙNG danh sách qua hai lần tải
 *     liên tiếp; lượt đồng bộ nền hỏng cũng không xoá danh sách; bộ ảnh vừa tạo
 *     từ một dòng thì dòng đó rời khối ngay.
 *  2. Thuật sĩ "Tạo bộ ảnh mới": tra Lark (GIẢ LẬP route tra-lark — e2e không đọc
 *     Lark thật) → chi nhánh + người chụp tự điền; Lark chưa có người chụp → nhắc
 *     "Bổ sung người chụp trên Lark", vẫn cho chọn tay.
 *
 * Dữ liệu: nền Fixture riêng (chi nhánh + khách "Fixture BB-369 …"), nhân sự thử,
 * dọn theo id. Không đổi `settings` toàn cục (máy chủ e2e có PHEP_THU_TRINH_DUYET
 * nên route không đồng bộ Lark, không ghi mốc).
 * Chạy: `PW_PORT=3369 npx playwright test tests/e2e/bb-369-lark-tu-dien-on-dinh.spec.ts --workers=1`.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import { thuMucAnh } from "./helpers/thu-muc-anh";

const ANH = thuMucAnh("dot17", "bb369");
const password = "Password123!";
const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

test.describe("BB-369", () => {
  test.describe.configure({ timeout: 240_000 });
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let runId = "";
  const staffIds: string[] = [];
  let emailCs = "";
  let emailOwner = "";
  let thoChupId = "";
  let tenTho = "";
  const maDong: string[] = [];

  async function taoNhanSu(vai: string, ten: string, coChiNhanh: boolean) {
    const email = `test_bb369_${vai}_${runId}@demo.babybean.vn`;
    const r = await supa().auth.admin.createUser({ email, password, email_confirm: true });
    let id = r.data.user?.id ?? "";
    if (r.error) {
      // Đo 06/10: máy chủ auth bận (3 đội chạy song song) có lúc ĐÃ tạo tài khoản mà vẫn
      // trả "already registered" — lấy id theo email để afterAll dọn được, không để sót.
      const { rows } = await pg.query(`select id from auth.users where email = $1`, [email]);
      if (!rows[0]) throw r.error;
      id = rows[0].id;
    }
    staffIds.push(id);
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,$4)`, [id, ten, email, vai]);
    if (coChiNhanh) {
      await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, branchId]);
    }
    return { id, email };
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-369");
    branchId = nen.branchId;
    customerId = nen.customerId;
    runId = nen.runId;

    emailCs = (await taoNhanSu("cs", `Fixture BB-369 CSKH ${runId}`, true)).email;
    emailOwner = (await taoNhanSu("owner", `Fixture BB-369 Chủ ${runId}`, false)).email;
    tenTho = `Fixture BB-369 Thợ ${runId}`;
    thoChupId = (await taoNhanSu("photographer", tenTho, true)).id;

    // Ba bản ghi mới cùng MỐC thay_luc — thứ tự vẫn phải cố định giữa các lần tải.
    for (let i = 0; i < 3; i++) {
      const ma = `recFixtureBB369e2e${runId}${i}`;
      maDong.push(ma);
      await pg.query(
        `insert into lark_ban_ghi_moi (lark_record_id, branch_id, ten_khach, so_dien_thoai, goi_chup, ma_hoa_don, chi_nhanh_lark, thay_luc)
         values ($1,$2,$3,'0901000001','Baby 02',$4,'Fixture', '2026-10-06T05:00:00Z')`,
        [ma, branchId, `Fixture BB-369 Mẹ ${i} ${runId}`, `HD_20261006#36${i}`],
      );
    }
  });

  test.afterAll(async () => {
    try {
      await pg.query(`delete from lark_ban_ghi_moi where lark_record_id = any($1::text[])`, [maDong]);
      await pg.query(`delete from staff_branches where staff_id = any($1::uuid[])`, [staffIds]);
      await donNenFixture(pg, { customerIds: [customerId], branchIds: [branchId], staffIds });
    } finally {
      await pg.end();
    }
  });

  async function tenTrongKhoi(page: import("@playwright/test").Page) {
    const khoi = page.getByTestId("ban-ghi-moi-lark");
    // bb-dev dùng chung với 3 đội chạy song song — route đọc pg có lúc chậm tới vài chục giây.
    await expect(khoi.getByTestId("ban-ghi-moi-lark-dong")).toBeVisible({ timeout: 90_000 });
    return khoi.locator("li p.truncate").allTextContents();
  }

  test("1. Bàn làm việc: hai lần tải liên tiếp ra cùng danh sách; đồng bộ nền hỏng không xoá; tạo bộ → dòng rời khối", async ({ page }) => {
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const lan1 = await tenTrongKhoi(page);
    expect(lan1).toHaveLength(3);

    // Lần tải thứ hai: lượt đồng bộ nền (?dongBo=1) HỎNG — danh sách vẫn y nguyên.
    await page.route("**/api/admin/lark-moi?dongBo=1", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    const lan2 = await tenTrongKhoi(page);
    expect(lan2).toEqual(lan1);
    await expect(page.getByTestId("ban-ghi-moi-lark").getByRole("alert")).toContainText("đang hiện danh sách lần trước");
    await page.screenshot({ path: `${ANH}/1-ban-lam-viec-on-dinh.png`, fullPage: false });

    // Tạo bộ ảnh từ dòng thứ hai (như thuật sĩ neo lark_hauky_record_id) → rời khối ngay.
    await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_hauky_record_id)
       values ($1,$2,'Fixture BB-369 Bộ e2e','draft',$3,'https://example.com/x',0,$4)`,
      [branchId, customerId, `SEED_FOLDER_ID_BB369_E2E_${runId}`, maDong[1]],
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await tenTrongKhoi(page)).length, { timeout: 90_000 }).toBe(2);
    expect(await tenTrongKhoi(page)).toEqual(lan1.filter((t) => !t.startsWith("Fixture BB-369 Mẹ 1 ")));
  });

  async function denBuocThongTin(page: import("@playwright/test").Page, dong: Record<string, unknown>) {
    await page.route("**/api/admin/galleries/preview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { folderId: "x", folderName: "Thư mục giả BB-369", fileCount: 3, subfolders: [], sample: [] } }),
      }),
    );
    await page.route("**/api/admin/galleries/tra-lark", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { dong: [dong] } }) }),
    );
    await dangNhapNhanVien(page, emailOwner, password);
    // BB-375 — KHÔNG lấy phản hồi /api/admin/galleries/options làm dấu "đã hydrate": đăng
    // nhập xong vào /admin/galleries, danh sách bộ ảnh ở đó CŨNG gọi route này — phản hồi của
    // trang cũ về trước khi thuật sĩ hydrate, phép thử gõ vào ô của HTML máy chủ, React hydrate
    // dựng lại state rỗng → ô trống, nút "Kiểm tra thư mục" không bao giờ bật (trace 06/10).
    // Gõ lại tới khi chính thuật sĩ nhận chữ (nút bật).
    await page.goto("/admin/galleries/create", { waitUntil: "domcontentloaded" });
    const nutKiem = page.getByRole("button", { name: "Kiểm tra thư mục" });
    await expect(async () => {
      await page.getByPlaceholder("https://drive.google.com/drive/folders/…").fill(
        "https://drive.google.com/drive/folders/FIXTUREBB369folder",
      );
      await expect(nutKiem).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 90_000 });
    await nutKiem.click();
    await expect(page.getByText("Thư mục giả BB-369")).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await page.locator('input[name="maHoaDon"]').fill("HD_20261006#369");
    await page.locator('input[name="soDienThoai"]').fill("0901000001");
    await page.getByRole("button", { name: "Tra Lark" }).click();
    await expect(page.getByText("Thông tin từ Lark")).toBeVisible();
  }

  const dongGia = (goiY: Record<string, unknown>) => ({
    recordId: `recFixtureBB369wiz${runId}`,
    maHoaDon: "HD_20261006#369",
    tenMe: "Nguyễn Thị Mai",
    soDienThoai: "0901000001",
    tenBe: "Bé Na",
    goiChup: "Baby 02",
    ngayChup: "2026-10-04",
    tongFileEdit: 15,
    trangThai: "",
    linkLark: null,
    boAnhDaCo: null,
    chiNhanh: "Fixture",
    photo: goiY.photoLark ?? null,
    goiY,
  });

  test("2. Thuật sĩ: tra Lark → chi nhánh + người chụp tự điền, không phải chọn tay", async ({ page }) => {
    await denBuocThongTin(
      page,
      dongGia({ branchId, photographerId: thoChupId, chiNhanhLark: "Fixture", photoLark: tenTho }),
    );
    // Ô chọn là <select> hoặc ô tìm (combobox + input ẩn cùng `name`) tuỳ số mục.
    const [chonChiNhanh, chonTho] = [page.locator('[name="branchId"]'), page.locator('[name="photographerId"]')];
    await expect(chonChiNhanh).toHaveValue(branchId);
    await expect(chonTho).toHaveValue(thoChupId);
    await expect(page.getByTestId("goi-y-chi-nhanh")).toHaveText("Lấy từ Lark");
    await expect(page.getByTestId("goi-y-nguoi-chup")).toHaveText("Lấy từ Lark");
    await expect(page.getByRole("button", { name: "Tiếp tục" })).toBeEnabled();
    await page.screenshot({ path: `${ANH}/2-thuat-si-tu-dien.png`, fullPage: true });
  });

  test("3. Thuật sĩ: Lark chưa có người chụp → nhắc bổ sung trên Lark, vẫn chọn tay được", async ({ page }) => {
    await denBuocThongTin(page, dongGia({ branchId, photographerId: null, chiNhanhLark: "Fixture", photoLark: null }));
    await expect(page.locator('[name="branchId"]')).toHaveValue(branchId);
    await expect(page.getByTestId("goi-y-nguoi-chup")).toContainText("Bổ sung người chụp trên Lark rồi làm tiếp");
    // Không chặn cứng: vẫn tiếp tục được, và chọn tay được.
    await expect(page.getByRole("button", { name: "Tiếp tục" })).toBeEnabled();
    const oTho = page.locator('[name="photographerId"]');
    if ((await oTho.evaluate((el) => el.tagName)) === "SELECT") await oTho.selectOption(thoChupId);
    else {
      const hop = page.getByRole("combobox", { name: "Photo" });
      await hop.click();
      await hop.fill(tenTho);
      await page.getByRole("option", { name: tenTho }).click();
    }
    await expect(oTho).toHaveValue(thoChupId);
    await page.screenshot({ path: `${ANH}/3-thuat-si-lark-chua-co-nguoi-chup.png`, fullPage: true });
  });

  test("4. Trang khách: bộ tên 'Album · HD_…_12576,HD_…_12772' → nhãn 'Album' + MỘT mã hoá đơn, không tràn", async ({ page }) => {
    const ma = `HD_20261006#369${runId.replace(/\D/g, "").slice(0, 2) || "0"}`;
    await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_contract_code)
       values ($1,$2,$3,'submitted',$4,'https://example.com/x',0,$5)`,
      [branchId, customerId, `Album · ${ma}_12576,${ma}_12772,${ma}_12801`, `SEED_FOLDER_ID_BB369_KH_${runId}`, `${ma}_12576,${ma}_12772,${ma}_12801`],
    );
    await dangNhapNhanVien(page, emailCs, password);
    // BB-375 — trang khách hàng không có lỗi hydration (HTML lồng sai, vd `<p>` bọc `<div>`).
    const loiHydration: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat|cannot be a descendant|cannot contain a nested/i.test(m.text())) {
        loiHydration.push(m.text().slice(0, 300));
      }
    });
    await page.goto(`/admin/customers/${customerId}`, { waitUntil: "domcontentloaded" });
    const dong = page.getByTestId("dong-lich-su-chup").first();
    await expect(dong).toBeVisible({ timeout: 90_000 });
    const nhan = dong.getByTestId("ma-hoa-don-bo-anh").locator("li");
    await expect(nhan).toHaveCount(1);
    await expect(nhan.first()).toHaveText(ma);
    await expect(dong.getByRole("link").first()).toHaveText("Album");
    // Không tràn: khối chữ không đè lên nhãn trạng thái bên phải.
    const hopChu = await dong.locator("div").first().boundingBox();
    const hopNhan = await dong.getByText("Chờ studio xác nhận").boundingBox().catch(() => null);
    if (hopChu && hopNhan && Math.abs(hopChu.y - hopNhan.y) < hopChu.height) {
      expect(hopChu.x + hopChu.width).toBeLessThanOrEqual(hopNhan.x + 1);
    }
    await dong.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${ANH}/4-trang-khach-ma-hoa-don.png`, fullPage: true });
    expect(loiHydration).toEqual([]);
  });
});
