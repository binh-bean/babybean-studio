/**
 * BB-249 — PATCH /api/admin/galleries/[id]/mua-them/[yeuCauId]: CSKH đổi
 * trạng thái yêu cầu mua thêm (gọi khách, chốt, huỷ).
 *
 * Mỗi lần chạy mang một nhãn riêng và dọn theo nhãn của chính mình — BB-136.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { PATCH } from "@/app/api/admin/galleries/[id]/mua-them/[yeuCauId]/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-249 ${runId}`;

describe("BB-249: PATCH đổi trạng thái yêu cầu mua thêm", () => {
  let client: Client;
  let branchId: string;
  let branchKhacId: string;
  let staffId: string;
  let customerId: string;
  let boA: string;
  let boB: string;
  let productId: string;

  const goi = (galleryId: string, yeuCauId: string, body: unknown) =>
    PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: galleryId, yeuCauId }) },
    );

  /** Tạo một dòng yeu_cau_mua_them ở trạng thái cho trước, trả về id. */
  async function taoDong(galleryId: string, trangThai: string): Promise<string> {
    const { rows } = await client.query(
      `insert into yeu_cau_mua_them (gallery_id, product_id, so_luong, trang_thai)
       values ($1, $2, 1, $3) returning id`,
      [galleryId, productId, trangThai],
    );
    return rows[0].id;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 2");
    branchId = br[0].id;
    branchKhacId = br[1]?.id ?? br[0].id;
    const { rows: st } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    staffId = st[0].id;
    const { rows: pr } = await client.query("select id from products where is_active = true limit 1");
    if (!pr[0]) throw new Error("Không có sản phẩm nào đang bật — phép thử này cần một dòng products");
    productId = pr[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: gA } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'approved',$4,'https://example.com/a',1) returning id`,
      [branchId, customerId, `${NHAN} A`, `fixture-bb249-a-${runId}`],
    );
    boA = gA[0].id;

    const { rows: gB } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'approved',$4,'https://example.com/b',1) returning id`,
      [branchId, customerId, `${NHAN} B`, `fixture-bb249-b-${runId}`],
    );
    boB = gB[0].id;
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_type = 'yeu_cau_mua_them' and gallery_id = any($1)", [[boA, boB]]);
    await client.query("delete from yeu_cau_mua_them where gallery_id = any($1)", [[boA, boB]]);
    await client.query("delete from galleries where title like $1", [`${NHAN}%`]);
    await client.query("delete from customers where full_name like $1", [`${NHAN}%`]);
    await client.end();
  });

  const trangThaiCua = async (id: string) => {
    const { rows } = await client.query("select trang_thai from yeu_cau_mua_them where id = $1", [id]);
    return rows[0]?.trang_thai as string | undefined;
  };

  it("1. Không đăng nhập -> 401", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValueOnce(
      new staffAuth.AuthError("UNAUTHENTICATED"),
    );
    const yeuCauId = await taoDong(boA, "moi");
    const res = await goi(boA, yeuCauId, { trangThai: "da_lien_he" });
    expect(res.status).toBe(401);
  });

  it("2. Body hỏng -> 400, không phải 500", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");

    const res1 = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: "khong-phai-json" }),
      { params: Promise.resolve({ id: boA, yeuCauId }) },
    );
    expect(res1.status).toBe(400);

    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(phienGiaLap("cs", [branchId], staffId));
    const res2 = await goi(boA, yeuCauId, { trangThai: "khong_ton_tai" });
    expect(res2.status).toBe(400);

    expect(await trangThaiCua(yeuCauId)).toBe("moi");
  });

  it("3. Nhân viên chi nhánh khác -> 403, không đổi gì", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(
      phienGiaLap("cs", [branchKhacId], staffId),
    );
    const yeuCauId = await taoDong(boA, "moi");
    const res = await goi(boA, yeuCauId, { trangThai: "da_lien_he" });
    expect(res.status).toBe(403);
    expect(await trangThaiCua(yeuCauId)).toBe("moi");
  });

  it("4. Vai không có galleries:write (accountant) -> bị chặn, không đổi gì", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce(phienGiaLap("accountant", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");
    const res = await goi(boA, yeuCauId, { trangThai: "da_lien_he" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await trangThaiCua(yeuCauId)).toBe("moi");
  });

  it("5. Yêu cầu thuộc bộ ảnh khác -> 404, không đổi gì", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauCuaB = await taoDong(boB, "moi");
    // Gọi bằng galleryId của A nhưng yeuCauId thuộc B.
    const res = await goi(boA, yeuCauCuaB, { trangThai: "da_lien_he" });
    expect(res.status).toBe(404);
    expect(await trangThaiCua(yeuCauCuaB)).toBe("moi");
  });

  it("6. Bảng chuyển hợp lệ: moi -> da_lien_he -> da_chot; da_chot là cuối", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");

    const r1 = await goi(boA, yeuCauId, { trangThai: "da_lien_he" });
    expect(r1.status).toBe(200);
    expect(await trangThaiCua(yeuCauId)).toBe("da_lien_he");

    const r2 = await goi(boA, yeuCauId, { trangThai: "da_chot" });
    expect(r2.status).toBe(200);
    expect(await trangThaiCua(yeuCauId)).toBe("da_chot");

    // da_chot là trạng thái cuối — đổi tiếp phải bị chặn với 409, không đổi gì.
    const r3 = await goi(boA, yeuCauId, { trangThai: "huy" });
    expect(r3.status).toBe(409);
    expect(await trangThaiCua(yeuCauId)).toBe("da_chot");
  });

  it("7. Chuyển không hợp lệ: moi -> da_chot bị chặn 409, không đổi gì", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");
    const res = await goi(boA, yeuCauId, { trangThai: "da_chot" });
    expect(res.status).toBe(409);
    expect(await trangThaiCua(yeuCauId)).toBe("moi");
  });

  it("8. huy là trạng thái cuối — đổi tiếp bị chặn 409", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "huy");
    const res = await goi(boA, yeuCauId, { trangThai: "da_lien_he" });
    expect(res.status).toBe(409);
    expect(await trangThaiCua(yeuCauId)).toBe("huy");
  });

  it("9. Đổi hợp lệ để lại dòng activity_logs với ghi chú CSKH trong metadata", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");

    const res = await goi(boA, yeuCauId, {
      trangThai: "da_lien_he",
      ghiChuCskh: "Đã gọi, hẹn gọi lại chiều mai",
    });
    expect(res.status).toBe(200);

    const { rows } = await client.query(
      `select metadata from activity_logs
        where action = 'mua_them.doi_trang_thai' and entity_id = $1
        order by created_at desc limit 1`,
      [yeuCauId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.tuTrangThai).toBe("moi");
    expect(rows[0].metadata.denTrangThai).toBe("da_lien_he");
    expect(rows[0].metadata.ghiChuCskh).toBe("Đã gọi, hẹn gọi lại chiều mai");

    // Ghi chú CSKH không lọt vào cột ghi_chu của khách — cột đó là của khách.
    const { rows: dong } = await client.query(
      "select ghi_chu from yeu_cau_mua_them where id = $1",
      [yeuCauId],
    );
    expect(dong[0].ghi_chu).toBeNull();
  });

  it("10. Chống đua: hai lượt cùng đổi CÙNG một đích từ cùng trạng thái cũ, chỉ một lượt thắng", async () => {
    // Cả hai lượt gọi CÙNG đích (moi -> da_lien_he). Cố ý chọn cùng đích để
    // phép thử đúng bất kể hai lượt có thật sự chồng lấp trên mạng hay
    // không: nếu tuần tự (không chồng lấp), lượt hai đọc lại trạng thái ĐÃ
    // đổi (da_lien_he) và tự thấy "da_lien_he -> da_lien_he" không nằm trong
    // bảng chuyển hợp lệ -> 409. Nếu thật sự chồng lấp trên cùng một dòng,
    // `update ... where trang_thai = 'moi'` của Postgres chỉ khớp cho lượt
    // đến trước -> lượt kia 0 dòng -> 409. Cả hai đường đều phải ra đúng một
    // lượt 200, không bao giờ cả hai cùng 200.
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [branchId], staffId));
    const yeuCauId = await taoDong(boA, "moi");

    const [r1, r2] = await Promise.all([
      goi(boA, yeuCauId, { trangThai: "da_lien_he" }),
      goi(boA, yeuCauId, { trangThai: "da_lien_he" }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await trangThaiCua(yeuCauId)).toBe("da_lien_he");
  });
});
