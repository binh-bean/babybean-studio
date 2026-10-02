/**
 * BB-348 mục 3 — CSKH xác nhận thanh toán ảnh vượt hạn mức thì hạn mức tự tăng.
 *
 * Chạy trên bb-dev bằng fixture "Fixture BB-348-…", xoá theo id ở afterAll (kể cả
 * dòng hợp đồng, sổ thu, nhật ký). Không gọi Lark: bước ghi dòng hợp đồng của
 * đồng bộ Lark được gọi thẳng (`ghiDongHopDong`) với dữ liệu giả.
 *
 * Hai bộ ảnh, cùng hạn mức 5, khách chọn 8 → vượt 3 × 50.000đ:
 *   · bộ CHỐT RỒI   — có số lúc chốt (`snapshot_extra_amount` = 150.000);
 *   · bộ CHƯA CHỐT  — không có số lúc chốt, tiền lấy theo ảnh (`v_over_quota_unbilled`).
 *     Đây là chỗ dễ trừ HAI LẦN nhất: hạn mức tăng thì số theo ảnh tự giảm, còn
 *     tiền đã thu vẫn bị trừ tiếp.
 *
 * Thước đo AGENTS.md §5a (đã chạy thật, kết quả dán ở bàn giao):
 *   · bỏ lời gọi `dongBoHanMucTheoThanhToan` ở payments/route.ts → ca 1, 2, 4, 5 ĐỎ;
 *   · bỏ phần cộng lại `quyDoi` trong `tienVuotHanMucPhaiThu` → ca 3 ĐỎ (còn thu 0 thay vì 50.000).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as ghiThu } from "@/app/api/admin/galleries/[id]/payments/route";
import { GET as baoCaoVuot } from "@/app/api/admin/reports/over-quota/route";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { ghiDongHopDong } from "@/lib/lark/dong-hop-dong";
import { createAdminClient } from "@/lib/supabase/admin";

const GIA = 50000;

describe("BB-348: hạn mức tăng theo thanh toán, không trừ hai lần", () => {
  let pg: Client;
  let branchId = "";
  let staffId = "";
  let customerId = "";
  let spEditId = "";
  const boIds: string[] = [];
  let boChot = "";
  let boChuaChot = "";
  const MA_HD = `HD_FIXTURE348#${Date.now() % 100000}`;

  async function taoBo(ten: string, coChot: boolean): Promise<string> {
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,$4,$5,'https://example.com/x',8,null,$6) returning id`,
      [branchId, customerId, ten, coChot ? "submitted" : "in_review", `SEED_FOLDER_ID_348_${Date.now()}_${ten.length}`, GIA],
    );
    const id = g[0].id as string;
    boIds.push(id);
    // Dòng hợp đồng gốc: 5 ảnh chỉnh sửa, MANG mã hợp đồng (như dòng kéo từ Lark).
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, lark_contract_code, lark_record_id)
       values ($1,$2,5,$3,$4)`,
      [id, spEditId, MA_HD, `recFIXTURE348${id.slice(0, 8)}`],
    );
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1,$2,'bb348x','owner') returning id`,
      [id, `fixture-bb348-${id}`],
    );
    const { rows: sel } = await pg.query(
      coChot
        ? `insert into selections (gallery_id, share_link_id, is_primary, submitted_at,
                                   snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
           values ($1,$2,true,now() - interval '1 hour',8,3,${3 * GIA}) returning id`
        : `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [id, sl[0].id],
    );
    for (let i = 1; i <= 8; i++) {
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb348-${id}-${i}`, `R01_000${i}.JPG`, i],
      );
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index)
         values ($1,$2,$3,'selected',$4)`,
        [sel[0].id, ph[0].id, id, i],
      );
    }
    return id;
  }

  const hanMuc = async (id: string) =>
    Number((await pg.query(`select app.gallery_quota($1) q`, [id])).rows[0].q);
  const conThu = async (id: string) => (await layTienCanThu(createAdminClient(), id)).tienCanThu;
  const trongView = async (id: string) =>
    (await pg.query(`select unbilled_count from v_over_quota_unbilled where gallery_id = $1`, [id])).rows[0]
      ?.unbilled_count ?? null;
  const trongBaoCao = async (id: string) => {
    const res = await baoCaoVuot(new Request(`http://localhost/api/admin/reports/over-quota?branchId=${branchId}`));
    const json = await res.json();
    return (json.data.items as { galleryId: string; unbilledAmount: number }[]).find((i) => i.galleryId === id) ?? null;
  };
  const thu = async (id: string, v: Record<string, unknown>) => {
    const res = await ghiThu(new Request("http://localhost", { method: "POST", body: JSON.stringify(v) }), {
      params: Promise.resolve({ id }),
    });
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    return json.data as { quotaChange: number | null };
  };

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (await pg.query("select id from branches order by name limit 1")).rows[0].id;
    const st = await pg.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1");
    staffId = st.rows[0].id;
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [branchId], staffId));

    customerId = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,'Fixture BB-348 Nguyễn Thị Mai') returning id`, [branchId])
    ).rows[0].id;
    spEditId = (
      await pg.query(`insert into products (name, kind, list_price) values ('Fixture BB-348 Edit file','edited_photo',${GIA}) returning id`)
    ).rows[0].id;
    boChot = await taoBo("Fixture BB-348 đã chốt", true);
    boChuaChot = await taoBo("Fixture BB-348 chưa chốt", false);
  }, 60_000);

  afterAll(async () => {
    if (boIds.length) {
      await pg.query(`delete from activity_logs where entity_id = any($1::uuid[]) or gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from gallery_payments where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from gallery_items where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from selection_items where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from selections where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from share_links where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from photos where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from galleries where id = any($1::uuid[])`, [boIds]);
    }
    if (customerId) await pg.query(`delete from customers where id = $1`, [customerId]);
    if (spEditId) await pg.query(`delete from products where id = $1`, [spEditId]);
    await pg.end();
  }, 60_000);

  it("0. Trước khi thu: hạn mức 5, vượt 3, còn thu 150.000 ở cả hai bộ", async () => {
    for (const id of [boChot, boChuaChot]) {
      expect(await hanMuc(id)).toBe(5);
      expect(await trongView(id)).toBe(3);
      expect(await conThu(id)).toBe(3 * GIA);
    }
  });

  it("1. Bộ đã chốt: thu đủ 3 ảnh → hạn mức +3, còn thu 0, báo cáo vượt hạn mức không còn bộ này", async () => {
    const kq = await thu(boChot, { amount: 3 * GIA, method: "chuyen_khoan" });
    expect(kq.quotaChange).toBe(3);
    expect(await hanMuc(boChot)).toBe(8);
    expect(await conThu(boChot)).toBe(0);
    expect(await trongView(boChot)).toBeNull();
    expect(await trongBaoCao(boChot)).toBeNull();
    const log = await pg.query(
      `select metadata from activity_logs where gallery_id = $1 and action = 'gallery.quota_by_payment' order by created_at desc limit 1`,
      [boChot],
    );
    expect(log.rows[0]?.metadata?.soAnh).toBe(3);
  });

  it("2. Đồng bộ dòng hợp đồng từ Lark KHÔNG xoá dòng hạn mức do thanh toán", async () => {
    const kq = { soDongGhi: 0, soDongGiuNguyen: 0, maKhongThay: [], sanPhamChuaCo: [] };
    await ghiDongHopDong(
      createAdminClient(),
      boChot,
      MA_HD,
      [{ larkRecordId: `recFIXTURE348new${boChot.slice(0, 6)}`, productId: spEditId, quantity: 5, unitPrice: null, lineTotal: null, children: [] }],
      kq,
    );
    expect(kq.soDongGhi).toBe(1); // dòng gốc bị xoá-rồi-ghi-lại thật
    expect(await hanMuc(boChot)).toBe(8); // 5 (Lark) + 3 (thanh toán) — vẫn còn
    expect(await conThu(boChot)).toBe(0);
  });

  it("3. KHÔNG trừ hai lần: bộ chưa chốt thu 2/3 ảnh → hạn mức +2, còn đúng 1 ảnh = 50.000", async () => {
    const kq = await thu(boChuaChot, { amount: 2 * GIA, method: "tien_mat" });
    expect(kq.quotaChange).toBe(2);
    expect(await hanMuc(boChuaChot)).toBe(7);
    // Trừ hai lần sẽ ra 0 (1 ảnh × 50.000 theo ảnh − 100.000 đã thu).
    expect(await conThu(boChuaChot)).toBe(GIA);
    expect((await trongBaoCao(boChuaChot))?.unbilledAmount).toBe(GIA);
    // Thu nốt → hạn mức +1, còn 0, ra khỏi báo cáo.
    const kq2 = await thu(boChuaChot, { amount: GIA, method: "tien_mat" });
    expect(kq2.quotaChange).toBe(1);
    expect(await hanMuc(boChuaChot)).toBe(8);
    expect(await conThu(boChuaChot)).toBe(0);
    expect(await trongBaoCao(boChuaChot)).toBeNull();
  });

  it("4. Dòng đính chính âm → hạn mức về lại như cũ, tiền còn thu trở lại", async () => {
    const kq = await thu(boChot, { amount: -3 * GIA, method: "chuyen_khoan", note: "Fixture BB-348 đính chính" });
    expect(kq.quotaChange).toBe(-3);
    expect(await hanMuc(boChot)).toBe(5);
    expect(await conThu(boChot)).toBe(3 * GIA);
    expect(await trongView(boChot)).toBe(3);
    // BB-351: bộ còn `submitted` = đang nằm ở tab "Khách gửi ảnh chọn" (có form thu tiền riêng) →
    // KHÔNG hiện thêm ở "Ảnh vượt hạn mức" (một khách một việc). Studio xác nhận xong mà còn nợ
    // thì bộ quay về báo cáo này với đúng số còn thu.
    expect(await trongBaoCao(boChot)).toBeNull();
    await pg.query(`update galleries set status = 'in_retouch' where id = $1`, [boChot]);
    expect((await trongBaoCao(boChot))?.unbilledAmount).toBe(3 * GIA);
  });

  it("5. Bộ chưa chốt đính chính một phần (−50.000) → hạn mức giảm 1, còn thu 50.000", async () => {
    const kq = await thu(boChuaChot, { amount: -GIA, method: "tien_mat", note: "Fixture BB-348 đính chính" });
    expect(kq.quotaChange).toBe(-1);
    expect(await hanMuc(boChuaChot)).toBe(7);
    expect(await conThu(boChuaChot)).toBe(GIA);
  });
});
