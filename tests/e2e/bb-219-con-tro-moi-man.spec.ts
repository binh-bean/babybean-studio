/**
 * BB-219 — Dò con trỏ bàn tay trên MỌI màn, bằng trình duyệt thật.
 *
 * OWNER: DEV-FE. Task BB-219 (docs/20-phan-viec-dot-1.md, đợt 2).
 *
 * ---------------------------------------------------------------------------
 * Vì sao phép thử quét mã (tests/unit/con-tro-ban-tay.test.ts) không đủ
 * ---------------------------------------------------------------------------
 * Chủ studio báo HAI LẦN (22/09, 24/09) rằng nhiều chỗ bấm được không hiện bàn
 * tay, "cả màn khách và quản trị", nhưng không nhớ chỗ nào. Phép thử quét mã
 * chỉ đọc JSX tĩnh trong src/app và src/components — không thấy được:
 *   - thành phần bên thứ ba (thư viện ngoài, không phải .tsx của dự án),
 *   - lớp CSS đè nhau lúc chạy thật (một class sau ghi đè cursor của class
 *     trước, tsc/eslint không báo),
 *   - bất cứ thứ gì chỉ xuất hiện khi tương tác (menu mở ra, hộp thoại, thẻ
 *     bật lên khi hover).
 *
 * Phép thử này đăng nhập THẬT, đi qua MỌI trang quản trị (liệt kê tự động từ
 * hệ thống tệp `src/app/(admin)/admin/**\/page.tsx`, không chép tay danh sách
 * — trang mới thêm sau này tự động được dò), cộng trang gốc "/" và màn khách
 * của một bộ ảnh thử. Ở mỗi trang, một đoạn mã chạy TRONG trình duyệt tự dò
 * qua props React thật (khoá `__reactProps$...` mà React 19 gắn lên chính nút
 * DOM) — không đoán bằng class hay thẻ, mà hỏi thẳng "phần tử này có onClick
 * không" như React đang biết.
 *
 * KIỂM NGƯỢC (chạy tay trước khi nộp, kết quả dán vào commit):
 *   Gỡ "cursor-pointer" khỏi một phần tử có onClick thật ở một trang quản trị
 *   (hoặc đổi tạm một <button> thành <div onClick>) → phép thử này phải ĐỎ,
 *   nêu đúng trang và phần tử. Xem chi tiết ở cuối tệp.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-219 ${runId}`;
const email = `test_bb219_${runId}@demo.babybean.vn`;
const password = "Password123!";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const ROOT = path.resolve(__dirname, "../..");

/**
 * Liệt kê tự động MỌI trang quản trị từ hệ thống tệp — không chép tay, để
 * trang mới thêm sau này tự động được dò theo đúng yêu cầu đề bài BB-219.
 * `[id]` được thay bằng id bộ ảnh thử ở nơi gọi.
 */
function lietKeTrangQuanTri(): string[] {
  const goc = path.join(ROOT, "src/app/(admin)/admin");
  const routes: string[] = [];
  function di(dir: string, tienTo: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        di(path.join(dir, entry.name), `${tienTo}/${entry.name}`);
      } else if (entry.name === "page.tsx") {
        routes.push(tienTo);
      }
    }
  }
  di(goc, "/admin");
  return routes.sort();
}

interface ViPham {
  trang: string;
  the: string;
  lop: string;
  chu: string;
  cursor: string;
  ghiChu?: string;
}

/**
 * Đoạn dò chạy TRONG trình duyệt (page.evaluate) — xem mô tả đầu tệp.
 * Trả về danh sách vi phạm của MỘT trang, trang được ghi lại ở phía Node.
 */
