/**
 * BB-120 — API báo cáo ảnh vượt hạn mức chưa thu tiền.
 *
 * Phép thử quan trọng nhất ở đây là CÁCH LY CHI NHÁNH. Route đọc bằng khoá
 * quản trị nên RLS bị bỏ qua hoàn toàn; nếu route quên lọc thì quản lý chi
 * nhánh này nhìn thấy khoản nợ của chi nhánh kia, và không có lớp nào phía sau
 * chặn lại.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { Client } from "pg";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/reports/over-quota/route";

describe("BB-120: báo cáo ảnh vượt hạn mức", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  const made: { galleryId: string; customerId: string }[] = [];
  const nen: { branchId: string; customerId: string }[] = [];

  /** Dựng một bộ ảnh đã chọn vượt hạn mức, trả về id. */
  async function makeOverQuota(branchId: string, quota: number, selected: number, coBe = false) {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1, 'Fixture BB-120 Khách') returning id`,
      [branchId],
    );
    let babyId: string | null = null;
    if (coBe) {
      const { rows: be } = await client.query(
        `insert into babies (customer_id, full_name, nickname)
         values ($1, 'Fixture BB-320 Nguyễn Ngọc Bảo An', null) returning id`,
        [cust[0].id],
      );
      babyId = be[0].id;
    }
    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, baby_id, title, status, drive_folder_id, drive_folder_url,
          included_quota, extra_photo_price)
       values ($1,$2,$5,'Fixture BB-120','ready',$3,'https://example.com/x',$4,50000)
       returning id`,
      [branchId, cust[0].id, `fixture-bb120-${Date.now()}-${Math.random()}`, quota, babyId],
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
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const call = () => GET(new Request("http://localhost/api/admin/reports/over-quota"));

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    // BB-367: HAI chi nhánh "Fixture" RIÊNG (bản cũ lấy hai chi nhánh thật rồi dựng bộ thử vào).
    const nenA = await dungNenFixture(client, "BB-120");
    const nenB = await dungNenFixture(client, "BB-120");
    nen.push(nenA, nenB);
    branchA = nenA.branchId;
    branchB = nenB.branchId;

    await makeOverQuota(branchA, 2, 5); // vượt 3 ảnh = 150.000đ
    await makeOverQuota(branchB, 1, 4); // vượt 3 ảnh = 150.000đ
    await makeOverQuota(branchA, 2, 4, true); // BB-320: bộ có bé — để thử tên trong dòng báo cáo
  });

  afterAll(async () => {
    // BB-367: dọn theo id; lỗi dọn làm phép thử đỏ; luôn đóng kết nối.
    try {
      await donNenFixture(client, {
        galleryIds: made.map((m) => m.galleryId),
        customerIds: [...made.map((m) => m.customerId), ...nen.map((n) => n.customerId)],
        branchIds: nen.map((n) => n.branchId),
      });
    } finally {
      await client.end();
    }
  }, 60_000);

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

  it("6. BB-320 (Q-D2): mỗi dòng nói được GỌI AI — có tên khách và tên bé, không chỉ mã hợp đồng", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await call()).json();
    const coBe = body.data.items.find((i: { galleryId: string }) => i.galleryId === made[2]!.galleryId);
    expect(coBe?.customerName).toBe("Fixture BB-120 Khách");
    expect(coBe?.babyFullName).toBe("Fixture BB-320 Nguyễn Ngọc Bảo An");
    expect(coBe?.babyNickname).toBeNull();

    // Bộ không gắn bé vẫn hiện tên khách, tên bé để trống (không bịa).
    const khongBe = body.data.items.find((i: { galleryId: string }) => i.galleryId === made[0]!.galleryId);
    expect(khongBe?.customerName).toBe("Fixture BB-120 Khách");
    expect(khongBe?.babyFullName).toBeNull();
  });

  it("7. BB-320: báo cáo TRỪ tiền đã thu và phần giảm giá; thu/giảm đủ thì bộ rời khỏi danh sách đòi tiền", async () => {
    asStaff("owner", [branchA, branchB]);
    const { rows: st } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    const gid = made[0]!.galleryId; // vượt 3 ảnh = 150.000
    const ghi = (amount: number, method: string) =>
      client.query(
        `insert into gallery_payments (gallery_id, amount, payment_method, confirmed_by, note)
         values ($1,$2,$3,$4,'Fixture BB-320')`,
        [gid, amount, method, st[0].id],
      );
    const dong = async () => {
      const body = await (await call()).json();
      return (body.data.items as { galleryId: string; unbilledAmount: number; daThu: number; giamGia: number }[]).find(
        (i) => i.galleryId === gid,
      );
    };
    try {
      expect((await dong())?.unbilledAmount).toBe(150_000);

      await ghi(50_000, "tien_mat");
      await ghi(30_000, "giam_gia");
      const conLai = await dong();
      expect(conLai?.unbilledAmount, "150.000 − đã thu 50.000 − giảm 30.000").toBe(70_000);
      expect(conLai?.daThu).toBe(50_000);
      expect(conLai?.giamGia).toBe(30_000);

      await ghi(70_000, "chuyen_khoan");
      expect(await dong(), "thu đủ thì không còn nằm trong danh sách chưa thu").toBeUndefined();
    } finally {
      await client.query("delete from gallery_payments where gallery_id = $1", [gid]);
    }
  });

  it("5. CTV thời vụ bị chặn — không xem được tiền", async () => {
    asStaff("photoshop_ctv", [branchA, branchB]);
    const res = await call();
    expect(res.status).toBe(403);
  });
});
