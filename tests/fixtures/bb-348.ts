/**
 * Dữ liệu thử BB-348 (e2e) — chi nhánh riêng "Fixture BB-348-…", dọn theo id KÈM chi nhánh.
 *
 * Một bộ ảnh `submitted`, khách chọn 3 ảnh (tên file giả R01_0001…3.JPG):
 *   · R01_0001.JPG — ghi chú + gắn vào một sản phẩm in trong gói;
 *   · R01_0002.JPG — chỉ ghi chú;
 *   · R01_0003.JPG — không ghi chú, không dùng cho gì.
 * Không gọi Lark, không có ảnh thật (thumbnail hỏng là đúng — không có Drive).
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { donTheoChiNhanh } from "./bb-344";

export const NHAN_BB348 = "Fixture BB-348";

export interface DuLieuBB348 {
  runId: string;
  pg: Client;
  branchId: string;
  ownerId: string;
  emailOwner: string;
  password: string;
  galleryId: string;
  productIds: string[];
}

export async function duLieuBB348(): Promise<DuLieuBB348> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const password = "Password123!";
  let branchId: string | null = null;
  let ownerId: string | null = null;
  const productIds: string[] = [];
  try {
    branchId = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
        `FXBB348-${runId}`,
        `${NHAN_BB348}-${runId} Chi nhánh`,
      ])
    ).rows[0].id as string;
    const customerId = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
        branchId,
        `${NHAN_BB348}-${runId} Khách`,
      ])
    ).rows[0].id as string;
    const galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                included_quota, extra_photo_price, photo_count)
         values ($1,$2,$3,'submitted',$4,'https://example.com/x',3,50000,3) returning id`,
        [branchId, customerId, `${NHAN_BB348}-${runId} Bộ ảnh`, `SEED_FOLDER_ID_348_${runId}`],
      )
    ).rows[0].id as string;

    const pIn = (
      await pg.query(`insert into products (branch_id, name, kind) values ($1,$2,'print') returning id`, [
        branchId,
        `${NHAN_BB348} Album 20x20`,
      ])
    ).rows[0].id as string;
    productIds.push(pIn);
    const giIn = (
      await pg.query(`insert into gallery_items (gallery_id, product_id, quantity) values ($1,$2,1) returning id`, [
        galleryId,
        pIn,
      ])
    ).rows[0].id as string;

    const token = randomBytes(16).toString("hex");
    const sl = (
      await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
         values ($1,$2,$3,'owner',$4,'active') returning id`,
        [galleryId, createHash("sha256").update(token).digest("hex"), token.slice(0, 6), `${NHAN_BB348}-${runId}`],
      )
    ).rows[0].id as string;
    const sel = (
      await pg.query(
        `insert into selections (gallery_id, share_link_id, display_name, is_primary, submitted_at, submitted_by_name,
                                 snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
         values ($1,$2,$3,true,now(),'Chị Mai (mẹ)',3,0,0) returning id`,
        [galleryId, sl, `${NHAN_BB348}-${runId}`],
      )
    ).rows[0].id as string;

    const anh: [string, string | null][] = [
      ["R01_0001.JPG", "xóa mụn cho bé dùm chị"],
      ["R01_0002.JPG", "làm sáng da"],
      ["R01_0003.JPG", null],
    ];
    for (const [i, [ten, note]] of anh.entries()) {
      const ph = (
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
          [galleryId, `bb348-${runId}-${i}`, ten, i + 1],
        )
      ).rows[0].id as string;
      const si = (
        await pg.query(
          `insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note, order_index)
           values ($1,$2,$3,'selected',$4,$5) returning id`,
          [sel, ph, galleryId, note, i + 1],
        )
      ).rows[0].id as string;
      if (i === 0) {
        await pg.query(`insert into selection_placements (selection_item_id, gallery_item_id) values ($1,$2)`, [si, giIn]);
      }
    }

    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const emailOwner = `fixture.bb348.owner.${runId}@demo.babybean.vn`;
    const r = await supa.auth.admin.createUser({ email: emailOwner, password, email_confirm: true });
    if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản owner");
    ownerId = r.data.user.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      ownerId,
      `${NHAN_BB348}-${runId} Chủ studio`,
      emailOwner,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [ownerId, branchId]);
    return { runId, pg, branchId, ownerId, emailOwner, password, galleryId, productIds };
  } catch (e) {
    if (branchId) await donTheoChiNhanh(pg, branchId, ownerId ? [ownerId] : []).catch(() => {});
    if (productIds.length) await pg.query(`delete from products where id = any($1::uuid[])`, [productIds]).catch(() => {});
    if (branchId) await pg.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
    await pg.end().catch(() => {});
    throw e;
  }
}

/** Dọn theo id (bộ ảnh → khách → nhân sự → chi nhánh → sản phẩm); trả số còn sót (phải = 0). */
export async function donDepBB348(d: DuLieuBB348): Promise<{ conBo: number; conChiNhanh: number; conSanPham: number }> {
  await donTheoChiNhanh(d.pg, d.branchId, [d.ownerId]);
  // Sản phẩm fixture trỏ vào chi nhánh: xoá sản phẩm (bộ ảnh đã đi) rồi mới xoá được chi nhánh.
  await d.pg.query(`delete from products where id = any($1::uuid[])`, [d.productIds]);
  await d.pg.query(`delete from branches where id = $1`, [d.branchId]);
  const bo = (await d.pg.query(`select count(*)::int n from galleries where id = $1`, [d.galleryId])).rows[0].n as number;
  const cn = (await d.pg.query(`select count(*)::int n from branches where id = $1`, [d.branchId])).rows[0].n as number;
  const sp = (await d.pg.query(`select count(*)::int n from products where id = any($1::uuid[])`, [d.productIds])).rows[0].n as number;
  await d.pg.end();
  return { conBo: bo, conChiNhanh: cn, conSanPham: sp };
}
