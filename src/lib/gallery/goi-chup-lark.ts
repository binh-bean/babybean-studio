/**
 * BB-325 — gói chụp lấy từ Lark ("Gói chụp" của dòng Hậu Kỳ: "Baby 02",
 * "Fam 02", "EXTENDED FAMILY 01"…), không từ danh sách mẫu.
 *
 * Soát 29/09/2026: bảng `packages` KHÔNG hề được đồng bộ từ Lark — bốn dòng
 * đang có ("Gói Cao cấp" 40.000đ/ảnh, "Gói Cơ bản", "Gói Tiêu chuẩn", "Newborn
 * Quận 1") là dữ liệu mẫu từ seed. Chọn "Gói Cao cấp" là thuật sĩ tự điền
 * giá ảnh thêm 40.000 thay cho 50.000 của Cài đặt.
 *
 * Cách làm tối thiểu, không cần migration: `create_gallery_bundle` bắt buộc
 * một `package_id`, nên mỗi tên gói Lark có MỘT dòng `packages` (mã
 * "LARK-<TÊN KHÔNG DẤU>", áp dụng mọi chi nhánh), tạo khi gặp lần đầu. Giá ảnh
 * thêm của dòng này là giá mặc định trong Cài đặt — bộ ảnh vẫn đọc giá từ Cài
 * đặt trước (create_gallery_bundle, 0065).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { giaAnhChonThemMacDinh } from "./gia-anh-chon-them";

export const TIEN_TO_MA_GOI_LARK = "LARK-";

/** "Baby 02" → "LARK-BABY-02"; "Gia đình Ông Bà" → "LARK-GIA-DINH-ONG-BA". Hàm thuần. */
export function maGoiLark(ten: string): string {
  const khongDau = ten
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${TIEN_TO_MA_GOI_LARK}${khongDau}`;
}

export async function timHoacTaoGoiLark(
  admin: SupabaseClient,
  tenGoi: string,
  soAnhTrongGoi: number | null,
): Promise<string> {
  const ten = tenGoi.trim();
  const code = maGoiLark(ten);
  const { data: cu } = await admin
    .from("packages")
    .select("id")
    .is("branch_id", null)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (cu) return (cu as { id: string }).id;

  const { data: moi, error } = await admin
    .from("packages")
    .insert({
      branch_id: null,
      code,
      name: ten,
      included_quota: soAnhTrongGoi,
      extra_photo_price: await giaAnhChonThemMacDinh(admin),
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !moi) {
    // Hai người cùng tạo một gói mới cùng lúc: đọc lại dòng người kia vừa ghi.
    const { data: lai } = await admin.from("packages").select("id").is("branch_id", null).eq("code", code).maybeSingle();
    if (lai) return (lai as { id: string }).id;
    throw error ?? new Error("Không tạo được gói chụp từ Lark");
  }
  return (moi as { id: string }).id;
}
