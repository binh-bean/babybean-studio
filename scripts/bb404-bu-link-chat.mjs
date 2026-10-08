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
 * Luật ghi: CHỈ khách đang TRỐNG (NULL/chuỗi trắng) — không đè link nhân viên đã sửa tay.
 * Một khách khớp nhiều link KHÁC nhau → mơ hồ, bỏ qua (đếm riêng). Một giao dịch.
 *
 * Chạy:
 *   node --env-file=.env.local scripts/bb404-bu-link-chat.mjs          # chỉ đọc, in số đếm
 *   node --env-file=.env.local scripts/bb404-bu-link-chat.mjs --ghi    # ghi (một giao dịch)
 *   (bb-prod: thêm --that-su-la-bb-prod)
 * Chỉ in SỐ ĐẾM — không tên, không SĐT, không link, không mã khách.
 */
import { createHash } from "node:crypto";
import pg from "pg";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd } from "./lib/moi-truong.mjs";
// Cùng bộ lọc http(s) với app (tệp không có import alias nên node nạp thẳng được).
import { linkChatKhach } from "../src/lib/lien-lac/link-chat-khach.ts";

const HOST = "https://open.larksuite.com/open-apis";
const BANG_KHACH_HANG = /Khách\s*Hàng/i;
const BANG_HAU_KY = /h[aậ]u\s*k[yỳ]/i;

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (chạy kèm --env-file=.env.local).`);
  return v;
};

/** Cùng công thức `customerKey` của sync-retouch.ts / sync-lark-hauky.mjs. */
function customerKey(ma) {
  return createHash("sha256").update(String(ma)).digest("hex").slice(0, 12);
}

/** Chữ của ô (chỉ dùng cho ô MÃ — không dùng cho ô URL vì text của ô URL là tên khách). */
function cellText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => (v == null ? "" : typeof v === "object" ? (v.text ?? v.name ?? v.fullPhoneNum ?? "") : String(v)))
      .join("");
  }
  if (typeof value === "object") return value.text ?? value.name ?? value.fullPhoneNum ?? "";
  return String(value);
}

/** Link http(s) đầu tiên của ô URL/lookup — chỉ đọc `link`, bỏ `text`. */
function linkCuaO(value) {
  const ung = Array.isArray(value) ? value : value == null ? [] : [value];
  for (const v of ung) {
    const tho = typeof v === "string" ? v : v && typeof v === "object" ? v.link : null;
    const link = linkChatKhach(tho);
    if (link) return link;
  }
  return null;
}

function oTheoMau(fields, mau) {
  for (const k of Object.keys(fields ?? {})) if (mau.test(k)) return fields[k];
  return undefined;
}

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

/** Gom link theo khoá; khoá có ≥ 2 link KHÁC nhau → null (mơ hồ). */
function themLink(map, khoa, link) {
  if (!khoa || !link) return;
  if (!map.has(khoa)) map.set(khoa, link);
  else if (map.get(khoa) !== link) map.set(khoa, null);
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

  const theoKhoaKH = new Map(); // khoá → link (bảng Khách Hàng)
  for (const r of khachHang) {
    const ma = cellText(r.fields?.["Mã Khách Hàng"]).trim();
    themLink(theoKhoaKH, ma ? customerKey(ma) : null, linkCuaO(oTheoMau(r.fields, /^link\s*chat$/i)));
  }
  const theoKhoaHK = new Map(); // khoá → link (Hậu Kỳ "Chat với khách")
  const theoDongHK = new Map(); // record_id → link
  for (const r of hauKy) {
    const link = linkCuaO(oTheoMau(r.fields, /chat\s*v[ớo]i\s*kh[áa]ch/i));
    const ma = cellText(oTheoMau(r.fields, /mã\s*kh|mã\s*khách\s*hàng/i)).trim();
    themLink(theoKhoaHK, ma ? customerKey(ma) : null, link);
    themLink(theoDongHK, r.record_id, link);
  }

  // --- DB ---
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows: trong } = await c.query(
      `select c.id, c.lark_customer_key,
              coalesce(array_agg(g.lark_hauky_record_id) filter (where g.lark_hauky_record_id is not null), '{}') as dong
         from customers c
         left join galleries g on g.customer_id = c.id
        where nullif(btrim(coalesce(c.facebook, '')), '') is null
        group by c.id, c.lark_customer_key`,
    );

    const dem = { khachTrong: trong.length, theoKhachHang: 0, theoHauKyMaKH: 0, theoDongHauKy: 0, moHo: 0, khongCoTrenLark: 0 };
    const seGhi = [];
    for (const k of trong) {
      let link = null;
      let nguon = null;
      let moHo = false;
      if (k.lark_customer_key) {
        const a = theoKhoaKH.get(k.lark_customer_key);
        if (a) [link, nguon] = [a, "theoKhachHang"];
        else if (a === null) moHo = true;
        if (!link) {
          const b = theoKhoaHK.get(k.lark_customer_key);
          if (b) [link, nguon] = [b, "theoHauKyMaKH"];
          else if (b === null) moHo = true;
        }
      }
      if (!link) {
        const tuDong = new Set();
        for (const rid of k.dong ?? []) {
          const l = theoDongHK.get(rid);
          if (l) tuDong.add(l);
          else if (l === null) moHo = true;
        }
        if (tuDong.size === 1) [link, nguon] = [[...tuDong][0], "theoDongHauKy"];
        else if (tuDong.size > 1) moHo = true;
      }
      if (link) {
        dem[nguon] += 1;
        seGhi.push([link, k.id]);
      } else if (moHo) dem.moHo += 1;
      else dem.khongCoTrenLark += 1;
    }

    console.log(`Lark: ${khachHang.length} dòng Khách Hàng, ${hauKy.length} dòng Hậu Kỳ (chỉ đọc).`);
    console.log("Số đếm (không tên, không link):");
    console.table({ ...dem, seGhi: seGhi.length });
    if (!ghi) {
      console.log("Chỉ xem. Thêm --ghi để ghi (một giao dịch, chỉ khách đang trống).");
      return;
    }

    await c.query("begin");
    try {
      let daGhi = 0;
      for (const [link, id] of seGhi) {
        const kq = await c.query(
          `update customers set facebook = $1 where id = $2 and nullif(btrim(coalesce(facebook, '')), '') is null`,
          [link, id],
        );
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
