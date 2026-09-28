/**
 * BB-305 — LUẬT PHÔNG mới của admin (chốt 28/09/2026) cho MÀN KHÁCH (và phần
 * dùng chung với trang đăng nhập).
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm do DEV-FE sửa theo phát hiện).
 *
 * LUẬT:
 *   - Phông thương hiệu: CHỈ Playfair Display — logo "Baby Bean"/"BABY BEAN"
 *     và tiêu đề lớn (tên bé trên bìa, H1/H2 của màn). KHÔNG nghiêng.
 *   - Phông nội dung: CHỈ Be Vietnam Pro — đoạn văn, nút, nhãn, chip, số liệu,
 *     thanh chọn, giá tiền. Không `font-mono`.
 *   - Fraunces bị loại hẳn khỏi hệ thống.
 *
 * Phép thử đo MÁY, đúng bốn điều cấm ở AGENTS.md §5a: không đọc mã nguồn làm
 * dữ liệu thử, không giả lập hook React, phép thử ghi DB tự trả lại giá trị
 * cũ (afterAll xoá đúng id đã tạo), không kiểm chuỗi có trong mọi HTML — mỗi
 * assertion liệt kê rõ phần tử/phông vi phạm.
 *
 * Dữ liệu: chỉ "Fixture BB-305 …" (AGENTS.md §6) — tên bé "Bé Na", loại buổi
 * chụp "Thôi nôi" là dữ liệu BỊA, không phải khách thật.
 *
 * KIỂM NGƯỢC (dán vào bàn giao, không tự động hoá trong tệp này — sửa thật
 * rồi chạy lại là cách duy nhất không tự lừa mình):
 *   1. Tạm thêm `italic` vào class của h1 tên bé trong
 *      `src/components/features/gallery/bia-bo-anh.tsx` (nhánh mặc định
 *      "ben-canh", h1 `tieuDeHienThi`) → chạy `test("bìa — 1440×900…")` phải
 *      ĐỎ (bắt được "in nghiêng").
 *   2. Bỏ đi → chạy lại phải XANH.
 */

import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-305 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const CHO_ANH = 20_000;

// __dirname = .../babybean-studio/.claude/worktrees/bb305/tests/e2e — cần lên
// SÁU cấp để ra khỏi worktree lẫn repo, tới `Downloads/claude code/`, rồi mới
// vào `babybean-assets` (thư mục anh em của `babybean-studio`, không nằm
// trong repo/worktree nào).
const THU_MUC_CHUP = path.resolve(
  __dirname,
  "../../../../../../babybean-assets/BB-305/chup",
);

function luuAnh(): string | null {
  try {
    fs.mkdirSync(THU_MUC_CHUP, { recursive: true });
    return THU_MUC_CHUP;
  } catch {
    return null;
  }
}

/** Đúng hai họ phông LUẬT PHÔNG BB-305 cho phép trên màn khách. */
const PHONG_CHO_PHEP = ["Playfair Display", "Be Vietnam Pro"];

function hoPhongDau(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

interface DoPhong {
  text: string;
  fontFamily: string;
  fontStyle: string;
}

/**
 * Gom họ phông đầu tiên + font-style của MỌI phần tử có chữ TRỰC TIẾP nhìn
 * thấy (có text node con khác rỗng, kích thước hiển thị > 0) — không gọi
 * `readFileSync` lên mã nguồn, đo thẳng DOM đã dựng bằng `getComputedStyle`.
 */
async function doPhongTrenTrang(page: Page): Promise<DoPhong[]> {
  return page.evaluate(() => {
    const out: { text: string; fontFamily: string; fontStyle: string }[] = [];
    const tatCa = document.querySelectorAll("body *");
    for (const el of Array.from(tatCa)) {
      if (!(el instanceof HTMLElement)) continue;
      const coChuTrucTiep = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
      );
      if (!coChuTrucTiep) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden") continue;
      out.push({
        text: (el.textContent ?? "").trim().slice(0, 40),
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
      });
    }
    return out;
  });
}

