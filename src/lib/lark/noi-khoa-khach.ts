/**
 * BB-397 — nối khách app với khách Lark: đặt `customers.lark_customer_key` khi khách còn NULL.
 *
 * Dùng ở các đường tạo/gắn bộ ảnh từ một dòng Hậu Kỳ (thuật sĩ tạo bộ `POST /api/admin/galleries`,
 * gắn dòng Hậu Kỳ cho bộ tạo tay `.../gan-lark`). Trước BB-397 hai đường này tạo/gắn khách mà
 * KHÔNG đặt khoá → xác nhận bằng hoá đơn báo "Khách của bộ ảnh chưa nối với khách bên Lark".
 *
 * Luật (giống `sync-retouch.ts`: `coalesce(lark_customer_key, $khoa)`):
 *   · không bao giờ đè khoá đã có;
 *   · khách KHÁC đã giữ khoá (chỉ mục duy nhất `uq_customers_lark_key`) → không ghi, trả
 *     `trung_khach` để người gọi ghi nhật ký "có thể trùng khách".
 * Lỗi ở đây KHÔNG được làm hỏng việc tạo/gắn bộ — người gọi chỉ ghi nhận kết quả.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type KetQuaNoiKhoa = "da_noi" | "da_co_khoa" | "trung_khach" | "khong_co_khoa" | "loi";

export async function noiKhoaKhachNeuTrong(
  admin: SupabaseClient,
  customerId: string | null | undefined,
  khoa: string | null | undefined,
): Promise<KetQuaNoiKhoa> {
  if (!customerId || !khoa) return "khong_co_khoa";
  try {
    const { data: giu, error: eg } = await admin.from("customers").select("id").eq("lark_customer_key", khoa).limit(1).maybeSingle();
    if (eg) throw eg;
    if (giu?.id) return giu.id === customerId ? "da_co_khoa" : "trung_khach";
    const { data, error } = await admin
      .from("customers")
      .update({ lark_customer_key: khoa })
      .eq("id", customerId)
      .is("lark_customer_key", null)
      .select("id");
    if (error && error.code === "23505") return "trung_khach";
    if (error) throw error;
    return (data ?? []).length > 0 ? "da_noi" : "da_co_khoa";
  } catch (e) {
    console.error(JSON.stringify({ evt: "lark.noi_khoa_khach.loi", loi: (e as { message?: string } | null)?.message ?? String(e) }));
    return "loi";
  }
}
