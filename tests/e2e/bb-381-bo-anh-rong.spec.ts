/**
 * BB-381 — bộ ảnh 0 tấm trên trình duyệt thật (bb-dev, cổng PW_PORT), fixture "Fixture BB-381-…"
 * (tests/fixtures/bb-381.ts) dọn theo id ở afterAll. Nhân sự branch_manager chỉ thấy chi nhánh thử.
 *
 * 1. Việc cần xử lý có HAI mục mới:
 *    · "Gói chụp chưa có ảnh": đúng 2 dòng (chưa đồng bộ + chưa có link), kèm lý do + hướng dẫn;
 *      bộ đang lỗi Drive chỉ được đếm ở chân tab (không thành dòng, không đếm hai lần).
 *    · "Đơn hậu kỳ mua thêm": đúng 1 dòng, thành phần "UV 13x18 ×2 · Edit file ×5", chỉ tới bộ gốc.
 * 2. Chi tiết bộ gốc hiện "Đơn mua thêm ngoài app: HD_… · …"; chi tiết đơn hậu kỳ nói không gửi link.
 * 3. Đơn hậu kỳ rời hàng "Bộ ảnh chưa có ảnh" cũ (/api/admin/can-xu-ly).
 *
 * Kiểm ngược (đã chạy, xem bàn giao): cho `phanLoaiHoaDon` coi mọi dòng là dịch vụ chụp → tab
 * "Đơn hậu kỳ mua thêm" trống, tab gói chụp có 3 dòng → ĐỎ.
 */
import { test, expect } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { duLieuBB381, donDepBB381, type DuLieuBB381 } from "../fixtures/bb-381";

test.describe.configure({ mode: "serial" });

const ANH = process.env.BB381_ANH_DIR;
let d: DuLieuBB381;

test.beforeAll(async () => {
  // bb-dev dùng chung với các đội khác: tạo tài khoản thử có lúc chậm hơn 60 giây mặc định.
  test.setTimeout(180_000);
  d = await duLieuBB381();
});

test.afterAll(async () => {
  if (!d) return;
  const con = await donDepBB381(d);
  console.info("BB381_E2E_SAU_DON", JSON.stringify(con));
  expect(con).toEqual({ conBo: 0, conChiNhanh: 0, conNhanSu: 0, conSanPham: 0 });
});

test("Việc cần xử lý: hai mục mới — gói chụp chưa có ảnh + đơn hậu kỳ mua thêm", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, d.email, d.password);

  await page.goto("/admin/viec-can-xu-ly?tab=goi-chua-co-anh");
  const bang = page.getByTestId("bang-goi-chua-co-anh");
  await expect(bang).toBeVisible({ timeout: 120_000 });
  const dong = page.getByTestId("dong-goi-chua-co-anh");
  await expect(dong).toHaveCount(2, { timeout: 30_000 });
  const lyDo = await dong.evaluateAll((els) => els.map((e) => e.getAttribute("data-ly-do")).sort());
  expect(lyDo).toEqual(["chua_co_link", "chua_dong_bo"]);
  await expect(dong.filter({ hasText: "Chưa đồng bộ ảnh" })).toContainText("bấm Đồng bộ");
  await expect(dong.filter({ hasText: "Chưa có link Drive" })).toContainText("Dán link thư mục ảnh");
  await expect(page.getByTestId("goi-chua-co-anh-o-loi-tai")).toContainText("Thêm 1 bộ có gói chụp đang lỗi Drive");
  await expect(page.getByTestId("goi-chua-co-anh-o-loi-tai")).toContainText("thư mục chưa chia sẻ 1");
  // số trên tab = số dòng
  await expect.poll(async () => Number(await page.getByTestId("tab-goi-chua-co-anh").getAttribute("data-so-viec")), { timeout: 30_000 }).toBe(2);
  if (ANH) await page.screenshot({ path: `${ANH}/1-goi-chua-co-anh.png`, fullPage: true });

  await page.getByTestId("tab-don-hau-ky").click();
  const dongHk = page.getByTestId("dong-don-hau-ky");
  await expect(dongHk).toHaveCount(1, { timeout: 30_000 });
  await expect(dongHk).toContainText(d.maDonHk);
  await expect(page.getByTestId("thanh-phan-don-hau-ky")).toHaveText(/UV 13x18 ×2 · .*Edit file ×5/);
  await expect(page.getByTestId("link-bo-goc")).toHaveAttribute("href", `/admin/galleries/${d.goc}`);
  await expect.poll(async () => Number(await page.getByTestId("tab-don-hau-ky").getAttribute("data-so-viec")), { timeout: 30_000 }).toBe(1);
  if (ANH) await page.screenshot({ path: `${ANH}/2-don-hau-ky.png`, fullPage: true });

  // Hàng "Bộ ảnh chưa có ảnh" cũ không còn đơn hậu kỳ.
  const cxl = await page.request.get("/api/admin/can-xu-ly");
  const j = (await cxl.json()) as { data: { chuaCoAnh: Array<{ id: string }>; driveChuaChiaSe: Array<{ id: string }> } };
  const idRong = j.data.chuaCoAnh.map((x) => x.id);
  expect(idRong).toContain(d.goiRong);
  expect(idRong).not.toContain(d.donHk);
});

test("Chi tiết: bộ gốc hiện đơn mua thêm ngoài app; đơn hậu kỳ nói không gửi link", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, d.email, d.password);

  await page.goto(`/admin/galleries/${d.goc}`);
  const khoi = page.getByTestId("khoi-don-mua-them-ngoai-app");
  await expect(khoi).toBeVisible({ timeout: 120_000 });
  await expect(khoi).toContainText(`Đơn mua thêm ngoài app: ${d.maDonHk}`);
  await expect(khoi).toContainText("UV 13x18 ×2");
  if (ANH) await page.screenshot({ path: `${ANH}/3-bo-goc.png`, fullPage: false });

  await page.goto(`/admin/galleries/${d.donHk}`);
  const khoiHk = page.getByTestId("khoi-don-hau-ky");
  await expect(khoiHk).toBeVisible({ timeout: 120_000 });
  await expect(khoiHk).toContainText("không gửi link cho khách");
  await expect(khoiHk.getByRole("link")).toHaveAttribute("href", `/admin/galleries/${d.goc}`);
  if (ANH) await page.screenshot({ path: `${ANH}/4-don-hau-ky-chi-tiet.png`, fullPage: false });

  // Bộ có gói chụp (không phải hậu kỳ) không hiện khối nào.
  await page.goto(`/admin/galleries/${d.goiRong}`);
  await expect(page.getByText("Trạng thái").first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("khoi-don-hau-ky")).toHaveCount(0);
});
