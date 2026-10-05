/**
 * BB-334A — dữ liệu thử link gia đình: MỘT chi nhánh riêng "Fixture BB-334A-…",
 *
 *   khách A: bộ A1, A2 (mỗi bộ 2 ảnh giả)
 *            link cũ theo bộ A1 (owner) + lượt chọn CHÍNH của A1 (như khách cũ thật)
 *            link GIA ĐÌNH owner (sống) + link gia đình owner ĐÃ THU HỒI
 *            link mời người thân theo khách (viewer, sống)
 *   khách B: bộ B1 (2 ảnh) + link cũ theo bộ B1 (owner) + lượt chọn chính
 *
 * Dữ liệu giả theo AGENTS.md §6 (tên "Fixture BB-334A-…", SĐT 090100000x,
 * drive_folder_id giả). Dọn THEO ID ở `donBb334a`: mọi bảng có khoá ngoại trỏ
 * vào các bộ/khách/link vừa tạo được dò từ catalog (bước chốt sinh ra dòng ở
 * bảng nào cũng dọn được), rồi ĐỌC LẠI — còn dòng là ném (BB-352).
 */
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

export const NHAN_BB334A = "Fixture BB-334A";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface BoBb334a {
  id: string;
  anh: string[];
}

export interface DuLieuBb334a {
  runId: string;
  pg: Client;
  branchId: string;
  khachA: string;
  khachB: string;
  A1: BoBb334a;
  A2: BoBb334a;
  B1: BoBb334a;
  /** Link cũ theo bộ A1 + lượt chọn chính của A1. */
  linkCuA1: { id: string; ma: string; selectionId: string };
  linkCuB1: { id: string; ma: string; selectionId: string };
  giaDinhA: { id: string; ma: string };
  giaDinhAThuHoi: { id: string; ma: string };
  moiGiaDinhA: { id: string; ma: string };
}

async function chen(pg: Client, sql: string, args: unknown[]): Promise<string> {
  const { rows } = await pg.query(sql, args);
  return rows[0].id as string;
}

