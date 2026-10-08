/**
 * BB-407 — đồng bộ link chat RIÊNG của khách từ Lark vào `customers.facebook`, theo lô.
 *
 * Vì sao: `ghiLinkChatTheoLark` chỉ chạy khi MỘT dòng Hậu Kỳ được đồng bộ. Lark là nguồn
 * đúng (chủ studio 08/10) nên link ở Lark đổi mà dòng Hậu Kỳ không được đụng tới thì app
 * kẹt link cũ. Cron `hau-ky` (08:00 VN) gọi tệp này mỗi sáng; script bù một lần
 * `scripts/bb404-bu-link-chat.mjs` dùng chung phần thuần (`dong-bo-link-chat-thuan.ts`).
 *
 * Nguồn (CHỈ ĐỌC Lark):
 *   1. "👑 Khách Hàng" — ô "link chat", nối theo "Mã Khách Hàng" → sha256 12 ký tự =
 *      `customers.lark_customer_key`.
 *   2. Hậu Kỳ — ô lookup "Chat với khách": theo "Mã KH" → khoá khách, hoặc theo record_id =
 *      `galleries.lark_hauky_record_id` (khách chưa có khoá Lark).
 *
 * Luật (cùng `ghiLinkChatTheoLark`): Lark có link http(s) hợp lệ và KHÁC giá trị đang có →
 * ghi đè; giống → không ghi; Lark trống/hỏng → giữ nguyên, không xoá; một khách khớp nhiều
 * link KHÁC nhau → mơ hồ, bỏ qua. Phần `text` của ô URL Lark là TÊN KHÁCH — không bao giờ
 * đọc ra. Chỉ trả/in SỐ ĐẾM.
 *
 * Chỉ ĐỌC Lark — không ghi ngược lên Lark.
 */
// KHÔNG `import "server-only"`: script tsx/node ngoài Next cũng có thể nạp tệp này.
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";
import { larkAuth, readLarkTable } from "@/lib/lark/sync-retouch";
import {
  MAU_BANG_HAU_KY,
  MAU_BANG_KHACH_HANG,
  SQL_GHI_LINK_CHAT_THEO_LARK,
  SQL_KHACH_VA_BO,
  gomLinkChatTuLark as gomThuan,
  khachTuDongSql,
  tinhKeHoachLinkChat,
  type DemLinkChat,
  type DongLarkTho,
  type LinkChatTuLark,
} from "@/lib/lark/dong-bo-link-chat-thuan";

export * from "@/lib/lark/dong-bo-link-chat-thuan";

/** Dòng Lark thô → ba bảng tra link, lọc bằng bộ lọc http(s) của app (`linkChatKhach`). */
export function gomLinkChatTuLark(khachHang: DongLarkTho[], hauKy: DongLarkTho[]): LinkChatTuLark {
  return gomThuan(khachHang, hauKy, linkChatKhach);
}

export interface KhoPgLinkChat {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export interface DocLarkLinkChat {
  khachHang: DongLarkTho[];
  hauKy: DongLarkTho[];
}

/** Đọc HAI bảng (Khách Hàng, Hậu Kỳ) từ Lark — chỉ đọc. Thiếu cấu hình hoặc Lark lỗi thì ném. */
export async function docLinkChatTuLark(env: {
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  LARK_BASE_APP_TOKEN?: string;
}): Promise<DocLarkLinkChat> {
  const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN } = env;
  if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) {
    throw new Error("Thiếu cấu hình Lark (LARK_APP_ID / LARK_APP_SECRET / LARK_BASE_APP_TOKEN)");
  }
  const auth = await larkAuth(LARK_APP_ID, LARK_APP_SECRET);
  const khach = await readLarkTable(auth, LARK_BASE_APP_TOKEN, MAU_BANG_KHACH_HANG);
  const hauKy = await readLarkTable(auth, LARK_BASE_APP_TOKEN, MAU_BANG_HAU_KY);
  return { khachHang: khach.records, hauKy: hauKy.records };
}

export interface KetQuaDongBoLinkChat extends DemLinkChat {
  /** số khách thật sự được ghi (điều kiện `is distinct from` còn đúng lúc ghi) */
  daGhi: number;
  /** số lần ghi lỗi (chỉ đếm — không ghi nội dung lỗi, vì thông báo của pg có thể kèm giá trị) */
  loiGhi: number;
  soDongKhachHangLark: number;
  soDongHauKyLark: number;
}

/**
 * Một lượt: đọc Lark (`docLark`) → đọc khách trong app → tính kế hoạch → ghi từng khách bằng
 * `SQL_GHI_LINK_CHAT_THEO_LARK` (điều kiện chống đè nằm trong câu UPDATE). `ghi = false` là
 * xem thử: chỉ tính, không ghi. Lark lỗi thì ném TRƯỚC khi ghi bất cứ gì; người gọi bọc lỗi.
 */
export async function dongBoLinkChatTuLark(opts: {
  client: KhoPgLinkChat;
  docLark: () => Promise<DocLarkLinkChat>;
  ghi: boolean;
}): Promise<KetQuaDongBoLinkChat> {
  const lark = await opts.docLark();
  const nguon = gomLinkChatTuLark(lark.khachHang, lark.hauKy);
  const { rows } = await opts.client.query(SQL_KHACH_VA_BO);
  const { seGhi, dem } = tinhKeHoachLinkChat(nguon, rows.map(khachTuDongSql));

  let daGhi = 0;
  let loiGhi = 0;
  if (opts.ghi) {
    for (const m of seGhi) {
      try {
        const kq = await opts.client.query(SQL_GHI_LINK_CHAT_THEO_LARK, [m.link, m.id]);
        daGhi += kq.rowCount ?? 0;
      } catch {
        loiGhi += 1;
      }
    }
  }
  return { ...dem, daGhi, loiGhi, soDongKhachHangLark: lark.khachHang.length, soDongHauKyLark: lark.hauKy.length };
}
