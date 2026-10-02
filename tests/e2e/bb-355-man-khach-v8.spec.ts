/**
 * BB-355 — màn khách theo bản vẽ "BabyBean · Màn khách v8" (Claude Design).
 *
 *   (a) Đang chọn: KHÔNG còn khối nào (khối "Mời ông bà" cũ) đứng giữa hàng chip
 *       và lưới; "Mời ông bà cùng xem" là nút viền thứ hai trên bìa, mở tấm trượt.
 *   (b) Đã gửi, chờ Bean xác nhận — 390×844: chip → MỘT thẻ tiến độ gộp → lưới.
 *       Tấm ảnh đầu không muộn hơn khối thứ 2 sau hàng chip; bìa và thẻ nói CÙNG
 *       một trạng thái (cùng dòng `trangThaiKhach()`).
 *   (c) Gia đình mở link mời (vai viewer): không thấy "tấm trong gói"; chip → lưới
 *       ngay; thanh đáy "0 tấm · Chạm tim…" + nút túi + "Đặt chỉnh sửa".
 *
 * Đếm "khối" bằng DOM thật đang hiện (cao > 0) giữa `#dau-luoi-anh` và khối lưới —
 * không đọc mã nguồn (AGENTS.md §5a). Dữ liệu: tests/fixtures/danh-gia.ts nhãn
 * "Fixture BB-355-…", dọn theo id (`donDep`, gồm share_links của bộ ảnh).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import type { DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";

let d: DuLieuDanhGia5;
let donDep: (d: DuLieuDanhGia5) => Promise<{ conFixture: number }>;
let maNguoiXem = "";

const THU_MUC_ANH = process.env.BB355_ANH ?? "test-results/bb-355";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

test.use({ actionTimeout: 15_000 });
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  process.env.DANHGIA_NHAN = `Fixture BB-355-${Math.random().toString(36).slice(2, 8)}`;
  const m = await import("../fixtures/danh-gia");
  donDep = m.donDep;
  d = await m.duLieuDanhGia5();
  // Link "Mời gia đình" (vai viewer) cho bộ đã gửi danh sách — xoá cùng bộ ảnh trong donDep.
  maNguoiXem = randomBytes(32).toString("base64url");
  await d.pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'viewer','Fixture BB-355 Bà nội','active')`,
    [d.daChot.id, createHash("sha256").update(maNguoiXem).digest("hex"), maNguoiXem.slice(0, 6)],
  );
});

test.afterAll(async () => {
  if (d) await donDep(d);
});

async function vao(page: Page, w: number, h: number, token: string) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.getByTestId("the-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(800);
}

/**
 * Các khối ĐANG HIỆN (cao > 0) nằm sau hàng chip (`#dau-luoi-anh`), tới và gồm
 * khối chứa tấm ảnh đầu. Trả về mô tả từng khối; khối cuối là khối lưới.
 */
async function khoiSauChip(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const dau = document.getElementById("dau-luoi-anh");
    const anhDau = document.querySelector('[data-testid="the-anh"]');
    if (!dau || !anhDau) return ["THIẾU #dau-luoi-anh hoặc the-anh"];
    const ra: string[] = [];
    for (let el = dau.nextElementSibling; el; el = el.nextElementSibling) {
      const r = el.getBoundingClientRect();
      const hien = r.height > 0 && getComputedStyle(el).display !== "none";
      if (!hien) continue;
      const ten = el.getAttribute("data-testid") || el.id || el.getAttribute("aria-label") || el.tagName;
      ra.push(ten);
      if (el.contains(anhDau)) break;
    }
    return ra;
  });
}

test("(a) đang chọn — 390: không khối nào giữa chip và lưới; Mời ông bà ở bìa, mở tấm trượt", async ({ page }) => {
  await vao(page, 390, 844, d.chinh.token);
  const khoi = await khoiSauChip(page);
  expect(khoi, `khối sau chip: ${khoi.join(" → ")}`).toEqual(["Ảnh của buổi chụp"]);
  await expect(page.getByTestId("khoi-moi-ong-ba")).toHaveCount(0);

  // Khoảng chip → ảnh đầu: 8px theo bản vẽ (cho phép lệch 4px).
  const chip = (await page.locator("#dau-luoi-anh").boundingBox())!;
  const anh = (await page.getByTestId("the-anh").first().boundingBox())!;
  expect(anh.y - (chip.y + chip.height)).toBeLessThanOrEqual(12);

  const bia = page.getByTestId("bia-bo-anh");
  const nutMoi = bia.getByRole("button", { name: "Mời ông bà cùng xem" });
  await expect(nutMoi).toBeVisible();
  await page.screenshot({ path: `${THU_MUC_ANH}/a-bia-390.png` });
  await nutMoi.click();
  const tam = page.getByTestId("tam-moi-ong-ba");
  await expect(tam).toBeVisible();
  await expect(tam.getByRole("heading", { name: "Mời ông bà cùng xem" })).toBeVisible();
  // Tấm trượt từ đáy: mép dưới sát đáy màn, không phủ kín đầu màn.
  const hop = (await tam.boundingBox())!;
  expect(Math.round(hop.y + hop.height)).toBeGreaterThanOrEqual(843);
  expect(hop.y).toBeGreaterThan(40);
  await page.goBack();
  await expect(tam).toHaveCount(0);
});

