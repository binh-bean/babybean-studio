/**
 * BB-359 mục 1 — (a) MỘT kết quả đếm "Việc cần xử lý" cho bốn chỗ hiển thị; (b) Q-4 vòng 8:
 * sản phẩm mua thêm ở đợt 1 phải nằm trong "Phải thu".
 *
 * (a) giả `fetch` ở biên giới mạng (route của từng tab). Phép thử bốn chỗ trên màn thật nằm
 *     ở tests/e2e/bb-359-dem-viec-khop.spec.ts.
 * (b) chạy `layTienCanThu` thật trên bb-dev với fixture "Fixture BB-359-…" (chi nhánh riêng),
 *     xoá theo id ở afterAll. Kiểm ngược: bỏ khối "BB-359 (vòng 8 A, Q-4…)" trong
 *     tien-can-thu-server.ts → tongPhaiThu 0 ≠ 40.000 → ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { demViecCanXuLy, ketQuaDemViec, tabsChoVai } from "@/lib/utils/viec-can-xu-ly-tabs";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";

function fetchGia(theoApi: Record<string, unknown>) {
  return async (url: string) => {
    const data = theoApi[url];
    if (data === undefined) return new Response(JSON.stringify({ error: { code: "INTERNAL" } }), { status: 500 });
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
}

describe("BB-359 (a): một kết quả đếm cho huy hiệu, dòng phụ, thẻ và tab", () => {
  it("cảnh vòng 8: Khách gửi ảnh chọn 2 + Ảnh vượt hạn mức 1 → tổng 3, thẻ có ĐỦ hai dòng", async () => {
    const kq = await demViecCanXuLy(
      "owner",
      fetchGia({
        "/api/admin/reports/loi-dong-bo": { summary: { galleryCount: 0 } },
        "/api/admin/reports/link-sap-het-han": { items: [] },
        "/api/admin/reports/over-quota": { items: [{ galleryId: "a" }] },
        "/api/admin/reports/yeu-cau-mo-lai": { items: [] },
        "/api/admin/reports/dot-chon-cho-xac-nhan": { boAnh: [{}, {}] },
        "/api/admin/reports/quen-mat-khau": { items: [], coQuyen: true },
        "/api/admin/reports/lark-da-xoa": { items: [] },
      }),
    );
    expect(kq).not.toBeNull();
    expect(kq!.tong).toBe(3);
    expect(kq!.dong.map((d) => [d.tab, d.soLuong])).toEqual([
      ["over-quota", 1],
      ["khach-mua-them", 2],
    ]);
    // bất biến: tổng dòng thẻ = huy hiệu = tổng số trên tab
    const tongTab = Object.values(kq!.theoTab).reduce<number>((t, n) => t + (n ?? 0), 0);
    expect(kq!.dong.reduce((t, d) => t + d.soLuong, 0)).toBe(kq!.tong);
    expect(tongTab).toBe(kq!.tong);
  });

  it("tab nào có số > 0 thì có đúng một dòng, theo thứ tự tab; vai CTV không thấy tab bị ẩn", () => {
    const so = { "loi-dong-bo": 2, "over-quota": 1, "khach-mua-them": 4, "quen-mat-khau": 1 } as const;
    const kq = ketQuaDemViec({ ...so }, "owner");
    expect(kq.dong.map((d) => d.tab)).toEqual(["loi-dong-bo", "over-quota", "khach-mua-them", "quen-mat-khau"]);
    expect(kq.tong).toBe(8);
    const ctv = ketQuaDemViec({ ...so }, "photoshop_ctv");
    expect(ctv.dong.map((d) => d.tab)).toEqual(tabsChoVai("photoshop_ctv").map((t) => t.value).filter((t) => t === "over-quota"));
    expect(ctv.tong).toBe(1);
    // không có quyền quên mật khẩu → không tính dòng đó
    expect(ketQuaDemViec({ ...so }, "owner", true).tong).toBe(7);
  });

  it("mọi route hỏng → null (ẩn số, không bịa 0)", async () => {
    expect(await demViecCanXuLy("owner", fetchGia({}))).toBeNull();
  });
});

const coDb = Boolean(process.env.SUPABASE_DB_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!coDb)("BB-359 (b): sản phẩm mua thêm đợt 1 nằm trong Phải thu", () => {
  let pg: Client;
  const RUN = `${Date.now() % 1_000_000}`;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    id.branch = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB359-${RUN}`, `Fixture BB-359-${RUN} Chi nhánh`])
    ).rows[0].id;
    id.customer = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [id.branch, `Fixture BB-359-${RUN} Khách`])
    ).rows[0].id;
    id.product = (
      await pg.query(`insert into products (branch_id, name, kind) values ($1,$2,'print') returning id`, [
        id.branch,
        `Fixture BB-359-${RUN} Ảnh in 15x21`,
      ])
    ).rows[0].id;
    const taoBo = async (ten: string, daChot: boolean) => {
      const g = (
        await pg.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price, photo_count)
           values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',10,50000,0) returning id`,
          [id.branch, id.customer, `Fixture BB-359-${RUN} ${ten}`, `SEED_FOLDER_ID_359_${RUN}_${ten}`],
        )
      ).rows[0].id as string;
      const sl = (
        await pg.query(
          `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb359x','owner') returning id`,
          [g, `fixture-bb359-${g}`],
        )
      ).rows[0].id;
      const sel = (
        await pg.query(
          `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_count, snapshot_extra_amount)
           values ($1,$2,true,$3,0,0) returning id`,
          [g, sl, daChot ? new Date(Date.now() - 3600_000).toISOString() : null],
        )
      ).rows[0].id;
      // 2 × 20.000 ở đợt 1 + 1 × 30.000 ở đợt 2 (đợt 2 chưa xác nhận → chưa phải thu)
      await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [sel, id.product]);
      await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,1,30000,2)`, [sel, id.product]);
      return g;
    };
    id.daChot = await taoBo("da-chot", true);
    id.chuaChot = await taoBo("chua-chot", false);
  }, 60_000);

  afterAll(async () => {
    if (!pg) return;
    for (const g of [id.daChot, id.chuaChot].filter(Boolean)) {
      await pg.query(`delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)`, [g]);
      await pg.query(`delete from selections where gallery_id = $1`, [g]);
      await pg.query(`delete from share_links where gallery_id = $1`, [g]);
      await pg.query(`delete from activity_logs where gallery_id = $1`, [g]).catch(() => {});
      await pg.query(`delete from galleries where id = $1`, [g]);
    }
    if (id.product) await pg.query(`delete from products where id = $1`, [id.product]);
    if (id.customer) await pg.query(`delete from customers where id = $1`, [id.customer]);
    if (id.branch) await pg.query(`delete from branches where id = $1`, [id.branch]);
    const { rows } = await pg.query(`select count(*)::int n from branches where code = $1`, [`FXBB359-${RUN}`]);
    console.info("BB359_TIEN_CON_FIXTURE", rows[0].n);
    await pg.end();
  });

  // BB-360: sản phẩm vào "Phải thu" HAY dòng "thu qua Lark" tuỳ cài đặt `thanh_toan.thu_san_pham_qua_app`
  // (ca bật/tắt ở bb-360-san-pham-qua-lark.test.ts). Ở đây chỉ canh: 40.000 của đợt 1 đã chốt được
  // ĐẾM (một trong hai chỗ), đợt 2 chưa xác nhận thì không.
  it("đã chốt đợt 1 với 40.000 sản phẩm, không vượt hạn mức → 40.000 được đếm (Phải thu hoặc thu qua Lark)", async () => {
    const t = await layTienCanThu(createAdminClient(), id.daChot!);
    expect(t.tienSanPham).toBe(40000);
    expect(t.tongPhaiThu + t.tienSanPhamQuaLark).toBe(40000);
    expect(t.tienCanThu).toBe(t.tongPhaiThu);
    expect(t.conThieuVuot).toBe(0); // phần vượt hạn mức (tab "Ảnh vượt hạn mức") không đổi
  });

  it("giỏ đợt 1 CHƯA chốt → chưa phải thu", async () => {
    const t = await layTienCanThu(createAdminClient(), id.chuaChot!);
    expect(t.tongPhaiThu).toBe(0);
    expect(t.tienSanPhamQuaLark).toBe(0);
  });
});
