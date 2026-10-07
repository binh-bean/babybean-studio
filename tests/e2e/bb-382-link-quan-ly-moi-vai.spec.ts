/**
 * BB-382 — cột "Link quản lý bộ ảnh" bên Lark (`/admin/galleries/<id>`) bấm bởi nhân viên
 * MỌI VAI. Mỗi vai đang có trên bb-dev (đọc bảng `roles` lúc chạy — vai động) × 3 tình huống:
 *   (a) chưa đăng nhập → /login?next=<đúng đường dẫn> → đăng nhập xong QUAY LẠI đúng bộ;
 *   (b) đủ quyền + đúng chi nhánh → thấy chi tiết, chỉ thấy nút vai mình dùng được;
 *   (c) không đủ quyền / khác chi nhánh / CTV chưa được giao → màn báo tiếng Việt, không lộ dữ liệu.
 * Thêm: link cũ theo MÃ HOÁ ĐƠN (có '#'), và route GET chi tiết không còn trả dữ liệu cho CTV
 * chưa được giao; tài khoản đã khoá thì quay về /login mà vẫn giữ đúng id.
 *
 * Dữ liệu: nền Fixture (2 chi nhánh riêng) + bộ ảnh "Fixture BB-382 …" + một vai thử "Fixture
 * BB-382 Không quyền xem" + một nhân sự auth Fixture cho MỖI vai. Dọn theo id ở afterAll.
 * Vai thật chỉ được ĐỌC (mượn id vai để gán cho nhân sự Fixture).
 *
 * Chạy: PW_PORT=3382 npx playwright test tests/e2e/bb-382-link-quan-ly-moi-vai.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dungNenFixture, donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { thuMucAnh } from "./helpers/thu-muc-anh";

const ANH = thuMucAnh("dot17", "bb382");
fs.mkdirSync(ANH, { recursive: true });

test.setTimeout(180_000);

const run = randomBytes(4).toString("hex");
const MAT_KHAU = `Bb382-${run}-Pass9`;
const VAI_KHONG_XEM = `Fixture BB-382 Không quyền xem ${run}`;
const MA_HOA_DON = `FXBB382_${run}#1`;
const GHI_CHU = `Fixture ghi chú BB-382 ${run}`;

/** Vai đang có trên bb-dev lúc viết phép thử (06/10/2026) + vai thử không có `galleries:read`. */
const DANH_SACH_VAI = [
  "owner",
  "admin",
  "branch_manager",
  "cs",
  "Cskh",
  "Photo",
  "photographer",
  "retoucher",
  "accountant",
  "viewer",
  "photoshop_ctv",
  "__khong_xem__",
] as const;
const ENUM_VAI = new Set(["owner", "admin", "branch_manager", "cs", "photographer", "retoucher", "accountant", "viewer", "photoshop_ctv"]);

interface Vai {
  id: string;
  name: string;
  permissions: string[];
  is_system: boolean;
}

let pg: Client;
let nenA: NenFixture;
let nenB: NenFixture;
let vaiKhongXemId = "";
const vaiTheoTen = new Map<string, Vai>();
const nhanSu = new Map<string, { id: string; email: string }>();
const bo = { A: "", A2: "", B: "", ctv: "" };
let tenVaiThatTrenBbDev: string[] = [];

