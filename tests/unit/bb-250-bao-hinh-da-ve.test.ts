/**
 * BB-250 — báo đẩy "Sản phẩm của bé đã về" khi Lark vừa sang giai đoạn 9.
 *
 * Canh hai điều: (1) chỉ báo khi CHUYỂN từ một giai đoạn app đã biết, không báo
 * lần đầu đọc (tránh lặp vụ nhắc ồ ạt ngày đầu BB-200); (2) báo đúng MỘT lần —
 * lượt đọc sáng hôm sau vẫn ở giai đoạn 9 thì không báo lại.
 *
 * Phần DB chỉ tạo một bộ ảnh `Fixture BB-250`, mã bản ghi Lark giả; lượt ghi chỉ
 * đụng bộ có mã nằm trong Map truyền vào, nên bộ ảnh thật không bị chạm.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { vuaSangHinhDaVe, ghiTrangThaiVaoGalleries, type TrangThaiDoc } from "@/lib/lark/doc-trang-thai-lark";

const DA_GUI_IN = "optxMAdtNX"; // giai đoạn 8
const HINH_DA_VE = "opttKmVbce"; // giai đoạn 9
const DA_GIAO = "opttHXFpgy"; // giai đoạn 10

describe("BB-250: vuaSangHinhDaVe", () => {
  it("8 → 9 thì báo", () => expect(vuaSangHinhDaVe(DA_GUI_IN, HINH_DA_VE, "approved")).toBe(true));
  it("lần đầu đọc (null → 9) thì KHÔNG báo", () =>
    expect(vuaSangHinhDaVe(null, HINH_DA_VE, "approved")).toBe(false));
  it("9 → 9 (sáng hôm sau) thì không báo lại", () =>
    expect(vuaSangHinhDaVe(HINH_DA_VE, HINH_DA_VE, "approved")).toBe(false));
  it("10 → 9 (Lark lùi) thì không báo", () =>
    expect(vuaSangHinhDaVe(DA_GIAO, HINH_DA_VE, "approved")).toBe(false));
  it("app đã delivered thì không báo", () =>
    expect(vuaSangHinhDaVe(DA_GUI_IN, HINH_DA_VE, "delivered")).toBe(false));
  it("8 → 10 (nhảy qua 9) thì không báo 'đã về'", () =>
    expect(vuaSangHinhDaVe(DA_GUI_IN, DA_GIAO, "approved")).toBe(false));
});

describe("BB-250: ghiTrangThaiVaoGalleries trả bộ vừa sang 'Hình đã về'", () => {
  let client: Client;
  let galleryId: string;
  let customerId: string;
  const maBanGhi = `rec_fixture_bb250_${Date.now()}`;
  const sdt = "0900" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  const doc = (ma: string): Map<string, TrangThaiDoc> =>
    new Map([[maBanGhi, { maTrangThai: ma, maCanhBao: null, ngayVaoGiaiDoan: null, suaLuc: null }]]);

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-250',$2) returning id`,
      [br[0].id, sdt],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, lark_hauky_record_id, lark_trang_thai)
       values ($1,$2,'Fixture BB-250','approved','SEED_FOLDER_ID_BB250','https://example.com/x',0,$3,$4)
       returning id`,
      [br[0].id, customerId, maBanGhi, DA_GUI_IN],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("8 → 9: có trong danh sách; đọc lại lần nữa: không còn", async () => {
    const lan1 = await ghiTrangThaiVaoGalleries(client, doc(HINH_DA_VE));
    expect(lan1.sangHinhDaVe).toEqual([galleryId]);

    const lan2 = await ghiTrangThaiVaoGalleries(client, doc(HINH_DA_VE));
    expect(lan2.sangHinhDaVe).toEqual([]);
  });
});
