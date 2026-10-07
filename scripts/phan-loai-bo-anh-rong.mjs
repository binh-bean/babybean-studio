// BB-381 — bộ ảnh 0 tấm CHƯA có dòng hoá đơn trong app thì app xếp "Chưa rõ gói" (không
// đoán là hậu kỳ). Script này kéo dòng hoá đơn từ Lark cho đúng các bộ đó để phân loại được.
//
//   npm run db:phan-loai-bo-rong            → CHẠY THỬ (mặc định): CHỈ ĐỌC Lark + bb-dev, in con số
//   npm run db:phan-loai-bo-rong -- --write → ghi dòng hoá đơn (người có quyền chạy, sau khi xem số)
//
// Ghi dùng đúng bước ghi của app (`ghiDongHopDong`, BB-331): chỉ thêm dòng của hợp đồng đó,
// giữ dòng CSKH sửa tay. Không xoá bộ ảnh, không đổi trạng thái, không ghi Lark.
// Không in tên hay số điện thoại — chỉ con số.
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { moDocHopDong, ghiDongHopDong } from "../src/lib/lark/dong-hop-dong.ts";
import { phanLoaiHoaDon, lyDoChuaCoAnh } from "../src/lib/gallery/phan-loai-hoa-don.ts";

const ghi = process.argv.includes("--write");
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("Thiếu SUPABASE_DB_URL");
const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN } = process.env;
if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) throw new Error("Thiếu cấu hình Lark");

const c = new pg.Client({ connectionString: dbUrl });
await c.connect();
const { rows: bo } = await c.query(`
  select g.id, g.drive_folder_id, g.sync_error, g.lark_contract_code, g.lark_contract_codes,
    coalesce((select json_agg(json_build_object('kind', p.kind::text, 'name', p.name))
                from gallery_items gi join products p on p.id = gi.product_id where gi.gallery_id = g.id), '[]') dong
  from galleries g
  where g.photo_count = 0 and g.status not in ('archived', 'delivered') and g.title !~* '^fixture'`);
const { rows: sp } = await c.query(`select id, kind::text kind, name, lark_record_id from products where lark_record_id is not null`);
await c.end();
const spTheoLark = new Map(sp.map((p) => [p.lark_record_id, p.id]));
const spTheoId = new Map(sp.map((p) => [p.id, p]));

const dem = (m, k) => (m[k] = (m[k] ?? 0) + 1);
const truoc = {};
const lyDo = {};
for (const g of bo) {
  const loai = phanLoaiHoaDon(g.dong);
  dem(truoc, loai);
  if (loai !== "hau_ky") dem(lyDo, `${loai}/${lyDoChuaCoAnh(g)}`);
}
console.info(`Bộ 0 ảnh (không tính Fixture, chưa lưu trữ/giao): ${bo.length}`);
console.info("Phân loại theo dòng hoá đơn ĐANG CÓ trong app:", truoc);
console.info("Lý do chưa có ảnh (bộ không phải hậu kỳ):", lyDo);

const chuaRo = bo.filter((g) => g.dong.length === 0);
const doc = await moDocHopDong(LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN);
const admin = ghi
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const sau = {};
let soDongGhi = 0;
let loi = 0;
for (const g of chuaRo) {
  const codes = (g.lark_contract_codes?.length ? g.lark_contract_codes : [g.lark_contract_code]).filter((m) => m && m.trim());
  const dong = [];
  try {
    for (const ma of codes) {
      const { parents } = await doc(ma, spTheoLark);
      for (const p of parents) {
        dong.push(spTheoId.get(p.productId));
        for (const ch of p.children) dong.push(spTheoId.get(ch.productId));
      }
      if (admin && parents.length) {
        const kq = { soDongGhi: 0, soDongGiuNguyen: 0, maKhongThay: [], sanPhamChuaCo: [] };
        await ghiDongHopDong(admin, g.id, ma, parents, kq);
        soDongGhi += kq.soDongGhi;
      }
    }
    dem(sau, phanLoaiHoaDon(dong.filter(Boolean)));
  } catch {
    loi++;
    dem(sau, "loi_doc_lark");
  }
}
console.info(`Bộ "chưa rõ gói" (chưa có dòng hoá đơn): ${chuaRo.length} → theo Lark:`, sau);
console.info(ghi ? `ĐÃ GHI ${soDongGhi} dòng hoá đơn (${loi} bộ lỗi).` : "CHẠY THỬ — không ghi gì. Thêm --write để ghi.");
