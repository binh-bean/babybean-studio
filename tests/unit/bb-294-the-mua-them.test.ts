/**
 * BB-294 (#2, P0) — thẻ "Mua thêm" ở hàng số liệu đầu trang chi tiết bộ ảnh
 * (quản trị) trước đây hiện `dueAmount` (= `selections.snapshot_extra_amount`,
 * tiền VƯỢT HẠN MỨC ảnh) — SAI với ý nghĩa "Mua thêm". Người chấm độc lập bắt
 * được: khách chốt "Mua thêm 3 món · 60.000 ₫" (sản phẩm mua thêm ở cửa hàng,
 * bảng `selection_addons`) mà thẻ quản trị vẫn ghi "0 ₫" vì khách không hề
 * vượt hạn mức ảnh — hai con số khác nhau, gán nhầm nhãn.
 *
 * Phép thử này canh ĐÚNG hành vi: `GET /api/admin/galleries/:id/items` phải
 * trả `addonsAmount` = tổng đúng của `selection_addons` (lượt chọn CHÍNH),
 * KHÁC với `dueAmount` ("Phải thu" của khối Tiền phát sinh).
 *
 * BB-366 — luật "Phải thu" đã đổi sau BB-294 (BB-359 → BB-360 → BB-363):
 *   · "Edit file" (`products.kind = 'edited_photo'`) là tiền ẢNH — luôn vào "Phải thu";
 *   · ảnh in / khung / album là tiền SẢN PHẨM — chỉ vào "Phải thu" khi cờ
 *     `thanh_toan.thu_san_pham_qua_app` bật VÀ bộ chốt từ mốc `…_tu` trở đi;
 *     cờ tắt thì hiện riêng (`sanPhamQuaLark`), "Phải thu" = 0.
 * Bản cũ lấy `products where is_active limit 1` (không thứ tự, không lọc loại) — trên
 * bb-dev dòng đó là một sản phẩm "Edit file", nên `dueAmount = 60.000` là ĐÚNG luật hiện
 * tại, phép thử đỏ oan. Nay fixture tự tạo sản phẩm của mình (ảnh in + Edit file, đều
 * `is_active = false` để không lọt vào danh mục thật), và cố định cờ trong từng ca;
 * giá trị cờ cũ được trả lại ở afterAll (và kiểm lại là đã trả đúng).
 *
 * Nếu hoàn nguyên bản vá BB-294 (trả `addonsAmount` về đọc từ `dueAmount`, hoặc bỏ
 * hẳn trường này), ca "cờ tắt" phải ĐỎ: `dueAmount = 0` nhưng `addonsAmount = 60.000`.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/galleries/[id]/items/route";
import { KHOA_THU_SAN_PHAM_QUA_APP, KHOA_THU_SAN_PHAM_QUA_APP_TU } from "@/lib/gallery/tien-phat-sinh";

type CaiDat = { co: boolean; value: unknown };

describe("BB-294 (#2): GET .../items trả đúng addonsAmount (khác dueAmount)", () => {
  let client: Client;
  let branchId: string;
  let galleryId = "";
  let customerId = "";
  let shareLinkId = "";
  let selectionId = "";
  let addonId = "";
  const sp: { in?: string; edit?: string } = {};
  const caiDatCu = new Map<string, CaiDat>();
  const RUN = Date.now();

  function asOwner() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000294",
      role: "owner",
      branchIds: [branchId],
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const req = () => new Request("http://localhost");

  async function docCaiDat(key: string): Promise<CaiDat> {
    const r = await client.query(`select value from settings where key = $1 and branch_id is null`, [key]);
    return r.rowCount ? { co: true, value: r.rows[0].value } : { co: false, value: null };
  }
  /** `null` = xoá dòng cài đặt (đúng trạng thái "chưa từng đặt"). */
  async function datCaiDat(key: string, value: unknown | null) {
    await client.query(`delete from settings where key = $1 and branch_id is null`, [key]);
    if (value !== null) {
      await client.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [key, JSON.stringify(value)]);
    }
  }

  async function goi() {
    asOwner();
    const res = await GET(req(), params(galleryId));
    expect(res.status).toBe(200);
    return (await res.json()).data as {
      dueAmount: number;
      addonsAmount: number;
      sanPhamQuaLark: number;
      amountToCollect: number;
    };
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    for (const k of [KHOA_THU_SAN_PHAM_QUA_APP, KHOA_THU_SAN_PHAM_QUA_APP_TU]) caiDatCu.set(k, await docCaiDat(k));

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-294 Khách') returning id`,
      [branchId],
    );
    customerId = kh[0].id;

    // Sản phẩm RIÊNG của phép thử, loại cố định — không phụ thuộc danh mục thật của bb-dev.
    sp.in = (
      await client.query(
        `insert into products (branch_id, name, kind, is_active) values ($1,$2,'print',false) returning id`,
        [branchId, `Fixture BB-294-${RUN} Ảnh in`],
      )
    ).rows[0].id;
    sp.edit = (
      await client.query(
        `insert into products (branch_id, name, kind, is_active) values ($1,$2,'edited_photo',false) returning id`,
        [branchId, `Fixture BB-294-${RUN} Edit file`],
      )
    ).rows[0].id;

    // Bộ ảnh ĐÃ CHỐT (submitted), KHÔNG vượt hạn mức — snapshot_extra_amount = 0.
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, submitted_at)
       values ($1,$2,'Fixture BB-294','submitted',$3,'https://example.com/x',10, now()) returning id`,
      [branchId, customerId, `fixture-bb294-${RUN}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb294a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;

    // Lượt chọn CHÍNH: chốt lúc now(), snapshot_extra_amount = 0 (không vượt hạn mức).
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
       values ($1,$2,true, now(), 0) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    // Khách mua thêm 3 tấm ẢNH IN, đơn giá 20.000đ = 60.000đ ("Mua thêm 3 món · 60.000 ₫").
    addonId = (
      await client.query(
        `insert into selection_addons (selection_id, product_id, quantity, unit_price)
         values ($1,$2,3,20000) returning id`,
        [selectionId, sp.in],
      )
    ).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    for (const [k, cu] of caiDatCu) await datCaiDat(k, cu.co ? cu.value : null);
    if (galleryId) {
      await client.query(`delete from activity_logs where entity_id = $1 or gallery_id = $1`, [galleryId]);
      await client.query(
        `delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)`,
        [galleryId],
      );
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
    }
    for (const p of [sp.in, sp.edit].filter(Boolean)) await client.query("delete from products where id = $1", [p]);
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);

    // Cài đặt phải về ĐÚNG như trước khi chạy — bb-dev là dữ liệu thật.
    for (const [k, cu] of caiDatCu) expect(await docCaiDat(k)).toEqual(cu);
    await client.end();
  }, 60_000);

  it("cờ thu sản phẩm qua app TẮT: addonsAmount = 60.000, dueAmount = 0 (ảnh in thu qua Lark, hiện riêng)", async () => {
    await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, false);
    await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, null);
    const d = await goi();

    expect(d.addonsAmount).toBe(60000);
    expect(d.dueAmount).toBe(0);
    expect(d.amountToCollect).toBe(0);
    expect(d.sanPhamQuaLark).toBe(60000);
  });

  // Ca "cờ BẬT" cố ý KHÔNG viết ở đây: bb-dev là app thật, bật cờ toàn cục dù vài
  // giây cũng làm bộ chốt gần đây của khách thật hiện tiền sản phẩm phải thu.
  // Ca đó đã có ở tests/unit/bb-363-tien-moc-hieu-luc.test.ts.

  it("'Edit file' là tiền ẢNH: cờ tắt vẫn vào Phải thu (dueAmount = 60.000)", async () => {
    await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP, false);
    await datCaiDat(KHOA_THU_SAN_PHAM_QUA_APP_TU, null);
    await client.query(`update selection_addons set product_id = $1 where id = $2`, [sp.edit, addonId]);
    try {
      const d = await goi();
      expect(d.addonsAmount).toBe(60000);
      expect(d.dueAmount).toBe(60000);
      expect(d.sanPhamQuaLark).toBe(0);
    } finally {
      await client.query(`update selection_addons set product_id = $1 where id = $2`, [sp.in, addonId]);
    }
  });
});
