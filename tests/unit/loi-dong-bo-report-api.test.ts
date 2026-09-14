/**
 * BB-129 — API báo cáo bộ ảnh tải từ Drive bị lỗi.
 *
 * Phép thử quan trọng nhất ở đây là CÁCH LY CHI NHÁNH. Route đọc bằng khoá
 * quản trị nên RLS bị bỏ qua hoàn toàn; nếu route quên lọc thì quản lý chi
 * nhánh này không những NHÌN THẤY bộ ảnh của chi nhánh kia, mà còn bấm được
 * nút Thử lại trên đó — màn hình đưa sẵn mã bộ ảnh cho họ.
 *
 * Mọi dòng dùng trong tệp này đều do chính tệp này chèn vào rồi xoá đi. Không
 * mượn dòng có sẵn: bb-dev đang có dữ liệu thật, và một phép thử dựa vào dòng
 * của người khác sẽ đổi màu mỗi khi ai đó chạy lại mẻ đồng bộ.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/reports/loi-dong-bo/route";

/** Nhãn riêng để nhận ra dòng của chính phép thử này giữa dữ liệu thật. */
const DAU = `bb129-${Date.now()}`;

const LY_DO_CHUNG = "Thư mục chưa được chia sẻ công khai";
const LY_DO_RIENG = "Thư mục không có tấm ảnh nào";

describe("BB-129: báo cáo bộ ảnh lỗi đồng bộ", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  const made: { galleryId: string; customerId: string }[] = [];

  /** Dựng một bộ ảnh đang mang lỗi đồng bộ, trả về id. */
  async function makeLoi(branchId: string, syncError: string, status = "sync_error") {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name)
       values ($1, 'Fixture BB-129 Khách') returning id`,
      [branchId],
    );
    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
          lark_contract_code, sync_error, last_synced_at)
       values ($1,$2,$3,$4,$5,'https://drive.google.invalid/folders/fixture-bb129',
               $6, $7, now())
       returning id`,
      [
        branchId,
        cust[0].id,
        `Fixture BB-129`,
        status,
        `${DAU}-${Math.random()}`,
        `HD_BB129#${made.length + 1}`,
        syncError,
      ],
    );

    made.push({ galleryId: gal[0].id, customerId: cust[0].id });
    return gal[0].id as string;
  }

  function asStaff(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000129",
      role,
      branchIds,
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  /** Mọi bộ ảnh trong mọi nhóm, trải phẳng — để tra cho nhanh. */
  function moiBo(body: {
    data: { groups: { items: { galleryId: string }[] }[] };
  }): string[] {
    return body.data.groups.flatMap((g) => g.items.map((i) => i.galleryId));
  }

  let galA1: string;
  let galA2: string;
  let galB: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select id from branches order by name limit 2");
    branchA = rows[0].id;
    branchB = rows[1].id;

    // Hai bộ chi nhánh A cùng một lý do, một bộ chi nhánh A lý do khác, và một
    // bộ chi nhánh B để bắt lỗi rò rỉ chi nhánh.
    galA1 = await makeLoi(branchA, LY_DO_CHUNG);
    galA2 = await makeLoi(branchA, LY_DO_CHUNG);
    await makeLoi(branchA, LY_DO_RIENG);
    galB = await makeLoi(branchB, LY_DO_CHUNG);
  });

  afterAll(async () => {
    for (const m of made) {
      await client.query("delete from galleries where id = $1", [m.galleryId]);
      await client.query("delete from customers where id = $1", [m.customerId]);
    }
    await client.end();
  });

  it("1. Quản lý chi nhánh A KHÔNG thấy bộ lỗi của chi nhánh B", async () => {
    asStaff("branch_manager", [branchA]);
    const body = await (await GET()).json();

    const ids = moiBo(body);
    expect(ids).toContain(galA1);
    expect(ids).toContain(galA2);
    expect(ids).not.toContain(galB);

    // Và không dòng nào trong kết quả thuộc chi nhánh ngoài quyền — kể cả dòng
    // dữ liệu thật đang có sẵn trên bb-dev.
    const branchIds = new Set(
      body.data.groups.flatMap((g: { items: { branchId: string }[] }) =>
        g.items.map((i) => i.branchId),
      ),
    );
    expect([...branchIds].every((b) => b === branchA)).toBe(true);
  });

  it("2. Chủ studio thấy cả hai chi nhánh", async () => {
    asStaff("owner", [branchA, branchB]);
    const ids = moiBo(await (await GET()).json());
    expect(ids).toContain(galA1);
    expect(ids).toContain(galB);
  });

  it("3. Gom theo lý do: ba bộ cùng lý do nằm chung MỘT nhóm", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await GET()).json();

    const nhomChung = body.data.groups.find(
      (g: { reason: string }) => g.reason === LY_DO_CHUNG,
    );
    expect(nhomChung).toBeDefined();

    const ids = nhomChung.items.map((i: { galleryId: string }) => i.galleryId);
    expect(ids).toEqual(expect.arrayContaining([galA1, galA2, galB]));

    // count phải khớp số dòng thật trong nhóm, nếu không phần tóm tắt nói dối.
    expect(nhomChung.count).toBe(nhomChung.items.length);
  });

  it("4. Số bộ ở phần tóm tắt bằng đúng tổng các nhóm", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await GET()).json();

    const tong = body.data.groups.reduce(
      (n: number, g: { count: number }) => n + g.count,
      0,
    );
    expect(body.data.summary.galleryCount).toBe(tong);
    expect(body.data.summary.reasonCount).toBe(body.data.groups.length);
  });

  it("5. Mỗi dòng đủ thứ CSKH cần để đi sửa: link Drive và nhãn tiếng Việt", async () => {
    asStaff("owner", [branchA, branchB]);
    const body = await (await GET()).json();

    const dong = body.data.groups
      .flatMap((g: { items: unknown[] }) => g.items)
      .find((i: { galleryId: string }) => i.galleryId === galA1);

    expect(dong.driveFolderUrl).toMatch(/^https?:\/\//);
    expect(dong.branchName).not.toBe("—");
    // Nhãn lấy từ nguồn chung gallery-status, không phải chuỗi chép tay.
    expect(dong.statusLabel).toBe("Tải ảnh lỗi");
  });

  it("6. Bộ đã hết lỗi thì biến khỏi danh sách", async () => {
    // Đây chính là việc CSKH làm: sửa quyền bên Drive rồi bấm Thử lại. Đường
    // đồng bộ xoá sync_error, và sau đó bộ ảnh phải rời báo cáo.
    await client.query("update galleries set sync_error = null where id = $1", [galA2]);

    asStaff("owner", [branchA, branchB]);
    const ids = moiBo(await (await GET()).json());
    expect(ids).not.toContain(galA2);
    expect(ids).toContain(galA1);

    await client.query("update galleries set sync_error = $2 where id = $1", [
      galA2,
      LY_DO_CHUNG,
    ]);
  });

  it("7. CTV thời vụ bị chặn", async () => {
    asStaff("photoshop_ctv", [branchA, branchB]);
    expect((await GET()).status).toBe(403);
  });

  it("8. Nhân viên chưa được gán chi nhánh nào thì thấy bảng rỗng, không phải lỗi", async () => {
    asStaff("cs", []);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.groups).toEqual([]);
    expect(body.data.summary.galleryCount).toBe(0);
  });
});