test("(b) đã gửi — 390: chip → thẻ gộp → lưới; bìa và thẻ cùng một trạng thái", async ({ page }) => {
  await d.pg.query(`update galleries set status='submitted', lark_trang_thai=null where id=$1`, [d.daChot.id]);
  await vao(page, 390, 844, d.daChot.token);

  const khoi = await khoiSauChip(page);
  expect(khoi.length, `khối sau chip: ${khoi.join(" → ")}`).toBeLessThanOrEqual(2);
  expect(khoi[khoi.length - 1]).toBe("Ảnh của buổi chụp");
  await expect(page.getByTestId("dai-khoa-trang-thai")).toHaveCount(0);
  await expect(page.getByTestId("chon-them-anh")).toHaveCount(0);
  await expect(page.getByTestId("khoi-moi-ong-ba")).toHaveCount(0);

  const the = page.getByTestId("the-tien-do-gop");
  await expect(the).toBeVisible();
  const tieuDe = ((await the.getByRole("heading", { level: 3 }).innerText()) ?? "").trim();
  await expect(the.locator('[aria-current="step"]')).toHaveText(/Chờ\s*xác nhận/);
  await expect(the.getByTestId("dong-phu-tien-do")).toHaveText("Ba mẹ vẫn sửa danh sách được tới khi Bean xác nhận ạ.");
  await expect(the.getByRole("button", { name: "Mời ông bà cùng xem" })).toBeVisible();
  await expect(the.locator("img")).toHaveCount(0); // anh chốt: bỏ tranh trong thẻ sau khi gửi

  // Bìa và thẻ: cùng một dòng trạng thái (bìa = câu thẻ, gắn tên bé, có dấu chấm).
  // BB-358 — "ạ" gắn chữ trước bằng khoảng trắng không ngắt (U+00A0): so chữ như người đọc thấy.
  const bia = (await page.getByTestId("bia-loi-chao").innerText()).replace(/ /g, " ").trim();
  expect(tieuDe).toMatch(/ ạ$/);
  const goc = tieuDe.replace(/ ạ$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  expect(bia, `bìa "${bia}" lệch thẻ "${tieuDe}"`).toMatch(new RegExp(`^${goc} của .+ ạ\\.$`));

  // Thanh chọn (hiện khi đã qua bìa): "Sửa danh sách" là nút chính (BB-362: "Chọn thêm ảnh"
  // dành cho đợt mua thêm sau khi Bean xác nhận), cửa hàng vào bằng nút túi.
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.wheel(0, -40);
  await page.waitForTimeout(700);
  const thanh = page.getByTestId("thanh-noi");
  await expect(thanh.getByRole("button", { name: "Sửa danh sách" })).toBeVisible();
  await expect(thanh.getByRole("button", { name: "Mua thêm" })).toBeVisible();
  await page.screenshot({ path: `${THU_MUC_ANH}/b-dau-luoi-390.png` });
});

test("(b) đã gửi — 1440: thẻ gộp là dải ngang rộng bằng lưới", async ({ page }) => {
  await vao(page, 1440, 900, d.daChot.token);
  const the = (await page.getByTestId("the-tien-do-gop").boundingBox())!;
  const luoi = (await page.locator('section[aria-label="Ảnh của buổi chụp"]').boundingBox())!;
  // Lưới có lề 40 bên trong section; thẻ đứng cùng lề.
  expect(Math.abs(the.x - (luoi.x + 40))).toBeLessThanOrEqual(2);
  expect(Math.abs(the.x + the.width - (luoi.x + luoi.width - 40))).toBeLessThanOrEqual(2);
  expect(the.height, "dải ngang, không phải thẻ cao").toBeLessThan(160);
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${THU_MUC_ANH}/b-dau-luoi-1440.png` });
});

test("(c) gia đình mở link mời — 390: không 'tấm trong gói', chip → lưới, thanh đáy mới", async ({ page }) => {
  await vao(page, 390, 844, maNguoiXem);
  const chu = await page.locator("body").innerText();
  expect(chu).not.toContain("tấm trong gói");
  await expect(page.getByTestId("bia-giai-thich-nguoi-xem")).toHaveText(
    "Ảnh chọn trong gói được ba mẹ thực hiện. Gia đình thích tấm nào có thể đặt chỉnh sửa hoặc mua thêm ảnh in và album in ảnh ạ!",
  );
  await expect(page.getByRole("button", { name: /Xem ảnh và thả tim/ })).toBeVisible();

  const khoi = await khoiSauChip(page);
  expect(khoi, `khối sau chip: ${khoi.join(" → ")}`).toEqual(["Ảnh của buổi chụp"]);
  await expect(page.getByText("Link này để xem ảnh cùng gia đình")).toHaveCount(0);

  const thanh = page.getByTestId("thanh-dat-chinh-sua");
  await expect(thanh.getByTestId("dem-tim-gia-dinh")).toContainText("0 tấm");
  await expect(thanh.getByTestId("dem-tim-gia-dinh")).toContainText("Chạm tim tấm gia đình thích ạ");
  await expect(thanh.getByTestId("nut-dat-chinh-sua")).toBeDisabled();
  await page.screenshot({ path: `${THU_MUC_ANH}/c-bia-390.png` });

  // Nút túi mở màn mua ảnh in / album; Back đóng lại, vẫn ở bộ ảnh.
  const url = page.url();
  // BB-358 — thanh đáy người xem ẩn khi bìa còn chiếm màn (cùng luật thanh của ba mẹ): cuộn tới lưới trước.
  await page.evaluate(() => {
    const the = document.querySelector('[data-testid="the-anh"]');
    if (the) window.scrollTo(0, the.getBoundingClientRect().top + window.scrollY - 120);
  });
  await thanh.getByRole("button", { name: "Mua ảnh in, album in ảnh" }).click();
  await expect(page.getByTestId("man-mua-them-sau-duyet")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("man-mua-them-sau-duyet")).toHaveCount(0);
  expect(page.url()).toBe(url);
});
