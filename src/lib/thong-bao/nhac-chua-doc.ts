/**
 * BB-261 — nhắc lại thông báo khách CHƯA ĐỌC.
 *
 * OWNER: Sonnet (BB-261). Chủ studio 26/09/2026: "thông báo nếu khách chưa
 * đọc cũng sẽ được báo lại và hiện ở đó."
 *
 * ---------------------------------------------------------------------------
 * Điều kiện nhắc
 * ---------------------------------------------------------------------------
 * Một dòng `thong_bao_khach` được nhắc lại khi ĐỦ CẢ BỐN:
 *  1. Chưa đọc (`da_doc_luc is null`).
 *  2. Tạo hơn 24 giờ trước — mới gửi thì chưa cần giục, khách có thể chỉ chưa
 *     kịp mở app.
 *  3. Đã nhắc dưới 2 lần (`so_lan_nhac < 2`) — nhắc quá nhiều thành làm phiền.
 *  4. Lần nhắc trước (nếu có) cách đây hơn 24 giờ — không dội hai lần nhắc
 *     trong cùng một ngày nếu cron chạy bù.
 *
 * Tối đa 200 dòng một lượt gọi — cron chạy mỗi ngày, không cần xử lý hết một
 * lượt nếu hộp thư có hàng nghìn dòng tồn đọng; lượt sau dọn tiếp.
 *
 * ---------------------------------------------------------------------------
 * Không bao giờ ném
 * ---------------------------------------------------------------------------
 * Gọi từ cron hậu kỳ (08:00) — SAU phần nhắc hậu kỳ đã có. Hỏng ở đây không
 * được phép làm hỏng phần cron còn lại (đọc Lark, ghi trạng thái...). Lỗi thì
 * ghi log `thong_bao.nhac.loi`, trả về số đã nhắc được (có thể là 0).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guiPushToiBoAnh } from "@/lib/thong-bao/gui-day";

const TOI_DA_MOT_LUOT = 200;
const SO_LAN_NHAC_TOI_DA = 2;
const MOT_NGAY_MS = 24 * 60 * 60 * 1000;

interface DongThongBaoChuaDoc {
  id: string;
  gallery_id: string;
  tieu_de: string;
  noi_dung: string;
  so_lan_nhac: number;
}

export async function nhacThongBaoChuaDoc(client: SupabaseClient): Promise<number> {
  try {
    const moc24h = new Date(Date.now() - MOT_NGAY_MS).toISOString();

    // Không lọc `nhac_lan_cuoi` bằng SQL trực tiếp trong `.or` vì so_lan_nhac=0
    // thì nhac_lan_cuoi luôn NULL (chưa nhắc lần nào) — vẫn phải hợp lệ ở điều
    // kiện 4. Lọc `nhac_lan_cuoi is null OR < moc24h` bằng `.or()` của
    // PostgREST cho đúng cả hai nhánh.
    const { data, error } = await client
      .from("thong_bao_khach")
      .select("id, gallery_id, tieu_de, noi_dung, so_lan_nhac")
      .is("da_doc_luc", null)
      .lt("created_at", moc24h)
      .lt("so_lan_nhac", SO_LAN_NHAC_TOI_DA)
      .or(`nhac_lan_cuoi.is.null,nhac_lan_cuoi.lt.${moc24h}`)
      .limit(TOI_DA_MOT_LUOT);

    if (error) throw error;
    const ds = (data ?? []) as DongThongBaoChuaDoc[];
    if (ds.length === 0) return 0;

    let daNhac = 0;
    for (const dong of ds) {
      try {
        await guiPushToiBoAnh(
          client,
          dong.gallery_id,
          { tieuDe: dong.tieu_de, noiDung: `${dong.noi_dung} (nhắc lại)` },
          dong.id,
        );

        const { error: upErr } = await client
          .from("thong_bao_khach")
          .update({ so_lan_nhac: dong.so_lan_nhac + 1, nhac_lan_cuoi: new Date().toISOString() })
          .eq("id", dong.id);
        if (upErr) throw upErr;

        daNhac += 1;
      } catch (err) {
        console.error(
          JSON.stringify({
            evt: "thong_bao.nhac.loi",
            thongBaoId: dong.id,
            loi: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
    return daNhac;
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "thong_bao.nhac.loi", loi: err instanceof Error ? err.message : String(err) }),
    );
    return 0;
  }
}
