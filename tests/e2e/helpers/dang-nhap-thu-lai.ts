import type { Page } from "@playwright/test";

/**
 * Đăng nhập nhân viên, tự chờ và thử lại khi Supabase Auth chặn tốc độ.
 *
 * OWNER: QA-BOT. Việc BB-266 — nhiều agent chạy phép thử song song trên cùng
 * bb-dev, từ cùng một máy (127.0.0.1 / ::1).
 *
 * Đăng nhập nhân viên gọi thẳng `supabase.auth.signInWithPassword` NGAY TỪ
 * TRÌNH DUYỆT (src/app/(auth)/login/page.tsx) — không qua route nào của app.
 * Hạn mức "đăng nhập quá nhanh" vì vậy không nằm trong `src/`: đó là hạn mức
 * MẶC ĐỊNH của chính Supabase Auth (GoTrue), khoá theo ĐỊA CHỈ IP gọi tới,
 * không theo email. Nhiều agent cùng bấm đăng nhập tài khoản thử của MÌNH từ
 * cùng một máy thì vẫn ăn chung đúng một hạn mức đó — đổi email nhân viên mỗi
 * lượt (như các spec khác đã làm cho việc cách ly dữ liệu) không né được.
 *
 * Không được nới hạn mức hay thêm cửa sau trong mã app (AGENTS.md §2.8: QA-BOT
 * cấm sửa code sản phẩm để test qua). Cách an toàn duy nhất còn lại: nhận diện
 * đúng lúc bị chặn qua PHẢN HỒI MẠNG của chính lời gọi `signInWithPassword`
 * (status 429), rồi chờ có giãn cách và thử lại có giới hạn số lần — không
 * đoán qua thông báo hiển thị trên form, vì màn đăng nhập cố tình trả CÙNG MỘT
 * câu cho sai mật khẩu lẫn bị chặn tốc độ.
 */
export async function dangNhapNhanVien(
  page: Page,
  email: string,
  password: string,
  opts: { sauKhiVao?: string } = {},
): Promise<void> {
  const sauKhiVao = opts.sauKhiVao ?? "**/admin**";
  const soLanToiDa = 4;
  let choLan = 5_000;

  for (let lan = 1; lan <= soLanToiDa; lan++) {
    await page.goto("/login");
    await page.waitForURL("**/login**");

    const choPhanHoi = page
      .waitForResponse(
        (res) => res.url().includes("/auth/v1/token") && res.request().method() === "POST",
        { timeout: 15_000 },
      )
      .catch(() => null);

    await page.getByLabel("Tên tài khoản hoặc email").fill(email);
    await page.getByLabel("Mật khẩu").fill(password);
    await page.getByRole("button", { name: /Đăng nhập/i }).click();

    const phanHoi = await choPhanHoi;
    const biChanToDo = phanHoi ? phanHoi.status() === 429 : false;

    if (!biChanToDo) {
      await page.waitForURL(sauKhiVao, { timeout: 15_000 });
      return;
    }

    if (lan === soLanToiDa) {
      throw new Error(
        `Đăng nhập "${email}" bị Supabase Auth chặn tốc độ (429) sau ${soLanToiDa} ` +
          `lần thử — có agent khác đang đăng nhập cùng lúc từ cùng máy. Không nới hạn ` +
          `mức trong mã app; chờ bớt agent chạy song song rồi thử lại.`,
      );
    }
    await page.waitForTimeout(choLan);
    choLan *= 2;
  }
}
