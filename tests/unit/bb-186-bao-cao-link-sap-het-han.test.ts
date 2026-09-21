/**
 * BB-186 — bảng "Link sắp hết hạn".
 *
 * Chủ studio hỏi: *"khi hết hạn có ai nhận được thông báo không, CSKH có biết
 * trên giao diện không?"* — trước bản vá thì không, cả hai. Màn chi tiết chỉ
 * trả `shareLink: { id }`, và không có chỗ nào liệt kê link sắp chết.
 *
 * Bảng này là chỗ CSKH mở ra mỗi sáng. Ba điều nó phải làm đúng, vì sai một
 * cái là hoặc gọi nhầm nhà, hoặc để một nhà mất link mà không ai biết.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { GET } from "@/app/api/admin/reports/link-sap-het-han/route";
import * as staffAuth from "@/lib/auth/staff";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

const bam = (s: string) => createHash("sha256").update(s).digest("hex");

describe("BB-186 — bảng link sắp hết hạn", () => {
  let client: Client;
  let staffId = "";
  let branchA = "";
  let branchB = "";
  let customerId = "";
  const bo: Record<string, string> = {};
  const maTran: Record<string, string> = {};

  const goi = (q = "") =>
    GET(new Request(`http://localhost/api/admin/reports/link-sap-het-han${q}`));

  function nhuCs(branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds, permissions: quyenCuaVai("cs"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 2");
    if (br.length < 2) throw new Error("Cần ít nhất hai chi nhánh.");
    branchA = br[0].id;
    branchB = br[1].id;

    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone)
       values ($1,'Fixture BB-186','0900000186') returning id`,
      [branchA],
    );
    customerId = c[0].id;

    // Ba bộ ảnh, ba tình huống khác nhau — và một bộ ở CHI NHÁNH KHÁC.
    const them = async (ten: string, branchId: string, hanSauNgay: number | null) => {
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',3) returning id`,
        [branchId, customerId, `Fixture BB-186 ${ten}`, `fx-bb186-${ten}-${Date.now()}`],
      );
      bo[ten] = g[0].id;

      const ma = randomBytes(32).toString("base64url");
      maTran[ten] = ma;
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status, expires_at)
         values ($1,$2,$3,'owner','Fixture BB-186','active',
                 case when $4::int is null then null else now() + ($4::int || ' days')::interval end)`,
        [g[0].id, bam(ma), ma.slice(0, 6), hanSauNgay],
      );
    };

    await them("sapChet", branchA, 3); // chết trong 3 ngày
    await them("daChet", branchA, -5); // đã chết 5 ngày
    await them("conLau", branchA, 45); // còn 45 ngày
    await them("chiNhanhKhac", branchB, 2); // sắp chết, nhưng chi nhánh khác
  });

  afterAll(async () => {
    for (const id of Object.values(bo)) {
      await client.query("delete from share_links where gallery_id = $1", [id]);
      await client.query(
        `delete from selection_items where selection_id in (select id from selections where gallery_id = $1)`,
        [id],
      );
      await client.query("delete from selections where gallery_id = $1", [id]);
      await client.query("delete from photos where gallery_id = $1", [id]);
      await client.query("delete from galleries where id = $1", [id]);
    }
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("gom cả link ĐÃ chết lẫn link sắp chết, và bỏ link còn lâu ra ngoài", async () => {
    nhuCs([branchA]);
    const json = await (await goi("?soNgay=14")).json();

    const theoBo = new Map<string, { daChet: boolean; conLaiNgay: number }>(
      json.data.items.map((i: { galleryId: string; daChet: boolean; conLaiNgay: number }) => [
        i.galleryId,
        i,
      ]),
    );

    expect(theoBo.has(bo.sapChet!)).toBe(true);
    expect(theoBo.get(bo.sapChet!)!.daChet).toBe(false);

    // Link đã chết là việc GẤP HƠN link sắp chết — ba mẹ đang không vào được
    // ngay bây giờ. Tách ra màn riêng thì màn đó không ai mở.
    expect(theoBo.has(bo.daChet!)).toBe(true);
    expect(theoBo.get(bo.daChet!)!.daChet).toBe(true);

    // `status` trong cơ sở dữ liệu vẫn là 'active' vì lượt chạy định kỳ chưa
    // đổi nó. Bảng phải tự tính, không thì báo "đang dùng" cho một link chết.
    const { rows } = await client.query(
      "select status from share_links where gallery_id = $1",
      [bo.daChet],
    );
    expect(rows[0].status).toBe("active");

    expect(theoBo.has(bo.conLau!)).toBe(false);
  });

  it("KHÔNG hiện link của chi nhánh mình không phụ trách", async () => {
    nhuCs([branchA]);
    const json = await (await goi("?soNgay=14")).json();
    const ids = json.data.items.map((i: { galleryId: string }) => i.galleryId);

    // Đọc bằng khoá quản trị thì luật quyền theo dòng bị bỏ qua hoàn toàn —
    // đường API phải tự lọc. Không lọc thì CSKH Pasteur đọc được số điện thoại
    // khách của Tân Bình.
    expect(ids).not.toContain(bo.chiNhanhKhac);

    nhuCs([branchA, branchB]);
    const json2 = await (await goi("?soNgay=14")).json();
    const ids2 = json2.data.items.map((i: { galleryId: string }) => i.galleryId);
    expect(ids2).toContain(bo.chiNhanhKhac);
  });

  it("không rò mã link ra ngoài", async () => {
    nhuCs([branchA]);
    const than = JSON.stringify(await (await goi("?soNgay=14")).json());

    // Sau khi bỏ PIN, chuỗi 43 ký tự là thứ DUY NHẤT che ảnh của một nhà.
    for (const ma of Object.values(maTran)) {
      expect(than).not.toContain(ma);
    }
    expect(than).not.toContain("token_hash");
  });
});
