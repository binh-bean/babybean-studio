/**
 * Dữ liệu thử BB-344 — một chi nhánh riêng "Fixture BB-344-…" (số liệu không lẫn bộ ảnh
 * thật trên bb-dev), dọn theo id KÈM chi nhánh ở `donDepBB344`.
 *
 *  · khongPhatSinh : bộ `ready`, không có lượt chọn, không dòng thu → còn phải thu = 0.
 *  · vuotHanMuc    : bộ `submitted`, khách chốt vượt hạn mức, snapshot 300.000 → còn phải thu 300.000.
 *  · dotA          : bộ `submitted` (đợt 1 chờ xác nhận) + HAI đợt mua thêm chờ xác nhận.
 *  · dotB          : bộ `in_retouch` + HAI đợt mua thêm chờ xác nhận.
 *    → tab "Khách gửi ảnh chọn" của chi nhánh này có đúng 3 dòng (vuotHanMuc, dotA, dotB),
 *      trong khi cộng theo ĐỢT sẽ ra 4 (hai đợt của dotA + hai đợt của dotB, không có đợt 1).
 *
 * Chỉ ghi vào chi nhánh fixture; không đụng bộ ảnh/khách thật. Không gọi Lark.
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

export const NHAN_BB344 = "Fixture BB-344";

export interface DuLieuBB344 {
  runId: string;
  pg: Client;
  branchId: string;
  ownerId: string | null;
  emailOwner: string | null;
  password: string;
  khongPhatSinh: string;
  vuotHanMuc: string;
  dotA: string;
  dotB: string;
}

async function taoBo(
  pg: Client,
  p: { branchId: string; customerId: string; runId: string; ten: string; status: string; snapshot: number | null; dot: number[] },
): Promise<string> {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            included_quota, extra_photo_price, photo_count)
     values ($1,$2,$3,$4,$5,'https://example.com/x',10,50000,0) returning id`,
    [p.branchId, p.customerId, `${NHAN_BB344}-${p.runId} ${p.ten}`, p.status, `fixture-bb344-${p.runId}-${p.ten}`],
  );
  const galleryId = g[0].id as string;
  if (p.snapshot === null) return galleryId;

  const token = randomBytes(16).toString("hex");
  const { rows: sl } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active') returning id`,
    [galleryId, createHash("sha256").update(token).digest("hex"), token.slice(0, 6), `${NHAN_BB344}-${p.runId}`],
  );
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary, snapshot_extra_amount)
     values ($1,$2,$3,true,$4) returning id`,
    [galleryId, sl[0].id, `${NHAN_BB344}-${p.runId}`, p.snapshot],
  );
  for (const soDot of p.dot) {
    await pg.query(
      `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, tien_anh, tien_san_pham)
       values ($1,$2,$3,'cho_xac_nhan',2,100000,0)`,
      [galleryId, sel[0].id, soDot],
    );
  }
  return galleryId;
}

export async function duLieuBB344(opts: { coNhanSu?: boolean } = {}): Promise<DuLieuBB344> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const password = "Password123!";
  let branchId: string | null = null;
  let ownerId: string | null = null;
  try {
    const { rows: br } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
      `FXBB344-${runId}`,
      `${NHAN_BB344}-${runId} Chi nhánh`,
    ]);
    branchId = br[0].id as string;
    const { rows: kh } = await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
      branchId,
      `${NHAN_BB344}-${runId} Khách`,
    ]);
    const customerId = kh[0].id as string;
    const chung = { branchId, customerId, runId };

    const khongPhatSinh = await taoBo(pg, { ...chung, ten: "khong-phat-sinh", status: "ready", snapshot: null, dot: [] });
    const vuotHanMuc = await taoBo(pg, { ...chung, ten: "vuot-han-muc", status: "submitted", snapshot: 300000, dot: [] });
    const dotA = await taoBo(pg, { ...chung, ten: "dot-a", status: "submitted", snapshot: 0, dot: [2, 3] });
    const dotB = await taoBo(pg, { ...chung, ten: "dot-b", status: "in_retouch", snapshot: 0, dot: [2, 3] });

    let emailOwner: string | null = null;
    if (opts.coNhanSu) {
      const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      emailOwner = `fixture.bb344.owner.${runId}@demo.babybean.vn`;
      const r = await supa.auth.admin.createUser({ email: emailOwner, password, email_confirm: true });
      if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản owner");
      ownerId = r.data.user.id;
      await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
        ownerId,
        `${NHAN_BB344}-${runId} Chủ studio`,
        emailOwner,
      ]);
      await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [ownerId, branchId]);
    }
    return { runId, pg, branchId, ownerId, emailOwner, password, khongPhatSinh, vuotHanMuc, dotA, dotB };
  } catch (e) {
    if (branchId) await donTheoChiNhanh(pg, branchId, ownerId ? [ownerId] : []).catch(() => {});
    await pg.end().catch(() => {});
    throw e;
  }
}

export async function donTheoChiNhanh(pg: Client, branchId: string, staffIds: string[]): Promise<void> {
  const { rows: bo } = await pg.query(`select id from galleries where branch_id = $1`, [branchId]);
  const { rows: fk } = await pg.query(
    `select tc.table_name t, kcu.column_name c
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
       join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_name = 'galleries' and ccu.column_name = 'id' and tc.table_name <> 'galleries'`,
  );
  for (const b of bo as { id: string }[]) {
    await pg.query("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)", [b.id]).catch(() => {});
    await pg.query("delete from selection_items where gallery_id = $1", [b.id]).catch(() => {});
    await pg.query("delete from activity_logs where entity_id = $1", [b.id]).catch(() => {});
    for (let vong = 0; vong < 3; vong++) {
      for (const f of fk as { t: string; c: string }[]) {
        if (!/^[a-z_][a-z0-9_]*$/.test(f.t) || !/^[a-z_][a-z0-9_]*$/.test(f.c)) continue;
        await pg.query(`delete from public.${f.t} where ${f.c} = $1`, [b.id]).catch(() => {});
      }
    }
    await pg.query("delete from galleries where id = $1", [b.id]).catch(() => {});
  }
  await pg.query(`delete from customers where branch_id = $1`, [branchId]).catch(() => {});

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const staffId of staffIds) {
    await pg.query(`delete from activity_logs where actor_id = $1`, [staffId]).catch(() => {});
    await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
    await pg.query(`delete from staff_profiles where id = $1`, [staffId]).catch(() => {});
    await supa.auth.admin.deleteUser(staffId).catch(() => {});
  }
  await pg.query(`delete from activity_logs where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from notifications where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
}

/** Dọn theo id (bộ ảnh → khách → nhân sự → chi nhánh) và trả số bộ/chi nhánh fixture còn sót (phải = 0). */
export async function donDepBB344(d: DuLieuBB344): Promise<{ conBo: number; conChiNhanh: number }> {
  await donTheoChiNhanh(d.pg, d.branchId, d.ownerId ? [d.ownerId] : []);
  const { rows: bo } = await d.pg.query(`select count(*)::int n from galleries where branch_id = $1`, [d.branchId]);
  const { rows: cn } = await d.pg.query(`select count(*)::int n from branches where id = $1`, [d.branchId]);
  await d.pg.end();
  return { conBo: bo[0].n as number, conChiNhanh: cn[0].n as number };
}