const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function taoBo(branchId: string, customerId: string, ten: string, opts: { editorId?: string; maHoaDon?: string } = {}) {
  const { rows } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, submitted_at, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled, lark_contract_codes, editor_id)
     values ($1,$2,$3,'submitted',now(),$4,'https://example.com/bb382',3,5,20000,false,$5,$6) returning id`,
    [branchId, customerId, `Fixture BB-382 Bộ ${ten} ${run}`, `fixture-bb382-${run}-${ten}`, opts.maHoaDon ? [opts.maHoaDon] : [], opts.editorId ?? null],
  );
  const id = rows[0].id as string;
  const anh: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const { rows: p } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
      [id, `bb382-${run}-${ten}-${i}`, `FX382_${ten}_${i}.jpg`, i],
    );
    anh.push(p[0].id as string);
  }
  const ma = randomBytes(32).toString("base64url");
  const { rows: l } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
     values ($1, encode(sha256($2::bytea),'hex'), $3, 'owner', 'active') returning id`,
    [id, ma, ma.slice(0, 6)],
  );
  const { rows: s } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,$3,true) returning id`,
    [id, l[0].id, `Fixture BB-382 ${ten}`],
  );
  await pg.query(
    `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index, retouch_note)
     values ($1,$2,$3,'selected',1,$4), ($1,$5,$3,'selected',2,null)`,
    [s[0].id, anh[0], id, GHI_CHU, anh[1]],
  );
  return id;
}

const productIds: string[] = [];

test.beforeAll(async () => {
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  nenA = await dungNenFixture(pg, "BB382A");
  nenB = await dungNenFixture(pg, "BB382B");

  // Vai động: đọc bảng `roles` (chỉ đọc vai thật).
  const { rows: vai } = await pg.query(`select id, name, permissions, is_system from roles where name not like 'Fixture %'`);
  tenVaiThatTrenBbDev = vai.map((v: Vai) => v.name);
  for (const v of vai as Vai[]) vaiTheoTen.set(v.name, v);
  // Vai thử KHÔNG có `galleries:read` (bộ quyền không rỗng — rỗng thì requireStaff lùi về vai theo tên).
  const { rows: vk } = await pg.query(
    `insert into roles (name, permissions, is_system) values ($1, '{branch:dashboard}', false) returning id, name, permissions, is_system`,
    [VAI_KHONG_XEM],
  );
  vaiKhongXemId = vk[0].id;
  vaiTheoTen.set("__khong_xem__", vk[0]);

  // Sản phẩm thử (không bán) cho thành phần hợp đồng.
  const { rows: sp } = await pg.query(
    `insert into products (name, kind, list_price, is_active) values ($1,'edited_photo',50000,false) returning id`,
    [`Fixture BB-382 Edit file ${run}`],
  );
  productIds.push(sp[0].id);

  // Nhân sự Fixture cho từng vai, gán chi nhánh A.
  for (const khoa of DANH_SACH_VAI) {
    const v = vaiTheoTen.get(khoa);
    if (!v) continue;
    const email = `fixture.bb382.${khoa.replace(/[^a-z0-9]/gi, "").toLowerCase()}.${run}@demo.babybean.vn`;
    const r = await supa().auth.admin.createUser({ email, password: MAT_KHAU, email_confirm: true });
    if (r.error) throw r.error;
    const id = r.data.user.id;
    nhanSu.set(khoa, { id, email });
    const roleEnum = ENUM_VAI.has(v.name) ? v.name : "viewer";
    await pg.query(`insert into staff_profiles (id, full_name, email, role, role_id) values ($1,$2,$3,$4,$5)`, [
      id,
      `Fixture BB-382 ${khoa} ${run}`,
      email,
      roleEnum,
      v.id,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, nenA.branchId]);
  }
  // Tài khoản đã khoá (đăng nhập Supabase được, nhưng requireStaff từ chối) — canh `next` của trang.
  {
    const email = `fixture.bb382.dakhoa.${run}@demo.babybean.vn`;
    const r = await supa().auth.admin.createUser({ email, password: MAT_KHAU, email_confirm: true });
    if (r.error) throw r.error;
    nhanSu.set("__da_khoa__", { id: r.data.user.id, email });
    await pg.query(`insert into staff_profiles (id, full_name, email, role, is_active) values ($1,$2,$3,'cs',false)`, [
      r.data.user.id,
      `Fixture BB-382 Đã khoá ${run}`,
      email,
    ]);
  }

  bo.ctv = nhanSu.get("photoshop_ctv")?.id ?? "";
  bo.A = await taoBo(nenA.branchId, nenA.customerId, "A", { editorId: bo.ctv || undefined, maHoaDon: MA_HOA_DON });
  bo.A2 = await taoBo(nenA.branchId, nenA.customerId, "A2");
  bo.B = await taoBo(nenB.branchId, nenB.customerId, "B");
  await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,5,0), ($3,$2,5,0)`, [
    bo.A,
    productIds[0],
    bo.A2,
  ]);
});

test.afterAll(async () => {
  try {
    const sIds = [...nhanSu.values()].map((n) => n.id);
    if (sIds.length) await pg.query(`delete from staff_branches where staff_id = any($1::uuid[])`, [sIds]).catch(() => {});
    await donNenFixture(pg, {
      galleryIds: [bo.A, bo.A2, bo.B],
      branchIds: [nenA?.branchId, nenB?.branchId],
      productIds,
      staffIds: sIds,
    });
    if (vaiKhongXemId) await pg.query(`delete from roles where id = $1`, [vaiKhongXemId]);
  } finally {
    await pg.end();
  }
});

/**
 * Mở link quản trị khi CHƯA đăng nhập, đăng nhập NGAY trên trang /login mà middleware đưa tới
 * (không tự đi /login trống — như vậy là không thử `next`). Supabase chặn tốc độ (429) thì chờ, thử lại.
 */
