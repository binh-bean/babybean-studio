/**
 * BB-358 (anh 02/10/2026) — người được mời (link "Mời gia đình", vai xem) cũng
 * được gợi ý lưu app ra màn hình chính, bằng lời Bean nói với GIA ĐÌNH:
 *   1. Ở 390, gia đình thấy chip "Lưu vào màn hình chính để gia đình mở lại ảnh
 *      của bé nhanh hơn ạ"; bấm chip → tấm hướng dẫn mở, lời gọi "gia đình".
 *      Chip nằm trong dòng chảy trang (không `fixed`) nên không đè thanh đáy
 *      "N tấm gia đình thích / Đặt chỉnh sửa".
 *   2. Manifest của link gia đình mở lại ĐÚNG link gia đình (`start_url` là mã
 *      gia đình, không phải mã ba mẹ) và dùng ảnh bìa của bộ ảnh làm biểu tượng.
 *
 * Dữ liệu: "Fixture BB-358-…" (fixture bb-345 với tiền tố riêng), dọn theo id.
 * Chạy: PW_PORT=3241 npx playwright test tests/e2e/bb-358-gia-dinh-luu-app.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { taoBb345, donBb345, type DuLieuBb345 } from "../fixtures/bb-345";

let d: DuLieuBb345 | null = null;

test.setTimeout(180_000);

test.beforeAll(async () => {
  d = await taoBb345({ nhan: "Fixture BB-358" });
  // Bộ A có ảnh bìa đã chọn — biểu tượng màn hình chính lấy từ đó.
  await d.pg.query("update galleries set cover_photo_id = $1 where id = $2", [d.A.anh[0]!.id, d.A.id]);
});

test.afterAll(async () => {
  if (d) {
    await d.pg.query("update galleries set cover_photo_id = null where id = $1", [d.A.id]).catch(() => {});
    await donBb345(d);
  }
});

test("gia đình thấy chip lưu app (lời cho gia đình) và mở được hướng dẫn — 390", async ({ page }) => {
  const du = d!;
  await page.setViewportSize({ width: 390, height: 844 });
  // Luật tần suất 7 ngày đọc localStorage: trình duyệt mới thì chưa từng ẩn.
  await page.goto(`/g/${du.A.maGiaDinh}`);
  await expect(page.getByTestId("the-anh").first()).toBeVisible({ timeout: 30_000 });

  const chip = page.getByTestId("goi-y-luu-app");
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Lưu vào màn hình chính để gia đình mở lại ảnh của bé nhanh hơn ạ");

  // Chip nằm trong dòng chảy trang: không phải lớp `fixed` đè lên thanh đáy.
  const viTri = await chip.evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    while (n) {
      if (getComputedStyle(n).position === "fixed") return "fixed";
      n = n.parentElement;
    }
    return "dong-chay";
  });
  expect(viTri).toBe("dong-chay");

  await chip.getByRole("button", { name: /gia đình mở lại ảnh/ }).click();
  const huongDan = page.getByRole("dialog");
  await expect(huongDan).toBeVisible();
  await expect(huongDan).not.toContainText(/ba mẹ/i);
});

test("manifest link gia đình mở lại đúng link gia đình, biểu tượng là ảnh bìa", async ({ request }) => {
  const du = d!;
  const res = await request.get(`/api/g/${du.A.maGiaDinh}/manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const m = (await res.json()) as { start_url: string; scope: string; icons: { src: string }[] };
  expect(m.start_url).toBe(`/g/${du.A.maGiaDinh}`);
  expect(m.start_url).not.toContain(du.A.maBaMe);
  expect(m.scope).toBe(`/g/${du.A.maGiaDinh}`);
  expect(m.icons.length).toBeGreaterThan(0);
  for (const icon of m.icons) expect(icon.src).toContain(`/api/g/${du.A.maGiaDinh}/bia-vuong`);

  // Trang của link gia đình trỏ tới ĐÚNG manifest đó.
  const html = await (await request.get(`/g/${du.A.maGiaDinh}`)).text();
  expect(html).toContain(`/api/g/${du.A.maGiaDinh}/manifest.webmanifest`);
});
