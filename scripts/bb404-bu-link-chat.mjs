#!/usr/bin/env node
/**
 * bb404-bu-link-chat — BB-404: bù link chat RIÊNG của khách vào `customers.facebook` (một lần).
 *
 * OWNER: DEV-OPS. ĐỘI BB-404 KHÔNG CHẠY tệp này — Claude chạy (xem trước, rồi ghi).
 *
 * Vì sao: trước BB-404 thuật sĩ tạo bộ (`POST /api/admin/galleries`), gắn Lark (`.../gan-lark`) và
 * nhánh `already_exists` của đồng bộ Hậu Kỳ KHÔNG ghi link chat → khách tạo qua các đường đó có
 * nút "Nhắn khách" xám. Mã mới ghi từ nay; tệp này bù cho khách ĐÃ CÓ.
 *
 * Nguồn (CHỈ ĐỌC Lark):
 *   1. "👑 Khách Hàng" — ô "link chat" (URL {link,text}), nối theo "Mã Khách Hàng" →
 *      customerKey (sha256, 12 ký tự) = `customers.lark_customer_key`.
 *   2. Hậu Kỳ — ô lookup "Chat với khách" ([{link,text}]):
 *        · theo "Mã KH" → customerKey (khi bảng Khách Hàng không có link);
 *        · theo record_id = `galleries.lark_hauky_record_id` (khách chưa có khoá Lark).
 *   Phần `text` của ô URL là TÊN KHÁCH — không bao giờ đọc/in. Chỉ nhận URL http(s).
 *
 * Luật ghi (BB-407 — Lark là nguồn đúng, cùng luật với app và cron hằng ngày): link Lark hợp lệ
 * và KHÁC giá trị đang có → ghi đè; giống → không ghi; Lark trống/hỏng → giữ nguyên.
 * Một khách khớp nhiều link KHÁC nhau → mơ hồ, bỏ qua (đếm riêng). Một giao dịch.
 * Phần thuần (đọc + so khớp + câu SQL ghi) nằm ở `src/lib/lark/dong-bo-link-chat-thuan.ts`,
 * dùng chung với cron `hau-ky` — tệp đó không có import alias nên node nạp thẳng được.
 *
 * Chạy:
 *   node --env-file=.env.local scripts/bb404-bu-link-chat.mjs          # chỉ đọc, in số đếm
 *   node --env-file=.env.local scripts/bb404-bu-link-chat.mjs --ghi    # ghi (một giao dịch)
 *   (bb-prod: thêm --that-su-la-bb-prod)
 * Chỉ in SỐ ĐẾM — không tên, không SĐT, không link, không mã khách.
 */
import pg from "pg";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd } from "./lib/moi-truong.mjs";
// Cùng bộ lọc http(s) với app (tệp không có import alias nên node nạp thẳng được).
import { linkChatKhach } from "../src/lib/lien-lac/link-chat-khach.ts";
import {
  MAU_BANG_HAU_KY as BANG_HAU_KY,
  MAU_BANG_KHACH_HANG as BANG_KHACH_HANG,
  SQL_GHI_LINK_CHAT_THEO_LARK,
  SQL_KHACH_VA_BO,
  gomLinkChatTuLark,
  khachTuDongSql,
  tinhKeHoachLinkChat,
} from "../src/lib/lark/dong-bo-link-chat-thuan.ts";

const HOST = "https://open.larksuite.com/open-apis";

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (chạy kèm --env-file=.env.local).`);
  return v;
};

async function larkAuth() {
  const res = await fetch(`${HOST}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: need("LARK_APP_ID"), app_secret: need("LARK_APP_SECRET") }),
  });
  const json = await res.json();
  if (!json.tenant_access_token) throw new Error(`Lark từ chối cấp token (code ${json.code}).`);
  return { authorization: `Bearer ${json.tenant_access_token}` };
}

/** Đọc hết một bảng (CHỈ ĐỌC), tìm theo tên. */
async function docBang(auth, baseToken, mauTen) {
  const list = await (await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, { headers: auth })).json();
  if (list.code !== 0) throw new Error(`Không liệt kê được bảng (code ${list.code}).`);
  const bang = list.data.items.find((t) => mauTen.test(t.name));
  if (!bang) throw new Error(`Không thấy bảng khớp ${mauTen}.`);
  const rows = [];
  let pageToken = "";
  do {
    const url =
      `${HOST}/bitable/v1/apps/${baseToken}/tables/${bang.table_id}/records?page_size=500` +
      (pageToken ? `&page_token=${pageToken}` : "");
    const page = await (await fetch(url, { headers: auth })).json();
    if (page.code !== 0) throw new Error(`Lỗi đọc bảng (code ${page.code}).`);
    rows.push(...(page.data.items ?? []));
    pageToken = page.data.has_more ? page.data.page_token : "";
  } while (pageToken);
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const ghi = args.includes("--ghi");
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Thiếu SUPABASE_DB_URL (chạy kèm --env-file=.env.local).");
  const kt = kiemTraMoiTruongChoPhep(url);
  if (!kt.choPhep) throw new Error(kt.ly_do);
  inMoiTruong(url);
  if (ghi) {
    const ktProd = kiemTraCoBbProd(url, args.includes("--that-su-la-bb-prod"));
    if (!ktProd.choPhep) throw new Error(ktProd.ly_do);
  }

  // --- Lark (chỉ đọc) ---
  const auth = await larkAuth();
  const baseToken = need("LARK_BASE_APP_TOKEN");
  const khachHang = await docBang(auth, baseToken, BANG_KHACH_HANG);
  const hauKy = await docBang(auth, baseToken, BANG_HAU_KY);

  const nguon = gomLinkChatTuLark(khachHang, hauKy, linkChatKhach);

  // --- DB ---
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(SQL_KHACH_VA_BO);
    const { seGhi, dem } = tinhKeHoachLinkChat(nguon, rows.map(khachTuDongSql));

    console.log(`Lark: ${khachHang.length} dòng Khách Hàng, ${hauKy.length} dòng Hậu Kỳ (chỉ đọc).`);
    console.log("Số đếm (không tên, không link):");
    console.table(dem);
    if (!ghi) {
      console.log("Chỉ xem. Thêm --ghi để ghi (một giao dịch, chỉ khách có link Lark KHÁC giá trị đang có).");
      return;
    }

    await c.query("begin");
    try {
      let daGhi = 0;
      for (const m of seGhi) {
        const kq = await c.query(SQL_GHI_LINK_CHAT_THEO_LARK, [m.link, m.id]);
        daGhi += kq.rowCount ?? 0;
      }
      await c.query("commit");
      console.log(`Đã ghi link chat cho ${daGhi}/${seGhi.length} khách.`);
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("bb404-bu-link-chat lỗi:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
