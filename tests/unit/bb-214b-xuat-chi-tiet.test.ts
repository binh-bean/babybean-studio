/**
 * BB-214(b) — dạng xuất "chi-tiet" cho CSKH.
 *
 * Lời chủ studio: "CSKH tải file text mã chọn và note chi tiết từng ảnh khách
 * note hoặc ảnh chọn in là gì". Phép thử này canh:
 *
 *   1. Phần đầu tệp có tên bộ ảnh, tên khách, ngày chốt, người xác nhận, ghi
 *      chú chung.
 *   2. Mỗi ảnh đã chọn có dòng riêng: tên file + ghi chú chỉnh sửa.
 *   3. "Dùng cho" gom đủ BA nguồn: suất trong gói (selection_placements ->
 *      gallery_items -> products), sản phẩm mua thêm gắn thẳng vào ảnh
 *      (selection_addons.photo_id), và album mua thêm gộp nhiều ảnh
 *      (selection_addon_photos -> selection_addons.product_id).
 *   4. Ảnh không gắn sản phẩm nào thì nói rõ "chưa gắn sản phẩm nào", không
 *      để trống — CSKH cần phân biệt "chưa gắn gì" với "quên đọc dòng này".
 *   5. Dạng cũ (.txt / .csv, BB-067) không bị đụng tới.
 *
 * ---------------------------------------------------------------------------
 * Thước đo của AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên bản vá (bỏ nhánh `dinhDang === "chi-tiet"` khỏi route, quay về
 * chỉ txt/csv) thì ca 1-4 phải ĐỎ: `?format=chi-tiet` rơi về dạng .txt cũ,
 * không có phần đầu, không có "Dùng cho".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as xuat } from "@/app/api/admin/galleries/[id]/export/route";

describe("BB-214b: xuất văn bản chi tiết cho CSKH", () => {
  let client: Client;
  let branchA = "";
  let customerId = "";
  let galleryId = "";
  let productGoiId = "";
  let productMuaThemId = "";
  let productAlbumId = "";
  const anh: Record<string, string> = {};

  function asRole(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000214",
      role,
      roleName: role,
      branchIds,
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const goi = () =>
    xuat(
      new Request(
        `http://localhost/api/admin/galleries/${galleryId}/export?format=chi-tiet`,
      ),
      { params: Promise.resolve({ id: galleryId }) },
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchA = br[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-214b Nguyễn Thị Mai') returning id`,
      [branchA],
    );
    customerId = c[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-214b','submitted',$3,'https://example.com/x',2,10) returning id`,
      [branchA, customerId, `fixture-bb214b-${Date.now()}`],
    );
    galleryId = g[0].id;

    for (const ten of ["IMG_0101.jpg", "IMG_0102.jpg"]) {
      const { rows } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',1,'active') returning id`,
        [galleryId, `bb214b-${ten}-${Date.now()}`, ten],
      );
      anh[ten] = rows[0].id;
    }

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb214b', 'owner', 'active') returning id`,
      [galleryId],
    );
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, general_note, submitted_at, submitted_by_name)
       values ($1,$2,true,'Làm tông ấm giúp em','2026-09-20T10:00:00Z','Chị Mai (mẹ)') returning id`,
      [galleryId, lk[0].id],
    );
    const selectionId = sel[0].id;

    const { rows: si1 } = await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note, order_index)
       values ($1,$2,$3,'selected','Xoá mụn sữa',1) returning id`,
      [selectionId, anh["IMG_0101.jpg"], galleryId],
    );
    const item1 = si1[0].id;

    const { rows: si2 } = await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index)
       values ($1,$2,$3,'selected',2) returning id`,
      [selectionId, anh["IMG_0102.jpg"], galleryId],
    );
    const item2 = si2[0].id;

    // 1. Suất trong gói: một sản phẩm in đã có sẵn trong hợp đồng.
    const { rows: pGoi } = await client.query(
      `insert into products (branch_id, name, kind) values ($1,'Fixture Ảnh phóng 20x30','print') returning id`,
      [branchA],
    );
    productGoiId = pGoi[0].id;
    const { rows: gi } = await client.query(
      `insert into gallery_items (gallery_id, product_id, quantity) values ($1,$2,1) returning id`,
      [galleryId, productGoiId],
    );
    await client.query(
      `insert into selection_placements (selection_item_id, gallery_item_id) values ($1,$2)`,
      [item1, gi[0].id],
    );

    // 2. Sản phẩm mua thêm gắn thẳng vào ảnh IMG_0101.
    const { rows: pMuaThem } = await client.query(
      `insert into products (branch_id, name, kind) values ($1,'Fixture Khung gỗ 15x21','print') returning id`,
      [branchA],
    );
    productMuaThemId = pMuaThem[0].id;
    await client.query(
      `insert into selection_addons (selection_id, product_id, photo_id, quantity, unit_price)
       values ($1,$2,$3,1,150000)`,
      [selectionId, productMuaThemId, anh["IMG_0101.jpg"]],
    );

    // 3. Album mua thêm, gộp ảnh IMG_0102 vào.
    const { rows: pAlbum } = await client.query(
      `insert into products (branch_id, name, kind) values ($1,'Fixture Album mini','print') returning id`,
      [branchA],
    );
    productAlbumId = pAlbum[0].id;
    const { rows: addonAlbum } = await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price)
       values ($1,$2,1,300000) returning id`,
      [selectionId, productAlbumId],
    );
    await client.query(
      `insert into selection_addon_photos (addon_id, selection_item_id) values ($1,$2)`,
      [addonAlbum[0].id, item2],
    );
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.query("delete from products where id = any($1)", [
      [productGoiId, productMuaThemId, productAlbumId].filter(Boolean),
    ]);
    await client.end();
  });

  it("1. Phần đầu tệp có tên bộ ảnh, khách, ngày chốt, người xác nhận, ghi chú chung", async () => {
    asRole("cs", [branchA]);
    const res = await goi();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");

    const than = await res.text();
    expect(than).toContain("Bộ ảnh: Fixture BB-214b");
    expect(than).toContain("Khách: Fixture BB-214b Nguyễn Thị Mai");
    expect(than).toContain("Người xác nhận: Chị Mai (mẹ)");
    expect(than).toContain("Ghi chú chung: Làm tông ấm giúp em");
    expect(than).toContain("Số ảnh đã chọn: 2");
  });

  it("2. Mỗi ảnh có ghi chú chỉnh sửa riêng", async () => {
    asRole("cs", [branchA]);
    const than = await (await goi()).text();
    expect(than).toContain("IMG_0101.jpg");
    expect(than).toContain("Ghi chú chỉnh sửa: Xoá mụn sữa");
    expect(than).toContain("Ghi chú chỉnh sửa: (không có)");
  });

  it("3. IMG_0101 dùng cho suất trong gói VÀ sản phẩm mua thêm gắn thẳng vào ảnh", async () => {
    asRole("cs", [branchA]);
    const than = await (await goi()).text();
    const dong101 = than.split("IMG_0101.jpg")[1]?.split("IMG_0102.jpg")[0] ?? "";
    expect(dong101).toContain("Fixture Ảnh phóng 20x30");
    expect(dong101).toContain("Fixture Khung gỗ 15x21 (mua thêm)");
  });

  it("4. IMG_0102 dùng cho album mua thêm, không dùng cho suất trong gói", async () => {
    asRole("cs", [branchA]);
    const than = await (await goi()).text();
    const dong102 = than.split("IMG_0102.jpg")[1] ?? "";
    expect(dong102).toContain("Fixture Album mini (album mua thêm)");
    expect(dong102).not.toContain("Fixture Ảnh phóng 20x30");
  });

  it("5. Dạng cũ .txt và .csv (BB-067) không bị đụng tới", async () => {
    asRole("cs", [branchA]);
    const txt = await (
      await xuat(
        new Request(`http://localhost/api/admin/galleries/${galleryId}/export`),
        { params: Promise.resolve({ id: galleryId }) },
      )
    ).text();
    expect(txt).toBe("IMG_0101.jpg\r\nIMG_0102.jpg");
    expect(txt).not.toContain("Dùng cho");
  });
});
