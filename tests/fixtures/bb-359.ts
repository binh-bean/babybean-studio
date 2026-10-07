/**
 * Dữ liệu thử BB-359 (e2e) — chi nhánh riêng "Fixture BB-359-…", dọn theo id KÈM chi nhánh
 * (`donTheoChiNhanh` của BB-344). Không gọi Lark, không ảnh thật.
 *
 * Bàn làm việc (mục 1) — nhân sự vai `branch_manager` CHỈ thấy chi nhánh này, nên số trên
 * màn là số của fixture, không lẫn bộ thật:
 *   · guiAnh : `submitted`, 2 ảnh, đợt 1 chờ xác nhận     → tab "Khách gửi ảnh chọn" 1
 *              (có ảnh như bộ thật khách đã chọn; trước BB-395 bộ này 0 ảnh nên từ BB-381
 *              nó bị đếm THÊM ở "Gói chụp chưa có ảnh" — phép thử đỏ 4 ≠ 2)
 *   · vuot   : `in_retouch`, chốt 3/1 ảnh, 100.000 chưa thu → tab "Ảnh vượt hạn mức" 1
 *   · nhap   : `draft`, 0 ảnh, chưa có dòng hoá đơn         → tab "Gói chụp chưa có ảnh" 1
 *              (luật BB-381, Đợt 18: bộ có gói/chưa rõ gói mà 0 ảnh là MỘT việc có tab riêng;
 *              trước BB-381 bộ này không có tab nào — bản cũ BB-283 cộng nó vào thẻ
 *              "Cần xử lý ngay" bằng công thức riêng nên thẻ lệch huy hiệu).
 *
 * Bộ đã thu gọn (mục 2b) — `daGiao`: `delivered`, CHỈ còn 2 dòng ảnh (bìa + ảnh đã chọn),
 * link vai owner. Phép thử thêm 4 dòng ảnh khi "Drive đồng bộ xong" (giả).
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { donTheoChiNhanh } from "./bb-344";

export const NHAN_BB359 = "Fixture BB-359";

export interface DuLieuBB359 {
  runId: string;
  pg: Client;
  branchId: string;
  staffId: string;
  email: string;
  password: string;
  guiAnh: string;
  vuot: string;
  nhap: string;
  daGiao: string;
  tokenDaGiao: string;
}

export async function duLieuBB359(): Promise<DuLieuBB359> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const password = "Password123!";
  let branchId: string | null = null;
  let staffId: string | null = null;
  try {
    branchId = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
        `FXBB359-${runId}`,
        `${NHAN_BB359}-${runId} Chi nhánh`,
      ])
    ).rows[0].id as string;
    const customerId = (
      await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000359') returning id`, [
        branchId,
        `${NHAN_BB359}-${runId} Nguyễn Thị Mai`,
      ])
    ).rows[0].id as string;

    const taoBo = async (ten: string, status: string, quota: number | null) =>
      (
        await pg.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                  included_quota, extra_photo_price, photo_count)
           values ($1,$2,$3,$4,$5,'https://example.com/x',$6,50000,0) returning id`,
          [branchId, customerId, `${NHAN_BB359}-${runId} ${ten}`, status, `SEED_FOLDER_ID_359_${runId}_${ten}`, quota],
        )
      ).rows[0].id as string;
    const linkVaLuot = async (g: string, chot: { soAnh: number; tien: number } | null) => {
      const token = randomBytes(24).toString("base64url");
      const sl = (
        await pg.query(
          `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
           values ($1,$2,$3,'owner',$4,'active') returning id`,
          [g, createHash("sha256").update(token).digest("hex"), token.slice(0, 6), `${NHAN_BB359}-${runId}`],
        )
      ).rows[0].id as string;
      const sel = (
        await pg.query(
          `insert into selections (gallery_id, share_link_id, display_name, is_primary, submitted_at,
                                   snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
           values ($1,$2,$3,true,$4,$5,$6,$7) returning id`,
          [g, sl, `${NHAN_BB359}-${runId}`, chot ? new Date(Date.now() - 3600_000).toISOString() : null,
            chot?.soAnh ?? null, chot ? Math.max(0, chot.soAnh - 1) : null, chot?.tien ?? null],
        )
      ).rows[0].id as string;
      return { token, sel };
    };
    const themAnh = async (g: string, tu: number, den: number) => {
      const { rows } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
         select $1, 'fx359_' || $2 || '_' || i, 'R01_' || lpad(i::text, 4, '0') || '.JPG', 'image/jpeg', i, 'active', 1500, 1000
           from generate_series($3::int, $4::int) i returning id`,
        [g, runId, tu, den],
      );
      await pg.query(
        `update galleries set photo_count = (select count(*) from photos where gallery_id = $1 and status = 'active') where id = $1`,
        [g],
      );
      return rows.map((r) => r.id as string);
    };

    const guiAnh = await taoBo("gui-anh", "submitted", 10);
    await linkVaLuot(guiAnh, { soAnh: 0, tien: 0 });
    // BB-395 — bộ khách đã gửi ảnh chọn thì có ảnh; 0 ảnh là rơi vào "Gói chụp chưa có ảnh" (BB-381).
    await themAnh(guiAnh, 1, 2);

    const vuot = await taoBo("vuot", "in_retouch", 1);
    const lv = await linkVaLuot(vuot, { soAnh: 3, tien: 100000 });
    const anhVuot = await themAnh(vuot, 1, 3);
    for (const p of anhVuot) {
      await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`, [lv.sel, p, vuot]);
    }

    const nhap = await taoBo("nhap", "draft", null);

    const daGiao = await taoBo("da-giao", "delivered", 10);
    const ld = await linkVaLuot(daGiao, { soAnh: 1, tien: 0 });
    const [bia, chon] = await themAnh(daGiao, 1, 2);
    await pg.query(`update galleries set cover_photo_id = $2 where id = $1`, [daGiao, bia]);
    await pg.query(`insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`, [ld.sel, chon, daGiao]);

    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `fixture.bb359.ql.${runId}@demo.babybean.vn`;
    const r = await supa.auth.admin.createUser({ email, password, email_confirm: true });
    if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản");
    staffId = r.data.user.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [
      staffId,
      `${NHAN_BB359}-${runId} Quản lý`,
      email,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, branchId]);

    return { runId, pg, branchId, staffId, email, password, guiAnh, vuot, nhap, daGiao, tokenDaGiao: ld.token };
  } catch (e) {
    if (branchId) await donTheoChiNhanh(pg, branchId, staffId ? [staffId] : []).catch(() => {});
    await pg.end().catch(() => {});
    throw e;
  }
}

/** "Drive đồng bộ xong" (giả): thêm 4 ảnh còn lại vào bộ đã giao. */
export async function giaDongBoXong(d: DuLieuBB359): Promise<void> {
  await d.pg.query(
    `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     select $1, 'fx359_' || $2 || '_' || i, 'R01_' || lpad(i::text, 4, '0') || '.JPG', 'image/jpeg', i, 'active', 1500, 1000
       from generate_series(3, 6) i`,
    [d.daGiao, d.runId],
  );
  await d.pg.query(`update galleries set photo_count = 6 where id = $1`, [d.daGiao]);
}

export async function donDepBB359(d: DuLieuBB359): Promise<{ conBo: number; conChiNhanh: number; conNhanSu: number }> {
  await donTheoChiNhanh(d.pg, d.branchId, [d.staffId]);
  const { rows: bo } = await d.pg.query(`select count(*)::int n from galleries where branch_id = $1`, [d.branchId]);
  const { rows: cn } = await d.pg.query(`select count(*)::int n from branches where id = $1`, [d.branchId]);
  const { rows: ns } = await d.pg.query(`select count(*)::int n from staff_profiles where id = $1`, [d.staffId]);
  await d.pg.end();
  return { conBo: bo[0].n, conChiNhanh: cn[0].n, conNhanSu: ns[0].n };
}
