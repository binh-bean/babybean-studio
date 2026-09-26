/**
 * BB-274 — soát bố cục trên mọi màn, điện thoại (390×844) và máy tính (1440×900).
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE/DEV-UI sửa theo phát hiện).
 *
 * Bốn phép đo MÁY (không đoán bằng mắt):
 *  (a) không cuộn ngang toàn trang — scrollWidth so với clientWidth.
 *  (b) tiêu đề/nút/nhãn chip không bị CHỮ TRÀN khỏi khung của chính nó
 *      (scrollWidth phần tử > clientWidth phần tử).
 *  (c) thanh nổi/nút dính đáy không che phần tử tương tác cuối trang khi đã
 *      cuộn tới đáy — dùng `elementFromPoint` tại tâm phần tử (trình duyệt tự
 *      bỏ qua phần tử `pointer-events:none`, đúng cơ chế app dùng cho khung
 *      bọc thanh chọn).
 *  (d) ảnh minh hoạ (`/hanh-trinh/`, `/minh-hoa/`, `/san-pham/`) phủ kín khung
 *      chứa nó — `object-fit: cover|fill` HOẶC tỉ lệ khung khớp tỉ lệ ảnh gốc.
 *
 * Dữ liệu: chỉ tạo "Fixture BB-274 …", xoá sạch ở afterAll — theo mẫu
 * `tests/e2e/bb-272-toc-do.spec.ts` (bộ ảnh khách) và
 * `tests/e2e/bb-141-admin-galleries.spec.ts` (tài khoản nhân sự thử).
 *
 * Ảnh chụp: lưu vào `test-results/bb-274/` (đã gitignore, không vào public/
 * hay tests/) để TỰ XEM so với `docs/thiet-ke/*.webp` — không phải bằng
 * chứng nộp kèm.
 */
import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { test as pwTest, expect as pwExpect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-274 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

const THU_MUC_ANH = "test-results/bb-274";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

function tenAnh(tenMan: string, kichThuoc: { width: number; height: number }) {
  const an = kichThuoc.width === DIEN_THOAI.width ? "dien-thoai" : "may-tinh";
  return `${THU_MUC_ANH}/${tenMan.replace(/[^a-z0-9-]+/gi, "-")}-${an}.png`;
}

/** (a) không cuộn ngang toàn trang. */
async function kiemCuonNgang(page: Page): Promise<string[]> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1) {
    return [`Cuộn ngang: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`];
  }
  return [];
}

/** (b) tiêu đề/nút/nhãn chip không bị chữ tràn khỏi khung của chính nó. */
async function kiemChuTran(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const loi: string[] = [];
    const selectors = ["h1", "h2", "h3", "button", '[role="button"]', "a.rounded-full", "[class*='badge']"];
    const seen = new Set<Element>();
    for (const sel of selectors) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue; // ẩn hoặc rỗng
        if (r.top > window.innerHeight || r.bottom < 0) continue; // ngoài khung nhìn
        const he = el as HTMLElement;
        if (he.scrollWidth > he.clientWidth + 2 && he.clientWidth > 0) {
          const text = (he.textContent || "").trim().slice(0, 40);
          loi.push(
            `Chữ tràn trong <${el.tagName.toLowerCase()}> "${text}": scrollWidth=${he.scrollWidth} > clientWidth=${he.clientWidth}`,
          );
        }
      }
    }
    return loi;
  });
}

/** (c) thanh nổi/nút dính đáy không che phần tử tương tác cuối trang. */
async function kiemTheDinhDayCheNut(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const loi: string[] = [];
    const interactive = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]'),
    );
    for (const el of interactive) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      // Chỉ xét phần tử đang thật sự nằm trong khung nhìn hiện tại.
      if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
      const tren = document.elementFromPoint(cx, cy);
      if (!tren) continue;
      if (tren === el || el.contains(tren) || tren.contains(el)) continue;
      // Bị phần tử khác che ở đúng tâm — kiểm phần tử che có phải đứng yên ở
      // đáy màn (fixed/sticky) hay không, để tránh báo nhầm lớp phủ tạm thời.
      const csTren = getComputedStyle(tren);
      if (csTren.position !== "fixed" && csTren.position !== "sticky") continue;
      const nhan = (el.textContent || (el as HTMLElement).getAttribute?.("aria-label") || "").trim().slice(0, 40);
      loi.push(
        `Phần tử tương tác "<${el.tagName.toLowerCase()}> ${nhan}" bị che bởi <${tren.tagName.toLowerCase()} class="${tren.className.toString().slice(0, 60)}">`,
      );
    }
    return loi;
  });
}

