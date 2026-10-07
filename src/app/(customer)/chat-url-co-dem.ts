/**
 * BB-378 — địa chỉ "Nhắn Bean" cho màn link hết hạn / không tìm thấy / chọn buổi
 * chụp của `/g/<mã>`, `/k/<mã>`, `/k/<mã>/<n>`.
 *
 * OWNER: DEV-FE. Bản đầu gọi `getChatPageUrl()` — MỘT câu `settings` mới, không
 * đệm, ở MỌI lượt mở trang khách (kể cả link còn tốt). Sau sự cố 504 tối 06/10
 * (bb-dev gói miễn phí quá tải) không thêm câu nào vào đường mở trang: đọc qua
 * `layDuLieuChungBoAnh` — CÙNG bộ đệm 5 phút mà `/api/g/gallery` đã dùng (BB-341),
 * nên ở production lượt mở trang không gửi thêm câu nào vào cơ sở dữ liệu.
 *
 * Lỗi đọc → null: màn lỗi tự dẫn về trang chủ (chi nhánh + số gọi), không sập.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { layDuLieuChungBoAnh } from "@/lib/gallery/du-lieu-chung-bo-anh";
import { duongNhanTinTuCaiDat } from "@/lib/lien-lac/duong-nhan-tin";

export async function layChatUrlCoDem(): Promise<string | null> {
  try {
    const { chatSetting } = await layDuLieuChungBoAnh(createAdminClient());
    return duongNhanTinTuCaiDat(chatSetting?.value);
  } catch {
    return null;
  }
}
