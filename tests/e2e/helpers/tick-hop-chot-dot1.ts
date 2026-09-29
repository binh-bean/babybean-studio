import type { Locator, Page } from "@playwright/test";

/**
 * Tích các ô của hộp "Chốt danh sách" (đợt 1) — BB-321.
 *
 * Từ BB-321 (chủ studio 29/09/2026) hộp chốt đợt 1 có thể có thêm hai ô BẮT BUỘC
 * ngoài ô chung "Tôi xác nhận các thông tin trên là đúng":
 *   · chọn THIẾU so với hạn mức → "Tôi đồng ý với ảnh studio chọn dùm và không đổi lại"
 *     (chỉ có hai đường: chọn tiếp cho đủ, hoặc đồng ý studio chọn dùm);
 *   · còn sản phẩm in chưa có ảnh → "Tôi biết chưa chọn ảnh in thì nhận ảnh chậm hơn".
 * Máy chủ `/api/g/submit` từ chối nếu thiếu. Phép thử nào chốt thiếu ảnh (hầu hết
 * fixture chỉ thả tim vài tấm) phải tích đủ — đúng như ba mẹ thật phải làm.
 *
 * Khối A tính NGAY từ số tấm đã chọn và hạn mức (không chờ mạng); khối B dựa trên số
 * máy chủ đếm (`/api/g/dot-chon`, đọc lại mỗi lần mở hộp) — chờ nút Xác nhận báo đã đọc
 * xong (`data-da-doc-dot1="1"`) rồi mới xét khối B.
 */
/** Ô tick là input sr-only: trên máy cảm ứng click ép vào input không đổi được
 *  trạng thái — bấm nhãn bọc ngoài như người thật, rồi mới rơi về setChecked. */
async function tick(page: Page, o: Locator): Promise<void> {
  if (await o.isChecked()) return;
  try {
    await o.setChecked(true, { force: true });
  } catch {
    await page.locator("label").filter({ has: o }).first().click();
  }
}

export async function tickHopChotDot1(page: Page): Promise<void> {
  await tick(page, page.getByTestId("o-xac-nhan-chot"));

  const khoiA = page.getByTestId("nhac-nho-studio-chon");
  if (await khoiA.count()) await tick(page, khoiA.getByRole("checkbox"));

  await page.locator('[data-da-doc-dot1="1"]').waitFor({ state: "attached", timeout: 20_000 });
  const khoiB = page.getByTestId("nhac-in-chua-anh");
  if (await khoiB.count()) await tick(page, khoiB.getByRole("checkbox"));
}
