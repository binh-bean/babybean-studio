/**
 * BB-359 — hai luồng trên trình duyệt thật (bb-dev, cổng PW_PORT), fixture "Fixture BB-359-…"
 * dọn theo id ở afterAll.
 *
 * 1. Bàn làm việc: huy hiệu menu, dòng phụ lời chào, thẻ "Cần xử lý ngay", số trên từng tab
 *    trang Việc cần xử lý — BỐN chỗ phải cùng một số. Nhân sự vai branch_manager chỉ thấy
 *    chi nhánh fixture: guiAnh (tab Khách gửi ảnh chọn) + vuot (tab Ảnh vượt hạn mức)
 *    + nhap (tab Gói chụp chưa có ảnh — luật BB-381, Đợt 18) = 3.
 *    Kiểm ngược: trả dashboard.tsx về `dongCanXuLy(merged)` → thẻ đếm theo công thức riêng,
 *    thiếu "Ảnh vượt hạn mức" → ĐỎ.
 *
 * 2. Khách mở bộ đã thu gọn: bìa + ảnh đã chọn hiện ngay, có câu "Bean đang mở lại…", rồi
 *    khi Đồng bộ lại (giả) xong thì lưới đủ 6 ảnh, KHÔNG F5. bb-dev chưa áp 0088 (không được
 *    áp) nên trạng thái "thu gọn" và route mo-lai-anh được giả ở BIÊN GIỚI MẠNG của trình
 *    duyệt: `/api/g/gallery` thật nhưng thêm `thuGon`, `/api/g/mo-lai-anh` giả; ảnh và
 *    `/api/g/photos` là THẬT (phép thử chèn 4 dòng ảnh vào bộ khi "Drive xong"). Phía máy chủ
 *    (khoá, hàm SQL, đồng bộ) được thử trên Postgres thật ở tests/unit/bb-359-thu-gon-mo-lai.test.ts.
 *    Kiểm ngược: bỏ `useMoLaiAnhThuGon` khỏi gallery-app.tsx → không có câu chờ, không POST,
 *    lưới đứng ở 2 ảnh → ĐỎ.
 */
import { test, expect } from "@playwright/test";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { duLieuBB359, donDepBB359, giaDongBoXong, type DuLieuBB359 } from "../fixtures/bb-359";
import { cheTrongDom } from "../fixtures/danh-gia";

test.describe.configure({ mode: "serial" });

let d: DuLieuBB359;

test.beforeAll(async () => {
  d = await duLieuBB359();
});

test.afterAll(async () => {
  if (!d) return;
  const con = await donDepBB359(d);
  console.info("BB359_E2E_SAU_DON", JSON.stringify(con));
  expect(con).toEqual({ conBo: 0, conChiNhanh: 0, conNhanSu: 0 });
});

test("Bàn làm việc: huy hiệu = dòng phụ = thẻ Cần xử lý ngay = tổng số trên tab", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dangNhapNhanVien(page, d.email, d.password);
  await page.goto("/admin");

  const huyHieu = page.getByTestId("badge-viec-can-xu-ly").first();
  await expect(huyHieu).toBeVisible({ timeout: 30_000 });
  const soHuyHieu = Number((await huyHieu.innerText()).replace(/\D/g, ""));

  const dongPhu = page.getByTestId("dong-phu-so-viec");
  await expect(dongPhu).toBeVisible({ timeout: 30_000 });
  const soDongPhu = Number(await dongPhu.getAttribute("data-so-viec"));
  await expect(dongPhu).toContainText(`${soDongPhu} việc cần xử lý`);

  // Thẻ có dòng, hoặc trạng thái trống ("Không có cảnh báo nào") — trống thì coi là 0 dòng.
  const the = page.getByTestId("can-xu-ly-ngay-rows");
  await expect(the.or(page.getByTestId("can-xu-ly-ngay-trong"))).toBeVisible({ timeout: 30_000 });
  const dongThe = (await the.count())
    ? await the.locator("li").evaluateAll((els) =>
        els.map((el) => ({ id: el.getAttribute("data-testid"), so: Number(el.getAttribute("data-so-viec")) })),
      )
    : [];
  const soThe = dongThe.reduce((t, x) => t + x.so, 0);

  await page.goto("/admin/viec-can-xu-ly");
  const tabs = page.locator('[data-testid^="tab-"][data-so-viec]');
  await expect(tabs.first()).toBeVisible({ timeout: 30_000 });
  // số tab đọc cùng context với huy hiệu — chờ context có số
  await expect.poll(async () => Number(await page.getByTestId("tab-over-quota").getAttribute("data-so-viec")), { timeout: 30_000 }).toBeGreaterThan(0);
  const soTab = await tabs.evaluateAll((els) =>
    els.map((el) => ({ id: el.getAttribute("data-testid")!.replace(/^tab-/, ""), so: Number(el.getAttribute("data-so-viec")) })),
  );
  const tongTab = soTab.reduce((t, x) => t + x.so, 0);
  // Trang Việc cần xử lý là một lượt tải MỚI: so số tab với huy hiệu CỦA CHÍNH lượt tải đó.
  const soHuyHieuTrangViec = Number((await page.getByTestId("badge-viec-can-xu-ly").first().innerText()).replace(/\D/g, ""));

  console.info("BB359_DEM", JSON.stringify({ soHuyHieu, soDongPhu, soThe, tongTab, soHuyHieuTrangViec, dongThe, soTab }));

  // Fixture: đúng 1 "Khách gửi ảnh chọn" + 1 "Ảnh vượt hạn mức" + 1 "Gói chụp chưa có ảnh"
  // (bộ nhap 0 ảnh — từ BB-381 là một việc có tab riêng). Mỗi tab đúng số của fixture,
  // không chỉ tổng: tổng khớp mà lệch tab (vd bộ đã có ảnh vẫn bị đếm "chưa có ảnh") là ĐỎ.
  expect(Object.fromEntries(soTab.filter((x) => x.so > 0).map((x) => [x.id, x.so]))).toEqual({
    "khach-mua-them": 1,
    "over-quota": 1,
    "goi-chua-co-anh": 1,
  });
  expect(soHuyHieu).toBe(3);
  expect(soDongPhu).toBe(soHuyHieu);
  expect(soThe).toBe(soHuyHieu);
  expect(tongTab).toBe(soHuyHieuTrangViec);
  expect(tongTab).toBe(3);
  // tab nào có số > 0 thì thẻ có đúng một dòng cùng số (và ngược lại)
  const theoTab = soTab.filter((x) => x.so > 0).map((x) => [`can-xu-ly-ngay-${x.id}`, x.so]);
  expect(dongThe.map((x) => [x.id, x.so])).toEqual(theoTab);
  expect(dongThe.map((x) => x.id)).toContain("can-xu-ly-ngay-over-quota");
});

