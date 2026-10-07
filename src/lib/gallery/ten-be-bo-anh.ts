/**
 * BB-379 — CSKH điền tên bé cho bộ ảnh chưa có (240/495 bộ trên bb-dev ngày 06/10/2026).
 *
 * Mô hình dữ liệu đã có: `galleries.baby_id` → `babies` (thuộc về MỘT khách). Bộ chưa có bé
 * thì `baby_id` null, và bìa khách rơi về "Baby Bean". Hàm này:
 *   1. dùng lại bé CÙNG TÊN đã có của khách (không nhân đôi: một khách có nhiều bộ, mỗi
 *      lần điền tay mà tạo một dòng `babies` mới là đúng lỗi từng nhân 2.154 khách rác);
 *   2. không có thì tạo `babies` mới cho khách;
 *   3. gắn `galleries.baby_id` — CHỈ khi bộ còn trống (hai CSKH bấm cùng lúc: người sau nhận
 *      "đã có tên bé", không đè);
 *   4. gắn luôn `shoots.baby_id` của buổi chụp nếu buổi đó còn trống.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DauVaoTenBe {
  galleryId: string;
  fullName: string;
  nickname?: string | null;
}

export type KetQuaTenBe =
  | { ok: true; babyId: string; taoMoi: boolean }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT"; message: string };

/** Gộp khoảng trắng, bỏ khoảng trắng đầu/cuối. Rỗng sau chuẩn hoá = không hợp lệ. */
export function chuanHoaTenBe(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/** So tên bé không phân biệt hoa/thường và dấu cách thừa ("bé Mít" = "Bé  Mít"). */
export function cungTenBe(a: string, b: string): boolean {
  return chuanHoaTenBe(a).toLocaleLowerCase("vi") === chuanHoaTenBe(b).toLocaleLowerCase("vi");
}

export async function datTenBeChoBoAnh(admin: SupabaseClient, p: DauVaoTenBe): Promise<KetQuaTenBe> {
  const ten = chuanHoaTenBe(p.fullName);
  if (!ten) return { ok: false, code: "INVALID_INPUT", message: "Tên bé không được để trống" };
  const nick = chuanHoaTenBe(p.nickname) || null;

  const { data: g, error: eg } = await admin
    .from("galleries")
    .select("id, customer_id, baby_id, shoot_id")
    .eq("id", p.galleryId)
    .maybeSingle();
  if (eg) throw eg;
  if (!g) return { ok: false, code: "NOT_FOUND", message: "Không tìm thấy bộ ảnh" };
  if (g.baby_id) return { ok: false, code: "CONFLICT", message: "Bộ ảnh này đã có tên bé — tải lại trang để xem" };

  const { data: beCu, error: eb } = await admin.from("babies").select("id, full_name, nickname").eq("customer_id", g.customer_id);
  if (eb) throw eb;
  const trung = (beCu ?? []).find((b) => cungTenBe(String(b.full_name), ten));

  let babyId: string;
  let taoMoi = false;
  if (trung) {
    babyId = String(trung.id);
    if (nick && !trung.nickname) {
      await admin.from("babies").update({ nickname: nick, updated_at: new Date().toISOString() }).eq("id", babyId);
    }
  } else {
    const { data: moi, error: ei } = await admin
      .from("babies")
      .insert({ customer_id: g.customer_id, full_name: ten, nickname: nick })
      .select("id")
      .single();
    if (ei) throw ei;
    babyId = String(moi.id);
    taoMoi = true;
  }

  // Hàng rào: chỉ gắn khi bộ còn trống.
  const { data: daGan, error: eu } = await admin
    .from("galleries")
    .update({ baby_id: babyId, updated_at: new Date().toISOString() })
    .eq("id", p.galleryId)
    .is("baby_id", null)
    .select("id");
  if (eu) throw eu;
  if (!daGan || daGan.length === 0) {
    // Người khác vừa gắn trước. Bé vừa tạo mà không ai dùng thì dọn đi.
    if (taoMoi) await admin.from("babies").delete().eq("id", babyId);
    return { ok: false, code: "CONFLICT", message: "Bộ ảnh này vừa được người khác điền tên bé — tải lại trang để xem" };
  }

  if (g.shoot_id) {
    await admin.from("shoots").update({ baby_id: babyId }).eq("id", g.shoot_id).is("baby_id", null);
  }
  return { ok: true, babyId, taoMoi };
}