function taoDoanDo() {
  return () => {
    const ketQua: {
      the: string;
      lop: string;
      chu: string;
      cursor: string;
    }[] = [];

    const tatCa = document.querySelectorAll<HTMLElement>("*");
    for (const el of Array.from(tatCa)) {
      // 1. Tìm props React thật trên chính nút DOM — không đoán bằng class.
      const propsKey = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
      if (!propsKey) continue;
      const props = (el as unknown as Record<string, Record<string, unknown>>)[propsKey];
      if (!props) continue;

      const handler = (props.onClick ?? props.onMouseDown ?? props.onPointerDown) as
        | ((...a: unknown[]) => unknown)
        | undefined;
      if (typeof handler !== "function") continue;

      // 2. Bỏ qua: phần tử vô hiệu.
      const disabled =
        (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true";
      if (disabled) continue;

      // 3. Bỏ qua: cố ý, có lý do ghi trong mã (data-con-tro).
      if (el.hasAttribute("data-con-tro")) continue;

      // 4. Bỏ qua: onClick chỉ gọi stopPropagation (không thật sự "bấm được gì").
      const thanHam = handler.toString().replace(/\s+/g, " ").trim();
      const chiChanNoi =
        /^\(?[\w$]*\)?\s*=>\s*\{?\s*[\w$]+\.stopPropagation\(\);?\s*\}?$/.test(thanHam) ||
        /^function\s*\(?[\w$]*\)?\s*\{\s*[\w$]+\.stopPropagation\(\);?\s*\}$/.test(thanHam);
      if (chiChanNoi) continue;

      // 5. Bỏ qua: ô nhập chữ — con trỏ chữ (text caret) là ĐÚNG ở đây.
      const the = el.tagName.toLowerCase();
      const kieuInput = (el as HTMLInputElement).type;
      const laOChu =
        (the === "input" &&
          !["button", "submit", "checkbox", "radio", "file", "range", "color", "image", "reset"].includes(
            kieuInput,
          )) ||
        the === "textarea" ||
        el.isContentEditable;
      if (laOChu) continue;

      // 6. Bỏ qua: phần tử không hiển thị thật (kích thước 0 / display:none).
      const kieu = getComputedStyle(el);
      const hcn = el.getBoundingClientRect();
      if (hcn.width === 0 || hcn.height === 0 || kieu.display === "none" || kieu.visibility === "hidden") {
        continue;
      }

      // 7. Phần tử bấm được thật sự — con trỏ PHẢI là bàn tay.
      if (kieu.cursor !== "pointer") {
        ketQua.push({
          the,
          lop: typeof el.className === "string" ? el.className.slice(0, 200) : "",
          chu: (el.textContent ?? "").trim().slice(0, 60),
          cursor: kieu.cursor,
        });
      }
    }
    return ketQua;
  };
}

async function choTrangOnDinh(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  // Vài màn có vòng xoay tải (.animate-spin) — chờ nó biến mất, không chặn
  // cứng nếu màn không dùng vòng xoay này.
  await page
    .locator(".animate-spin")
    .first()
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(400); // React ổn định sau khi dữ liệu về.
}

async function doMotTrang(page: Page, nhan: string, viPhamAll: ViPham[], ghiChu?: string) {
  const doanDo = taoDoanDo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ds = await page.evaluate(doanDo as any);
  for (const v of ds as { the: string; lop: string; chu: string; cursor: string }[]) {
    viPhamAll.push({ trang: nhan, the: v.the, lop: v.lop, chu: v.chu, cursor: v.cursor, ghiChu });
  }
}

test.describe("BB-219: con trỏ bàn tay trên mọi màn", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLinkKhach = "";
  const trangDaDo: string[] = [];
  const lopNoiDaMo: string[] = [];

  function adminAuth() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    // Rác của lần chạy cũ hơn một giờ.
    await pg.query(`delete from galleries where title like 'Fixture BB-219%' and created_at < now() - interval '1 hour'`);
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-219%' and created_at < now() - interval '1 hour'`,
    );

    // --- nhân viên quyền cao nhất (owner) — cần dò MỌI trang, kể cả /admin/staff, /admin/roles ---
    const { data, error } = await adminAuth().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      userId,
      `${NHAN} Nhân viên`,
      email,
    ]);

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0900000219') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',2,5,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb219-${runId}`],
    );
    galleryId = g[0].id;

    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',1,'active'), ($1,$4,$5,'image/jpeg',2,'active')`,
      [galleryId, `bb219-${runId}-1.jpg`, "BB219_0001.jpg", `bb219-${runId}-2.jpg`, "BB219_0002.jpg"],
    );

    // Link chủ bộ ảnh gửi khách — màn khách BB-219 cũng phải dò.
    maLinkKhach = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner','Fixture BB-219','active')`,
      [galleryId, sha256(maLinkKhach), maLinkKhach.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (galleryId) {
      await pg.query("delete from share_links where gallery_id = $1", [galleryId]);
      await pg.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await pg.query("delete from photos where gallery_id = $1", [galleryId]);
      await pg.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (userId) {
      await pg.query("delete from staff_profiles where id = $1", [userId]);
      await adminAuth().auth.admin.deleteUser(userId);
    }
    await pg.end();
    console.info("[BB-219] Trang đã dò:", trangDaDo.join(", "));
    console.info("[BB-219] Lớp nổi đã mở thêm:", lopNoiDaMo.join(", ") || "(không có)");
  });

  test("mọi phần tử bấm được trên mọi màn đều hiện bàn tay", async ({ page }) => {
    test.setTimeout(180_000);
    const viPham: ViPham[] = [];

    // ── 1. Trang gốc "/" ────────────────────────────────────────────────────
    await page.goto("/");
    await choTrangOnDinh(page);
    await doMotTrang(page, "/", viPham);
    trangDaDo.push("/");

    // ── 2. Màn khách — link chủ bộ ảnh thử ─────────────────────────────────
    await page.goto(`/g/${maLinkKhach}`);
    await page
      .locator('img[src*="/api/img/"]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
    await choTrangOnDinh(page);
    await doMotTrang(page, `/g/[token]`, viPham);
    trangDaDo.push("/g/[token] (màn khách bộ ảnh thử)");

    // ── 3. Đăng nhập thật ────────────────────────────────────────────────────
    await page.goto("/login");
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    await page.waitForURL("**/admin**");

    // ── 4. Mọi trang quản trị — liệt kê tự động từ hệ thống tệp ────────────
    const trangQuanTri = lietKeTrangQuanTri();
    expect(trangQuanTri.length).toBeGreaterThan(5); // bằng chứng liệt kê thật, không rỗng.

    for (const route of trangQuanTri) {
      const routeThat = route.replace("[id]", galleryId);
      await page.goto(routeThat);
      await choTrangOnDinh(page);
      await doMotTrang(page, routeThat, viPham);
      trangDaDo.push(routeThat);

      // ── Mở thêm lớp nổi hay gặp (hộp thoại "Thêm.../Tạo...") nếu có ──────
      // Best-effort: bấm nút "Thêm..."/"Tạo..." đầu tiên đang hiện, dò tiếp
      // nội dung hộp thoại vừa bật lên, rồi đóng lại bằng Escape.
      const nutMo = page.getByRole("button", { name: /^(Thêm|Tạo)\s/ }).first();
      if (await nutMo.isVisible().catch(() => false)) {
        await nutMo.click().catch(() => {});
        await page.waitForTimeout(300);
        const moDuocDialog = await page
          .getByRole("dialog")
          .first()
          .isVisible()
          .catch(() => false);
        await doMotTrang(page, `${routeThat} (mở "${await nutMo.textContent()}")`, viPham);
        lopNoiDaMo.push(`${routeThat}: bấm nút "${await nutMo.textContent()}"${moDuocDialog ? " → hộp thoại" : " → khối mở rộng"}`);
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    // ── 5. In danh sách nếu có vi phạm — phép thử ĐỎ ───────────────────────
    if (viPham.length > 0) {
      const bang = viPham
        .map((v) => `${v.trang}\t<${v.the}>\tclass="${v.lop}"\tchữ="${v.chu}"\tcursor=${v.cursor}`)
        .join("\n");
      throw new Error(`${viPham.length} chỗ bấm được nhưng KHÔNG hiện bàn tay:\n${bang}`);
    }

    expect(viPham).toEqual([]);
  });
});

/**
 * ---------------------------------------------------------------------------
 * KIỂM NGƯỢC — chạy tay 24/09/2026
 * ---------------------------------------------------------------------------
 * (Kết quả thật của lượt kiểm ngược được dán vào thông điệp commit, không
 * phải ở đây — tệp mã không phải chỗ ghi log chạy tay.)
 */
