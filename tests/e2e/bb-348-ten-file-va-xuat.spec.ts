/**
 * BB-348 — (1) lưới "Ảnh khách đã chọn" ở chi tiết bộ ảnh: tên file cạnh số thứ tự, rê chuột
 * xem tên đầy đủ; (2) khối "Xuất danh sách ảnh đã chọn": nút "Thông tin chi tiết" ra mỗi ảnh
 * một dòng `tên (Dùng cho: … · "ghi chú")`, ảnh không có gì thì chỉ tên.
 *
 * Dữ liệu: tests/fixtures/bb-348.ts ("Fixture BB-348-…", dọn theo id KÈM chi nhánh). Không gọi Lark.
 *
 * Chạy: PW_PORT=3219 npx playwright test tests/e2e/bb-348-ten-file-va-xuat.spec.ts --workers=1
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import fs from "node:fs";
import path from "node:path";
import { duLieuBB348, donDepBB348, type DuLieuBB348 } from "../fixtures/bb-348";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

let d: DuLieuBB348;
const THU_MUC = "test-results/bb-348";
fs.mkdirSync(THU_MUC, { recursive: true });

test.setTimeout(150_000);

test.beforeAll(async () => {
  d = await duLieuBB348();
});

test.afterAll(async () => {
  if (d) expect(await donDepBB348(d)).toEqual({ conBo: 0, conChiNhanh: 0, conSanPham: 0 });
});

test("Tên file cạnh số thứ tự + xuất 'Thông tin chi tiết' đúng định dạng", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await dangNhapNhanVien(page, d.emailOwner, d.password);
    await page.goto(`/admin/galleries/${d.galleryId}`, { waitUntil: "domcontentloaded" });

    // (1) Nhãn góc trái: "1 · R01_0001.JPG", tooltip là tên đầy đủ.
    const nhan = page.getByTestId("nhan-anh-chon");
    await expect(nhan).toHaveCount(3, { timeout: 40_000 });
    await expect(nhan.nth(0)).toHaveText("1 · R01_0001.JPG");
    await expect(nhan.nth(0)).toHaveAttribute("title", "R01_0001.JPG");
    await expect(nhan.nth(2)).toHaveText("3 · R01_0003.JPG");
    // Nhãn không tràn khỏi ô ảnh (cắt "…" khi dài).
    const [oNhan, oAnh] = await Promise.all([
      nhan.nth(0).boundingBox(),
      nhan.nth(0).locator("xpath=..").boundingBox(),
    ]);
    expect(oNhan!.x + oNhan!.width).toBeLessThanOrEqual(oAnh!.x + oAnh!.width);
    await page.locator("section", { hasText: "Ảnh khách đã chọn" }).first().screenshot({ path: path.join(THU_MUC, "luoi-ten-file.png") });

    // (2) Xuất "Thông tin chi tiết".
    await page.getByRole("button", { name: "Thông tin chi tiết" }).click();
    await expect(page.getByRole("button", { name: "Kèm ghi chú" })).toHaveCount(0);
    const khung = page.getByTestId("khung-danh-sach-anh");
    await expect(khung).toHaveValue(/R01_0003\.JPG/, { timeout: 30_000 });
    const dong = (await khung.inputValue()).split(/\r?\n/);
    expect(dong).toContain(`R01_0001.JPG (Dùng cho: ${"Fixture BB-348"} Album 20x20 · "xóa mụn cho bé dùm chị")`);
    expect(dong).toContain('R01_0002.JPG ("làm sáng da")');
    expect(dong).toContain("R01_0003.JPG");
    // Khối tóm tắt đầu vẫn giữ.
    expect(dong.some((x) => x.startsWith("Số ảnh đã chọn: 3"))).toBe(true);
    await khung.screenshot({ path: path.join(THU_MUC, "xuat-thong-tin-chi-tiet.png") });

    // "Tên file": mỗi dòng một tên.
    await page.getByRole("button", { name: "Tên file" }).click();
    await expect(khung).toHaveValue(/^R01_0001\.JPG\r?\nR01_0002\.JPG\r?\nR01_0003\.JPG$/, { timeout: 30_000 });
  } finally {
    await ctx.close();
  }
});
