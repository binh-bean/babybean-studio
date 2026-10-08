/**
 * BB-351 — chép từ phép đo vòng 7 của người chấm B (`zz-dg7b-van-hanh.spec.ts`, worktree dg7b)
 * và THÊM KỲ VỌNG: cuối hành trình (mở lại + chốt lại + đợt 2, khách trả đúng 250.000 cho 5 ảnh)
 * không còn chữ "DƯ", outstanding = 0, form không gợi ý thu thêm; màn Cảm ơn đổi chữ không F5;
 * huy hiệu menu = 1 cho 1 khách; dòng "Khách gửi ảnh chọn" có ô khoá kèm thu (BB-349).
 * Các bước vẫn ghi số vào test-results/bb351/ket-qua.json; kỳ vọng nằm ở cuối ca.
 *
 * Dữ liệu: chi nhánh / nhân viên cs / khách / bộ 400 ảnh "Fixture DANHGIA7-B …"
 * (SĐT 0901000001), dọn theo id ở afterAll, kể cả thông báo và chi nhánh.
 * Không gửi Lark (PHEP_THU_TRINH_DUYET=1 ở máy chủ). Ảnh lh3 chặn ở trình duyệt.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, BrowserContext, Request } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { tickHopChotDot1 } from "./helpers/tick-hop-chot-dot1";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

test.use({ actionTimeout: 20_000 });
const runId = Math.random().toString(36).slice(2, 8);
const NHAN = `Fixture BB-351-${runId}`;
const TEN_BO = `${NHAN} Bộ ảnh bé Nguyễn Ngọc Bảo An`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const email = `fixture.bb351.cs.${runId}@demo.babybean.vn`;
const matKhau = `Dg7b!${randomBytes(6).toString("hex")}`;
const THU_MUC = "test-results/bb351";
fs.mkdirSync(THU_MUC, { recursive: true });
const KQ: Record<string, unknown> = {};
const ghi = (k: string, v: unknown) => {
  KQ[k] = v;
  fs.writeFileSync(`${THU_MUC}/ket-qua.json`, JSON.stringify(KQ, null, 2));
  console.info(`[DG7B] ${k} = ${JSON.stringify(v)}`);
};
async function buoc(ten: string, f: () => Promise<void>) {
  try {
    await f();
  } catch (e) {
    ghi(`LOI:${ten}`, e instanceof Error ? e.message.split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
async function chanAnh(page: Page) {
  await page.route("https://lh3.googleusercontent.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG_1PX, headers: { "access-control-allow-origin": "*" } }),
  );
}

function demYeuCau(page: Page) {
  const ds: { url: string; t: number; method: string }[] = [];
  page.on("request", (r: Request) => ds.push({ url: r.url(), t: Date.now(), method: r.method() }));
  return ds;
}
function phanLoai(ds: { url: string }[]) {
  const c = { api: 0, img: 0, imgQua: 0, lh3: 0, trang: 0, tinh: 0 };
  const apiTen: Record<string, number> = {};
  for (const { url } of ds) {
    if (url.includes("lh3.googleusercontent.com")) c.lh3++;
    else if (url.includes("/api/img/")) {
      c.img++;
      if (url.includes("qua=1")) c.imgQua++;
    } else if (url.includes("/api/")) {
      c.api++;
      const p = new URL(url).pathname.replace(/[0-9a-f-]{36}/g, ":id");
      apiTen[p] = (apiTen[p] ?? 0) + 1;
    } else if (url.includes("/_next/")) c.tinh++;
    else if (url.startsWith("http://localhost")) c.trang++;
  }
  return { ...c, apiTen };
}

test.describe("BB-351: hành trình vận hành — tiền một công thức", () => {
  let pg: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";
  const supa = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB351-${runId}`, `${NHAN} Chi nhánh`])
    ).rows[0].id;
    const u = await supa().auth.admin.createUser({ email, password: matKhau, email_confirm: true });
    if (u.error) throw u.error;
    userId = u.data.user!.id;
    // BB-395: nhập tiền tay chỉ còn cho Admin/Quản lý (`thanh_toan:nhap_tay`) → kịch bản thu tiền tay
    // chạy bằng vai Quản lý. Ca "CSKH không thấy nhập tay + 403" nằm ở bb-349 và bb-395 (ca 4).
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [userId, `${NHAN} Quản lý`, email]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [userId, branchId]);
    customerId = (
      await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000001') returning id`, [
        branchId,
        `${NHAN} Nguyễn Thị Hoa`,
      ])
    ).rows[0].id;
    galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota, extra_photo_price, download_enabled)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',400,15,50000,false) returning id`,
        [branchId, customerId, TEN_BO, `SEED_FOLDER_ID_BB351_${runId}`],
      )
    ).rows[0].id;
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height, size_bytes)
       select $1, 'bb351file' || $2 || '-' || x, 'R01_' || lpad(x::text, 4, '0') || '.JPG', 'image/jpeg', x, 'active',
              case when x % 6 = 2 then 1500 else 1000 end, case when x % 6 = 2 then 1000 else 1500 end, 90000
       from generate_series(1, 400) as x`,
      [galleryId, runId],
    );
    const sp = await pg.query(`select id from products where kind='edited_photo' and is_active order by (lark_record_id is null), created_at limit 1`);
    if (sp.rows[0]) {
      await pg.query(`insert into gallery_items (gallery_id, product_id, quantity) values ($1,$2,15)`, [galleryId, sp.rows[0].id]);
    }
    maLink = randomBytes(32).toString("base64url");
    await pg.query(`insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,$3,'owner','active')`, [
      galleryId,
      sha256(maLink),
      maLink.slice(0, 6),
    ]);
    const hm = await pg.query(`select app.gallery_quota($1) q`, [galleryId]).catch(() => ({ rows: [{ q: "?" }] }));
    ghi("han_muc_ban_dau", hm.rows[0].q);
  });

  test.afterAll(async () => {
    if (pg) {
      if (galleryId) {
        for (const sql of [
          "delete from thong_bao_khach where gallery_id = $1",
          "delete from push_dang_ky where gallery_id = $1",
          "delete from activity_logs where entity_id = $1 or gallery_id = $1",
          "delete from notifications where payload::text like '%' || $1 || '%'",
          "delete from gallery_payments where gallery_id = $1",
          "delete from selection_placements where selection_item_id in (select id from selection_items where gallery_id = $1)",
          "delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)",
          "delete from selection_items where gallery_id = $1",
          "delete from selection_rounds where gallery_id = $1",
          "delete from selections where gallery_id = $1",
          "delete from gallery_items where gallery_id = $1",
          "delete from share_links where gallery_id = $1",
          "update galleries set cover_photo_id = null where id = $1",
          "delete from photos where gallery_id = $1",
          "delete from galleries where id = $1",
        ])
          await pg.query(sql, [galleryId]).catch((e) => ghi(`don_loi:${sql.slice(0, 40)}`, String(e.message)));
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]).catch(() => {});
      if (userId) {
        await pg.query("delete from activity_logs where actor_id = $1", [userId]).catch(() => {});
        await pg.query("delete from staff_branches where staff_id = $1", [userId]);
        await pg.query("delete from staff_profiles where id = $1", [userId]);
      }
      if (branchId) {
        await pg.query("delete from activity_logs where branch_id = $1", [branchId]).catch(() => {});
        await pg.query("delete from notifications where branch_id = $1", [branchId]).catch(() => {});
        await pg.query("delete from branches where id = $1", [branchId]).catch((e) => ghi("don_chi_nhanh_loi", e.message));
      }
      const con = (await pg.query(`select count(*)::int n from galleries where title like $1`, [`${NHAN}%`])).rows[0].n;
      const conCn = (await pg.query(`select count(*)::int n from branches where name like $1`, [`${NHAN}%`])).rows[0].n;
      ghi("don_dep_con_sot", { boAnh: con, chiNhanh: conCn });
      await pg.end();
    }
    if (userId) await supa().auth.admin.deleteUser(userId);
  });

  test("hành trình đầy đủ + realtime + tiền", async ({ page, browser }) => {
    test.setTimeout(700_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, email, matKhau);
    const nvYeuCau = demYeuCau(page);
    const huyHieu = async () => {
      const h = page.getByTestId("badge-viec-can-xu-ly").first();
      return (await h.count()) ? Number((await h.innerText()).replace(/\D/g, "")) || 0 : 0;
    };
    await page.goto("/admin/viec-can-xu-ly?tab=khach-mua-them");
    const bao = page.getByTestId("khach-mua-them-report");
    await expect(bao).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    ghi("truoc_huy_hieu", await huyHieu());

    const ctxKhach: BrowserContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "x-forwarded-for": `10.79.${Math.floor(Math.random() * 250) + 1}.7` },
    });
    const khach = await ctxKhach.newPage();
    await chanAnh(khach);
    let soCham = 0;
    try {
      const t0 = Date.now();
      await khach.goto(`/g/${maLink}`);
      const nutChon = khach.locator('button[aria-label="Chọn ảnh này"]');
      await expect(nutChon.first()).toBeVisible({ timeout: 40_000 });
      ghi("khach_mo_den_bam_duoc_ms", Date.now() - t0);
      await khach.evaluate(() => ((window as unknown as { __dg: string }).__dg = "x"));

      // --- 1. Khách thả 17 tim + chốt ---
      await buoc("khach_chon_17", async () => {
        let daBam = 0;
        for (let lan = 0; lan < 80 && daBam < 17; lan++) {
          const btn = khach.locator('button[aria-label="Chọn ảnh này"]:visible').first();
          if ((await btn.count()) === 0) {
            await khach.mouse.wheel(0, 500);
            await khach.waitForTimeout(400);
            continue;
          }
          await btn.click({ timeout: 5_000 }).catch(async () => {
            await btn.evaluate((el) => (el as HTMLElement).click(), undefined, { timeout: 5_000 }).catch(() => {});
          });
          daBam++;
          soCham++;
          await khach.waitForTimeout(250);
        }
        ghi("khach_da_bam_tim", daBam);
        await khach.waitForTimeout(3000);
        const n = (
          await pg.query(
            `select count(*)::int n from selection_items si join selections s on s.id=si.selection_id where s.gallery_id=$1 and si.mark='selected'`,
            [galleryId],
          )
        ).rows[0].n;
        ghi("khach_da_chon_trong_csdl", n);
      });
      await buoc("khach_chot", async () => {
        await khach.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
        await khach.getByRole("button", { name: "Chốt danh sách" }).first().click();
        soCham++;
        await khach.fill("#confirm-name-input", "Mẹ Hoa");
        soCham++;
        await tickHopChotDot1(khach);
        soCham++;
        await khach.screenshot({ path: `${THU_MUC}/k-hop-chot.png` });
        const cho = khach.waitForResponse((r) => r.url().includes("/api/g/submit") && r.request().method() === "POST");
        await khach.getByRole("button", { name: "Xác nhận" }).click();
        soCham++;
        const r = await cho;
        ghi("submit_status", r.status());
        const t = Date.now();
        const dong = bao.getByTestId("dong-khach-gui-anh-chon").filter({ hasText: TEN_BO });
        await expect(dong).toBeVisible({ timeout: 20_000 });
        ghi("realtime_nv_thay_dong_ms", Date.now() - t);
        await expect.poll(huyHieu, { timeout: 10_000 }).toBeGreaterThan(Number(KQ.truoc_huy_hieu ?? 0));
        ghi("realtime_huy_hieu_tang_ms", Date.now() - t);
        await page.waitForTimeout(3000);
        const sau = nvYeuCau.filter((y) => y.t >= t);
        ghi("api_nv_sau_1_su_kien", phanLoai(sau));
        ghi("so_cham_khach_chon_va_chot", soCham);
      });
      await khach.screenshot({ path: `${THU_MUC}/k-sau-chot.png` });

      // Đối chiếu số: huy hiệu menu vs tab vs Bàn làm việc
      await buoc("doi_chieu_dem", async () => {
        const tab = await page.getByRole("tablist").first().innerText();
        ghi("dem_cac_tab", tab.replace(/\s+/g, " "));
        const cxl = await page.evaluate(async () => {
          const r = await fetch("/api/admin/can-xu-ly", { cache: "no-store" });
          const d = (await r.json()).data ?? {};
          const o: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(d)) o[k] = Array.isArray(v) ? v.length : v;
          return o;
        });
        ghi("can_xu_ly_ngay_nguon", cxl);
        ghi("dem_huy_hieu_menu", await huyHieu());
        const tong = await page.evaluate(async () => {
          const r = await fetch("/api/admin/dashboard", { cache: "no-store" });
          return r.ok ? JSON.stringify((await r.json()).data).slice(0, 1500) : `HTTP ${r.status}`;
        });
        ghi("dashboard_tom_tat", tong);
      });

      // --- 2. CSKH mở dòng: số tiền ---
      const dong = bao.getByTestId("dong-khach-gui-anh-chon").filter({ hasText: TEN_BO });
      await buoc("cskh_mo_dong", async () => {
        await dong.getByTestId("nut-xu-ly-viec").click();
        const tt = dong.getByTestId("khoi-thanh-toan");
        await expect(tt).toBeVisible({ timeout: 20_000 });
        ghi("khoi_tt_truoc_thu", (await tt.innerText()).replace(/\s+/g, " "));
        await page.screenshot({ path: `${THU_MUC}/nv-dong-khach-gui.png`, fullPage: false });
      });
      // Thu tiền ngay trong dòng (form không có ô khoá)
      await buoc("cskh_thu_trong_dong", async () => {
        const tt = dong.getByTestId("khoi-thanh-toan");
        // BB-395: form nhập tay nằm trong mục dự phòng + bắt ghi lý do.
        await tt.getByTestId("nhap-tay-du-phong").locator("summary").click();
        await tt.locator('input[name="note"]').fill("Fixture BB-351 nhập tay");
        ghi("dong_co_o_khoa", await tt.locator('input[name="khoaBoAnh"]').count());
        if (await tt.locator('input[name="khoaBoAnh"]').count()) await tt.locator('input[name="khoaBoAnh"]').uncheck();
        const amount = await tt.locator('input[name="amount"]').inputValue();
        ghi("goi_y_so_tien", amount);
        await khach.evaluate(() => ((window as unknown as { __dg: string }).__dg = "x"));
        const cho = page.waitForResponse((r) => r.url().includes("/payments") && r.request().method() === "POST");
        await tt.getByRole("button", { name: "Ghi nhận đã thu" }).click();
        const r = await cho;
        const j = await r.json();
        ghi("thu_1_tra_ve", { status: r.status(), ...j.data });
        await page.waitForTimeout(1500);
        ghi("thong_bao_sau_thu_1", await dong.getByTestId("thong-bao-xu-ly").innerText().catch(() => "(không thấy)"));
        const q = (await pg.query(`select app.gallery_quota($1) q, status from galleries where id=$1`, [galleryId])).rows[0];
        ghi("sau_thu_1_han_muc_trang_thai", q);
      });
      await buoc("cskh_xac_nhan_dot1", async () => {
        const cho = page.waitForResponse((r) => r.url().includes("/confirm") && r.request().method() === "POST");
        await dong.getByTestId("nut-xac-nhan-dot-1").click();
        ghi("confirm_status", (await cho).status());
        const t = Date.now();
        // khách đang ở màn cảm ơn "Chờ studio xác nhận": đo lúc chữ này đổi (không F5)
        const daDoi = await expect
          .poll(async () => !/chờ (studio|Bean) xác nhận/i.test(await khach.locator("body").innerText()), { timeout: 15_000 })
          .toBe(true)
          .then(() => true)
          .catch(() => false);
        ghi("realtime_khach_man_cam_on_doi", daDoi ? `${Date.now() - t} ms` : "KHÔNG đổi sau 15 s");
        ghi("cam_on_trang_thai_khong_F5", await khach.getByTestId("cam-on-trang-thai").innerText().catch(() => "(không còn màn cảm ơn)"));
        ghi("khach_chu_sau_xac_nhan", (await khach.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
        await khach.screenshot({ path: `${THU_MUC}/k-sau-xac-nhan-15s.png` });
        await khach.reload();
        await khach.waitForTimeout(4000);
        ghi("khach_chu_sau_F5", (await khach.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
        await khach.screenshot({ path: `${THU_MUC}/k-sau-xac-nhan-F5.png` });
        await khach.evaluate(() => ((window as unknown as { __dg: string }).__dg = "x"));
        ghi("khach_khong_tai_lai", await khach.evaluate(() => (window as unknown as { __dg?: string }).__dg));
        await page.waitForTimeout(1500);
        ghi("dong_con_sau_xac_nhan", await dong.count());
        const q = (await pg.query(`select app.gallery_quota($1) q, status from galleries where id=$1`, [galleryId])).rows[0];
        ghi("sau_xac_nhan_han_muc_trang_thai", q);
      });
      await khach.screenshot({ path: `${THU_MUC}/k-da-khoa.png` });

      // --- 3. Mở lại (API của nút) + khách thêm 1 ảnh + thử thu ở dòng không có ô chắc chắn ---
      await buoc("mo_lai", async () => {
        const r = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/reopen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "Khách xin đổi 1 tấm" }),
          });
          return { s: x.status, j: await x.json().catch(() => null) };
        }, galleryId);
        ghi("mo_lai_tra_ve", { status: r.s, loi: r.j?.error?.message ?? null });
        const t = Date.now();
        const thay = await expect
          .poll(() => khach.locator('button[aria-label="Chọn ảnh này"]:enabled').count(), { timeout: 15_000 })
          .toBeGreaterThan(0)
          .then(() => true)
          .catch(() => false);
        ghi("realtime_khach_thay_mo_lai", thay ? `${Date.now() - t} ms` : "KHÔNG thấy tim bật sau 15 s");
        ghi("khach_chu_sau_mo_lai", (await khach.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
        await khach.screenshot({ path: `${THU_MUC}/k-sau-mo-lai.png` });
        if (!thay) {
          await khach.reload();
          await khach.waitForTimeout(4000);
        }
        for (let lan = 0; lan < 40; lan++) {
          const btn = khach.locator('button[aria-label="Chọn ảnh này"]:visible').first();
          if ((await btn.count()) === 0) {
            await khach.mouse.wheel(0, 500);
            await khach.waitForTimeout(300);
            continue;
          }
          await btn.click({ timeout: 5_000 });
          break;
        }
        await khach.waitForTimeout(3000);
        const tien = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/items`, { cache: "no-store" });
          const d = (await x.json()).data;
          return { dueAmount: d.dueAmount, paidAmount: d.paidAmount, outstanding: d.outstanding, amountToCollect: d.amountToCollect };
        }, galleryId);
        ghi("khi_khach_dang_sua_18_anh_tien", tien);
        const thu = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: 50000, method: "tien_mat", note: "" }),
          });
          return { s: x.status, j: await x.json().catch(() => null) };
        }, galleryId);
        ghi("thu_kieu_form_dong_khi_dang_sua", { status: thu.s, loi: thu.j?.error?.message ?? null });
      });

      // Khách chốt lại 18 ảnh → CSKH mở chi tiết bộ ảnh, thu + khoá (BB-349)
      await buoc("chot_lai_va_thu_khoa_chi_tiet", async () => {
        await khach.screenshot({ path: `${THU_MUC}/k-truoc-chot-lai.png` });
        ghi("khach_chu_truoc_chot_lai", (await khach.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 300));
        await khach.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
        await khach.getByRole("button", { name: /Chốt danh sách|Gửi lại/ }).first().click();
        await khach.fill("#confirm-name-input", "Mẹ Hoa").catch(() => {});
        await tickHopChotDot1(khach);
        const cho = khach.waitForResponse((r) => r.url().includes("/api/g/submit") && r.request().method() === "POST");
        await khach.getByRole("button", { name: "Xác nhận" }).click();
        ghi("submit_lan2_status", (await cho).status());
        await page.goto(`/admin/galleries/${galleryId}`);
        await page.getByTestId("nhap-tay-du-phong").locator("summary").click({ timeout: 30_000 });
        await page.locator('input[name="note"]').first().fill("Fixture BB-351 nhập tay");
        const nut = page.getByRole("button", { name: "Ghi nhận đã thu" });
        await expect(nut).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        ghi("chi_tiet_khoi_tien", (await nut.locator("xpath=ancestor::section[1]").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600));
        ghi("chi_tiet_goi_y", await page.locator('input[name="amount"]').first().inputValue());
        ghi("chi_tiet_o_khoa_tick", await page.locator('input[name="khoaBoAnh"]').isChecked().catch(() => "khong co"));
        const chac = page.locator('input[name="chacChan"]');
        if (await chac.count()) await chac.check();
        await page.screenshot({ path: `${THU_MUC}/nv-chi-tiet-thu-khoa.png` });
        const choTT = page.waitForResponse((r) => r.url().includes("/payments") && r.request().method() === "POST", { timeout: 90_000 });
        await nut.click();
        const r = await choTT;
        ghi("thu_2_khoa_tra_ve", { status: r.status(), ...(await r.json()).data });
        const q = (await pg.query(`select app.gallery_quota($1) q, status from galleries where id=$1`, [galleryId])).rows[0];
        ghi("sau_thu_2_han_muc_trang_thai", q);
      });

      // --- 4. Mua thêm đợt 2 ---
      await buoc("dot_2", async () => {
        await khach.reload();
        const the = khach.getByTestId("chon-them-anh");
        await expect(the).toBeVisible({ timeout: 30_000 });
        await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();
        const man = khach.getByTestId("man-chon-them-anh");
        await expect(man).toBeVisible();
        await man.getByRole("button", { name: /Chưa chọn/ }).first().click().catch(() => {});
        await khach.waitForTimeout(800);
        let bam = 0;
        for (let lan = 0; lan < 40 && bam < 2; lan++) {
          const btn = man.locator('button[aria-label="Chọn ảnh này"]:visible').first();
          if ((await btn.count()) === 0) {
            await khach.mouse.wheel(0, 500);
            await khach.waitForTimeout(300);
            continue;
          }
          await btn.click({ timeout: 5_000 });
          bam++;
          await khach.waitForTimeout(300);
        }
        ghi("dot2_bam_tim", bam);
        await man.getByTestId("nut-chot-dot").click();
        const hop = khach.getByTestId("hop-xac-nhan-dot");
        await expect(hop).toBeVisible();
        await khach.screenshot({ path: `${THU_MUC}/k-hop-dot-2.png` });
        const cho = khach.waitForResponse((r) => r.url().includes("/api/g/dot-chon/chot") && r.request().method() === "POST");
        await hop.getByTestId("nut-xac-nhan-chot-dot").click();
        ghi("chot_dot2_status", (await cho).status());
        const tien = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/items`, { cache: "no-store" });
          const d = (await x.json()).data;
          return { dueAmount: d.dueAmount, paidAmount: d.paidAmount, outstanding: d.outstanding, amountToCollect: d.amountToCollect };
        }, galleryId);
        ghi("dot2_cho_xac_nhan_tien", tien);
        // NV xác nhận đợt 2 ở Việc cần xử lý; khách offline trong lúc đó
        await page.goto("/admin/viec-can-xu-ly?tab=khach-mua-them");
        const d2 = page.getByTestId("khach-mua-them-report").getByTestId("dong-khach-gui-anh-chon").filter({ hasText: TEN_BO });
        await expect(d2).toBeVisible({ timeout: 20_000 });
        await d2.getByTestId("nut-xu-ly-viec").click();
        await ctxKhach.setOffline(true);
        const choXN = page.waitForResponse((r) => r.url().includes(`/dot-chon/2/xac-nhan`) && r.request().method() === "POST");
        await d2.getByTestId("khoi-dot-2").getByRole("button", { name: "Xác nhận", exact: true }).click();
        ghi("xac_nhan_dot2_status", (await choXN).status());
        await page.waitForTimeout(3000);
        await ctxKhach.setOffline(false);
        const t = Date.now();
        await expect(khach.getByTestId("trang-thai-dot-2")).toContainText("Bean đã xác nhận đợt này ạ", { timeout: 40_000 });
        ghi("offline_roi_online_khach_bat_kip_ms", Date.now() - t);
        const tien2 = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/items`, { cache: "no-store" });
          const d = (await x.json()).data;
          return { dueAmount: d.dueAmount, paidAmount: d.paidAmount, outstanding: d.outstanding, amountToCollect: d.amountToCollect };
        }, galleryId);
        ghi("dot2_da_xac_nhan_tien", tien2);
        await page.waitForTimeout(1500);
        const tt = d2.getByTestId("khoi-thanh-toan");
        if (await tt.count()) ghi("dot2_khoi_tt_dong", (await tt.innerText()).replace(/\s+/g, " "));
      });
      await buoc("thu_dot_2", async () => {
        await page.goto(`/admin/galleries/${galleryId}`);
        await page.getByTestId("nhap-tay-du-phong").locator("summary").click({ timeout: 30_000 });
        await page.locator('input[name="note"]').first().fill("Fixture BB-351 nhập tay đợt 2");
        const nut = page.getByRole("button", { name: "Ghi nhận đã thu" });
        await expect(nut).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(1500);
        ghi("dot2_goi_y_chi_tiet", await page.locator('input[name="amount"]').first().inputValue());
        const chac = page.locator('input[name="chacChan"]');
        if (await chac.count()) await chac.check();
        const choTT = page.waitForResponse((r) => r.url().includes("/payments") && r.request().method() === "POST", { timeout: 90_000 });
        ghi("dot2_khoi_tien_chi_tiet", (await nut.locator("xpath=ancestor::section[1]").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 500));
        if (!(await nut.isEnabled())) { ghi("dot2_nut_thu", "bị khoá"); return; }
        await nut.click();
        const r = await choTT;
        ghi("thu_dot2_tra_ve", { status: r.status(), ...(await r.json()).data });
        // Màn chi tiết tải lại sau khi ghi (GET /items ~3 s): đợi khối tiền đổi rồi mới đọc.
        await expect(page.getByText(/Phải thu 250\.000 ₫ · đã thu 250\.000 ₫/)).toBeVisible({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const txt = await page.locator("body").innerText();
        const m = txt.match(/Phải thu[^\n]{0,160}/g);
        ghi("chi_tiet_sau_thu_dot2_dong_tien", m);
        ghi("chi_tiet_co_chu_tra_du", /trả DƯ/.test(txt));
        ghi("goi_y_cuoi_cung", await page.locator('input[name="amount"]').first().inputValue());
        await page.screenshot({ path: `${THU_MUC}/nv-chi-tiet-sau-dot2.png`, fullPage: true });
        const q = (await pg.query(`select app.gallery_quota($1) q, status from galleries where id=$1`, [galleryId])).rows[0];
        ghi("sau_thu_dot2_han_muc_trang_thai", q);
      });

      // --- 5. Xuất chi tiết ---
      await buoc("xuat", async () => {
        const r = await page.evaluate(async (id) => {
          const x = await fetch(`/api/admin/galleries/${id}/export`);
          const t = await x.text();
          return { s: x.status, ct: x.headers.get("content-type"), cd: x.headers.get("content-disposition"), dai: t.length, dau: t.slice(0, 400), dong: t.split("\n").length };
        }, galleryId);
        ghi("xuat", r);
      });

      // --- 6. Nhật ký ---
      await buoc("nhat_ky", async () => {
        const { rows } = await pg.query(
          `select action, actor_type, count(*)::int n from activity_logs where entity_id=$1 or gallery_id=$1 group by 1,2 order by min(created_at)`,
          [galleryId],
        );
        ghi("nhat_ky", rows);
        const tt = await pg.query(`select amount, payment_method from gallery_payments where gallery_id=$1 order by created_at`, [galleryId]);
        ghi("so_thu", tt.rows);
      });
    } finally {
      await ctxKhach.close();
    }

    // ---------------- KỲ VỌNG BB-351 ----------------
    const loi = Object.keys(KQ).filter((k) => k.startsWith("LOI:"));
    expect(loi, `bước hỏng: ${JSON.stringify(loi.map((k) => [k, KQ[k]]))}`).toEqual([]);
    // 4. Một khách = một việc: huy hiệu tăng đúng 1.
    expect(Number(KQ.dem_huy_hieu_menu) - Number(KQ.truoc_huy_hieu ?? 0)).toBe(1);
    // 5. Dòng "Khách gửi ảnh chọn" có ô khoá kèm thu.
    expect(Number(KQ.dong_co_o_khoa)).toBeGreaterThan(0);
    // 3. Màn Cảm ơn đổi chữ không F5.
    expect(String(KQ.realtime_khach_man_cam_on_doi)).toMatch(/ms$/);
    // 1. Tiền: chốt lại 18 ảnh (đã trả 100.000) → phải thu 150.000, còn thiếu 50.000, không "DƯ".
    expect(String(KQ.chi_tiet_khoi_tien)).not.toMatch(/DƯ/);
    expect(String(KQ.chi_tiet_khoi_tien)).toMatch(/còn thiếu 50\.000/);
    expect(KQ.chi_tiet_goi_y).toBe("50000");
    // Sau đợt 2 đã xác nhận: còn thiếu đúng 100.000, không "DƯ".
    expect(KQ.dot2_da_xac_nhan_tien).toMatchObject({ outstanding: 100000, amountToCollect: 100000, paidAmount: 150000, dueAmount: 250000 });
    // Thu đợt 2: tổng 250.000 cho 5 ảnh — outstanding 0, không còn gì để gợi ý.
    expect(KQ.thu_dot2_tra_ve).toMatchObject({ status: 200, outstanding: 0, amountToCollect: 0, paidAmount: 250000, dueAmount: 250000 });
    expect(KQ.chi_tiet_co_chu_tra_du).toBe(false);
    expect(KQ.goi_y_cuoi_cung).toBe("");
    expect((KQ.so_thu as { amount: string }[]).reduce((t, r) => t + Number(r.amount), 0)).toBe(250000);
  });
});
