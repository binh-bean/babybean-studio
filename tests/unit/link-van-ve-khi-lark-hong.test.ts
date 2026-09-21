/**
 * BB-132 — Lark hỏng thì LINK VẪN PHẢI VỀ TỚI TAY CSKH.
 *
 * Điều kiện số 3 của brief, và là điều kiện đắt nhất: mã link hiện ĐÚNG MỘT
 * LẦN (BB-127 chỉ lưu bản băm SHA-256). Nếu một lỗi bên Lark làm route trả 500
 * thì link vừa tạo biến mất vĩnh viễn — không ai dựng lại được, kể cả người
 * viết ra nó — mà bản ghi trong share_links thì vẫn còn đó, đang sống, không
 * mở được. Lark chết mà chặn luôn việc tạo link là làm cả studio đứng.
 *
 * Phép thử ở đây thay `@/lib/lark/ghi-link-app` bằng bản giả để bắt route đi
 * qua cả hai nhánh — ghi được và ghi hỏng — mà không chạm vào Lark thật.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

/**
 * Bản giả có thể đổi hành vi giữa các phép thử.
 * `vi.hoisted` vì `vi.mock` được nâng lên trên mọi lệnh import.
 */
const gia = vi.hoisted(() => ({
  ketQua: null as unknown,
  nemLoi: false,
  soLanGoi: 0,
}));

vi.mock("@/lib/lark/ghi-link-app", async (importOriginal) => {
  const that = await importOriginal<typeof import("@/lib/lark/ghi-link-app")>();
  return {
    ...that,
    ghiLinkAppVeLark: vi.fn(async () => {
      gia.soLanGoi += 1;
      if (gia.nemLoi) throw new Error("Lark nổ bất ngờ");
      return gia.ketQua;
    }),
  };
});

import * as staffAuth from "@/lib/auth/staff";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";

describe("BB-132: Lark hỏng thì link vẫn về tới tay CSKH", () => {
  let client: Client;
  let branchId: string;
  let galleryId: string;
  let customerId: string;
  let staffId: string;

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const body = () => new Request("http://localhost", { method: "POST", body: "{}" });

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://chon-anh.test");

    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles limit 1");
    staffId = st[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1,'Fixture BB-132 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, lark_hauky_record_id)
       values ($1,$2,'Fixture BB-132','ready',$3,'https://example.com/x', 9, $4)
       returning id`,
      [branchId, customerId, `fixture-bb132-${Date.now()}`, `recBB132${Date.now()}`],
    );
    galleryId = g[0].id;

    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds: [branchId], permissions: quyenCuaVai("cs"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  });

  afterAll(async () => {
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await client.query("delete from share_links where gallery_id = $1", [galleryId]);
    gia.nemLoi = false;
    gia.soLanGoi = 0;
  });

  it("1. Ghi được -> báo 'đã ghi sang Lark', kèm đúng chuỗi đã ghi", async () => {
    gia.ketQua = { ghiDuoc: true, chayThu: false };
    const res = await taoLink(body(), params());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.daGhiLark).toBe(true);
    expect(json.data.lyDoKhongGhiLark).toBeNull();
    // Chuỗi CSKH nhìn thấy phải khớp chuỗi khách nhận được, nếu không thì lúc
    // khách báo lỗi sẽ không ai đối chiếu ra.
    expect(json.data.diaChiDaGhiLark).toBe(`https://chon-anh.test${json.data.duongDan}`);
  });

  it("2. Ghi hỏng -> LINK VẪN VỀ, kèm lý do tiếng Việt", async () => {
    gia.ketQua = { ghiDuoc: false, chayThu: false, lyDo: "Lark từ chối ghi: Forbidden" };
    const res = await taoLink(body(), params());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.duongDan).toMatch(/^\/g\/[A-Za-z0-9_-]{40,}$/);
    expect(json.data.daGhiLark).toBe(false);
    expect(json.data.lyDoKhongGhiLark).toContain("Forbidden");
    expect(json.data.diaChiDaGhiLark).toBeNull();

    // Và link thật sự dùng được: bản ghi đang sống nằm trong cơ sở dữ liệu.
    const { rows } = await client.query(
      "select count(*)::int n from share_links where gallery_id = $1 and status = 'active'",
      [galleryId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("3. Lark nổ bất ngờ (ném lỗi) -> LINK VẪN VỀ, không thành 500", async () => {
    // `ghiLinkAppVeLark` cam kết không ném, nhưng cam kết không phải là rào.
    // Route bọc `.catch` vì link đã nằm trong cơ sở dữ liệu trước đoạn này rồi.
    gia.nemLoi = true;
    const res = await taoLink(body(), params());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.duongDan).toMatch(/^\/g\/[A-Za-z0-9_-]{40,}$/);
    expect(json.data.daGhiLark).toBe(false);
    expect(json.data.lyDoKhongGhiLark).toContain("Lark nổ bất ngờ");
  });

  it("4. Phản hồi KHÔNG bao giờ nhét cả mã link vào lý do lỗi", async () => {
    gia.ketQua = { ghiDuoc: false, chayThu: false, lyDo: "Lark từ chối ghi: Forbidden" };
    const res = await taoLink(body(), params());
    const json = await res.json();
    const ma = json.data.duongDan.replace("/g/", "");
    expect(String(json.data.lyDoKhongGhiLark)).not.toContain(ma);
  });

  it("5. Bộ ảnh chưa có ảnh -> từ chối TRƯỚC, không gọi Lark lần nào", async () => {
    await client.query("update galleries set photo_count = 0 where id = $1", [galleryId]);
    gia.ketQua = { ghiDuoc: true, chayThu: false };
    const res = await taoLink(body(), params());
    expect(res.status).toBe(400);
    expect(gia.soLanGoi).toBe(0);
    await client.query("update galleries set photo_count = 9 where id = $1", [galleryId]);
  });
});
