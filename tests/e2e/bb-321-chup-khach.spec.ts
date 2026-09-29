/**
 * BB-321 (phía khách) — chụp màn THẬT để đặt cạnh bản vẽ anh duyệt
 * (`babybean-assets/BB-321/ban-ve/`), và kiểm luồng khách bằng hành vi.
 *
 * ---------------------------------------------------------------------------
 * DỮ LIỆU: bộ ảnh THẬT (fixture) + API ĐỢT GIẢ LẬP
 * ---------------------------------------------------------------------------
 * Migration 0077 (selection_rounds, cột `dot`) CHƯA áp lên bb-dev, nên hai route
 * đợt được giả lập bằng `page.route` — đúng hình dạng hợp đồng của DEV-BE
 * (`layTrangThaiDotChoKhach`, `POST /api/g/dot-chon/chot`, `POST /api/g/submit`):
 *   · GET  /api/g/dot-chon          → trạng thái đợt (đổi theo từng bước)
 *   · POST /api/g/dot-chon/chot     → ghi lại body để kiểm, trả đợt 2
 *   · POST /api/g/submit            → ghi lại body để kiểm (không chốt thật)
 * Mọi thứ khác (bộ ảnh, ảnh, đăng nhập link, danh mục sản phẩm) chạy THẬT trên
 * fixture "Fixture BB321K-…" (tests/fixtures/bb321-khach.ts), dọn ở afterAll.
 * Không có gì gửi ra Lark (không route thật nào ghi được ở đây).
 *
 * Chạy: MOCK_DRIVE_TRE=1 PW_PORT=3183 npx playwright test tests/e2e/bb-321-chup-khach.spec.ts --workers=1
 * Ảnh ra: babybean-assets/BB-321/chup-khach/ (đổi bằng BB321_RA).
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { duLieuBb321K, donDepBb321K, DA_CHON_DOT1, type DuLieuBb321K } from "../fixtures/bb321-khach";
import { CAU_BIET_ANH_IN_CHAM, CAU_DONG_Y_STUDIO_CHON } from "@/lib/gallery/dot-chon";

const RA = process.env.BB321_RA ?? "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-321\\chup-khach";
fs.mkdirSync(RA, { recursive: true });

const KT = { dt: { width: 390, height: 844 }, mt: { width: 1440, height: 900 } } as const;
type Kt = keyof typeof KT;

let d: DuLieuBb321K;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.beforeAll(async () => {
  d = await duLieuBb321K();
});
test.afterAll(async () => {
  if (d) {
    const con = await donDepBb321K(d);
    expect(con, "còn chi nhánh fixture chưa dọn").toBe(0);
  }
});

// ---------------------------------------------------------------------------
// API đợt giả lập
// ---------------------------------------------------------------------------

const cauDongY = { studioChon: CAU_DONG_Y_STUDIO_CHON, bietAnhInCham: CAU_BIET_ANH_IN_CHAM };

function ttDot(over: Record<string, unknown> = {}) {
  return {
    cheDoChonThem: true,
    coTheChot: true,
    giaMoiAnh: 30000,
    hanMuc: 12,
    daChonTruoc: DA_CHON_DOT1.length,
    cacDot: [] as unknown[],
    dotTheoAnh: {} as Record<string, number>,
    banNhap: null,
    soAnhThieu: 0,
    soSanPhamInChuaAnh: 0,
    dot1: { nhoStudioChonThem: 0, dongYAnhStudioChon: false, soSanPhamInChuaAnh: 0, bietAnhInChamHon: false },
    cauDongY,
    ...over,
  };
}

const BA_DOT = [
  { soDot: 2, trangThai: "da_xac_nhan", soAnh: 3, tienAnh: 90000, tienSanPham: 40000, tong: 130000, lyDoTuChoi: null, submittedAt: "2026-09-20T03:00:00Z", confirmedAt: "2026-09-21T03:00:00Z", sanPham: [{ ten: "UV 10x15", soLuong: 2 }] },
  { soDot: 3, trangThai: "tu_choi", soAnh: 1, tienAnh: 30000, tienSanPham: 0, tong: 30000, lyDoTuChoi: "Tấm này trùng đợt trước.", submittedAt: "2026-09-25T03:00:00Z", confirmedAt: null, sanPham: [] },
  { soDot: 4, trangThai: "cho_xac_nhan", soAnh: 2, tienAnh: 60000, tienSanPham: 0, tong: 60000, lyDoTuChoi: null, submittedAt: "2026-09-29T03:00:00Z", confirmedAt: null, sanPham: [] },
];

interface GiaLap {
  tt: Record<string, unknown>;
  bodyChot: Record<string, unknown> | null;
  bodySubmit: Record<string, unknown> | null;
}

async function giaLapApiDot(page: Page, g: GiaLap) {
  await page.route(
    (u) => u.pathname === "/api/g/dot-chon",
    (r: Route) => r.fulfill({ json: { data: g.tt } }),
  );
  await page.route(
    (u) => u.pathname === "/api/g/dot-chon/chot",
    async (r: Route) => {
      g.bodyChot = r.request().postDataJSON() as Record<string, unknown>;
      // Sau khi chốt: màn chính thấy đủ ba trạng thái (đã xác nhận / từ chối / chờ).
      g.tt = ttDot({ cacDot: BA_DOT });
      await r.fulfill({ json: { data: { soDot: 2, trangThai: "cho_xac_nhan", soAnh: 3, tong: 0 } } });
    },
  );
  await page.route(
    (u) => u.pathname === "/api/g/submit",
    async (r: Route) => {
      g.bodySubmit = r.request().postDataJSON() as Record<string, unknown>;
      await r.fulfill({ status: 400, json: { error: { code: "INVALID_INPUT", message: "Giả lập: không chốt thật trong phép chụp." } } });
    },
  );
}

// ---------------------------------------------------------------------------
// Tiện ích chụp
// ---------------------------------------------------------------------------

async function choAnh(page: Page) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.images)
          .filter((i) => {
            const r = i.getBoundingClientRect();
            return r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
          })
          .every((i) => i.complete),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(600);
}

async function chup(page: Page, ten: string, k: Kt) {
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await choAnh(page);
  // Lề phải: không phần tử nào tràn khỏi màn (trừ vùng tự cuộn ngang có chủ đích).
  const tran = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tran, `${ten}-${k}: trang tràn ngang`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(RA, `${ten}-${k}.png`) });
}

async function moBo(page: Page, k: Kt, token: string) {
  await page.setViewportSize(KT[k]);
  await chanLh3TrenTrinhDuyet(page);
  await page.goto(`/g/${token}`);
  await page.locator("#dau-luoi-anh").first().waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Các ca
// ---------------------------------------------------------------------------

for (const k of ["dt", "mt"] as Kt[]) {
  test(`K321-a ${k}: lưới đợt 2 → sản phẩm → hộp chốt → trạng thái đợt`, async ({ page }) => {
    const g: GiaLap = { tt: ttDot(), bodyChot: null, bodySubmit: null };
    await giaLapApiDot(page, g);
    await moBo(page, k, d.chonThem.token);

    // Thẻ trên màn chính (chưa có đợt nào) → lối vào.
    const the = page.getByTestId("chon-them-anh");
    await expect(the).toBeVisible({ timeout: 30_000 });
    await expect(the).toContainText("Thêm ảnh cho bé Mít");
    await the.getByRole("button", { name: "Chọn thêm ảnh" }).click();

    // 1. Lưới đợt 2 — ĐÚNG lưới màn chính: 12 tấm đợt 1 mang huy hiệu, không có tim.
    const man = page.getByTestId("man-chon-them-anh");
    await expect(man).toBeVisible();
    await expect(man.getByTestId("dong-dau-man-dot")).toHaveText(/^Chọn thêm ảnh cho bé Mít · 30\.000\s₫\/ảnh$/);
    await expect(man.getByTestId("cau-tong-dot")).toHaveText("Chưa chọn ảnh mới");
    await expect(man.getByTestId("nut-chot-dot")).toBeDisabled();
    const chipDaChon = man.getByRole("button", { name: /^Đã chọn/ });
    await expect(chipDaChon).toHaveText(new RegExp(`^Đã chọn\s*${DA_CHON_DOT1.length}$`));
    await chipDaChon.click();
    // Lưới cuộn ảo chỉ dựng tấm trong tầm nhìn: mọi huy hiệu ĐANG dựng đều là "Đợt 1".
    const huyHieu = man.getByTestId("huy-hieu-khoa");
    await expect(huyHieu.first()).toHaveText("Đợt 1");
    for (const t of await huyHieu.allTextContents()) expect(t).toBe("Đợt 1");
    await expect(man.getByRole("button", { name: "Bỏ chọn" })).toHaveCount(0); // tấm khoá không có tim
    await man.getByRole("button", { name: /^Tất cả/ }).click();
    await chup(page, "1-luoi-dot2-truoc", k);

    const timChuaChon = man.getByRole("button", { name: "Chọn ảnh này" });
    for (let i = 0; i < 3; i++) await timChuaChon.first().evaluate((el) => (el as HTMLElement).click());
    await expect(man.getByTestId("cau-tong-dot")).toHaveText(/^3 ảnh mới · 90\.000\s₫$/);
    await expect(man.getByTestId("nut-chot-dot")).toHaveText("Chốt đợt 2");
    await expect(man.getByTestId("nut-chot-dot")).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await chup(page, "1-luoi-dot2", k);

    // 2. Sản phẩm — mở CỬA HÀNG đã duyệt; không có "Edit file".
    await man.getByRole("button", { name: "Thêm ảnh in, khung, album" }).click();
    const ch = page.getByRole("dialog", { name: "Mua thêm sản phẩm" });
    await expect(ch).toBeVisible();
    await expect(ch).toContainText("Tính vào đợt 2");
    await expect(ch).not.toContainText(/edit file/i);
    await expect(ch).not.toContainText(/\d+x\d+/); // kích thước luôn "10×15"
    await ch.getByRole("button", { name: "Thêm ảnh vào tấm này" }).click();
    const luoiChon = page.getByRole("dialog", { name: "Chọn ảnh để đặt in" });
    const oChon = luoiChon.locator("button[aria-pressed]");
    await oChon.nth(0).click();
    await oChon.nth(1).click();
    await luoiChon.getByRole("button", { name: /Xong/ }).click();
    await expect(ch).toContainText("Ảnh · 2 tấm");
    await chup(page, "2-san-pham-dot2", k);
    await ch.getByRole("button", { name: /^Thêm vào giỏ · / }).click();
    await expect(ch.getByTestId("da-them-vao-gio")).toBeVisible();

    // Thêm một album (đặt mua, ảnh đưa vào sau) để hộp chốt có khối nhắc + ô tick.
    await ch.getByRole("button", { name: "Album", exact: true }).click();
    await ch.getByRole("button", { name: "Thêm vào giỏ", exact: true }).click();
    await expect(ch.getByTestId("da-them-vao-gio")).toBeVisible();
    await ch.getByRole("button", { name: "Đóng" }).first().click();
    await expect(man.getByTestId("cau-tong-dot")).toHaveText(/^3 ảnh mới · 3 sản phẩm · [\d.]+\s₫$/);

    // 3. Hộp chốt đợt 2 — cùng số với thanh đáy; ô tick bắt buộc khi album chưa có ảnh.
    const tongThanh = (await man.getByTestId("cau-tong-dot").textContent())!.split(" · ").at(-1)!;
    await man.getByTestId("nut-chot-dot").click();
    const hop = page.getByTestId("hop-xac-nhan-dot");
    await expect(hop).toBeVisible();
    await expect(hop.getByRole("heading")).toHaveText("Chốt đợt 2 cho bé Mít");
    await expect(hop.getByTestId("tong-tien-dot")).toHaveText(tongThanh);
    await expect(hop).not.toContainText("trong gói");
    await expect(hop.getByTestId("nhac-in-chua-anh-dot")).toContainText(CAU_BIET_ANH_IN_CHAM);
    await expect(hop.getByTestId("nut-xac-nhan-chot-dot")).toBeDisabled();
    await expect(hop.getByTestId("ly-do-khoa-chot-dot")).toHaveText("Tích ô bên trên để chốt");
    await chup(page, "3-hop-chot-dot2", k);

    await hop.getByText(CAU_BIET_ANH_IN_CHAM).click();
    await expect(hop.getByTestId("nut-xac-nhan-chot-dot")).toBeEnabled();
    await hop.getByTestId("nut-xac-nhan-chot-dot").click();
    await expect.poll(() => g.bodyChot).not.toBeNull();
    expect(g.bodyChot!.photoIds as string[]).toHaveLength(3);
    for (const id of g.bodyChot!.photoIds as string[]) {
      expect(DA_CHON_DOT1.map((i) => d.chonThem.anh.get(i))).not.toContain(id); // không gửi tấm đã khoá
    }
    expect((g.bodyChot!.items as unknown[]).length).toBe(3); // 2 tấm in + 1 album
    expect(g.bodyChot!.bietAnhInChamHon).toBe(true);

    // 4. Trạng thái đợt trên màn chính — MỘT thẻ, đúng chỗ dải BB-312.
    await expect(page.getByTestId("man-chon-them-anh")).toHaveCount(0);
    const dot4 = page.getByTestId("trang-thai-dot-4");
    await expect(dot4).toContainText("Đang chờ studio xác nhận", { timeout: 20_000 });
    await expect(page.getByTestId("trang-thai-dot-3")).toContainText("Studio chưa nhận đợt này");
    await expect(page.getByTestId("ly-do-dot-3")).toHaveText("Lý do: Tấm này trùng đợt trước.");
    await expect(page.getByTestId("trang-thai-dot-2")).toContainText("Studio đã xác nhận");
    await expect(page.getByTestId("trang-thai-dot-2")).toContainText("UV 10×15 ×2");
    await page.getByTestId("thong-bao-trang-thai").getByRole("button").click().catch(() => {});
    // Bản vẽ duyệt: khối "Bộ ảnh đang ở chế độ xem lại" nằm TRÊN thẻ các đợt.
    const khoiKhoa = page.getByText("Bộ ảnh đang ở chế độ xem lại");
    const yKhoa = (await khoiKhoa.boundingBox())!.y;
    const yThe = (await page.getByTestId("chon-them-anh").boundingBox())!.y;
    expect(yKhoa).toBeLessThan(yThe);
    await khoiKhoa.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 1024 ? 150 : 90);
      window.scrollTo(0, top);
    });
    await page.waitForTimeout(500);
    await chup(page, "4-trang-thai-dot", k);
  });

  test(`K321-b ${k}: hộp chốt ĐỢT 1 — thiếu 3 ảnh + Gỗ 20×30 chưa có ảnh`, async ({ page }) => {
    const g: GiaLap = {
      tt: ttDot({ cheDoChonThem: false, hanMuc: 15, soAnhThieu: 3, soSanPhamInChuaAnh: 1 }),
      bodyChot: null,
      bodySubmit: null,
    };
    await giaLapApiDot(page, g);
    await moBo(page, k, d.dot1.token);
    await expect(page.getByTestId("chon-them-anh")).toHaveCount(0); // đợt 1 chưa chốt: chưa có "Chọn thêm"

    await page.locator("#dau-luoi-anh").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -8));
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Chốt danh sách" }).click();

    const khoiA = page.getByTestId("nhac-nho-studio-chon");
    const khoiB = page.getByTestId("nhac-in-chua-anh");
    await expect(khoiA).toContainText("Còn 3 ảnh trong gói — nhờ studio chọn giúp");
    await expect(khoiA).toContainText(CAU_DONG_Y_STUDIO_CHON);
    await expect(khoiB).toContainText("Gỗ 20×30 còn thiếu 1 ảnh.");
    await expect(khoiB).toContainText(CAU_BIET_ANH_IN_CHAM);

    const nut = page.getByRole("button", { name: "Xác nhận", exact: true });
    // Tích ô chung "Tôi xác nhận…": nút VẪN khoá — chọn thiếu thì ô đồng ý studio chọn
    // dùm BẮT BUỘC (không có đường thứ ba), và ô ảnh in cũng bắt buộc.
    await page.getByTestId("o-xac-nhan-chot").setChecked(true, { force: true });
    await expect(nut).toBeDisabled();
    await expect(page.getByTestId("ly-do-khoa-nut-chot")).toHaveText("Tích đủ các ô để xác nhận");
    await khoiA.getByText(CAU_DONG_Y_STUDIO_CHON).click();
    await expect(nut).toBeDisabled(); // còn ô ảnh in

    await page.getByRole("heading", { name: /Chốt ảnh cho/ }).scrollIntoViewIfNeeded();
    await chup(page, "5-hop-chot-dot1-dau", k);
    await nut.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await chup(page, "5-hop-chot-dot1", k);

    await khoiB.getByText(CAU_BIET_ANH_IN_CHAM).click();
    await expect(nut).toBeEnabled();
    await nut.click();
    await expect.poll(() => g.bodySubmit).not.toBeNull();
    expect(g.bodySubmit).toMatchObject({ nhoStudioChonThem: true, dongYAnhStudioChon: true, bietAnhInChamHon: true, agreed: true });
  });
}
