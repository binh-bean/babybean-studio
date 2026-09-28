/**
 * BB-311 (P1) — nút "Sao chép link" ở danh sách quản trị PHẢI chép link
 * KHÁCH (`/g/<token>`), không phải link quản trị (`/admin/galleries/<id>`).
 *
 * Người đánh giá vận hành độc lập phát hiện lỗi này bằng clipboard THẬT, nên
 * phép thử này cũng đo clipboard thật sau khi bấm nút — không đọc mã nguồn
 * `.tsx` ra khớp chuỗi (AGENTS.md §5a điều cấm #1).
 *
 * Chạy riêng (không chạy cả suite, tránh đụng cổng với agent khác):
 *   PW_PORT=3167 npx playwright test tests/e2e/bb-311-copy-link-khach.spec.ts --workers=1
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
// `ma-link-loi.ts` KHÔNG có `server-only` (đọc chú thích đầu file đó) — chính
// vì thế script/phép thử ngoài Next nạp được để dựng đúng bản mã hoá mà route
// thật sẽ giải mã lại, không tự chế một cách mã hoá khác cho phép thử.
import { maHoaMaLink } from "../../src/lib/auth/ma-link-loi";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb311_${runId}@demo.babybean.vn`;
const password = "Password123!";
const tenKhach = `Fixture BB-311 ${runId}`;
let userId = "";
let customerId = "";
let galleryId = "";
/** Mã link chữ rõ — CHỈ tồn tại trong bộ nhớ phép thử để đối chiếu kết quả,
 * không log, không commit. Cơ sở dữ liệu chỉ nhận bản băm và bản mã hoá. */
let ma = "";

const bam = (s: string) => createHash("sha256").update(s).digest("hex");

function adminAuth() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("BB-311: Sao chép link ở danh sách chép ĐÚNG link khách", () => {
  let pg: Client;

  test.beforeAll(async () => {
    const { data, error } = await adminAuth().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    // 'owner' có galleries:share + system:superuser (0052/0053) — không cần
    // gán chi nhánh riêng, đúng khuôn mẫu bb-186/bb-141.
    await pg.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [userId, `Test BB311 ${runId}`, email],
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: cu } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000311') returning id`,
      [br[0].id, tenKhach],
    );
    customerId = cu[0].id;

    // status='ready' (không phải in_review/submitted/in_retouch) để nút mặc
    // định của LamNhanh là "Sao chép link", đúng nút đang sửa.
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',3) returning id`,
      [br[0].id, customerId, `Fixture BB-311 bo anh ${runId}`, `fx-bb311-e2e-${Date.now()}`],
    );
    galleryId = g[0].id;

    ma = randomBytes(32).toString("base64url");
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-311','active') returning id`,
      [galleryId, bam(ma), ma.slice(0, 6)],
    );
    const shareLinkId = sl[0].id as string;

    // Bản mã hoá thuận nghịch — đúng khuôn mẫu bảng `share_link_ma` mà route
    // thật (POST .../share-link) ghi, và route mới (GET .../link-khach) đọc
    // lại. KHÔNG lưu mã gốc ở đâu trong cơ sở dữ liệu.
    await pg.query(`insert into share_link_ma (share_link_id, ma_hoa) values ($1,$2)`, [
      shareLinkId,
      maHoaMaLink(ma),
    ]);
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query(
        "delete from share_link_ma where share_link_id in (select id from share_links where gallery_id = $1)",
        [galleryId],
      );
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (userId) {
      await adminAuth().auth.admin.deleteUser(userId);
      await pg.query("delete from staff_profiles where id = $1", [userId]);
    }
    await pg.end();
  });

  test("bấm 'Sao chép link' chép /g/<token>, không phải /admin/galleries/<id>", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    await dangNhapNhanVien(page, email, password);

    // ≥ lg: ô tìm kiếm luôn hiện sẵn (xem gallery-filters.tsx), khỏi phải bấm
    // nút kính lúp trước — cùng cách bb-292-tranh.spec.ts đã làm.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/galleries");

    const oTim = page.getByPlaceholder("Tìm theo tên bé, tên khách, số điện thoại…");

    // Chờ ĐÚNG lời gọi lọc theo `tenKhach` trả lời rồi mới thao tác tiếp —
    // trước khi có phản hồi, bảng còn hiện TOÀN BỘ danh sách chưa lọc (nhiều
    // dòng đều có nút "Sao chép link" trùng tên, `getByRole` sẽ ném lỗi
    // strict-mode nếu bấm sớm).
    const choLocLoc = page.waitForResponse(
      (res) => res.url().includes("/api/admin/galleries?") && res.url().includes(encodeURIComponent(tenKhach).replace(/%20/g, "+")),
      { timeout: 20_000 },
    );
    await oTim.fill(tenKhach);
    await choLocLoc;

    // Khoanh đúng dòng của bộ ảnh Fixture (tên khách chỉ khớp một dòng sau
    // khi đã lọc), rồi mới lấy nút Copy TRONG dòng đó — không dựa vào tên nút
    // trần trên cả trang.
    const dong = page.getByRole("row", { name: tenKhach });
    await expect(dong, "phải lọc ra đúng MỘT dòng — bộ ảnh Fixture vừa tạo").toBeVisible({
      timeout: 15_000,
    });
    const nutChep = dong.getByRole("button", { name: "Sao chép link" });
    await expect(nutChep).toBeVisible();
    await nutChep.click();

    // Đo GIÁ TRỊ CLIPBOARD THẬT sau khi API trả lời — không đọc mã nguồn,
    // không khớp chuỗi có trong mọi HTML.
    await expect
      .poll(async () => page.evaluate(() => navigator.clipboard.readText()), {
        timeout: 10_000,
      })
      .not.toBe("");

    const daChep = await page.evaluate(() => navigator.clipboard.readText());

    let url: URL;
    try {
      url = new URL(daChep);
    } catch {
      throw new Error(`Clipboard không phải một URL hợp lệ: "${daChep}"`);
    }

    // Ca chính: PHẢI là link khách /g/<token đúng>, không phải bất cứ gì
    // khác (đúng lỗi gốc: bản cũ chép link quản trị).
    expect(url.pathname, "clipboard phải là link khách /g/<token>, không phải link quản trị").toBe(
      `/g/${ma}`,
    );
    expect(daChep, "clipboard KHÔNG được chứa đường quản trị").not.toContain("/admin/galleries/");
  });
});