async function moLinkRoiDangNhap(page: Page, duongDan: string, email: string, sauKhiVao: (u: URL) => boolean) {
  let cho = 5_000;
  for (let lan = 1; lan <= 4; lan++) {
    await page.goto(duongDan, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/login", { timeout: 60_000 });
    const next = new URL(page.url()).searchParams.get("next");
    const choPhanHoi = page
      .waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST", { timeout: 20_000 })
      .catch(() => null);
    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(MAT_KHAU);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();
    const r = await choPhanHoi;
    if (r && r.status() === 429 && lan < 4) {
      await page.waitForTimeout(cho);
      cho *= 2;
      continue;
    }
    await page.waitForURL(sauKhiVao, { timeout: 60_000 });
    return next;
  }
  throw new Error("Không đăng nhập được (429 liên tục)");
}

const coQuyen = (v: Vai, q: string) => v.permissions.includes(q);

async function kiemManChan(page: Page, lyDo: string, tieuDe: string) {
  const man = page.getByTestId("man-chan-bo-anh");
  await expect(man).toBeVisible({ timeout: 60_000 });
  await expect(man).toHaveAttribute("data-ly-do", lyDo);
  await expect(man.getByRole("heading")).toHaveText(tieuDe);
  await expect(man.getByRole("link", { name: "Về Bàn làm việc" })).toHaveAttribute("href", "/admin");
  // Không lộ dữ liệu bộ.
  const html = await page.content();
  expect(html).not.toContain(nenA.tenKhach);
  expect(html).not.toContain(nenB.tenKhach);
  expect(html).not.toContain(GHI_CHU);
  expect(html).not.toContain(`FXBB382_${run}`);
}

async function kiemChiTiet(page: Page, v: Vai) {
  await expect(page.getByText("Trạng thái", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("man-chan-bo-anh")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Thành phần hợp đồng" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ảnh khách đã chọn" })).toBeVisible();
  await expect(page.getByTestId("ghi-chu-anh-quan-tri")).toContainText(GHI_CHU);

  const ghi = coQuyen(v, "galleries:write");
  const menu =
    ghi ||
    coQuyen(v, "galleries:sync") ||
    coQuyen(v, "galleries:share") ||
    coQuyen(v, "galleries:reopen") ||
    coQuyen(v, "galleries:edit_info");
  await expect(page.getByRole("button", { name: "Xác nhận và chuyển sang chỉnh ảnh" })).toHaveCount(ghi ? 1 : 0);
  await expect(page.getByRole("button", { name: "Thao tác khác" })).toHaveCount(menu ? 1 : 0);
  await expect(page.getByText("Vai của bạn không có quyền sửa sản phẩm — chỉ xem được.")).toHaveCount(ghi ? 0 : 1);
  // BB-383b — bìa là "thông tin bộ": `galleries:edit_info` (thợ chụp, anh 07/10) HOẶC `galleries:write`.
  await expect(page.getByRole("button", { name: /Đổi bìa|Mở trình thiết kế bìa/ })).toHaveCount(
    ghi || coQuyen(v, "galleries:edit_info") ? 1 : 0,
  );
  // BB-383 — nút đồng bộ theo `galleries:sync` HOẶC `galleries:write` (thợ chụp bấm được).
  await expect(page.getByTestId("nut-dong-bo-drive")).toHaveCount(ghi || coQuyen(v, "galleries:sync") ? 1 : 0);
  await expect(page.locator("#xuat-danh-sach")).toHaveCount(coQuyen(v, "galleries:export") ? 1 : 0);
  // Không có lỗi đỏ nào của màn chi tiết (route bị từ chối, "Không tải được…").
  await expect(page.getByText(/Không tải được|FORBIDDEN|UNAUTHENTICATED/)).toHaveCount(0);
}

test("0. Danh sách vai trong phép thử phủ đủ mọi vai đang có trên bb-dev", () => {
  const thieu = tenVaiThatTrenBbDev.filter((t) => !(DANH_SACH_VAI as readonly string[]).includes(t));
  expect(thieu, `Vai mới trên bb-dev chưa có trong phép thử BB-382: ${thieu.join(", ")}`).toEqual([]);
});