function khangDinhPhongHopLe(ketQua: DoPhong[], moTa: string) {
  expect(ketQua.length, `${moTa}: không đo được phần tử chữ nào — phép thử không canh được gì`).toBeGreaterThan(0);
  const viPham: string[] = [];
  for (const { text, fontFamily, fontStyle } of ketQua) {
    const ho = hoPhongDau(fontFamily);
    if (!PHONG_CHO_PHEP.includes(ho)) {
      viPham.push(`phông lạ: "${text}" → "${ho}" (computed: ${fontFamily})`);
    }
    if (fontStyle === "italic") {
      viPham.push(`in nghiêng: "${text}" (font-style: ${fontStyle})`);
    }
  }
  expect(viPham, `${moTa} — vi phạm LUẬT PHÔNG BB-305:\n${viPham.join("\n")}`).toEqual([]);
}

/**
 * Theo dõi mọi request tệp phông (woff2/woff/ttf/otf) phát sinh trong lúc
 * chạy `chay()`, và mọi họ phông mà trình duyệt thực sự đã nạp
 * (`document.fonts`) — cả hai đều phải sạch chữ "fraunces".
 */
async function khongCoFraunces(page: Page, moTa: string, chay: () => Promise<void>) {
  const yeuCauPhong: string[] = [];
  const nghe = (req: { url(): string }) => {
    const u = req.url();
    if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) yeuCauPhong.push(u);
  };
  page.on("request", nghe);
  try {
    await chay();
  } finally {
    page.off("request", nghe);
  }
  expect(
    yeuCauPhong.filter((u) => /fraunces/i.test(u)),
    `${moTa}: có yêu cầu tải tệp phông nghi là Fraunces`,
  ).toEqual([]);

  const hoDaNap = await page.evaluate(() => {
    const s = new Set<string>();
    document.fonts.forEach((f: FontFace) => s.add(f.family.replace(/^["']|["']$/g, "")));
    return Array.from(s);
  });
  expect(
    hoDaNap.filter((f) => /fraunces/i.test(f)),
    `${moTa}: document.fonts vẫn còn nạp họ phông Fraunces (${hoDaNap.join(", ")})`,
  ).toEqual([]);
}

test.describe("BB-305: LUẬT PHÔNG màn khách (Playfair Display + Be Vietnam Pro, không nghiêng, không Fraunces)", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let babyId = "";
  let shootId = "";
  let galleryReadyId = "";
  let gallerySubmitId = "";
  let galleryDeliveredId = "";
  let maLinkReady = "";
  let maLinkSubmit = "";
  let maLinkDelivered = "";
  let coDanhMuc = false;

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();

    await pg.query(
      `delete from galleries where title like 'Fixture BB-305%' and created_at < now() - interval '6 hours'`,
    );
    await pg.query(
      `delete from customers where full_name like 'Fixture BB-305%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: dm } = await pg.query(
      `select 1 from products
        where is_active and kind in ('print','addon','edited_photo') and list_price is not null
          and price_confidence >= 0.8 and price_samples >= 5
        limit 1`,
    );
    coDanhMuc = dm.length > 0;

    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    // Tên bé có dấu + loại buổi chụp "Thôi nôi" — đúng dữ liệu giống thật mà
    // đề bài yêu cầu (BỊA, không lấy từ khách thật — AGENTS.md §6).
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
      [customerId, `${NHAN} Bé`, "Bé Na"],
    );
    babyId = be[0].id;

    const { rows: shoot } = await pg.query(
      `insert into shoots (branch_id, customer_id, baby_id, shoot_date, concept)
       values ($1,$2,$3, current_date - 14, 'Thôi nôi') returning id`,
      [branchId, customerId, babyId],
    );
    shootId = shoot[0].id;

    // --- Gallery 1: "ready" — bìa, lưới, xem lớn, cửa hàng, hộp chốt -------
    const { rows: g1 } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status,
                              drive_folder_id, drive_folder_url, photo_count,
                              included_quota, extra_photo_price)
       values ($1,$2,$3,$4,$5,'ready',$6,'https://example.com/x',6,10,50000) returning id`,
      [branchId, customerId, babyId, shootId, NHAN, `fixture-bb305-ready-${runId}`],
    );
    galleryReadyId = g1[0].id;
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       select $1, id, 10, 0 from products where is_active and kind = 'edited_photo' order by id limit 1`,
      [galleryReadyId],
    );
    for (let i = 1; i <= 6; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryReadyId, `bb305-r-${runId}-${i}`, `BB305R_${String(i).padStart(4, "0")}.jpg`, i],
      );
    }
    maLinkReady = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryReadyId, sha256(maLinkReady), maLinkReady.slice(0, 6), NHAN],
    );

    // --- Gallery 2: "ready" riêng — dùng để CHỐT THẬT (cảm ơn sau chốt) ----
    const { rows: g2 } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status,
                              drive_folder_id, drive_folder_url, photo_count,
                              included_quota, extra_photo_price)
       values ($1,$2,$3,$4,$5,'ready',$6,'https://example.com/x',3,10,50000) returning id`,
      [branchId, customerId, babyId, shootId, NHAN, `fixture-bb305-submit-${runId}`],
    );
    gallerySubmitId = g2[0].id;
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price)
       select $1, id, 10, 0 from products where is_active and kind = 'edited_photo' order by id limit 1`,
      [gallerySubmitId],
    );
    for (let i = 1; i <= 3; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [gallerySubmitId, `bb305-s-${runId}-${i}`, `BB305S_${String(i).padStart(4, "0")}.jpg`, i],
      );
    }
    maLinkSubmit = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [gallerySubmitId, sha256(maLinkSubmit), maLinkSubmit.slice(0, 6), NHAN],
    );

    // --- Gallery 3: "delivered" — màn "Đã giao" -----------------------------
    const { rows: g3 } = await pg.query(
      `insert into galleries (branch_id, customer_id, baby_id, shoot_id, title, status,
                              drive_folder_id, drive_folder_url, photo_count,
                              included_quota, extra_photo_price)
       values ($1,$2,$3,$4,$5,'delivered',$6,'https://example.com/x',4,10,50000) returning id`,
      [branchId, customerId, babyId, shootId, NHAN, `fixture-bb305-delivered-${runId}`],
    );
    galleryDeliveredId = g3[0].id;
    for (let i = 1; i <= 4; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryDeliveredId, `bb305-d-${runId}-${i}`, `BB305D_${String(i).padStart(4, "0")}.jpg`, i],
      );
    }
    await pg.query(
      `insert into deliveries (gallery_id, branch_id, status, delivered_at)
       values ($1,$2,'delivered', now() - interval '2 days')`,
      [galleryDeliveredId, branchId],
    );
    maLinkDelivered = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active')`,
      [galleryDeliveredId, sha256(maLinkDelivered), maLinkDelivered.slice(0, 6), NHAN],
    );
  });

  test.afterAll(async () => {
    if (pg) {
      const ganMoiId = [galleryReadyId, gallerySubmitId, galleryDeliveredId].filter(Boolean);
      for (const id of ganMoiId) {
        await pg.query("delete from activity_logs where entity_id = $1", [id]);
        await pg.query("delete from selections where gallery_id = $1", [id]);
        await pg.query("delete from gallery_items where gallery_id = $1", [id]);
        await pg.query("delete from share_links where gallery_id = $1", [id]);
        await pg.query("delete from photos where gallery_id = $1", [id]);
      }
      if (galleryDeliveredId) {
        await pg.query("delete from deliveries where gallery_id = $1", [galleryDeliveredId]);
      }
      for (const id of ganMoiId) {
        await pg.query("delete from galleries where id = $1", [id]);
      }
      if (shootId) await pg.query("delete from shoots where id = $1", [shootId]);
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  test("bìa — 390×844: phông đúng LUẬT PHÔNG, không nghiêng, không Fraunces", async ({ page }) => {
    await khongCoFraunces(page, "bìa 390×844", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/g/${maLinkReady}`);
      await expect(page.getByTestId("bia-bo-anh")).toBeVisible({ timeout: CHO_ANH });
      // "Bé Na" (tên bé, Playfair) không được tràn dòng — thấy trọn trong khung nhìn.
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    });
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "bìa 390×844");
    const thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "bia-390x844.png"), fullPage: false });
  });

  test("bìa — 1440×900: phông đúng LUẬT PHÔNG, không nghiêng, không Fraunces", async ({ page }) => {
    await khongCoFraunces(page, "bìa 1440×900", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/g/${maLinkReady}`);
      await expect(page.getByTestId("bia-bo-anh")).toBeVisible({ timeout: CHO_ANH });
    });
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "bìa 1440×900");
    const thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "bia-1440x900.png"), fullPage: false });
  });

  test("lưới ảnh: phông đúng LUẬT PHÔNG, không nghiêng", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLinkReady}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "lưới ảnh");
  });

  test("xem lớn (lightbox): phông đúng LUẬT PHÔNG, không nghiêng", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLinkReady}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.getByRole("button", { name: "Xem ảnh 1", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tấm này dùng cho…" }).or(page.locator('[role="dialog"]'))).toBeVisible({
      timeout: 10_000,
    });
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "xem lớn (lightbox)");
  });

  test("cửa hàng — 390×844: phông đúng LUẬT PHÔNG, không nghiêng", async ({ page }) => {
    test.skip(!coDanhMuc, "bb-dev hiện không có sản phẩm nào đủ điều kiện bán (không bịa dữ liệu giá).");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${maLinkReady}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
    await expect(nutMuaThem).toBeVisible({ timeout: 10_000 });
    await nutMuaThem.click();
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "cửa hàng 390×844");
    const thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "cua-hang-390x844.png"), fullPage: false });
  });

  test("cửa hàng — 1440×900: phông đúng LUẬT PHÔNG, không nghiêng", async ({ page }) => {
    test.skip(!coDanhMuc, "bb-dev hiện không có sản phẩm nào đủ điều kiện bán (không bịa dữ liệu giá).");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLinkReady}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    const nutMuaThem = page.getByRole("button", { name: "Mua thêm" });
    await expect(nutMuaThem).toBeVisible({ timeout: 10_000 });
    await nutMuaThem.click();
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "cửa hàng 1440×900");
    const thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "cua-hang-1440x900.png"), fullPage: false });
  });

  test("hộp chốt (xác nhận chốt danh sách): phông đúng LUẬT PHÔNG, không nghiêng", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLinkReady}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await expect(page.getByRole("button", { name: "Xác nhận" })).toBeVisible({ timeout: 10_000 });
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "hộp chốt");
    // Đóng lại bằng huỷ — bộ ảnh này còn dùng cho các phép thử khác trong tệp.
    await page.keyboard.press("Escape").catch(() => {});
  });

  test("cảm ơn sau chốt — 390×844 và 1440×900: phông đúng LUẬT PHÔNG, không nghiêng, không Fraunces", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/g/${maLinkSubmit}`);
    const anhDau = page.locator('img[src*="/api/img/"]').first();
    await anhDau.waitFor({ state: "visible", timeout: CHO_ANH });
    await page.locator('button[aria-label="Chọn ảnh này"]').first().click();
    await page.getByRole("button", { name: "Chốt danh sách" }).first().click();
    await page.fill("#confirm-name-input", "Mẹ Bean");
    await page.getByRole("checkbox").setChecked(true, { force: true });

    await khongCoFraunces(page, "cảm ơn sau chốt 1440×900", async () => {
      await page.getByRole("button", { name: "Xác nhận" }).click();
      // Tiêu đề THẬT của màn CamOnSauChot (cam-on-sau-chot.tsx) — không dùng
      // "Cảm ơn ba mẹ…" vì chuỗi đó cũng nằm sẵn trong chân trang tĩnh của
      // màn lưới ảnh phía sau lớp phủ, khớp NGAY cả khi hộp thoại chưa đóng.
      await expect(page.getByRole("heading", { name: /Studio đã nhận danh sách/ })).toBeVisible({
        timeout: 15_000,
      });
    });
    let ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "cảm ơn sau chốt 1440×900");
    let thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "cam-on-sau-chot-1440x900.png"), fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "cảm ơn sau chốt 390×844");
    thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "cam-on-sau-chot-390x844.png"), fullPage: false });
  });

  test("đã giao — 390×844 và 1440×900: phông đúng LUẬT PHÔNG, dòng loại buổi chụp không nghiêng, không Fraunces", async ({
    page,
  }) => {
    await khongCoFraunces(page, "đã giao 1440×900", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/g/${maLinkDelivered}`);
      await expect(page.getByTestId("dau-da-hoan-thien")).toBeVisible({ timeout: CHO_ANH });
    });
    let ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "đã giao 1440×900");
    let thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "da-giao-1440x900.png"), fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "đã giao 390×844");
    thuMuc = luuAnh();
    if (thuMuc) await page.screenshot({ path: path.join(thuMuc, "da-giao-390x844.png"), fullPage: false });
  });

  test("trang đăng nhập: phông đúng LUẬT PHÔNG (logo Playfair), không nghiêng, không Fraunces", async ({ page }) => {
    await khongCoFraunces(page, "trang đăng nhập", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "BABY BEAN" })).toBeVisible();
    });
    const ketQua = await doPhongTrenTrang(page);
    khangDinhPhongHopLe(ketQua, "trang đăng nhập");
  });
});
