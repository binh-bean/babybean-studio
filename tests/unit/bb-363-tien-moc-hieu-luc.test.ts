/**
 * BB-363 mục 2 + 3 — tiền.
 *
 *   2a. Cờ `thanh_toan.thu_san_pham_qua_app` KHÔNG hồi tố: bật cờ thì chỉ giỏ chốt TỪ mốc bật
 *       (`thanh_toan.thu_san_pham_qua_app_tu`) mới có tiền sản phẩm trong "Phải thu"; bộ chốt
 *       trước mốc vẫn "thu qua Lark", không hiện nợ ma. Đợt ≥ 2 theo lúc gửi đợt.
 *   2b. PATCH /api/admin/settings bật cờ → máy chủ ghi mốc = bây giờ + nhật ký riêng.
 *   2c. Cờ tắt: dòng thu lớn hơn số còn phải thu (tiền sản phẩm lẫn vào) bị chặn → hạn mức
 *       không tăng quá số ảnh đã trả (BB-348).
 *   3.  Có `requestId` (+ cột 0086) thì `requestId` là khoá chống trùng DUY NHẤT: hai phiếu
 *       khác nhau cùng số tiền, cùng người, trong 15 giây đều vào sổ.
 *
 * Fixture "Fixture BB-363-…" trên bb-dev (chi nhánh riêng), xoá theo id ở afterAll. Hai dòng
 * cài đặt được đổi trong từng ca rồi TRẢ LẠI giá trị cũ (AGENTS §5a điều 3) và kiểm lại ở
 * afterAll. Không gửi gì ra Lark (chốt khongGuiRaLarkThat của Vitest).
 *
 * Kiểm ngược (dán trong bàn giao):
 *   · `sanPhamThuTrongApp` bỏ so mốc (cờ bật là đủ) → ca "bộ cũ không có nợ sản phẩm" ĐỎ;
 *   · bỏ khối ghi mốc ở settings/route.ts → ca 2b ĐỎ;
 *   · bỏ chặn "số thu lớn hơn phần còn phải thu" ở payments/route.ts → ca 2c ĐỎ;
 *   · trả lưới đỡ 15 giây chạy cả khi có requestId → ca 3 ĐỎ (phiếu thứ hai bị nuốt).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as ghiThu } from "@/app/api/admin/galleries/[id]/payments/route";
import { PATCH as suaCaiDat } from "@/app/api/admin/settings/route";
import {
  KHOA_THU_SAN_PHAM_QUA_APP,
  KHOA_THU_SAN_PHAM_QUA_APP_TU,
  sanPhamThuTrongApp,
} from "@/lib/gallery/tien-phat-sinh";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";

const GIO = 3600_000;
const luc = (gio: number) => new Date(Date.now() + gio * GIO).toISOString();

describe("BB-363 sanPhamThuTrongApp (thuần) — chỗ rẽ nhánh theo mốc", () => {
  const tu = "2026-10-05T00:00:00.000Z";
  it("cờ bật: giỏ chốt từ mốc → thu qua app; trước mốc → Lark", () => {
    expect(sanPhamThuTrongApp({ bat: true, tu }, "2026-10-05T00:00:00.000Z")).toBe(true);
    expect(sanPhamThuTrongApp({ bat: true, tu }, "2026-10-04T23:59:59.000Z")).toBe(false);
  });
  it("cờ tắt, thiếu mốc, giỏ chưa chốt → không bao giờ thu qua app", () => {
    expect(sanPhamThuTrongApp({ bat: false, tu }, "2026-12-01T00:00:00.000Z")).toBe(false);
    expect(sanPhamThuTrongApp({ bat: true, tu: null }, "2026-12-01T00:00:00.000Z")).toBe(false);
    expect(sanPhamThuTrongApp({ bat: true, tu }, null)).toBe(false);
  });
});

const coDb = Boolean(process.env.SUPABASE_DB_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!coDb)("BB-363 tiền trên bb-dev", () => {
  let pg: Client;
  const RUN = `${Date.now() % 1_000_000}`;
  const id: Record<string, string> = {};
  const boIds: string[] = [];
  const caiDatCu = new Map<string, { co: boolean; value: unknown }>();
  let staffId = "";

  async function datCaiDat(key: string, value: unknown | null) {
    await pg.query(`delete from settings where key = $1 and branch_id is null`, [key]);
    if (value !== null) await pg.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [key, JSON.stringify(value)]);
  }
  async function traLaiCaiDat() {
    for (const [key, cu] of caiDatCu) await datCaiDat(key, cu.co ? cu.value : null);
  }
  async function docCaiDat(key: string) {
    const r = await pg.query(`select value from settings where key = $1 and branch_id is null`, [key]);
    return r.rowCount ? { co: true, value: r.rows[0].value } : { co: false, value: null };
  }

  /** Bộ chỉ có sản phẩm: đợt 1 = 2 × 20.000 ảnh in, đợt 2 = 40.000 ảnh in. */
  async function taoBoSanPham(ten: string, chotLuc: string) {
    const g = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price, photo_count)
         values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',10,50000,0) returning id`,
        [id.branch, id.customer, `Fixture BB-363-${RUN} ${ten}`, `SEED_FOLDER_ID_363_${RUN}_${ten}`],
      )
    ).rows[0].id as string;
    boIds.push(g);
    const sl = (
      await pg.query(`insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb363x','owner') returning id`, [
        g,
        `fixture-bb363-${g}`,
      ])
    ).rows[0].id;
    const sel = (
      await pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_count, snapshot_extra_amount)
         values ($1,$2,true,$3,0,0) returning id`,
        [g, sl, chotLuc],
      )
    ).rows[0].id as string;
    await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [sel, id.in]);
    await pg.query(
      `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh, tien_anh, tien_san_pham, san_pham, submitted_at)
       values ($1,$2,2,'da_xac_nhan',0,0,0,0,40000,$3::jsonb,$4)`,
      [g, sel, JSON.stringify([{ productId: id.in, ten: "in", photoId: null, soLuong: 2, donGia: 20000 }]), chotLuc],
    );
    return g;
  }

  /** Bộ vượt hạn mức: hạn mức 5 (dòng hợp đồng Edit file × 5), khách chốt 8 → vượt 3 × 50.000. */
  async function taoBoVuot(ten: string) {
    const g = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, included_quota, extra_photo_price)
         values ($1,$2,$3,'submitted',$4,'https://example.com/x',8,null,50000) returning id`,
        [id.branch, id.customer, `Fixture BB-363-${RUN} ${ten}`, `SEED_FOLDER_ID_363_${RUN}_${ten}`],
      )
    ).rows[0].id as string;
    boIds.push(g);
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, lark_contract_code, lark_record_id) values ($1,$2,5,$3,$4)`,
      [g, id.edit, `HD_FIXTURE363#${RUN}`, `recFIXTURE363${g.slice(0, 8)}`],
    );
    const sl = (
      await pg.query(`insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb363v','owner') returning id`, [
        g,
        `fixture-bb363v-${g}`,
      ])
    ).rows[0].id;
    const sel = (
      await pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
         values ($1,$2,true,now() - interval '1 hour',8,3,150000) returning id`,
        [g, sl],
      )
    ).rows[0].id;
    for (let i = 1; i <= 8; i++) {
      const ph = (
        await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
          [g, `bb363-${g}-${i}`, `R01_000${i}.JPG`, i],
        )
      ).rows[0].id;
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`,
        [sel, ph, g, i],
      );
    }
    // Khách cũng mua 40.000 ảnh in ở đợt 1 — tiền này thu qua Lark khi cờ tắt.
    await pg.query(`insert into selection_addons (selection_id, product_id, quantity, unit_price, dot) values ($1,$2,2,20000,1)`, [sel, id.in]);
    return g;
  }

  const thu = async (galleryId: string, v: Record<string, unknown>) => {
    const res = await ghiThu(new Request("http://localhost", { method: "POST", body: JSON.stringify(v) }), {
      params: Promise.resolve({ id: galleryId }),
    });
    return { status: res.status, json: await res.json() };
  };
  const soDong = async (galleryId: string) =>
    (await pg.query(`select count(*)::int n from gallery_payments where gallery_id = $1`, [galleryId])).rows[0].n as number;
  const hanMuc = async (galleryId: string) => Number((await pg.query(`select app.gallery_quota($1) q`, [galleryId])).rows[0].q);

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    for (const k of [KHOA_THU_SAN_PHAM_QUA_APP, KHOA_THU_SAN_PHAM_QUA_APP_TU]) caiDatCu.set(k, await docCaiDat(k));
    staffId = (await pg.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")).rows[0].id;

    id.branch = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB363-${RUN}`, `Fixture BB-363-${RUN} Chi nhánh`])
    ).rows[0].id;
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [id.branch!], staffId));
    id.customer = (
      await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000363') returning id`, [
        id.branch,
        `Fixture BB-363-${RUN} Nguyễn Thị Mai`,
      ])
    ).rows[0].id;
    id.in = (
      await pg.query(`insert into products (branch_id, name, kind) values ($1,$2,'print') returning id`, [id.branch, `Fixture BB-363-${RUN} Ảnh in`])
    ).rows[0].id;
    // Sản phẩm Edit file KHÔNG kinh doanh: hạn mức do thanh toán dùng sản phẩm thật đang kinh doanh.
    id.edit = (
      await pg.query(`insert into products (branch_id, name, kind, is_active, list_price) values ($1,$2,'edited_photo',false,50000) returning id`, [
        id.branch,
        `Fixture BB-363-${RUN} Edit file`,
      ])
    ).rows[0].id;

    id.boCu = await taoBoSanPham("cu", luc(-24 * 10)); // chốt 10 ngày trước
    id.boMoi = await taoBoSanPham("moi", luc(-1)); // chốt 1 giờ trước
    id.vuot = await taoBoVuot("vuot");
    id.vuot2 = await taoBoVuot("vuot2");
  }, 90_000);

  afterAll(async () => {
    if (!pg) return;
    await traLaiCaiDat();
    await pg.query(`delete from activity_logs where action = 'thanh_toan.bat_thu_san_pham_qua_app' and actor_id = $1 and created_at > now() - interval '1 hour'
                      and metadata->>'tu' is not null and (metadata->>'tu')::timestamptz > now() - interval '1 hour'`, [staffId]);
    await pg.query(`delete from activity_logs where action = 'settings.update' and actor_id = $1 and created_at > now() - interval '1 hour'
                      and metadata->>'key' = $2`, [staffId, KHOA_THU_SAN_PHAM_QUA_APP]);
    if (boIds.length) {
      await pg.query(`delete from activity_logs where entity_id = any($1::uuid[]) or gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from thong_bao_khach where gallery_id = any($1::uuid[])`, [boIds]).catch(() => {});
      await pg.query(`delete from gallery_payments where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from gallery_items where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from selection_rounds where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from selection_addons where selection_id in (select id from selections where gallery_id = any($1::uuid[]))`, [boIds]);
      await pg.query(`delete from selection_items where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from selections where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from share_links where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from photos where gallery_id = any($1::uuid[])`, [boIds]);
      await pg.query(`delete from galleries where id = any($1::uuid[])`, [boIds]);
    }
    for (const p of [id.in, id.edit].filter(Boolean)) await pg.query(`delete from products where id = $1`, [p]);
    if (id.customer) await pg.query(`delete from customers where id = $1`, [id.customer]);
    if (id.branch) await pg.query(`delete from branches where id = $1`, [id.branch]);
    const con = (await pg.query(`select count(*)::int n from branches where code = $1`, [`FXBB363-${RUN}`])).rows[0].n;
    const sau = { co: await docCaiDat(KHOA_THU_SAN_PHAM_QUA_APP), tu: await docCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU) };
    console.info("BB363_SAU_DON", JSON.stringify({ conChiNhanh: con, caiDat: sau }));
    expect(con).toBe(0);
    expect(sau.co).toEqual(caiDatCu.get(KHOA_THU_SAN_PHAM_QUA_APP));
    expect(sau.tu).toEqual(caiDatCu.get(KHOA_THU_SAN_PHAM_QUA_APP_TU));
    await pg.end();
  }, 90_000);

  it("2a: cờ bật từ HÔM QUA → bộ chốt 10 ngày trước KHÔNG có nợ sản phẩm; bộ chốt 1 giờ trước có", async () => {
    try {
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, true);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, luc(-24));
      const cu = await layTienCanThu(createAdminClient(), id.boCu!);
      expect({ tong: cu.tongPhaiThu, can: cu.tienCanThu, lark: cu.tienSanPhamQuaLark }).toEqual({ tong: 0, can: 0, lark: 80_000 });
      const moi = await layTienCanThu(createAdminClient(), id.boMoi!);
      expect({ tong: moi.tongPhaiThu, can: moi.tienCanThu, lark: moi.tienSanPhamQuaLark }).toEqual({ tong: 80_000, can: 80_000, lark: 0 });
    } finally {
      await traLaiCaiDat();
    }
  });

  it("2a: đợt ≥ 2 theo lúc GỬI ĐỢT — đợt 2 gửi sau mốc thì thu qua app dù đợt 1 chốt trước mốc", async () => {
    try {
      await pg.query(`update selection_rounds set submitted_at = $2 where gallery_id = $1`, [id.boCu, luc(-1)]);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, true);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, luc(-24));
      const cu = await layTienCanThu(createAdminClient(), id.boCu!);
      expect({ tong: cu.tongPhaiThu, lark: cu.tienSanPhamQuaLark }).toEqual({ tong: 40_000, lark: 40_000 });
    } finally {
      await pg.query(`update selection_rounds set submitted_at = $2 where gallery_id = $1`, [id.boCu, luc(-24 * 10)]);
      await traLaiCaiDat();
    }
  });

  it("2a (đảo): cờ TẮT → cả hai bộ không nợ sản phẩm; cờ bật mà THIẾU mốc → cũng không (không hồi tố)", async () => {
    try {
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, false);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, luc(-24));
      for (const g of [id.boCu, id.boMoi]) {
        const t = await layTienCanThu(createAdminClient(), g!);
        expect({ tong: t.tongPhaiThu, lark: t.tienSanPhamQuaLark }).toEqual({ tong: 0, lark: 80_000 });
      }
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, true);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, null);
      const moi = await layTienCanThu(createAdminClient(), id.boMoi!);
      expect({ tong: moi.tongPhaiThu, lark: moi.tienSanPhamQuaLark }).toEqual({ tong: 0, lark: 80_000 });
    } finally {
      await traLaiCaiDat();
    }
  });

  it("2b: bật cờ qua màn Cài đặt → máy chủ ghi mốc = bây giờ + nhật ký; lưu lại lần nữa không dời mốc", async () => {
    try {
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, false);
      await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, null);
      const truocBat = Date.now();
      const res = await suaCaiDat(
        new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ thayDoi: [{ key: KHOA_THU_SAN_PHAM_QUA_APP, value: true }] }) }),
      );
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
      const moc = await docCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU);
      expect(moc.co).toBe(true);
      const t = Date.parse(String(moc.value));
      expect(t).toBeGreaterThanOrEqual(truocBat - 5_000);
      expect(t).toBeLessThanOrEqual(Date.now() + 5_000);
      const log = await pg.query(
        `select count(*)::int n from activity_logs where action = 'thanh_toan.bat_thu_san_pham_qua_app' and metadata->>'tu' = $1`,
        [String(moc.value)],
      );
      expect(log.rows[0].n).toBe(1);
      // Lưu lại "bật" lần nữa (không đổi) → mốc giữ nguyên.
      await suaCaiDat(
        new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ thayDoi: [{ key: KHOA_THU_SAN_PHAM_QUA_APP, value: true }] }) }),
      );
      expect((await docCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU)).value).toBe(moc.value);
      // Bộ chốt 1 giờ trước là TRƯỚC mốc vừa bật → vẫn thu qua Lark.
      const moi = await layTienCanThu(createAdminClient(), id.boMoi!);
      expect(moi.tongPhaiThu).toBe(0);
    } finally {
      await traLaiCaiDat();
    }
  });

  it("3: hai phiếu KHÁC requestId, cùng số tiền, cùng người, trong 15 giây → cả hai vào sổ; gửi lại đúng mã → không thêm", async () => {
    await traLaiCaiDat();
    const truoc = await soDong(id.vuot!);
    const a = await thu(id.vuot!, { amount: 20000, method: "tien_mat", note: "phiếu 1", requestId: `bb363-${RUN}-phieu-a` });
    const b = await thu(id.vuot!, { amount: 20000, method: "tien_mat", note: "phiếu 2", requestId: `bb363-${RUN}-phieu-b` });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.json.data.trung).toBe(false);
    expect(await soDong(id.vuot!)).toBe(truoc + 2);
    const lai = await thu(id.vuot!, { amount: 20000, method: "tien_mat", note: "phiếu 2", requestId: `bb363-${RUN}-phieu-b` });
    expect(lai.json.data.trung).toBe(true);
    expect(await soDong(id.vuot!)).toBe(truoc + 2);
  });

  it("2c: cờ tắt — ghi 190.000 (150.000 ảnh + 40.000 sản phẩm) bị chặn, hạn mức đứng yên; ghi đúng 150.000 thì hạn mức +3", async () => {
    await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, false);
    try {
      const hm0 = await hanMuc(id.vuot2!);
      const t = await layTienCanThu(createAdminClient(), id.vuot2!);
      expect({ can: t.tienCanThu, lark: t.tienSanPhamQuaLark }).toEqual({ can: 150_000, lark: 40_000 });
      const qua = await thu(id.vuot2!, { amount: 190000, method: "tien_mat", note: "gộp", requestId: `bb363-${RUN}-gop` });
      expect(qua.status).toBe(400);
      expect(String(qua.json.error?.message ?? "")).toContain("thu qua Lark");
      expect(await soDong(id.vuot2!)).toBe(0);
      expect(await hanMuc(id.vuot2!)).toBe(hm0);
      const dung = await thu(id.vuot2!, { amount: 150000, method: "tien_mat", note: "đủ ảnh", requestId: `bb363-${RUN}-du` });
      expect(dung.status).toBe(200);
      expect(await hanMuc(id.vuot2!)).toBe(hm0 + 3);
    } finally {
      await traLaiCaiDat();
    }
  });
});
