/**
 * BB-351 — đối chiếu tiền trên 4 kịch bản (đề xuất của người soát C vòng 7, mục 2.1): MỌI nơi hiện
 * tiền phải ra CÙNG một con số — GET /items (màn chi tiết + tab "Khách gửi ảnh chọn"), GET /payments
 * (form thu ở tab "Ảnh vượt hạn mức"), phản hồi POST /payments, báo cáo over-quota, và `layTienCanThu`.
 *
 *   1. không vượt hạn mức;
 *   2. vượt (đã chốt, chưa thu);
 *   3. có đợt mua thêm 2 đã xác nhận (đã thu phần vượt);
 *   4. đã quy đổi hạn mức (thu đủ phần vượt → hạn mức tự tăng, BB-348).
 *
 * Fixture "Fixture BB-351-…" trên bb-dev, chi nhánh có sẵn, xoá theo id ở afterAll.
 * Kiểm ngược: hoàn nguyên items/route.ts (`dueAmount = snapshot_extra_amount`) → ca 3 ĐỎ
 * (100.000 ≠ 200.000); hoàn nguyên payments/route.ts (`outstanding = snapshot − paid`) → ca 3/4 ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as layItems, PATCH as suaDong, DELETE as xoaDong } from "@/app/api/admin/galleries/[id]/items/route";
import { GET as layThu, POST as ghiThu } from "@/app/api/admin/galleries/[id]/payments/route";
import { GET as baoCaoVuot } from "@/app/api/admin/reports/over-quota/route";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";

const GIA = 50000;
const RUN = `${Date.now() % 1_000_000}`;

describe("BB-351: một công thức tiền — 4 kịch bản, mọi nơi cùng số", () => {
  let pg: Client;
  let branchId = "";
  let staffId = "";
  let customerId = "";
  let spEditId = "";
  const boIds: string[] = [];

  async function taoBo(ten: string, chon: number, snapshotAnh: number): Promise<{ id: string; selId: string }> {
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',$5,null,$6) returning id`,
      [branchId, customerId, `Fixture BB-351-${RUN} ${ten}`, `SEED_FOLDER_ID_BB351_${RUN}_${boIds.length}`, chon, GIA],
    );
    const id = g[0].id as string;
    boIds.push(id);
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, lark_record_id) values ($1,$2,5,$3)`,
      [id, spEditId, `recFIXTURE351${id.slice(0, 8)}`],
    );
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb351x','owner') returning id`,
      [id, `fixture-bb351-${id}`],
    );
    const { rows: sel } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at,
                               snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,now() - interval '1 hour',$3,$4,$5) returning id`,
      [id, sl[0].id, chon, snapshotAnh, snapshotAnh * GIA],
    );
    for (let i = 1; i <= chon; i++) {
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb351-${id}-${i}`, `R01_000${i}.JPG`, i],
      );
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`,
        [sel[0].id, ph[0].id, id, i],
      );
    }
    return { id, selId: sel[0].id as string };
  }

  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  async function soItems(id: string) {
    const res = await layItems(new Request(`http://localhost/api/admin/galleries/${id}/items`), ctx(id));
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    return { due: j.data.dueAmount, out: j.data.outstanding, can: j.data.amountToCollect, paid: j.data.paidAmount };
  }
  async function soThuGet(id: string) {
    const res = await layThu(new Request(`http://localhost/api/admin/galleries/${id}/payments`), ctx(id));
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    return { due: j.data.dueAmount, out: j.data.outstanding, can: j.data.amountToCollect, paid: j.data.paidAmount };
  }
  async function trongBaoCao(id: string): Promise<number | null> {
    const res = await baoCaoVuot(new Request(`http://localhost/api/admin/reports/over-quota?branchId=${branchId}`));
    const j = await res.json();
    return (j.data.items as { galleryId: string; unbilledAmount: number }[]).find((i) => i.galleryId === id)?.unbilledAmount ?? null;
  }
  /** Mọi nơi phải cùng số; trả về bộ số để so với kỳ vọng. */
  async function doiChieu(id: string) {
    const [a, b, t, bc] = await Promise.all([soItems(id), soThuGet(id), layTienCanThu(createAdminClient(), id), trongBaoCao(id)]);
    expect(b).toEqual(a);
    expect(a.due).toBe(t.tongPhaiThu);
    expect(a.out).toBe(t.conThieu);
    expect(a.can).toBe(t.tienCanThu);
    expect(a.paid).toBe(t.daGhiCo);
    expect(bc ?? 0).toBe(t.conThieuVuot);
    return { ...a, baoCao: bc };
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (await pg.query("select id from branches order by name limit 1")).rows[0].id;
    staffId = (await pg.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")).rows[0].id;
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [branchId], staffId));
    customerId = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [branchId, `Fixture BB-351-${RUN} Nguyễn Thị Mai`])
    ).rows[0].id;
    spEditId = (
      await pg.query(`insert into products (name, kind, list_price, is_active) values ($1,'edited_photo',${GIA}, false) returning id`, [
        `Fixture BB-351-${RUN} Edit file`,
      ])
    ).rows[0].id;
  });

  afterAll(async () => {
    for (const id of boIds) {
      for (const sql of [
        "delete from activity_logs where entity_id = $1 or gallery_id = $1",
        "delete from thong_bao_khach where gallery_id = $1",
        "delete from gallery_payments where gallery_id = $1",
        "delete from selection_rounds where gallery_id = $1",
        "delete from selection_items where gallery_id = $1",
        "delete from selections where gallery_id = $1",
        "delete from share_links where gallery_id = $1",
        "delete from gallery_items where gallery_id = $1",
        "delete from photos where gallery_id = $1",
        "delete from galleries where id = $1",
      ])
        await pg.query(sql, [id]).catch(() => {});
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (spEditId) await pg.query("delete from products where id = $1", [spEditId]);
    const con = (await pg.query("select count(*)::int n from galleries where title like $1", [`Fixture BB-351-${RUN}%`])).rows[0].n;
    console.log("BB351_DON_4_KICH_BAN", JSON.stringify({ boAnhConSot: con }));
    await pg.end();
  });

  it("1. không vượt hạn mức: 0 ở mọi nơi", async () => {
    const { id } = await taoBo("khong vuot", 4, 0);
    expect(await doiChieu(id)).toMatchObject({ due: 0, out: 0, can: 0, baoCao: null });
  });

  it("2. vượt 2 ảnh, đã chốt, chưa thu: 100.000 ở mọi nơi", async () => {
    const { id } = await taoBo("vuot", 7, 2);
    expect(await doiChieu(id)).toMatchObject({ due: 2 * GIA, out: 2 * GIA, can: 2 * GIA, baoCao: 2 * GIA });
  });

  it("3. có đợt 2 đã xác nhận (đã thu phần vượt): phải thu 200.000, còn 100.000 — không 'DƯ'", async () => {
    const { id, selId } = await taoBo("dot 2", 7, 2);
    await pg.query(
      `insert into gallery_payments (gallery_id, selection_id, amount, payment_method, confirmed_by) values ($1,$2,$3,'tien_mat',$4)`,
      [id, selId, 2 * GIA, staffId],
    );
    await pg.query(
      `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh, tien_anh)
       values ($1,$2,2,'da_xac_nhan',2,2,$3,$4)`,
      [id, selId, GIA, 2 * GIA],
    );
    expect(await doiChieu(id)).toMatchObject({ due: 4 * GIA, out: 2 * GIA, can: 2 * GIA, paid: 2 * GIA, baoCao: null });
  });

  it("4. thu đủ phần vượt qua route → hạn mức quy đổi (+2), phải thu vẫn 100.000, còn 0 — phản hồi POST cùng số", async () => {
    const { id } = await taoBo("quy doi", 7, 2);
    const res = await ghiThu(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ amount: 2 * GIA, method: "chuyen_khoan", note: "Fixture nhập tay" }) }),
      ctx(id),
    );
    const j = await res.json();
    expect(res.status, JSON.stringify(j)).toBe(200);
    expect(j.data.quotaChange).toBe(2);
    const so = await doiChieu(id);
    expect(so).toMatchObject({ due: 2 * GIA, out: 0, can: 0, paid: 2 * GIA, baoCao: null });
    expect({ due: j.data.dueAmount, out: j.data.outstanding, can: j.data.amountToCollect, paid: j.data.paidAmount }).toEqual({
      due: so.due,
      out: so.out,
      can: so.can,
      paid: so.paid,
    });
  });

  it("chống ghi trùng: cùng requestId gửi hai lần → một dòng sổ, lần 2 trả trung:true", async () => {
    const { id } = await taoBo("trung", 7, 2);
    const ma = `fixture-bb351-${RUN}-ma`;
    const goi = () =>
      ghiThu(
        new Request("http://localhost", { method: "POST", body: JSON.stringify({ amount: GIA, method: "tien_mat", requestId: ma, note: "Fixture nhập tay" }) }),
        ctx(id),
      ).then((r) => r.json());
    const r1 = await goi();
    const r2 = await goi();
    expect(r1.data.trung).toBe(false);
    expect(r2.data.trung).toBe(true);
    const n = (await pg.query("select count(*)::int n from gallery_payments where gallery_id = $1", [id])).rows[0].n;
    expect(n).toBe(1);
    expect(r2.data.outstanding).toBe(GIA);
  });

  it("B#12: dòng hạn mức tự tạo khi thu tiền không sửa/xoá tay được (400), GET đánh dấu tuThanhToan", async () => {
    const { id } = await taoBo("khoa dong", 7, 2);
    const r = await ghiThu(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ amount: 2 * GIA, method: "chuyen_khoan", note: "Fixture nhập tay" }) }),
      ctx(id),
    );
    expect(r.status).toBe(200);
    const dong = (await pg.query("select id, quantity from gallery_items where gallery_id = $1 and lark_record_id like 'thanh_toan:%'", [id])).rows;
    expect(dong.length).toBe(1);
    const dongId = dong[0].id as string;
    const rs = await suaDong(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ itemId: dongId, quantity: 9 }) }),
      ctx(id),
    );
    expect(rs.status).toBe(400);
    expect((await rs.json()).error.message).toMatch(/Tự tạo khi thu tiền|tự tạo khi thu tiền/i);
    const rx = await xoaDong(new Request(`http://localhost?itemId=${dongId}`, { method: "DELETE" }), ctx(id));
    expect(rx.status).toBe(400);
    const sau = (await pg.query("select quantity from gallery_items where id = $1", [dongId])).rows;
    expect(sau).toEqual([{ quantity: dong[0].quantity }]);
    const g = await layItems(new Request(`http://localhost/api/admin/galleries/${id}/items`), ctx(id));
    const items = (await g.json()).data.items as { id: string; tuThanhToan?: boolean }[];
    expect(items.find((i) => i.id === dongId)?.tuThanhToan).toBe(true);
    expect(items.filter((i) => i.id !== dongId).every((i) => i.tuThanhToan === false)).toBe(true);
  });
});
