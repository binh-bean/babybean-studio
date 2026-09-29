/**
 * BB-320 — dòng "giảm giá" trong sổ thanh toán KHÔNG phải tiền thu:
 *  - "Đã thu (ghi nhận trong kỳ)" của báo cáo Doanh thu phát sinh chỉ cộng tiền thật;
 *  - nhưng "Còn phải thu" vẫn trừ phần giảm (khách được giảm thì không còn nợ phần đó).
 *
 * Báo cáo loại mọi bộ ảnh tên "Fixture…", nên ca này dựng một bộ tên khác, đặt hết
 * ở ô thời gian 2099 (cô lập, không lẫn số thật) và dọn sạch ở afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/bao-cao/[ma]/route";

const KY = { tu: "2099-05-01", den: "2099-05-07" };
const NGAY = "2099-05-03T03:00:00Z";

describe("BB-320: báo cáo doanh thu phát sinh với dòng giảm giá", () => {
  let client: Client;
  let branchId: string;
  let staffId: string;
  const don: { table: string; id: string }[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    branchId = (await client.query("select id from branches order by name limit 1")).rows[0].id;
    staffId = (
      await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")
    ).rows[0].id;

    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, 'Khach thu BB-320 bao cao') returning id`,
      [branchId],
    );
    don.push({ table: "customers", id: cust[0].id });
    const { rows: gal } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              included_quota, extra_photo_price, submitted_at)
       values ($1,$2,'BB-320 bo thu giam gia','submitted',$3,'https://example.com/x',10,50000,$4) returning id`,
      [branchId, cust[0].id, `bb320-bc-${Date.now()}-${Math.random()}`, NGAY],
    );
    don.push({ table: "galleries", id: gal[0].id });
    const { rows: sl } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb320b','owner') returning id`,
      [gal[0].id, `bb320-bc-hash-${Date.now()}`],
    );
    don.push({ table: "share_links", id: sl[0].id });
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at,
                               snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,$3,16,6,300000) returning id`,
      [gal[0].id, sl[0].id, NGAY],
    );
    don.push({ table: "selections", id: sel[0].id });
    // Thu thật 100.000 + giảm giá 50.000, cùng ngày trong kỳ.
    for (const [amount, method] of [
      [100_000, "tien_mat"],
      [50_000, "giam_gia"],
    ] as const) {
      const { rows: p } = await client.query(
        `insert into gallery_payments (gallery_id, selection_id, amount, snapshot_extra_amount, payment_method, confirmed_by, confirmed_at, note)
         values ($1,$2,$3,300000,$4,$5,$6,'BB-320') returning id`,
        [gal[0].id, sel[0].id, amount, method, staffId, NGAY],
      );
      don.push({ table: "gallery_payments", id: p[0].id });
    }
  });

  afterAll(async () => {
    for (const d of [...don].reverse()) await client.query(`delete from ${d.table} where id = $1`, [d.id]);
    await client.end();
  });

  it("'Đã thu' chỉ cộng tiền thật (100.000); 'Còn phải thu' trừ cả phần giảm (300.000 − 100.000 − 50.000 = 150.000)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [branchId]));
    const res = await GET(
      new Request(`http://localhost/api/admin/bao-cao/doanh-thu-phat-sinh?tu=${KY.tu}&den=${KY.den}&chiNhanh=${branchId}`),
      { params: Promise.resolve({ ma: "doanh-thu-phat-sinh" }) },
    );
    expect(res.status).toBe(200);
    const theSo = (await res.json()).data.ketQua.theSo as { nhan: string; giaTri: number }[];
    const so = (nhan: string) => theSo.find((t) => t.nhan.startsWith(nhan))!.giaTri;
    expect(so("Đã thu"), "phần giảm giá KHÔNG được tính là tiền đã thu").toBe(100_000);
    expect(so("Còn phải thu")).toBe(150_000);
  });
});
