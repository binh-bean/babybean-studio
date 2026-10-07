/**
 * Dữ liệu thử BB-381 (e2e) — chi nhánh riêng "Fixture BB-381-…", sản phẩm riêng "Fixture BB-381 …",
 * (is_active = false — không lọt vào danh mục bán), dọn theo id (chi nhánh + sản phẩm + nhân sự).
 * Không gọi Lark, không ảnh thật.
 *
 * Nhân sự vai `branch_manager` CHỈ thấy chi nhánh này:
 *   · goc       : `ready`, 2 ảnh, hoá đơn Baby 02            → bộ gốc của khách
 *   · goiRong   : `draft`, 0 ảnh, có link, chưa đồng bộ, Baby 02 → tab "Gói chụp chưa có ảnh" (chua_dong_bo)
 *   · goiKhongLink: `draft`, 0 ảnh, link trống, Fam 03     → tab "Gói chụp chưa có ảnh" (chua_co_link)
 *   · goiLoiTai : `sync_error` "chưa chia sẻ", Baby 02      → KHÔNG thành dòng (đã ở "Bộ ảnh lỗi tải"), chỉ đếm ở chân tab
 *   · donHk     : `in_review`, 0 ảnh, UV 13x18 ×2 + Edit file ×5 (không chụp) → tab "Đơn hậu kỳ mua thêm", bộ gốc = goc
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { donTheoChiNhanh } from "./bb-344";

export const NHAN_BB381 = "Fixture BB-381";

export interface DuLieuBB381 {
  runId: string;
  pg: Client;
  branchId: string;
  staffId: string;
  productIds: string[];
  email: string;
  password: string;
  goc: string;
  goiRong: string;
  goiKhongLink: string;
  goiLoiTai: string;
  donHk: string;
  maDonHk: string;
}

export async function duLieuBB381(): Promise<DuLieuBB381> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const password = "Password123!";
  let branchId: string | null = null;
  let staffId: string | null = null;
  const productIds: string[] = [];
  try {
    branchId = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
        `FXBB381-${runId}`,
        `${NHAN_BB381}-${runId} Chi nhánh`,
      ])
    ).rows[0].id as string;
    const customerId = (
      await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000381') returning id`, [
        branchId,
        `${NHAN_BB381}-${runId} Nguyễn Thị Mai`,
      ])
    ).rows[0].id as string;

    const taoSp = async (ten: string, kind: string) => {
      const id = (
        await pg.query(`insert into products (branch_id, name, kind, is_active) values ($1,$2,$3,false) returning id`, [
          branchId,
          `${NHAN_BB381}-${runId} ${ten}`,
          kind,
        ])
      ).rows[0].id as string;
      productIds.push(id);
      return id;
    };
    const baby02 = await taoSp("Baby 02", "shoot_package");
    const fam03 = await taoSp("Fam 03", "shoot_package");
    const uv = await taoSp("UV 13x18", "print");
    const edit = await taoSp("Edit file", "edited_photo");

    const taoBo = async (
      ten: string,
      o: { status: string; folder: string; syncError?: string | null; ma: string; ngayTruoc: number },
    ) =>
      (
        await pg.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                  extra_photo_price, photo_count, sync_error, lark_contract_code, lark_contract_codes, created_at)
           values ($1,$2,$3,$4,$5,$6,50000,0,$7,$8,array[$8]::text[], now() - make_interval(days => $9)) returning id`,
          [
            branchId,
            customerId,
            `${NHAN_BB381}-${runId} ${ten}`,
            o.status,
            o.folder,
            o.folder ? "https://example.com/x" : "",
            o.syncError ?? null,
            o.ma,
            o.ngayTruoc,
          ],
        )
      ).rows[0].id as string;
    const dong = async (g: string, sp: string, sl: number, ma: string) =>
      pg.query(
        `insert into gallery_items (gallery_id, product_id, quantity, lark_contract_code, lark_record_id) values ($1,$2,$3,$4,$5)`,
        [g, sp, sl, ma, `fx381_${runId}_${g.slice(0, 8)}_${sp.slice(0, 8)}`],
      );

    const goc = await taoBo("goc", { status: "ready", folder: `SEED_FOLDER_ID_381_${runId}_goc`, ma: `HD_FX381${runId}A`, ngayTruoc: 60 });
    await dong(goc, baby02, 1, `HD_FX381${runId}A`);
    await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       select $1, 'fx381_' || $2 || '_' || i, 'R01_' || lpad(i::text, 4, '0') || '.JPG', 'image/jpeg', i, 'active', 1500, 1000
         from generate_series(1, 2) i`,
      [goc, runId],
    );
    await pg.query(`update galleries set photo_count = 2 where id = $1`, [goc]);

    const goiRong = await taoBo("goi-rong", { status: "draft", folder: `SEED_FOLDER_ID_381_${runId}_rong`, ma: `HD_FX381${runId}B`, ngayTruoc: 5 });
    await dong(goiRong, baby02, 1, `HD_FX381${runId}B`);
    const goiKhongLink = await taoBo("goi-khong-link", { status: "draft", folder: "", ma: `HD_FX381${runId}C`, ngayTruoc: 4 });
    await dong(goiKhongLink, fam03, 1, `HD_FX381${runId}C`);
    const goiLoiTai = await taoBo("goi-loi-tai", {
      status: "sync_error",
      folder: `SEED_FOLDER_ID_381_${runId}_loi`,
      syncError: "Thư mục chưa được chia sẻ công khai",
      ma: `HD_FX381${runId}D`,
      ngayTruoc: 3,
    });
    await dong(goiLoiTai, baby02, 1, `HD_FX381${runId}D`);
    const maDonHk = `HD_FX381${runId}E`;
    const donHk = await taoBo("don-hk", { status: "in_review", folder: `SEED_FOLDER_ID_381_${runId}_hk`, ma: maDonHk, ngayTruoc: 2 });
    await dong(donHk, uv, 2, maDonHk);
    await dong(donHk, edit, 5, maDonHk);

    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = `fixture.bb381.ql.${runId}@demo.babybean.vn`;
    const r = await supa.auth.admin.createUser({ email, password, email_confirm: true });
    if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản");
    staffId = r.data.user.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [
      staffId,
      `${NHAN_BB381}-${runId} Quản lý`,
      email,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, branchId]);

    return { runId, pg, branchId, staffId, productIds, email, password, goc, goiRong, goiKhongLink, goiLoiTai, donHk, maDonHk };
  } catch (e) {
    if (branchId) await donTheoChiNhanh(pg, branchId, staffId ? [staffId] : []).catch(() => {});
    if (productIds.length) await pg.query(`delete from products where id = any($1::uuid[])`, [productIds]).catch(() => {});
    if (branchId) await pg.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
    await pg.end().catch(() => {});
    throw e;
  }
}

export async function donDepBB381(
  d: DuLieuBB381,
): Promise<{ conBo: number; conChiNhanh: number; conNhanSu: number; conSanPham: number }> {
  // Sản phẩm thử thuộc chi nhánh thử: bộ ảnh (và dòng hàng) xoá trước, rồi sản phẩm, rồi chi nhánh.
  await donTheoChiNhanh(d.pg, d.branchId, [d.staffId]);
  await d.pg.query(`delete from products where id = any($1::uuid[])`, [d.productIds]).catch(() => {});
  await d.pg.query(`delete from branches where id = $1`, [d.branchId]).catch(() => {});
  const n = async (sql: string, p: unknown[]) => (await d.pg.query(sql, p)).rows[0].n as number;
  const kq = {
    conBo: await n(`select count(*)::int n from galleries where branch_id = $1`, [d.branchId]),
    conChiNhanh: await n(`select count(*)::int n from branches where id = $1`, [d.branchId]),
    conNhanSu: await n(`select count(*)::int n from staff_profiles where id = $1`, [d.staffId]),
    conSanPham: await n(`select count(*)::int n from products where id = any($1::uuid[])`, [d.productIds]),
  };
  await d.pg.end();
  return kq;
}
