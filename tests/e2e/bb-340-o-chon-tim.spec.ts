/**
 * BB-340 — ô chọn có tìm kiếm ở danh sách dài.
 *
 * Mở Quản lý bộ ảnh, thử bộ lọc "Trạng thái" (10 trạng thái + "Tất cả" = 11
 * mục, dài hơn ngưỡng 7 nên là ô gõ-để-lọc), gõ vài chữ và kiểm danh sách
 * thật sự co lại — kể cả khi gõ không dấu / gõ hoa.
 *
 * Dữ liệu: một nhân viên thử "Fixture BB-340-…" tạo bằng service role, xoá
 * theo id ở afterAll. Không ghi gì vào bộ ảnh nào.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const email = `test_bb340_${runId}@demo.babybean.vn`;
const password = "Password123!";
let userId: string | undefined;
let pgClient: Client | undefined;

test.describe("BB-340: ô chọn có tìm kiếm", () => {
  test.beforeAll(async () => {
    const quanTri = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await quanTri.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;

    pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgClient.connect();
    await pgClient.query(
      `INSERT INTO staff_profiles (id, full_name, email, role) VALUES ($1, $2, $3, 'owner')`,
      [userId, `Fixture BB-340-${runId}`, email],
    );
  });

  test.afterAll(async () => {
    if (pgClient && userId) {
      await pgClient.query(`DELETE FROM staff_profiles WHERE id = $1`, [userId]);
    }
    if (pgClient) await pgClient.end();
    if (userId) {
      const quanTri = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      await quanTri.auth.admin.deleteUser(userId);
    }
  });

  test("gõ chữ thì danh sách trạng thái co lại, bỏ dấu và không phân biệt hoa thường", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/galleries");

    const oTrangThai = page.getByRole("combobox", { name: "Trạng thái", exact: true });
    await expect(oTrangThai).toBeVisible({ timeout: 20_000 });

    // Mở: thấy đủ 11 mục (Tất cả + 10 trạng thái).
    await oTrangThai.click();
    const danhSach = page.getByRole("listbox", { name: "Trạng thái" });
    await expect(danhSach).toBeVisible();
    await expect(danhSach.getByRole("option")).toHaveCount(11);

    // Gõ KHÔNG DẤU "da gi" -> chỉ còn "Đã giao".
    await oTrangThai.pressSequentially("da gi");
    await expect(danhSach.getByRole("option")).toHaveCount(1);
    await expect(danhSach.getByRole("option", { name: "Đã giao" })).toBeVisible();

    // Gõ HOA, không dấu: "QUA HAN" -> "Quá hạn".
    await oTrangThai.fill("QUA HAN");
    await expect(danhSach.getByRole("option")).toHaveCount(1);
    await expect(danhSach.getByRole("option", { name: "Quá hạn" })).toBeVisible();

    // Gõ một chữ chung "da" -> nhiều mục (Đã chốt, Đã giao, Đang ...), vẫn ít hơn 11.
    await oTrangThai.fill("da");
    const soKhop = await danhSach.getByRole("option").count();
    expect(soKhop).toBeGreaterThan(1);
    expect(soKhop).toBeLessThan(11);

    // Không khớp gì -> báo rỗng, không còn mục nào.
    await oTrangThai.fill("zzzz");
    await expect(danhSach.getByRole("option")).toHaveCount(0);
    await expect(danhSach.getByText("Không có mục nào khớp")).toBeVisible();

    // Enter chọn mục đang sáng: gõ lại "da gi" rồi Enter.
    await oTrangThai.fill("da gi");
    await expect(danhSach.getByRole("option")).toHaveCount(1);
    await oTrangThai.press("Enter");
    await expect(danhSach).toHaveCount(0);
    await expect(oTrangThai).toHaveValue("Đã giao");
    // Bộ lọc thật sự được áp: nút "Xoá lọc" chỉ hiện khi có bộ lọc đang bật.
    await expect(page.getByRole("button", { name: /Xoá lọc/ })).toBeVisible();
  });

  test("mũi tên chọn mục, Esc đóng mà không đổi giá trị", async ({ page }) => {
    await dangNhapNhanVien(page, email, password);
    await page.goto("/admin/galleries");

    const oTrangThai = page.getByRole("combobox", { name: "Trạng thái", exact: true });
    await expect(oTrangThai).toBeVisible({ timeout: 20_000 });
    const truoc = await oTrangThai.inputValue();

    // Esc: mở rồi đóng, giá trị y nguyên.
    await oTrangThai.click();
    const danhSach = page.getByRole("listbox", { name: "Trạng thái" });
    await expect(danhSach).toBeVisible();
    await oTrangThai.press("Escape");
    await expect(danhSach).toHaveCount(0);
    await expect(oTrangThai).toHaveValue(truoc);

    // Mũi tên xuống hai lần rồi Enter -> chọn mục thứ ba trong danh sách (đang sáng "Tất cả" ở đầu).
    await oTrangThai.click();
    await expect(danhSach).toBeVisible();
    await oTrangThai.press("ArrowDown");
    await oTrangThai.press("ArrowDown");
    const dangSang = await oTrangThai.getAttribute("aria-activedescendant");
    expect(dangSang).toBeTruthy();
    const nhanDangSang = (await page.locator(`[id="${dangSang}"]`).innerText()).trim();
    await oTrangThai.press("Enter");
    await expect(danhSach).toHaveCount(0);
    await expect(oTrangThai).toHaveValue(nhanDangSang);
    expect(nhanDangSang).not.toBe(truoc);
  });
});
