/**
 * BB-345 — dữ liệu thử "tim gia đình": MỘT chi nhánh riêng "Fixture BB-345-…",
 * hai bộ ảnh A và B (mỗi bộ: link ba mẹ + link mời gia đình + lượt chọn + ảnh
 * giả), tuỳ chọn một tài khoản chủ studio của đúng chi nhánh đó.
 *
 * Chi nhánh riêng: hàng đợi CSKH thật của các chi nhánh thật không bao giờ
 * thấy dòng thử. Dọn theo id (cả chi nhánh) ở `donBb345`.
 *
 * Dữ liệu giả theo AGENTS.md §6: tên "Fixture BB-345-…", SĐT 0901000001.
 */
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const NHAN_BB345 = "Fixture BB-345";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface BoBb345 {
  id: string;
  customerId: string;
  ownerLinkId: string;
  viewerLinkId: string;
  selectionId: string;
  maBaMe: string;
  maGiaDinh: string;
  anh: { id: string; fileName: string }[];
}

export interface DuLieuBb345 {
  runId: string;
  pg: Client;
  branchId: string;
  A: BoBb345;
  B: BoBb345;
  giaMoiAnh: number;
  staff?: { id: string; email: string; password: string };
}

export async function coBangTimGiaDinh(pg: Client): Promise<boolean> {
  const { rows } = await pg.query(`select to_regclass('public.tim_gia_dinh')::text as t`);
  return !!rows[0]?.t;
}

export async function taoBb345(opts: { taoNhanVien?: boolean; soAnhA?: number } = {}): Promise<DuLieuBb345> {
  const runId = Math.random().toString(36).slice(2, 10);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const giaMoiAnh = 50000;

  const { rows: br } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
    `FX345-${runId}`,
    `${NHAN_BB345}-${runId} Chi nhánh`,
  ]);
  const branchId = br[0].id as string;

  async function dungBo(ten: string, soAnh: number): Promise<BoBb345> {
    const { rows: c } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN_BB345}-${runId} Khách ${ten}`, ten === "A" ? "0901000001" : "0901000002"],
    );
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, download_enabled)
       values ($1,$2,$3,'in_review',$4,'https://example.com/bb345',$5,5,$6,false) returning id`,
      [branchId, c[0].id, `${NHAN_BB345}-${runId} Bộ ${ten}`, `fixture-bb345-${runId}-${ten}`, soAnh, giaMoiAnh],
    );
    const id = g[0].id as string;
    const anh: { id: string; fileName: string }[] = [];
    for (let i = 1; i <= soAnh; i++) {
      const fileName = `BB345${ten}_000${i}.jpg`;
      const { rows: p } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb345-${runId}-${ten}-${i}`, fileName, i],
      );
      anh.push({ id: p[0].id as string, fileName });
    }
    const maBaMe = randomBytes(32).toString("base64url");
    const maGiaDinh = randomBytes(32).toString("base64url");
    const { rows: l1 } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active') returning id`,
      [id, sha256(maBaMe), maBaMe.slice(0, 6)],
    );
    const { rows: l2 } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'viewer',$4,'active') returning id`,
      [id, sha256(maGiaDinh), maGiaDinh.slice(0, 6), `${NHAN_BB345} Bà nội`],
    );
    const { rows: s } = await pg.query(
      `insert into selections (gallery_id, share_link_id, display_name, is_primary)
       values ($1,$2,$3,true) returning id`,
      [id, l1[0].id, `${NHAN_BB345}-${runId} ${ten}`],
    );
    return {
      id,
      customerId: c[0].id as string,
      ownerLinkId: l1[0].id as string,
      viewerLinkId: l2[0].id as string,
      selectionId: s[0].id as string,
      maBaMe,
      maGiaDinh,
      anh,
    };
  }

  let A: BoBb345;
  let B: BoBb345;
  try {
    A = await dungBo("A", opts.soAnhA ?? 4);
    B = await dungBo("B", 2);
  } catch (e) {
    // Dựng hỏng giữa chừng: dọn theo chi nhánh vừa tạo, không để dòng thử nằm lại.
    const q = (sql: string) => pg.query(sql, [branchId]).catch(() => {});
    const sub = "(select id from galleries where branch_id = $1)";
    for (const t of ["selections", "share_links", "photos"]) await q(`delete from ${t} where gallery_id in ${sub}`);
    await q("delete from galleries where branch_id = $1");
    await q("delete from customers where branch_id = $1");
    await q("delete from branches where id = $1");
    await pg.end();
    throw e;
  }

  let staff: DuLieuBb345["staff"];
  if (opts.taoNhanVien) {
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const password = "Password123!";
    const email = `fixture.bb345.owner.${runId}@demo.babybean.vn`;
    const r = await supa.auth.admin.createUser({ email, password, email_confirm: true });
    if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản thử");
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
      r.data.user.id,
      `${NHAN_BB345}-${runId} Chủ studio`,
      email,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [
      r.data.user.id,
      branchId,
    ]);
    staff = { id: r.data.user.id, email, password };
  }

  return { runId, pg, branchId, A, B, giaMoiAnh, staff };
}

/** Dọn theo id: mọi dòng của hai bộ ảnh, khách, nhân viên thử, rồi chi nhánh. */
export async function donBb345(d: DuLieuBb345): Promise<void> {
  const { pg } = d;
  const q = (sql: string, args: unknown[]) => pg.query(sql, args).catch(() => {});
  const coBang = await coBangTimGiaDinh(pg).catch(() => false);
  for (const bo of [d.A, d.B]) {
    if (coBang) await q("delete from tim_gia_dinh where gallery_id = $1", [bo.id]);
    await q("delete from yeu_cau_mua_them where gallery_id = $1", [bo.id]);
    await q("delete from activity_logs where entity_id = $1", [bo.id]);
    await q("delete from selection_items where gallery_id = $1", [bo.id]);
    await q("delete from selections where gallery_id = $1", [bo.id]);
    await q("delete from share_links where gallery_id = $1", [bo.id]);
    await q("delete from photos where gallery_id = $1", [bo.id]);
    await q("delete from galleries where id = $1 and branch_id = $2", [bo.id, d.branchId]);
    await q("delete from customers where id = $1 and branch_id = $2", [bo.customerId, d.branchId]);
  }
  if (d.staff) {
    await q("delete from activity_logs where actor_id = $1", [d.staff.id]);
    await q("delete from staff_branches where staff_id = $1", [d.staff.id]);
    await q("delete from staff_profiles where id = $1", [d.staff.id]);
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await supa.auth.admin.deleteUser(d.staff.id).catch(() => {});
  }
  await q("delete from activity_logs where branch_id = $1", [d.branchId]);
  await q("delete from branches where id = $1", [d.branchId]);
  await pg.end();
}
