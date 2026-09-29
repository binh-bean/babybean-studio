"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { duongNhanTinTuCaiDat } from "@/lib/lien-lac/duong-nhan-tin";
import { laChiNhanhCongKhai } from "@/lib/utils/chi-nhanh-cong-khai";

export async function getActiveBranches() {
  try {
    const supabase = createAdminClient();
    // BB-328: loại chi nhánh do phép thử dựng ("Fixture …") ngay trong câu
    // truy vấn, rồi lọc lại bằng `laChiNhanhCongKhai` (mã FX…/FIXTURE-…).
    const { data: branches } = await supabase
      .from("branches")
      .select("name, address, hotline, code")
      .eq("is_active", true)
      .not("name", "ilike", "fixture%")
      .order("created_at", { ascending: true });

    return (branches || [])
      .filter(laChiNhanhCongKhai)
      .map(({ name, address, hotline }) => ({ name, address, hotline }));
  } catch {
    return [];
  }
}

export async function getPrimaryHotline(): Promise<string | null> {
  const branches = await getActiveBranches();
  return branches[0]?.hotline || null;
}

/**
 * Địa chỉ nút "Nhắn cho studio" ở trang gốc — đọc từ `settings.chat.page_url`
 * (khoá chung, `branch_id` rỗng), cùng cách `src/app/api/g/gallery/route.ts`
 * đọc cho màn khách. `null` khi chưa cấu hình hoặc cấu hình không hợp lệ —
 * trang gốc khi đó ẨN nút thay vì trỏ bừa. Xem BB-216.
 */
export async function getChatPageUrl(): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "chat.page_url")
      .is("branch_id", null)
      .maybeSingle();

    return duongNhanTinTuCaiDat(data?.value);
  } catch {
    return null;
  }
}