/** (d) ảnh minh hoạ phủ kín khung chứa nó. */
async function kiemAnhPhuKin(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const loi: string[] = [];
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => {
      const src = img.currentSrc || img.src || "";
      return /\/(hanh-trinh|minh-hoa|san-pham)\//.test(src);
    });
    for (const img of imgs) {
      const r = img.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
      const cs = getComputedStyle(img);
      if (cs.objectFit === "cover" || cs.objectFit === "fill") continue;
      if (!img.complete || img.naturalWidth === 0) continue;
      const tiLeKhung = r.width / r.height;
      const tiLeAnh = img.naturalWidth / img.naturalHeight;
      const lech = Math.abs(tiLeKhung - tiLeAnh) / tiLeKhung;
      if (lech > 0.06) {
        loi.push(
          `Ảnh "${(img.currentSrc || img.src).split("/").pop()}" không phủ kín khung: object-fit="${cs.objectFit}", ` +
            `tỉ lệ khung=${tiLeKhung.toFixed(2)} vs tỉ lệ ảnh=${tiLeAnh.toFixed(2)} (lệch ${(lech * 100).toFixed(0)}%)`,
        );
      }
    }
    return loi;
  });
}

async function kiemBoCuc(
  page: Page,
  tenMan: string,
  kichThuoc: { width: number; height: number },
): Promise<string[]> {
  await page.setViewportSize(kichThuoc);
  await page.waitForTimeout(400); // ổn định layout/ảnh sau khi đổi viewport

  const loiCuonNgang = await kiemCuonNgang(page);
  const loiChuTran = await kiemChuTran(page);
  const loiAnh = await kiemAnhPhuKin(page);

  await page.screenshot({ path: tenAnh(`${tenMan}-truoc-cuon`, kichThuoc), fullPage: false });

  const loiCheNut = await kiemTheDinhDayCheNut(page);
  await page.screenshot({ path: tenAnh(`${tenMan}-cuoi-trang`, kichThuoc), fullPage: false });

  return [...loiCuonNgang, ...loiChuTran, ...loiAnh, ...loiCheNut];
}

