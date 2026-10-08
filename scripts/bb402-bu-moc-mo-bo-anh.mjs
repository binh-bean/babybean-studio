/**
 * bb402-bu-moc-mo-bo-anh — BB-402: bù `first_viewed_at` / `sent_at` cho bộ ảnh CŨ.
 *
 * OWNER: DEV-OPS. ĐỘI BB-402 KHÔNG CHẠY tệp này — Claude chạy (xem trước, rồi ghi).
 *
 * Vì sao: tới BB-402 không đường nào ghi `first_viewed_at`, còn `sent_at` chỉ ghi khi CSKH
 * bấm "Tạo link gửi khách" — bộ đi qua LINK GIA ĐÌNH (`/k/<mã>`) không bao giờ có mốc (vd bộ
 * anh báo 08/10: đã chọn, đã chốt mà cả hai cột NULL). Mã mới (BB-402) đặt mốc lúc khách mở
 * bộ lần đầu; tệp này bù cho bộ đã mở TRƯỚC bản vá, từ dữ liệu sẵn có:
 *   · first_viewed_at ← lúc tạo lượt chọn SỚM NHẤT của bộ (lượt chọn sinh đúng lúc một
 *     người cầm link mở bộ lần đầu — `luot-chon-theo-link.ts`). Chỉ bộ đang NULL.
 *   · sent_at ← sớm hơn trong (lượt chọn sớm nhất, submitted_at). CHỈ bộ ĐÃ CHỐT
 *     (`submitted_at` có) và đang NULL: bộ đang chờ khách mà nhận `sent_at` mới thì lượt
 *     nhắc CSKH (`nhac-khach.ts`, lọc theo `sent_at`) có thể bắn tin cho cả loạt cùng lúc.
 * KHÔNG đụng `due_at`, không ghi đè mốc đã có. Tắt trigger `updated_at` lúc ghi (như 0088).
 *
 * Chạy:
 *   node --env-file=.env.local scripts/bb402-bu-moc-mo-bo-anh.mjs          # chỉ đọc, in số đếm
 *   node --env-file=.env.local scripts/bb402-bu-moc-mo-bo-anh.mjs --ghi    # một giao dịch
 *   (bb-prod: thêm --that-su-la-bb-prod)
 * Chỉ in SỐ ĐẾM — không tên, không mã bộ, không mã link.
 */
import pg from "pg";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd } from "./lib/moi-truong.mjs";

const SQL_DEM = `
with s as (select gallery_id, min(created_at) dau from selections group by gallery_id)
select
  count(*) filter (where g.first_viewed_at is null and s.dau is not null)::int as bu_xem,
  count(*) filter (where g.sent_at is null and g.submitted_at is not null)::int as bu_gui,
  count(*) filter (where g.sent_at is null and g.submitted_at is null and s.dau is not null)::int as bo_qua_gui_chua_chot
from galleries g left join s on s.gallery_id = g.id`;

const SQL_BU_XEM = `
update galleries g set first_viewed_at = s.dau
from (select gallery_id, min(created_at) dau from selections group by gallery_id) s
where s.gallery_id = g.id and g.first_viewed_at is null`;

const SQL_BU_GUI = `
update galleries g
set sent_at = least(
  coalesce((select min(s.created_at) from selections s where s.gallery_id = g.id), g.submitted_at),
  g.submitted_at
)
where g.sent_at is null and g.submitted_at is not null`;

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

  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query(SQL_DEM);
    console.log("Số đếm (không tên, không mã):");
    console.table(rows[0]);
    if (!ghi) {
      console.log("Chỉ xem. Thêm --ghi để ghi (một giao dịch).");
      return;
    }
    await c.query("begin");
    try {
      await c.query("alter table galleries disable trigger trg_galleries_updated_at");
      const xem = await c.query(SQL_BU_XEM);
      const gui = await c.query(SQL_BU_GUI);
      await c.query("alter table galleries enable trigger trg_galleries_updated_at");
      await c.query("commit");
      console.log(`Đã ghi: first_viewed_at ${xem.rowCount} bộ · sent_at ${gui.rowCount} bộ.`);
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("bb402-bu-moc-mo-bo-anh lỗi:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