for (const khoa of DANH_SACH_VAI) {
  test(`vai ${khoa}: (a) chưa đăng nhập → đăng nhập → về đúng bộ · (b) xem/nút theo quyền · (c) bộ không được xem`, async ({ page }) => {
    const v = vaiTheoTen.get(khoa);
    test.skip(!v, `Vai ${khoa} không còn trên bb-dev`);
    const ns = nhanSu.get(khoa)!;
    await page.setViewportSize({ width: 1440, height: 900 });

    // (a) — chưa đăng nhập: /login giữ `next` = đúng đường dẫn bộ A, đăng nhập xong về đúng bộ.
    const next = await moLinkRoiDangNhap(page, `/admin/galleries/${bo.A}`, ns.email, (u) => u.pathname === `/admin/galleries/${bo.A}`);
    expect(next).toBe(`/admin/galleries/${bo.A}`);

    const sieu = coQuyen(v!, "system:superuser");
    const xem = coQuyen(v!, "galleries:read");
    const moiBoTrongChiNhanh = coQuyen(v!, "galleries:all_in_branch");

    // (b) — bộ A: đúng chi nhánh (CTV: được giao bộ A).
    if (!xem) {
      await kiemManChan(page, "chua-co-quyen-xem", "Vai của bạn chưa có quyền xem bộ ảnh");
      await page.screenshot({ path: path.join(ANH, "khong-quyen-xem.png") });
    } else {
      await kiemChiTiet(page, v!);
      if (khoa === "photographer") await page.screenshot({ path: path.join(ANH, "tho-chup-chi-tiet.png"), fullPage: true });
      if (khoa === "photoshop_ctv") await page.screenshot({ path: path.join(ANH, "ctv-chi-tiet-bo-duoc-giao.png"), fullPage: true });
      if (khoa === "cs") await page.screenshot({ path: path.join(ANH, "cskh-chi-tiet.png"), fullPage: true });
    }

    // (c) — bộ B ở chi nhánh khác.
    await page.goto(`/admin/galleries/${bo.B}`, { waitUntil: "domcontentloaded" });
    if (!xem) await kiemManChan(page, "chua-co-quyen-xem", "Vai của bạn chưa có quyền xem bộ ảnh");
    else if (sieu) await kiemChiTiet(page, v!);
    else {
      await kiemManChan(page, "khac-chi-nhanh", "Bộ ảnh này thuộc chi nhánh khác");
      if (khoa === "cs") await page.screenshot({ path: path.join(ANH, "khac-chi-nhanh.png") });
    }

    // (c) — bộ A2 cùng chi nhánh, KHÔNG giao cho ai: vai không thấy mọi bộ trong chi nhánh thì bị chặn.
    await page.goto(`/admin/galleries/${bo.A2}`, { waitUntil: "domcontentloaded" });
    if (!xem) await kiemManChan(page, "chua-co-quyen-xem", "Vai của bạn chưa có quyền xem bộ ảnh");
    else if (!moiBoTrongChiNhanh && !sieu) {
      await kiemManChan(page, "chua-duoc-giao", "Bạn chưa được giao bộ này");
      await page.screenshot({ path: path.join(ANH, "ctv-chua-duoc-giao.png") });
      // Route chi tiết cũng không trả dữ liệu bộ chưa giao (trước BB-382: trả đủ).
      const res = await page.request.get(`/api/admin/galleries/${bo.A2}/items`);
      expect(res.status()).toBe(403);
      const body = await res.text();
      expect(body).not.toContain(GHI_CHU);
      expect(body).toContain("Bạn chưa được giao bộ này");
    } else await kiemChiTiet(page, v!);
  });
}

test("link cũ theo MÃ HOÁ ĐƠN (có '#'): chưa đăng nhập → đăng nhập → về đúng địa chỉ, mở đúng bộ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const duongDan = `/admin/galleries/${encodeURIComponent(MA_HOA_DON)}`;
  const next = await moLinkRoiDangNhap(page, duongDan, nhanSu.get("cs")!.email, (u) => u.pathname === duongDan);
  expect(next).toBe(duongDan);
  await kiemChiTiet(page, vaiTheoTen.get("cs")!);
});

test("tài khoản đã khoá: trang trả về /login mà vẫn giữ đúng id bộ (không rơi về /admin/galleries)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ns = nhanSu.get("__da_khoa__")!;
  // Đăng nhập Supabase được (phiên có thật) — middleware cho qua, requireStaff của TRANG từ chối.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const tok = page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByLabel("Tên tài khoản hoặc email").fill(ns.email);
  await page.getByLabel("Mật khẩu").fill(MAT_KHAU);
  await page.getByRole("button", { name: /Đăng nhập/i }).click();
  expect((await tok).status()).toBe(200);
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name.startsWith("sb-")), { timeout: 15_000 }).toBe(true);

  await page.goto(`/admin/galleries/${bo.A}`, { waitUntil: "domcontentloaded" });
  const u = new URL(page.url());
  expect(u.pathname).toBe("/login");
  expect(u.searchParams.get("next")).toBe(`/admin/galleries/${bo.A}`);
});