// ---------------------------------------------------------------------------
// Phần 1: màn khách /g/[token] — dùng fixture "IP riêng mỗi ca" vì route mở
// link bị giới hạn theo IP (xem helpers/ip-rieng-moi-ca.ts).
// ---------------------------------------------------------------------------
ownIpTest.describe("BB-274: bố cục màn khách", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  ownIpTest.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(`delete from galleries where title like 'Fixture BB-274%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-274%' and created_at < now() - interval '6 hours'`);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',30,10,50000,true) returning id`,
      [branchId, customerId, NHAN, `fixture-bb274-${runId}`],
    );
    galleryId = g[0].id;

    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb274-' || $2 || '-' || x, 'BB274_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 30) as x`,
      [galleryId, runId],
    );

    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  ownIpTest.afterAll(async () => {
    if (pg) {
      if (galleryId) await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await pg.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  for (const [tenKichThuoc, kichThuoc] of [
    ["dien-thoai", DIEN_THOAI],
    ["may-tinh", MAY_TINH],
  ] as const) {
    ownIpTest(`Màn khách bộ ảnh — ${tenKichThuoc}`, async ({ page }) => {
      await page.goto(`/g/${maLink}`);
      const anhBia = page.locator('img[fetchpriority="high"]');
      await anhBia.first().waitFor({ state: "visible", timeout: 30000 });

      const loi = await kiemBoCuc(page, "man-khach-bo-anh", kichThuoc);
      ownIpExpect.soft(loi, `Lỗi bố cục màn khách (${tenKichThuoc}):\n${loi.join("\n")}`).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Phần 2: màn đăng nhập + admin — dùng tài khoản nhân sự thử tạo riêng.
// ---------------------------------------------------------------------------
pwTest.describe("BB-274: bố cục màn đăng nhập & quản trị", () => {
  let pgAdmin: Client;
  let userId = "";
  const email = `test_bb274_${runId}@demo.babybean.vn`;
  const password = "Password123!";

  let branchId = "";
  let customerId = "";
  let galleryId = "";

  pwTest.beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await adminAuthClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pgAdmin = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgAdmin.connect();
    await pgAdmin.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      userId,
      `Fixture BB-274 Nhân sự ${runId}`,
      email,
    ]);

    const { rows: br } = await pgAdmin.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pgAdmin.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách quản trị`],
    );
    customerId = kh[0].id;
    const { rows: g } = await pgAdmin.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',12,10,50000,true) returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh quản trị`, `fixture-bb274-admin-${runId}`],
    );
    galleryId = g[0].id;
    await pgAdmin.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb274-admin-' || $2 || '-' || x, 'BB274A_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, 12) as x`,
      [galleryId, runId],
    );
  });

  pwTest.afterAll(async () => {
    if (pgAdmin) {
      if (galleryId) await pgAdmin.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from photos where gallery_id = $1", [galleryId]);
      if (galleryId) await pgAdmin.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await pgAdmin.query("delete from customers where id = $1", [customerId]);
      if (userId) await pgAdmin.query("delete from staff_profiles where id = $1", [userId]);
      await pgAdmin.end();
    }
    if (userId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const adminAuthClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await adminAuthClient.auth.admin.deleteUser(userId);
    }
  });

  for (const [tenKichThuoc, kichThuoc] of [
    ["dien-thoai", DIEN_THOAI],
    ["may-tinh", MAY_TINH],
  ] as const) {
    pwTest(`Màn đăng nhập — ${tenKichThuoc}`, async ({ page }) => {
      await page.setViewportSize(kichThuoc);
      await page.goto("/login");
      await page.getByLabel("Tên tài khoản hoặc email").waitFor({ state: "visible" });
      const loi = await kiemBoCuc(page, "dang-nhap", kichThuoc);
      pwExpect.soft(loi, `Lỗi bố cục màn đăng nhập (${tenKichThuoc}):\n${loi.join("\n")}`).toEqual([]);
    });
  }

  const manQuanTri: Array<[string, string]> = [
    ["bang-dieu-khien", "/admin"],
    ["danh-sach-bo-anh", "/admin/galleries"],
    ["tao-bo-anh", "/admin/galleries/create"],
    ["chi-tiet-bo-anh", ""], // gán path bằng galleryId lúc chạy
    ["khach-hang", "/admin/customers"],
    ["nhan-su", "/admin/staff"],
    ["chi-nhanh", "/admin/branches"],
    ["vai-tro", "/admin/roles"],
    ["cai-dat", "/admin/settings"],
    ["bao-cao", "/admin/bao-cao"],
    ["bao-cao-link-sap-het-han", "/admin/reports/link-sap-het-han"],
    ["bao-cao-loi-dong-bo", "/admin/reports/loi-dong-bo"],
    ["bao-cao-nhat-ky", "/admin/reports/nhat-ky"],
    ["bao-cao-vuot-han-muc", "/admin/reports/over-quota"],
  ];

  for (const [tenKichThuoc, kichThuoc] of [
    ["dien-thoai", DIEN_THOAI],
    ["may-tinh", MAY_TINH],
  ] as const) {
    pwTest(`Màn quản trị — ${tenKichThuoc}`, async ({ page }) => {
      // Nhiều màn phải đi qua tuần tự trong CÙNG một phiên đăng nhập (đăng
      // nhập bị giới hạn tốc độ theo IP — không đăng nhập lại mỗi màn), nên
      // cần thời gian rộng hơn mặc định 60s.
      pwTest.setTimeout(300_000);

      await dangNhapNhanVien(page, email, password);
      await page.setViewportSize(kichThuoc);

      const toanBoLoi: string[] = [];
      for (const [ten, pathCoDinh] of manQuanTri) {
        const path = ten === "chi-tiet-bo-anh" ? `/admin/galleries/${galleryId}` : pathCoDinh;
        await page.goto(path, { waitUntil: "domcontentloaded" });
        // Chờ trang ổn định: hết trạng thái tải (spinner) hoặc nội dung chính hiện ra.
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(400);

        // Tên màn không bao giờ được là mã uuid của đường dẫn.
        if (ten === "chi-tiet-bo-anh") {
          await pwExpect(page.locator("header.sticky")).toContainText("Chi tiết bộ ảnh");
          await pwExpect(page.locator("header.sticky")).not.toContainText(galleryId);
        }

        const loi = await kiemBoCuc(page, ten, kichThuoc);
        if (loi.length > 0) {
          toanBoLoi.push(`— Màn "${ten}" (${path}):\n  ${loi.join("\n  ")}`);
        }
      }

      pwExpect
        .soft(toanBoLoi, `Lỗi bố cục màn quản trị (${tenKichThuoc}):\n${toanBoLoi.join("\n")}`)
        .toEqual([]);
    });
  }
});