export async function taoBb334a(): Promise<DuLieuBb334a> {
  const runId = randomBytes(4).toString("hex");
  const N = `${NHAN_BB334A}-${runId}`;
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();

  const branchId = await chen(pg, `insert into branches (code, name) values ($1,$2) returning id`, [
    `FX334-${runId}`,
    `${N} Chi nhánh`,
  ]);
  const d: Partial<DuLieuBb334a> & { pg: Client; branchId: string; runId: string } = { pg, branchId, runId };
  try {
    d.khachA = await chen(pg, `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000001') returning id`, [
      branchId,
      `${N} Khách A`,
    ]);
    d.khachB = await chen(pg, `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000002') returning id`, [
      branchId,
      `${N} Khách B`,
    ]);

    const bo = async (khach: string, ten: string, taoLuc: string): Promise<BoBb334a> => {
      const id = await chen(
        pg,
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota, extra_photo_price, download_enabled, created_at)
         values ($1,$2,$3,'in_review',$4,'https://example.com/bb334a',2,5,50000,false,$5) returning id`,
        [branchId, khach, `${N} Bộ ${ten}`, `fixture-bb334a-${runId}-${ten}`, taoLuc],
      );
      const anh: string[] = [];
      for (let i = 1; i <= 2; i++) {
        anh.push(
          await chen(
            pg,
            `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
             values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
            [id, `bb334a-${runId}-${ten}-${i}`, `BB334A${ten}_000${i}.jpg`, i],
          ),
        );
      }
      return { id, anh };
    };
    d.A1 = await bo(d.khachA, "A1", "2026-09-01T00:00:00Z");
    d.A2 = await bo(d.khachA, "A2", "2026-09-20T00:00:00Z");
    d.B1 = await bo(d.khachB, "B1", "2026-09-10T00:00:00Z");

    const link = async (
      cot: "gallery_id" | "customer_id",
      gt: string,
      role: string,
      status: string,
    ): Promise<{ id: string; ma: string }> => {
      const ma = randomBytes(32).toString("base64url");
      const id = await chen(
        pg,
        `insert into share_links (${cot}, token_hash, token_prefix, role, status, label)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [gt, sha256(ma), ma.slice(0, 6), role, status, `${N} link`],
      );
      return { id, ma };
    };
    const chinh = async (galleryId: string, linkId: string) =>
      chen(pg, `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`, [
        galleryId,
        linkId,
      ]);

    const cuA1 = await link("gallery_id", d.A1.id, "owner", "active");
    d.linkCuA1 = { ...cuA1, selectionId: await chinh(d.A1.id, cuA1.id) };
    const cuB1 = await link("gallery_id", d.B1.id, "owner", "active");
    d.linkCuB1 = { ...cuB1, selectionId: await chinh(d.B1.id, cuB1.id) };
    d.giaDinhAThuHoi = await link("customer_id", d.khachA, "owner", "revoked");
    d.giaDinhA = await link("customer_id", d.khachA, "owner", "active");
    d.moiGiaDinhA = await link("customer_id", d.khachA, "viewer", "active");
    return d as DuLieuBb334a;
  } catch (e) {
    await donBb334a(d as DuLieuBb334a).catch(() => {});
    throw e;
  }
}

/** Mọi (bảng, cột) có khoá ngoại trỏ vào `bang`(id) — dò từ catalog. */
async function cotTroVao(pg: Client, bang: string): Promise<{ bang: string; cot: string }[]> {
  const { rows } = await pg.query(
    `select c.conrelid::regclass::text as bang, a.attname as cot
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = $1::regclass and array_length(c.conkey, 1) = 1`,
    [`public.${bang}`],
  );
  return rows as { bang: string; cot: string }[];
}

export async function donBb334a(d: DuLieuBb334a): Promise<void> {
  const { pg } = d;
  const boIds = [d.A1?.id, d.A2?.id, d.B1?.id].filter(Boolean) as string[];
  const khachIds = [d.khachA, d.khachB].filter(Boolean) as string[];
  const loi: string[] = [];
  const q = async (sql: string, args: unknown[]) => {
    try {
      await pg.query(sql, args);
    } catch (e) {
      loi.push(`${sql.slice(0, 60)}: ${(e as Error).message}`);
    }
  };

  const { rows: linkRows } = await pg.query(
    `select id from share_links where gallery_id = any($1::uuid[]) or customer_id = any($2::uuid[])`,
    [boIds, khachIds],
  );
  const linkIds = linkRows.map((r) => r.id as string);
  const { rows: selRows } = await pg.query(`select id from selections where gallery_id = any($1::uuid[])`, [boIds]);
  const selIds = selRows.map((r) => r.id as string);

  // Con trước cha: mọi bảng trỏ vào selections → share_links → galleries → customers.
  for (const [bang, ids] of [
    ["selections", selIds],
    ["share_links", linkIds],
    ["galleries", boIds],
  ] as const) {
    if (!ids.length) continue;
    for (const f of await cotTroVao(pg, bang)) {
      if (["selections", "share_links", "galleries"].includes(f.bang.replace(/^public\./, ""))) continue;
      if (f.bang.replace(/^public\./, "") === "photos") continue;
      await q(`delete from ${f.bang} where ${f.cot} = any($1::uuid[])`, [ids]);
    }
  }
  await q(`delete from activity_logs where entity_id = any($1::uuid[])`, [[...boIds, ...khachIds]]);
  await q(`delete from selections where id = any($1::uuid[])`, [selIds]);
  await q(`delete from share_links where id = any($1::uuid[])`, [linkIds]);
  if (boIds.length) {
    for (const f of await cotTroVao(pg, "photos")) {
      await q(`delete from ${f.bang} where ${f.cot} in (select id from photos where gallery_id = any($1::uuid[]))`, [boIds]);
    }
  }
  await q(`delete from photos where gallery_id = any($1::uuid[])`, [boIds]);
  await q(`delete from galleries where id = any($1::uuid[]) and branch_id = $2`, [boIds, d.branchId]);
  await q(`delete from customers where id = any($1::uuid[]) and branch_id = $2`, [khachIds, d.branchId]);
  await q(`delete from activity_logs where branch_id = $1`, [d.branchId]);
  // Bước chốt sinh thông báo theo chi nhánh (notifications.branch_id…) — dọn mọi
  // bảng trỏ vào ĐÚNG chi nhánh thử này.
  for (const f of await cotTroVao(pg, "branches")) {
    if (["galleries", "customers"].includes(f.bang.replace(/^public\./, ""))) continue;
    await q(`delete from ${f.bang} where ${f.cot} = $1`, [d.branchId]);
  }
  await q(`delete from branches where id = $1`, [d.branchId]);

  const { rows: con } = await pg.query(
    `select (select count(*) from galleries where id = any($1::uuid[]))::int g,
            (select count(*) from customers where id = any($2::uuid[]))::int c,
            (select count(*) from branches where id = $3)::int b`,
    [boIds, khachIds, d.branchId],
  );
  await pg.end();
  if (con[0].g || con[0].c || con[0].b) {
    throw new Error(`Dọn Fixture BB-334A THẤT BẠI — còn ${JSON.stringify(con[0])}. Lỗi: ${loi.join(" | ")}`);
  }
}
