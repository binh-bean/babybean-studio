/**
 * Dữ liệu mẫu cho ảnh chụp màn khách BB-321 ("Chọn thêm ảnh · Đợt N" + hộp chốt
 * đợt 1 có hai ô tick mới).
 *
 * OWNER: QA-BOT / DEV-FE. Mọi dữ liệu là GIẢ (AGENTS §6): chi nhánh, khách, bé
 * bịa, SĐT dải 0901000…, không drive_folder_id thật, ảnh là mock trung tính.
 * Chỉ ghi hàng do CHÍNH lượt chạy này tạo (một chi nhánh riêng mang `runId`), và
 * `donDep()` xoá đúng theo chi nhánh đó — không xoá theo tiền tố chung.
 */

import { Client } from "pg";
import { randomBytes, createHash } from "node:crypto";

export const NHAN_BB321K = "Fixture BB321K";

export interface BoAnhBb321 {
  id: string;
  token: string;
  /** sort_index → photo id */
  anh: Map<number, string>;
}

export interface DuLieuBb321K {
  runId: string;
  pg: Client;
  branchId: string;
  /** in_retouch — đợt 1 đã chốt 12/12 tấm, giá ảnh thêm 30.000. */
  chonThem: BoAnhBb321;
  /** ready — hạn mức 15, đã chọn 12 (thiếu 3), gói có "Gỗ 20x30" chưa có ảnh. */
  dot1: BoAnhBb321;
}

/** Tấm đã chọn ở đợt 1 — rải đều để màn đầu có cả tấm khoá lẫn tấm còn chọn được. */
export const DA_CHON_DOT1 = [1, 3, 4, 7, 9, 10, 13, 16, 18, 21, 24, 27];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function taoBo(
  pg: Client,
  p: {
    runId: string;
    branchId: string;
    customerId: string;
    babyId: string;
    shootId: string;
    status: string;
    soAnh: number;
    hanMuc: number;
    thuTu: number;
    editFileId: string;
    inTrongGoiId: string | null;
    daNop: boolean;
  },
): Promise<BoAnhBb321> {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, shoot_id, customer_id, baby_id, title, status,
                            drive_folder_id, drive_folder_url, photo_count, extra_photo_price, download_enabled)
     values ($1,$2,$3,$4,$5,$6,$7,'https://example.com/x',$8,30000,false) returning id`,
    [p.branchId, p.shootId, p.customerId, p.babyId, `Mít · Ảnh chụp ${p.thuTu}`, p.status, `fixture-bb321k-${p.runId}-${p.thuTu}`, p.soAnh],
  );
  const galleryId = g[0].id as string;

  await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,$3,$4)`, [
    galleryId,
    p.editFileId,
    p.hanMuc,
    p.hanMuc * 50000,
  ]);
  if (p.inTrongGoiId) {
    await pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,1,200000)`, [
      galleryId,
      p.inTrongGoiId,
    ]);
  }

  const { rows: ph } = await pg.query(
    `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     select $1, 'bb321k-' || $2 || '-' || x, 'IMG_' || (2000 + x)::text || '.JPG', 'image/jpeg', x, 'active',
            case when x % 5 = 2 then 1500 else 1000 end,
            case when x % 5 = 2 then 1000 else 1500 end
     from generate_series(1, $3::int) as x
     returning id, sort_index`,
    [galleryId, `${p.runId}-${p.thuTu}`, p.soAnh],
  );
  const anh = new Map<number, string>();
  for (const r of ph as { id: string; sort_index: number }[]) anh.set(r.sort_index, r.id);

  const token = randomBytes(32).toString("base64url");
  const { rows: lk } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active') returning id`,
    [galleryId, sha256(token), token.slice(0, 6), `${NHAN_BB321K}-${p.runId}`],
  );
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary, submitted_at, submitted_by_name)
     values ($1,$2,'Mẹ Lan',true,$3,$4) returning id`,
    [galleryId, lk[0].id, p.daNop ? new Date().toISOString() : null, p.daNop ? "Mẹ Lan" : null],
  );
  for (const i of DA_CHON_DOT1) {
    const photoId = anh.get(i);
    if (!photoId) continue;
    await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`, [
      sel[0].id,
      photoId,
      galleryId,
    ]);
  }
  return { id: galleryId, token, anh };
}

