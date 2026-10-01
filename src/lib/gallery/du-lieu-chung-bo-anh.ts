/**
 * BB-341 — phần dữ liệu GIỐNG NHAU cho mọi bộ ảnh mà `/api/g/gallery` đọc mỗi
 * lượt: danh mục mua thêm (`products`), link chat studio và dải quảng cáo
 * (`settings`). Ba câu này không phụ thuộc khách nào, bộ nào — 50 khách mở
 * cùng lúc là 150 câu giống hệt nhau gửi vào cơ sở dữ liệu.
 *
 * Nay giữ trong bộ nhớ đệm của Next (`unstable_cache`) 5 phút ở bản build
 * production. Đổi giá/danh mục trên Lark, đổi link chat hay quảng cáo thì màn
 * khách thấy trễ tối đa 5 phút — chấp nhận được với dữ liệu đổi theo mùa.
 *
 * KHÔNG đệm gì của riêng một khách (bộ ảnh, lượt chọn, giỏ hàng): những thứ
 * đó vẫn đọc mới mỗi lượt như cũ.
 *
 * `next dev` và phép thử đơn vị: đọc thẳng, không đệm — phép thử ghi
 * `settings` rồi đọc lại phải thấy ngay giá trị mới.
 */
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DuLieuChungBoAnh {
  chatSetting: { value: unknown } | null;
  banner: { key: string; value: unknown }[];
  catalogue: {
    id: string;
    name: string;
    kind: string;
    material: string | null;
    size: string | null;
    list_price: number | string | null;
    price_confidence: string | null;
    price_samples: number | null;
  }[];
}

async function docMoi(supabase: SupabaseClient): Promise<DuLieuChungBoAnh> {
  const [chat, banner, catalogue] = await Promise.all([
    supabase
      .from("settings")
      .select("value")
      .eq("key", "chat.page_url")
      .is("branch_id", null)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["gallery.banner_image_url", "gallery.banner_link_url"])
      .is("branch_id", null),
    // Lọc thô (có giá, có độ tin cậy); luật giá thật chạy ở route — xem chú
    // thích "DANH MỤC" trong src/app/api/g/gallery/route.ts.
    supabase
      .from("products")
      .select("id, name, kind, material, size, list_price, price_confidence, price_samples")
      .eq("is_active", true)
      .in("kind", ["print", "addon", "edited_photo"])
      .not("list_price", "is", null)
      .not("price_confidence", "is", null)
      .order("list_price", { ascending: true }),
  ]);
  // Lỗi thì NÉM — `unstable_cache` không lưu lượt ném, lượt sau đọc lại.
  if (chat.error) throw chat.error;
  if (banner.error) throw banner.error;
  if (catalogue.error) throw catalogue.error;
  return {
    chatSetting: (chat.data as { value: unknown } | null) ?? null,
    banner: (banner.data ?? []) as DuLieuChungBoAnh["banner"],
    catalogue: (catalogue.data ?? []) as DuLieuChungBoAnh["catalogue"],
  };
}

const docCoDem = unstable_cache(() => docMoi(createAdminClient()), ["bb341-du-lieu-chung-bo-anh"], {
  revalidate: 300,
  tags: ["du-lieu-chung-bo-anh"],
});

export async function layDuLieuChungBoAnh(supabase: SupabaseClient): Promise<DuLieuChungBoAnh> {
  if (process.env.NODE_ENV !== "production" || process.env.VITEST) return docMoi(supabase);
  try {
    return await docCoDem();
  } catch {
    // Đệm hỏng (môi trường lạ, lỗi đọc) — không để màn khách sập vì nó.
    return docMoi(supabase);
  }
}
