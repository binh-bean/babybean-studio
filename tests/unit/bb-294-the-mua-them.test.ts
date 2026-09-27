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
 * KHÁC với `dueAmount` (vẫn giữ nguyên ý nghĩa cũ, dùng cho "Phải thu"/"Còn
 * thiếu" ở khối Tiền phát sinh — không đổi).
 *
 * Nếu hoàn nguyên bản vá (trả `addonsAmount` về đọc từ `dueAmount`, hoặc bỏ
 * hẳn trường này), ca 1 dưới đây phải ĐỎ: fixture cố tình để `dueAmount = 0`
 * (không vượt hạn mức) nhưng có `selection_addons` = 60.000đ.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/galleries/[id]/items/route";

describe("BB-294 (#2): GET .../items trả đúng addonsAmount (khác dueAmount)", () => {
  let client: Client;
  let branchId: string;
  let galleryId = "";
  let customerId = "";
  let shareLinkId = "";
  let addonProductId = "";

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

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-294 Khách') returning id`,
      [branchId],
    );
    customerId = kh[0].id;

    // Bộ ảnh ĐÃ CHỐT (submitted), KHÔNG vượt hạn mức — snapshot_extra_amount
    // (dueAmount) phải là 0, để phép thử tách bạch rõ với addonsAmount.
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, submitted_at)
       values ($1,$2,'Fixture BB-294','submitted',$3,'https://example.com/x',10, now()) returning id`,
      [branchId, customerId, `fixture-bb294-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb294a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;

    // Lượt chọn CHÍNH: đã chốt, snapshot_extra_amount = 0 (không vượt hạn mức).
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
       values ($1,$2,true, now(), 0) returning id`,
      [galleryId, shareLinkId],
    );
    const selectionId = sel[0].id;

    // Một sản phẩm bất kỳ để gắn vào selection_addons.
    const { rows: sp } = await client.query(
      `select id from products where is_active limit 1`,
    );
    addonProductId = sp[0].id;

    // Khách mua thêm 3 món, đơn giá 20.000đ = tổng 60.000đ — đúng ca người
    // chấm độc lập ghi lại ("Mua thêm 3 món · 60.000 ₫").
    await client.query(
      `insert into selection_addons (selection_id, product_id, quantity, unit_price)
       values ($1,$2,3,20000)`,
      [selectionId, addonProductId],
    );
  });

  afterAll(async () => {
    if (galleryId) {
      await client.query(
        `delete from selection_addons where selection_id in (select id from selections where gallery_id = $1)`,
        [galleryId],
      );
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("addonsAmount = 60.000 (tổng selection_addons), dueAmount vẫn = 0 — hai số KHÔNG lẫn nhau", async () => {
    asOwner();
    const res = await GET(req(), params(galleryId));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.dueAmount).toBe(0);
    expect(body.data.addonsAmount).toBe(60000);
  });
});
