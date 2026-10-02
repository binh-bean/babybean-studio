/**
 * BB-360 mục 1 — anh chốt 02/10/2026: sản phẩm khách mua thêm (ảnh in / khung / album) đang
 * THU QUA LARK. Cài đặt `thanh_toan.thu_san_pham_qua_app` (mặc định tắt):
 *   · tắt → tiền sản phẩm KHÔNG nằm trong "Phải thu / Còn thiếu / amountToCollect"; hiện riêng
 *     "Sản phẩm mua thêm: X ₫ · thu qua Lark" (`tienSanPhamQuaLark`);
 *   · bật → cộng vào như BB-359.
 * Tiền ẢNH (vượt hạn mức, ảnh đợt ≥ 2, "Edit file") luôn thu qua app.
 *
 * (a) hàm thuần — chỗ rẽ nhánh duy nhất (`tienSanPhamTinhVaoPhaiThu`).
 * (b) `layTienCanThu` thật trên bb-dev, fixture "Fixture BB-360-…" (chi nhánh riêng), xoá theo
 *     id ở afterAll. Cờ trong `settings` được bật trong đúng một ca rồi TRẢ LẠI giá trị cũ
 *     (AGENTS §5a điều 3) ở `finally` và kiểm lại ở afterAll.
 *
 * Kiểm ngược (đã chạy, dán trong bàn giao): cho `tienSanPhamTinhVaoPhaiThu` bỏ qua cờ (luôn trả
 * tienSanPham) → 4 ca đỏ (Phải thu 190.000 ≠ 110.000; bộ chỉ có sản phẩm 40.000 ≠ 0; 170.000 ≠ 130.000).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import {
  KHOA_THU_SAN_PHAM_QUA_APP,
  laBatThuSanPhamQuaApp,
  tienCanThuCuaBo,
  tienSanPhamThuQuaLark,
  tongPhaiThuCuaBo,
} from "@/lib/gallery/tien-phat-sinh";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";

describe("BB-360 (a): một chỗ rẽ nhánh cho tiền sản phẩm", () => {
  const nen = { tienTheoAnh: 0, tienLucChot: 100_000, tienDotMuaThem: 30_000, tienSanPham: 40_000 };

  it("cờ TẮT → sản phẩm không vào Phải thu, nằm ở dòng 'thu qua Lark'", () => {
    expect(tongPhaiThuCuaBo({ ...nen, thuSanPhamQuaApp: false })).toBe(130_000);
    expect(tienCanThuCuaBo({ ...nen, thuSanPhamQuaApp: false, daGhiCo: 130_000 })).toBe(0);
    expect(tienSanPhamThuQuaLark(40_000, false)).toBe(40_000);
  });

  it("cờ BẬT → cộng vào như BB-359, không còn dòng Lark", () => {
    expect(tongPhaiThuCuaBo({ ...nen, thuSanPhamQuaApp: true })).toBe(170_000);
    expect(tienCanThuCuaBo({ ...nen, thuSanPhamQuaApp: true, daGhiCo: 130_000 })).toBe(40_000);
    expect(tienSanPhamThuQuaLark(40_000, true)).toBe(0);
  });

  it("không truyền cờ = tắt (mặc định); chỉ đúng boolean true mới là bật", () => {
    expect(tongPhaiThuCuaBo(nen)).toBe(130_000);
    expect(laBatThuSanPhamQuaApp(true)).toBe(true);
    for (const v of [false, null, undefined, "true", 1, {}]) expect(laBatThuSanPhamQuaApp(v)).toBe(false);
  });
});

const coDb = Boolean(process.env.SUPABASE_DB_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!coDb)("BB-360 (b): layTienCanThu thật trên bb-dev", () => {
  let pg: Client;
  const RUN = `${Date.now() % 1_000_000}`;
  const id: Record<string, string> = {};
  const boIds: string[] = [];
  // Giá trị cờ trước khi thử — trả lại y nguyên.
  let coCu: { co: boolean; value: unknown } = { co: false, value: null };
  let coDotMuaThem = true;

  async function datCo(value: boolean | null) {
    await pg.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_THU_SAN_PHAM_QUA_APP]);
    if (value !== null) {
      await pg.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [KHOA_THU_SAN_PHAM_QUA_APP, JSON.stringify(value)]);
    }
  }
  async function traLaiCo() {
    await pg.query(`delete from settings where key = $1 and branch_id is null`, [KHOA_THU_SAN_PHAM_QUA_APP]);
    if (coCu.co) {
      await pg.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [KHOA_THU_SAN_PHAM_QUA_APP, JSON.stringify(coCu.value)]);
    }
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const cu = await pg.query(`select value from settings where key = $1 and branch_id is null`, [KHOA_THU_SAN_PHAM_QUA_APP]);
    coCu = cu.rowCount ? { co: true, value: cu.rows[0].value } : { co: false, value: null };

    id.branch = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB360-${RUN}`, `Fixture BB-360-${RUN} Chi nhánh`])
    ).rows[0].id;
    id.customer = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [id.branch, `Fixture BB-360-${RUN} Khách`])
    ).rows[0].id;
    id.in = (
      await pg.query(`insert into products (branch_id, name, kind) values ($1,$2,'print') returning id`, [id.branch, `Fixture BB-360-${RUN} Ảnh in`])
    ).rows[0].id;
    id.edit = (
      await pg.query(`insert into products (branch_id, name, kind, is_active) values ($1,$2,'edited_photo', false) returning id`, [
        id.branch,
        `Fixture BB-360-${RUN} Edit file`,
      ])
    ).rows[0].id;

    const taoBo = async (ten: string) => {
      const g = (
        await pg.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price, photo_count)
           values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',10,50000,0) returning id`,
          [id.branch, id.customer, `Fixture BB-360-${RUN} ${ten}`, `SEED_FOLDER_ID_360_${RUN}_${ten}`],
        )
      ).rows[0].id as string;
      boIds.push(g);
      const sl = (
        await pg.query(`insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb360x','owner') returning id`, [
          g,
          `fixture-bb360-${g}`,
        ])
      ).rows[0].id;
      const sel = (
        await pg.query(
          `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_count, snapshot_extra_amount)
           values ($1,$2,true,$3,0,0) returning id`,
          [g, sl, new Date(Date.now() - 3600_000).toISOString()],
        )
      ).rows[0].id as string;
      return { g, sel };
    };

    // Bộ "trộn": đợt 1 = 2 × 20.000 ảnh in (SẢN PHẨM) + 1 × 50.000 Edit file (ẢNH);
    // đợt 2 đã xác nhận = tiền ảnh 30.000 + giỏ 70.000 (ảnh in 40.000 + Edit file 30.000).
    const tron = await taoBo("tron");
    id.tron = tron.g;
    await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [tron.sel, id.in]);
    await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,1,50000,1)`, [tron.sel, id.edit]);
    try {
      await pg.query(
        `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh, tien_anh, tien_san_pham, san_pham)
         values ($1,$2,2,'da_xac_nhan',1,1,30000,30000,70000,$3::jsonb)`,
        [
          tron.g,
          tron.sel,
          JSON.stringify([
            { productId: id.in, ten: "in", photoId: null, soLuong: 2, donGia: 20000 },
            { productId: id.edit, ten: "edit", photoId: null, soLuong: 1, donGia: 30000 },
          ]),
        ],
      );
    } catch {
      coDotMuaThem = false; // chưa áp 0077 — ca đợt 2 bỏ qua phần đợt
    }

    // Bộ "chỉ sản phẩm": không vượt hạn mức, chỉ mua 2 × 20.000 ảnh in ở đợt 1.
    const chiSp = await taoBo("chi-sp");
    id.chiSp = chiSp.g;
    await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [chiSp.sel, id.in]);
  }, 60_000);

  afterAll(async () => {
    if (!pg) return;
    await traLaiCo();
    for (const g of boIds) {
      await pg.query(`delete from selection_rounds where gallery_id = $1`, [g]).catch(() => {});
      await pg.query(`delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)`, [g]);
      await pg.query(`delete from selections where gallery_id = $1`, [g]);
      await pg.query(`delete from share_links where gallery_id = $1`, [g]);
      await pg.query(`delete from activity_logs where gallery_id = $1`, [g]).catch(() => {});
      await pg.query(`delete from galleries where id = $1`, [g]);
    }
    for (const p of [id.in, id.edit].filter(Boolean)) await pg.query(`delete from products where id = $1`, [p]);
    if (id.customer) await pg.query(`delete from customers where id = $1`, [id.customer]);
    if (id.branch) await pg.query(`delete from branches where id = $1`, [id.branch]);
    const con = await pg.query(`select count(*)::int n from branches where code = $1`, [`FXBB360-${RUN}`]);
    const co = await pg.query(`select value from settings where key = $1 and branch_id is null`, [KHOA_THU_SAN_PHAM_QUA_APP]);
    console.info("BB360_SAU_DON", JSON.stringify({ coDotMuaThem, conChiNhanh: con.rows[0].n, coTraLai: co.rowCount ? co.rows[0].value : "khong_co_dong" }));
    expect(con.rows[0].n).toBe(0);
    expect(co.rowCount ? { co: true, value: co.rows[0].value } : { co: false, value: null }).toEqual(coCu);
    await pg.end();
  });

  it("cờ TẮT: Phải thu chỉ có tiền ảnh; sản phẩm (đợt 1 + đợt 2) ở dòng 'thu qua Lark'", async () => {
    try {
      await datCo(false);
      const t = await layTienCanThu(createAdminClient(), id.tron!);
      const anh = 50_000 + (coDotMuaThem ? 30_000 + 30_000 : 0); // Edit file đợt 1 + (ảnh đợt 2 + Edit file đợt 2)
      const sp = 40_000 + (coDotMuaThem ? 40_000 : 0);
      expect(t.thuSanPhamQuaApp).toBe(false);
      expect(t.tienDotMuaThem).toBe(anh);
      expect(t.tienSanPham).toBe(sp);
      expect(t.tongPhaiThu).toBe(anh);
      expect(t.tienCanThu).toBe(anh);
      expect(t.tienSanPhamQuaLark).toBe(sp);
      expect(t.conThieuVuot).toBe(0); // BB-348: phần vượt hạn mức không đổi
    } finally {
      await traLaiCo();
    }
  });

  it("cờ TẮT: bộ CHỈ mua sản phẩm → không có gì phải thu (form khoá, BB-344), Lark 40.000", async () => {
    try {
      await datCo(false);
      const t = await layTienCanThu(createAdminClient(), id.chiSp!);
      expect(t.tongPhaiThu).toBe(0);
      expect(t.tienCanThu).toBe(0);
      expect(t.conThieu).toBe(0);
      expect(t.tienSanPhamQuaLark).toBe(40_000);
    } finally {
      await traLaiCo();
    }
  });

  it("cờ BẬT: sản phẩm cộng vào Phải thu như BB-359, dòng Lark = 0", async () => {
    try {
      await datCo(true);
      const t = await layTienCanThu(createAdminClient(), id.tron!);
      const tong = 50_000 + 40_000 + (coDotMuaThem ? 30_000 + 70_000 : 0);
      expect(t.thuSanPhamQuaApp).toBe(true);
      expect(t.tongPhaiThu).toBe(tong);
      expect(t.tienCanThu).toBe(tong);
      expect(t.tienSanPhamQuaLark).toBe(0);
      const chiSp = await layTienCanThu(createAdminClient(), id.chiSp!);
      expect(chiSp.tienCanThu).toBe(40_000);
    } finally {
      await traLaiCo();
    }
  });
});
