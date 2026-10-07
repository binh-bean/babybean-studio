/**
 * BB-362 — người chấm vòng 10 (khách 8,0 sát nút, quản trị 7,5).
 *   1. (P1 quản trị) nút chính có HAI hình dạng: Q02/Q03/Q08/Q09/Q11 góc nhỏ, Q01/Q04 viên
 *      tròn → mọi nút chính màu mực ở quản trị + đăng nhập cùng MỘT góc 8px (hệ thiết kế:
 *      "nút quản trị 8px"), qua `Button variant="muc"` dùng chung.
 *   3. (P1 khách) tấm "Mời ông bà" 1440: "ạ." mở đầu dòng 2 → "ạ" luôn cùng dòng chữ trước.
 *   4. Xem lớn 1440: tiêu đề thẻ "Xem trên tường nhà" một dòng.
 *
 * Dữ liệu: tests/fixtures/danh-gia.ts — chạy với DANHGIA_NHAN="Fixture BB-362" để mọi bản ghi
 * mang tên "Fixture BB-362-…"; afterAll dọn theo id.
 * Chạy: DANHGIA_NHAN="Fixture BB-362" PW_PORT=3261 npx playwright test tests/e2e/bb-362-nut-va-chu.spec.ts --workers=1
 *
 * Kiểm ngược: trả nút "Xác nhận và chuyển sang chỉnh ảnh" (gallery-detail.tsx) về
 * `rounded-full` → ca 1 ĐỎ (Q04 có góc 9999px / 22px khác 8px).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page } from "@playwright/test";
import { duLieuDanhGia5, donDep, type DuLieuDanhGia5 } from "../fixtures/danh-gia";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

test.setTimeout(180_000);

let d: DuLieuDanhGia5;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  d = await duLieuDanhGia5();
});

test.afterAll(async () => {
  if (!d) return;
  const { conFixture } = await donDep(d);
  expect(conFixture).toBe(0);
});

async function vao(page: Page, w: number, h: number, token: string) {
  await page.setViewportSize({ width: w, height: h });
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 45_000 });
  await page.waitForTimeout(1000);
}

/** Góc của mọi nút/link NỀN MỰC (--bb-fg = #2E2A27) đang thấy trên trang. */
async function gocNutChinh(page: Page): Promise<{ nhan: string; goc: string }[]> {
  return page.evaluate(() => {
    const out: { nhan: string; goc: string }[] = [];
    for (const el of Array.from(document.querySelectorAll("button, a"))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 28 || cs.visibility === "hidden" || cs.display === "none") continue;
      // Chip bật/tắt ("Danh sách" / "Thông tin chi tiết") và tab là bộ lọc, không phải nút chính.
      if (el.hasAttribute("aria-pressed") || ["tab", "radio", "switch"].includes(el.getAttribute("role") ?? "")) continue;
      if (cs.backgroundColor !== "rgb(46, 42, 39)") continue;
      out.push({ nhan: (el.textContent ?? "").trim().slice(0, 40), goc: cs.borderTopLeftRadius });
    }
    return out;
  });
}

test("1 — nút chính quản trị: MỘT hình dạng, góc 8px (Q01 đăng nhập, Q03 danh sách, Q04 chi tiết đã chốt)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  const q01 = await gocNutChinh(page);
  expect(q01.length, "Q01 không thấy nút chính").toBeGreaterThan(0);

  await dangNhapNhanVien(page, d.emailQl, d.password);
  await page.goto(`/admin/galleries?branchId=${d.branchId}`);
  await page.waitForLoadState("networkidle");
  const q03 = await gocNutChinh(page);

  await page.goto(`/admin/galleries/${d.daChot.id}`);
  await expect(page.getByRole("button", { name: "Xác nhận và chuyển sang chỉnh ảnh" }).first()).toBeVisible({ timeout: 30_000 });
  const q04 = await gocNutChinh(page);
  expect(q04.some((n) => n.nhan.startsWith("Xác nhận và chuyển")), JSON.stringify(q04)).toBe(true);

  const tatCa = [...q01, ...q03, ...q04];
  console.log("BB-362 nút chính:", JSON.stringify(tatCa));
  for (const n of tatCa) expect(n.goc, `${n.nhan}: ${n.goc}`).toBe("8px");
});

test("3 — tấm 'Mời ông bà' 1440: 'ạ' không mở đầu dòng ở mọi bề rộng 300–480px", async ({ page }) => {
  await vao(page, 1440, 900, d.chinh.token);
  await page.getByTestId("bia-bo-anh").getByRole("button", { name: "Mời ông bà cùng xem" }).click();
  const tam = page.getByTestId("tam-moi-ong-ba");
  await expect(tam).toBeVisible();
  const loi = await tam.locator("header p").first().evaluate((p) => {
    const text = p.firstChild as Text | null;
    if (!text || !text.data.includes("ạ")) return ["không có chữ ạ"];
    const i = text.data.indexOf("ạ");
    let j = i - 1;
    while (j > 0 && /\s/.test(text.data[j]!)) j--;
    const dong = (a: number) => {
      const r = document.createRange();
      r.setStart(text, a);
      r.setEnd(text, a + 1);
      return r.getClientRects()[0]?.top ?? -1;
    };
    const out: string[] = [];
    for (let w = 300; w <= 480; w += 2) {
      (p as HTMLElement).style.width = `${w}px`;
      if (Math.abs(dong(i) - dong(j)) > 2) out.push(`${w}px`);
    }
    (p as HTMLElement).style.width = "";
    return out;
  });
  expect(loi, `"ạ" rơi dòng ở: ${loi.join(", ")}`).toEqual([]);
});

test("4 — xem lớn 1440: tiêu đề 'Xem trên tường nhà' nằm trên MỘT dòng", async ({ page }) => {
  await vao(page, 1440, 900, d.chinh.token);
  await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.getByTestId("the-anh").nth(0).getByRole("button", { name: /^Xem ảnh 1$/ }).click();
  const dlg = page.getByRole("dialog").first();
  await dlg.waitFor({ state: "visible" });
  const nut = dlg.getByRole("button", { name: /Xem trên tường nhà/ }).first();
  await expect(nut).toBeVisible();
  const do_ = await nut.locator("span.font-semibold").first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { cao: el.getBoundingClientRect().height, dong: parseFloat(cs.lineHeight), tran: el.scrollWidth - el.clientWidth };
  });
  expect(do_.cao).toBeLessThanOrEqual(do_.dong + 1);
  expect(do_.tran, "chữ tràn ra ngoài thẻ").toBeLessThanOrEqual(0);
});
