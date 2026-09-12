/**
 * BB-120 — API báo cáo ảnh vượt hạn mức chưa thu tiền.
 *
 * Phép thử quan trọng nhất ở đây là CÁCH LY CHI NHÁNH. Route đọc bằng khoá
 * quản trị nên RLS bị bỏ qua hoàn toàn; nếu route quên lọc thì quản lý chi
 * nhánh này nhìn thấy khoản nợ của chi nhánh kia, và không có lớp nào phía sau
 * chặn lại.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/reports/over-quota/route";

describe("BB-120: báo cáo ảnh vượt hạn mức", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  const made: { galleryId: string; customerId: string }[] = [];

  /** Dựng một bộ ảnh đã chọn vượt hạn mức, trả về id. */
  async function makeOverQuota(branchId: string, quota: number, selected: number) {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1, 'Fixture BB-120 Khách') returning id`,
      [branchId],
    );
    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
          included_quota, extra_photo_price)
       values ($1,$2,'Fixture BB-120','ready',$3,'https://example.com/x',$4,50000)
       returning id`,
      [branchId, cust[0].id, `fixture-bb120-${Date.now()}-${Math.random()}`, quota],
    );
    const galleryId = gal[0].id;

    const { rows: link } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1, md5(random()::text), 'bb120x', 'owner') returning id`,
      [galleryId],
    );
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary)
       values ($1,$2,true) returning id`,
      [galleryId, link[0].id],
    );
    const { rows: photos } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index)
       select $1, 'bb120-'||i||'-'||random(), 'p'||i||'.jpg', 'image/jpeg', i
         from generate_series(1,$2) i returning id`,
      [galleryId, selected],
    );
    for (const p of photos) {
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark)
         values ($1,$2,$3,'selected')`,
        [sel[0].id, p.id, galleryId],
      );
    }

    made.push({ galleryId, customerId: cust[0].id });
    return galleryId;
  }

  function asStaff(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000120",
      role,
      branchIds,
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const call = () => GET(new Request("http://localhost/api/admin/reports/over-quota"));

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select id from branches order by name limit 2");
    branchA = rows[0].id;
    branchB = rows[1].id;

    await makeOverQuota(branchA, 2, 5); // vượt 3 ảnh = 150.000đ
    await makeOverQuota(branchB, 1, 4); // vượt 3 ảnh = 150.000đ
  });

  afterAll(async () => {
    for (const m of made) {
      await client.query("delete from galleries where id = $1", [m.galleryId]);
      await client.query("delete from customers where id = $1", [m.customerId]);
    }
    await client.end();
  });

  it("1. Quản lý chi nhánh A KHÔNG thấy khoản nợ của chi nhánh B", async () => {
    asStaff("branch_manager", [branchA]);
    const body = await (await call()).json();

    const branches = new Set(body.data.items.map((i: { branchName: string }) => i.branchName));
    expect(branches.size).toBeLessThanOrEqual(1);

    // Và bộ ảnh của chi nhánh B phải vắng mặt hoàn toàn.
    const ids = body.data.items.map((i: { galleryId: string }) => i.galleryId);
    expect(ids).not.toContain(made[1]!.galleryId);
    expect(ids).toContain(made[0]!.galleryId);
  });

  it("2. Chủ studio thấy cả hai chi nhánh", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await call()).json();
    const ids = body.data.items.map((i: { galleryId: string }) => i.galleryId);
    expect(ids).toContain(made[0]!.galleryId);
    expect(ids).toContain(made[1]!.galleryId);
  });

  it("3. Tổng tiền bằng đúng tổng các dòng — không cộng nhầm gì thêm", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await call()).json();

    const sum = body.data.items.reduce(
      (n: number, i: { unbilledAmount: number }) => n + i.unbilledAmount,
      0,
    );
    expect(body.data.summary.totalUnbilledAmount).toBe(sum);

    const mine = body.data.items.find(
      (i: { galleryId: string }) => i.galleryId === made[0]!.galleryId,
    );
    // Hạn mức 2, chọn 5 -> vượt 3, chưa mua thêm -> 3 x 50.000 = 150.000
    expect(mine?.unbilledCount).toBe(3);
    expect(mine?.unbilledAmount).toBe(150_000);
  });

  it("4. Số bộ chưa rõ hạn mức đếm RIÊNG, không cộng vào tiền", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await call()).json();

    // Đây là điểm dễ hiểu sai nhất của báo cáo: chưa rõ hạn mức KHÔNG có nghĩa
    // là không nợ, cũng KHÔNG được cộng vào số tiền. Nó là phần chưa đo được.
    expect(typeof body.data.summary.missingQuotaCount).toBe("number");
    const sum = body.data.items.reduce(
      (n: number, i: { unbilledAmount: number }) => n + i.unbilledAmount,
      0,
    );
    expect(body.data.summary.totalUnbilledAmount).toBe(sum);
  });

  it("5. CTV thời vụ bị chặn — không xem được tiền", async () => {
    asStaff("photoshop_ctv", [branchA, branchB]);
    const res = await call();
    expect(res.status).toBe(403);
  });
});