test("Khách mở bộ đã thu gọn: bìa + ảnh chọn ngay, câu chờ, đủ ảnh không cần F5", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await chanLh3TrenTrinhDuyet(page);

  let daXong = false;
  let soLanPost = 0;
  await page.route("**/api/g/gallery?*", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    if (json?.data) json.data.thuGon = !daXong;
    await route.fulfill({ response: res, json });
  });
  await page.route("**/api/g/mo-lai-anh", async (route) => {
    if (route.request().method() === "POST") {
      soLanPost++;
      if (soLanPost === 1) {
        // "Drive" chạy 3 giây rồi xong.
        setTimeout(() => {
          void giaDongBoXong(d).then(() => {
            daXong = true;
          });
        }, 3_000);
      }
      await route.fulfill({ status: 202, json: { data: { trangThai: soLanPost === 1 ? "da_nhan" : "dang_mo" } } });
      return;
    }
    await route.fulfill({ status: 200, json: { data: { thuGon: !daXong } } });
  });

  await page.goto(`/g/${d.tokenDaGiao}`);
  await page.evaluate(() => {
    (window as unknown as { __bb359KhongF5: number }).__bb359KhongF5 = 1;
  });

  const cauCho = page.getByTestId("dang-mo-lai-anh");
  await expect(cauCho).toBeVisible({ timeout: 30_000 });
  await expect(cauCho).toHaveText("Bean đang mở lại toàn bộ ảnh của bé, ba mẹ chờ chút ạ");
  // Ngay lúc mở: chỉ bìa + ảnh đã chọn
  await expect(page.getByTestId("the-anh")).toHaveCount(2, { timeout: 30_000 });
  expect(soLanPost).toBe(1);

  // Đồng bộ xong → đủ 6 ảnh, câu chờ biến mất, trang KHÔNG tải lại
  await expect(page.getByTestId("the-anh")).toHaveCount(6, { timeout: 30_000 });
  await expect(cauCho).toBeHidden();
  const conDau = await page.evaluate(() => (window as unknown as { __bb359KhongF5?: number }).__bb359KhongF5);
  expect(conDau).toBe(1);
  expect(soLanPost).toBe(1);
});

test("Che nhân sự thật trước khi chụp (Q09): bắt cả tài khoản KHÔNG có '@'", async ({ page }) => {
  // Tên bịa đóng vai "nhân sự thật"; dòng Fixture phải giữ nguyên.
  await page.setContent(`
    <table><tbody>
      <tr><td><span>TB</span></td><td>Trần Văn Bịa</td><td>tranvanbia</td><td>0901 234 567</td></tr>
      <tr><td><span>LH</span></td><td>Lê Thị Hư</td><td>le.hu@gmail.test</td></tr>
      <tr><td><span>FX</span></td><td>Fixture DANHGIA8-A Quản lý</td><td>fixture.ql@demo.babybean.vn</td></tr>
    </tbody></table>`);
  const daChe = await page.evaluate(
    ([maHam, ds]) => {
      const fn = new Function(`return (${maHam})`)() as (r: HTMLElement, t: string[]) => number;
      return fn(document.body, ds);
    },
    [cheTrongDom.toString(), ["Trần Văn Bịa", "Lê Thị Hư"]] as [string, string[]],
  );
  expect(daChe).toBe(2);
  const chu = await page.locator("body").innerText();
  for (const lo of ["Trần Văn Bịa", "tranvanbia", "0901 234 567", "Lê Thị Hư", "le.hu@gmail.test", "TB", "LH"]) {
    expect(chu).not.toContain(lo);
  }
  expect(chu).toContain("Fixture DANHGIA8-A Quản lý");
  expect(chu).toContain("fixture.ql@demo.babybean.vn");
});