export async function duLieuBb321K(): Promise<DuLieuBb321K> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();

  // Dọn rác (> 2 giờ) của lượt chạy TRƯỚC bị ngắt giữa chừng — chỉ chi nhánh mang nhãn này.
  const { rows: cu } = await pg.query(
    `select id from branches where name like $1 and created_at < now() - interval '2 hours'`,
    [`${NHAN_BB321K}%`],
  );
  for (const r of cu as { id: string }[]) await xoaTheoChiNhanh(pg, r.id);

  const { rows: sp } = await pg.query(
    `select
       (select id from products where is_active and kind = 'edited_photo' and name = 'Edit file' limit 1) as edit_file,
       (select id from products where is_active and kind = 'print' and material = 'Gỗ' and size = '20x30' limit 1) as go_20x30`,
  );
  const editFileId = sp[0]?.edit_file as string | null;
  const goId = sp[0]?.go_20x30 as string | null;
  if (!editFileId) throw new Error("Thiếu sản phẩm 'Edit file' trong danh mục bb-dev");

  const { rows: br } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
    `FX321K-${runId}`,
    `${NHAN_BB321K}-${runId} Chi nhánh`,
  ]);
  const branchId = br[0].id as string;

  try {
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Nguyễn Thị Lan','0901000321') returning id`,
      [branchId],
    );
    const customerId = kh[0].id as string;
    const { rows: bb } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1,'Trần Minh Khôi','Mít') returning id`,
      [customerId],
    );
    const babyId = bb[0].id as string;
    const { rows: sh } = await pg.query(
      `insert into shoots (branch_id, customer_id, baby_id, shoot_date, concept) values ($1,$2,$3,current_date - 20,'Thôi nôi') returning id`,
      [branchId, customerId, babyId],
    );
    const shootId = sh[0].id as string;

    const chung = { runId, branchId, customerId, babyId, shootId, editFileId, soAnh: 40 };
    const chonThem = await taoBo(pg, { ...chung, status: "in_retouch", hanMuc: 12, thuTu: 1, inTrongGoiId: null, daNop: true });
    const dot1 = await taoBo(pg, { ...chung, status: "ready", hanMuc: 15, thuTu: 2, inTrongGoiId: goId, daNop: false });
    return { runId, pg, branchId, chonThem, dot1 };
  } catch (e) {
    await xoaTheoChiNhanh(pg, branchId).catch(() => {});
    await pg.end();
    throw e;
  }
}

async function xoaTheoChiNhanh(pg: Client, branchId: string): Promise<void> {
  const { rows: bo } = await pg.query(`select id from galleries where branch_id = $1`, [branchId]);
  for (const b of bo as { id: string }[]) {
    const q = (s: string) => pg.query(s, [b.id]).catch(() => {});
    await q("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)");
    await q("delete from selection_placements where selection_item_id in (select id from selection_items where gallery_id=$1)");
    await q("delete from selection_items where gallery_id = $1");
    await q("delete from selections where gallery_id = $1");
    await q("delete from share_links where gallery_id = $1");
    await q("delete from activity_logs where entity_id = $1");
    await q("delete from notifications where payload->>'galleryId' = $1::text");
    await q("delete from gallery_items where gallery_id = $1");
    await q("delete from photos where gallery_id = $1");
    await q("delete from galleries where id = $1");
  }
  const { rows: khach } = await pg.query(`select id from customers where branch_id = $1`, [branchId]);
  for (const k of khach as { id: string }[]) {
    await pg.query(`delete from shoots where customer_id = $1`, [k.id]).catch(() => {});
    await pg.query(`delete from babies where customer_id = $1`, [k.id]).catch(() => {});
    await pg.query(`delete from customers where id = $1`, [k.id]).catch(() => {});
  }
  await pg.query(`delete from activity_logs where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from notifications where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
}

export async function donDepBb321K(d: DuLieuBb321K): Promise<number> {
  await xoaTheoChiNhanh(d.pg, d.branchId);
  const { rows } = await d.pg.query(`select count(*)::int n from branches where name like $1`, [`${NHAN_BB321K}-${d.runId}%`]);
  await d.pg.end();
  return rows[0].n as number;
}
