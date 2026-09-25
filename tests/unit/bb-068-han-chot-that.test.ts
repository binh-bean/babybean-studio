/**
 * BB-068 — hạn chốt phải có thật, không chỉ nằm trong màn Cài đặt.
 *
 * ---------------------------------------------------------------------------
 * Chuỗi đứt mà mọi khâu đều báo xanh
 * ---------------------------------------------------------------------------
 * Đo ngày 22/09/2026 trên bb-dev: **488/488 bộ ảnh có `due_at` rỗng**, và
 * không đường nào trong `src/` ghi `galleries.sent_at`. Nên:
 *
 *   - Dòng "Hạn chốt mặc định (ngày)" trong màn Cài đặt không điều khiển gì.
 *   - `expire_overdue_galleries()` lọc `due_at < now()` → luôn trả 0, và lượt
 *     cron hằng ngày trông như "hôm nay không có bộ nào tới hạn".
 *   - Cột "Hạn" ở màn quản trị luôn trống; Bảng điều khiển sắp theo `due_at`
 *     thì không có gì để sắp.
 *
 * Phép thử này canh cả ba mắt xích: đặt mốc lúc gửi link, không tự gia hạn khi
 * tạo lại link, và mở lại thì dời hạn (nếu không, lượt cron hôm sau tự huỷ
 * việc mở lại).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";
import { POST as moLai } from "@/app/api/admin/galleries/[id]/reopen/route";
import { GET as docTuyChon } from "@/app/api/admin/galleries/options/route";

describe("BB-068: hạn chốt có thật", () => {
  let client: Client;
  let branchId: string;
  let staffId: string;
  let customerId: string;
  const galleries: string[] = [];
  /** Giá trị cài đặt lúc bắt đầu, để trả lại đúng như cũ. */
  let hanChotGoc: number | null = null;

  function asRole(role: string) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      roleName: role,
      branchIds: [branchId],
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  async function taoBoAnh(status = "ready") {
    const { rows } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-068',$3,$4,'https://example.com/x', 12)
       returning id`,
      [branchId, customerId, status, `fixture-bb068-${Date.now()}-${Math.random()}`],
    );
    galleries.push(rows[0].id);
    return rows[0].id as string;
  }

  const goiTaoLink = (id: string) =>
    taoLink(new Request("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id }),
    });

  const docMoc = async (id: string) => {
    const { rows } = await client.query("select sent_at, due_at, status from galleries where id=$1", [
      id,
    ]);
    return rows[0] as { sent_at: Date | null; due_at: Date | null; status: string };
  };

  /** Số ngày từ bây giờ tới mốc, làm tròn — đủ để phân biệt 7 với 11. */
  const soNgayToi = (moc: Date) =>
    Math.round((moc.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  async function datCaiDat(soNgay: number) {
    await client.query(
      `update settings set value = $1::jsonb where key='gallery.default_due_days' and branch_id is null`,
      [JSON.stringify(soNgay)],
    );
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1");
    staffId = st[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-068 Khách') returning id`,
      [branchId],
    );
    customerId = c[0].id;

    const { rows: cd } = await client.query(
      `select value from settings where key='gallery.default_due_days' and branch_id is null`,
    );
    hanChotGoc = typeof cd[0]?.value === "number" ? cd[0].value : null;
  });

  afterAll(async () => {
    // Trả cài đặt về đúng con số ban đầu. Bỏ bước này là để lại một dòng cài
    // đặt bịa cho cả studio — đúng kiểu lỗi đã gặp ở phép thử vai trò BB-172.
    if (hanChotGoc !== null) await datCaiDat(hanChotGoc);
    if (galleries.length) {
      await client.query("delete from share_links where gallery_id = any($1)", [galleries]);
      await client.query("delete from galleries where id = any($1)", [galleries]);
    }
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("0. Cài đặt gốc phải là một con số — nếu không, phép thử sau vô nghĩa", () => {
    expect(hanChotGoc).toBeTypeOf("number");
  });

  it("1. Tạo link gửi khách thì đặt mốc đã gửi và hạn chốt", async () => {
    await datCaiDat(7);
    asRole("cs");
    const id = await taoBoAnh();

    const truoc = await docMoc(id);
    expect(truoc.sent_at).toBeNull();
    expect(truoc.due_at).toBeNull();

    expect((await goiTaoLink(id)).status).toBe(200);

    const sau = await docMoc(id);
    expect(sau.sent_at).not.toBeNull();
    expect(sau.due_at).not.toBeNull();
    expect(soNgayToi(sau.due_at as Date)).toBe(7);
  });

  it("2. Đổi cài đặt thì bộ ảnh gửi sau lấy đúng số ngày mới", async () => {
    await datCaiDat(11);
    asRole("cs");
    const id = await taoBoAnh();
    expect((await goiTaoLink(id)).status).toBe(200);

    const sau = await docMoc(id);
    expect(soNgayToi(sau.due_at as Date)).toBe(11);
  });

  it("3. Tạo lại link KHÔNG dời hạn và KHÔNG ghi đè mốc đã gửi", async () => {
    await datCaiDat(7);
    asRole("cs");
    const id = await taoBoAnh();
    expect((await goiTaoLink(id)).status).toBe(200);
    const lan1 = await docMoc(id);

    // Gia hạn ngầm mỗi lần bấm nút thì cái hạn đó không còn là hạn. Muốn cho
    // thêm thời gian thì đi nút Mở lại — có ghi lý do.
    await datCaiDat(30);
    expect((await goiTaoLink(id)).status).toBe(200);
    const lan2 = await docMoc(id);

    expect(lan2.due_at?.toISOString()).toBe(lan1.due_at?.toISOString());
    expect(lan2.sent_at?.toISOString()).toBe(lan1.sent_at?.toISOString());
  });

  it("4. Mở lại bộ quá hạn thì dời hạn — và lượt cron ngay sau đó KHÔNG đóng lại", async () => {
    await datCaiDat(7);
    asRole("owner");
    const id = await taoBoAnh("expired");
    await client.query("update galleries set due_at = now() - interval '3 days' where id=$1", [id]);

    const res = await moLai(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ reason: "Khách xin thêm thời gian" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);

    const sauMo = await docMoc(id);
    expect(sauMo.status).toBe("in_review");
    expect(soNgayToi(sauMo.due_at as Date)).toBe(7);

    // Đây là vế quan trọng nhất: chạy đúng hàm mà cron hằng ngày gọi.
    // Trước bản vá, `due_at` giữ nguyên ở quá khứ nên lượt chạy 18:00 hôm đó
    // đẩy bộ ảnh về 'expired' — CSKH đã báo khách "chị chọn tiếp giúp em" xong.
    await client.query("select expire_overdue_galleries()");
    const sauCron = await docMoc(id);
    expect(sauCron.status).toBe("in_review");
  });

  it("5. Thuật sĩ tạo bộ ảnh đọc được số ngày từ cài đặt", async () => {
    await datCaiDat(9);
    asRole("cs");
    const body = await (await docTuyChon()).json();
    expect(body.data.macDinhHanChotNgay).toBe(9);
  });
});
