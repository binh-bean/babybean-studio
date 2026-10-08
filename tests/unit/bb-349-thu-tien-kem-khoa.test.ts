/**
 * BB-349 — thu tiền kèm "xác nhận danh sách và khoá bộ ảnh" (anh chốt 01/10/2026).
 *
 * Chạy trên bb-dev bằng fixture "Fixture BB-349-…", xoá theo id ở afterAll (sổ thu,
 * hộp thư khách, nhật ký, ảnh, lượt chọn, bộ ảnh, khách). Không gọi Lark. Thông báo
 * đẩy: fixture không có đăng ký push nào nên chỉ ghi vào hộp thư (chuông).
 *
 * Mỗi bộ: hạn mức 5, giá ảnh thêm 50.000.
 *
 * Thước đo AGENTS.md §5a (đã chạy thật, kết quả dán ở bàn giao):
 *   · bỏ khối "BB-349 — khoá cùng lúc ghi thu" ở payments/route.ts → ca 1, 2b, 4 ĐỎ;
 *   · bỏ điều kiện `chacChan` khi khách đang sửa lại → ca 2a ĐỎ;
 *   · bỏ kiểm "đã báo xác nhận chưa" trong baoKhachSauThanhToan → ca 4 ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as ghiThu } from "@/app/api/admin/galleries/[id]/payments/route";
import { GET as chiTiet } from "@/app/api/admin/galleries/[id]/items/route";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";

const GIA = 50000;

describe("BB-349: thu tiền kèm xác nhận + khoá bộ ảnh", () => {
  let pg: Client;
  let branchId = "";
  let staffId = "";
  let customerId = "";
  const boIds: string[] = [];

  /** Bộ ảnh: khách đã chốt `daChonLucChot` ảnh; `moLai` = CSKH mở lại sau đó và khách chọn thêm thành `daChonHienTai`. */
  async function taoBo(ten: string, o: { daChonLucChot: number; moLai?: { daChonHienTai: number } }): Promise<string> {
    const vuotLucChot = Math.max(0, o.daChonLucChot - 5);
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price, submitted_at, reopened_at)
       values ($1,$2,$3,$4,$5,'https://example.com/x',12,5,$6, now() - interval '2 hours', $7) returning id`,
      [
        branchId,
        customerId,
        `Fixture BB-349-${ten}`,
        o.moLai ? "in_review" : "submitted",
        `SEED_FOLDER_ID_349_${Date.now()}_${ten}`,
        GIA,
        o.moLai ? new Date(Date.now() - 60 * 60 * 1000).toISOString() : null,
      ],
    );
    const id = g[0].id as string;
    boIds.push(id);
    const { rows: sl } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role) values ($1,$2,'bb349x','owner') returning id`,
      [id, `fixture-bb349-${id}`],
    );
    const { rows: sel } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, submitted_by_name,
                               snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true, now() - interval '2 hours','Chị Mai (mẹ)',$3,$4,$5) returning id`,
      [id, sl[0].id, o.daChonLucChot, vuotLucChot, vuotLucChot * GIA],
    );
    const soChon = o.moLai ? o.moLai.daChonHienTai : o.daChonLucChot;
    for (let i = 1; i <= soChon; i++) {
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [id, `bb349-${id}-${i}`, `R01_00${String(i).padStart(2, "0")}.JPG`, i],
      );
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`,
        [sel[0].id, ph[0].id, id, i],
      );
    }
    return id;
  }

  const thu = async (id: string, v: Record<string, unknown>) => {
    // BB-395: nhập tay bắt ghi lý do — mặc định một lý do thử nếu ca không tự ghi.
    const res = await ghiThu(new Request("http://localhost", { method: "POST", body: JSON.stringify({ note: "Fixture nhập tay", ...v }) }), {
      params: Promise.resolve({ id }),
    });
    return { status: res.status, json: await res.json() };
  };
  const trangThai = async (id: string) => (await pg.query(`select status from galleries where id = $1`, [id])).rows[0].status as string;
  const soDongThu = async (id: string) => Number((await pg.query(`select count(*) n from gallery_payments where gallery_id = $1`, [id])).rows[0].n);
  const tin = async (id: string) =>
    (await pg.query(`select loai, tieu_de from thong_bao_khach where gallery_id = $1 order by created_at`, [id])).rows as {
      loai: string;
      tieu_de: string;
    }[];

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (await pg.query("select id from branches order by name limit 1")).rows[0].id;
    staffId = (await pg.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")).rows[0].id;
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [branchId], staffId));
    customerId = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,'Fixture BB-349 Nguyễn Thị Mai') returning id`, [branchId])
    ).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    if (boIds.length) {
      for (const sql of [
        `delete from activity_logs where entity_id = any($1::uuid[]) or gallery_id = any($1::uuid[])`,
        `delete from thong_bao_khach where gallery_id = any($1::uuid[])`,
        `delete from gallery_payments where gallery_id = any($1::uuid[])`,
        `delete from gallery_items where gallery_id = any($1::uuid[])`,
        `delete from selection_items where gallery_id = any($1::uuid[])`,
        `delete from selections where gallery_id = any($1::uuid[])`,
        `delete from share_links where gallery_id = any($1::uuid[])`,
        `delete from photos where gallery_id = any($1::uuid[])`,
        `delete from galleries where id = any($1::uuid[])`,
      ]) await pg.query(sql, [boIds]);
    }
    if (customerId) await pg.query(`delete from customers where id = $1`, [customerId]);
    await pg.end();
  }, 60_000);

  it("0. GET chi tiết trả khoaKhiThu: bộ đã chốt → khoá được, không cảnh báo; bộ mở lại → khoá được + cảnh báo", async () => {
    const chot = await taoBo("doc-chot", { daChonLucChot: 8 });
    const moLai = await taoBo("doc-mo-lai", { daChonLucChot: 8, moLai: { daChonHienTai: 9 } });
    const doc = async (id: string) =>
      (await (await chiTiet(new Request("http://localhost"), { params: Promise.resolve({ id }) })).json()).data.khoaKhiThu;
    expect(await doc(chot)).toEqual({ coTheKhoa: true, dangMoLai: false, soDot: 1 });
    expect(await doc(moLai)).toEqual({ coTheKhoa: true, dangMoLai: true, soDot: 1 });
  });

  it("1. Đã chốt + tick khoá: thiếu 'chắc chắn' → 400, không ghi sổ; đủ → khoá in_retouch + tin 'nhận thanh toán và xác nhận'", async () => {
    const id = await taoBo("da-chot", { daChonLucChot: 8 });
    const thieu = await thu(id, { amount: 3 * GIA, method: "chuyen_khoan", khoaBoAnh: true });
    expect(thieu.status).toBe(400);
    expect(await soDongThu(id)).toBe(0);

    const r = await thu(id, { amount: 3 * GIA, method: "chuyen_khoan", khoaBoAnh: true, chacChan: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.daKhoa).toBe(true);
    expect(await trangThai(id)).toBe("in_retouch");
    expect(await tin(id)).toEqual([
      { loai: "da_xac_nhan_danh_sach", tieu_de: "Bean đã nhận thanh toán và xác nhận danh sách ảnh của ba mẹ ạ!" },
    ]);
    const log = await pg.query(`select 1 from activity_logs where entity_id = $1 and action = 'gallery.confirm_retouch'`, [id]);
    expect(log.rows).toHaveLength(1);
  });

  it("2a. Mở lại, khách chưa gửi lại: thu mà KHÔNG có chacChan → 400, không ghi sổ, bộ vẫn mở", async () => {
    const id = await taoBo("mo-lai-a", { daChonLucChot: 8, moLai: { daChonHienTai: 9 } });
    const r = await thu(id, { amount: 2 * GIA, method: "tien_mat" });
    expect(r.status).toBe(400);
    expect(r.json.error.message).toContain("Khách đang sửa lại danh sách");
    expect(await soDongThu(id)).toBe(0);
    expect(await trangThai(id)).toBe("in_review");
  });

  it("2b. Mở lại + chacChan + khoá → khoá theo danh sách khách ĐANG chọn (9 ảnh), số còn thu tính lại", async () => {
    const id = await taoBo("mo-lai-b", { daChonLucChot: 8, moLai: { daChonHienTai: 9 } });
    const r = await thu(id, { amount: 3 * GIA, method: "tien_mat", khoaBoAnh: true, chacChan: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.daKhoa).toBe(true);
    expect(await trangThai(id)).toBe("in_retouch");
    const sel = (await pg.query(`select snapshot_selected_count n, snapshot_extra_amount::int t from selections where gallery_id = $1`, [id])).rows[0];
    expect(sel).toEqual({ n: 9, t: 4 * GIA });
    // Thu 150.000 theo danh sách cũ, danh sách khoá có 4 ảnh vượt → còn 50.000 (không mất doanh thu).
    expect((await layTienCanThu(createAdminClient(), id)).tienCanThu).toBe(GIA);
  });

  it("3. Không tick khoá → chỉ ghi tiền, bộ vẫn 'submitted', tin 'Bean đã nhận thanh toán của ba mẹ ạ!'", async () => {
    const id = await taoBo("khong-tick", { daChonLucChot: 8 });
    const r = await thu(id, { amount: GIA, method: "tien_mat" });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.daKhoa).toBe(false);
    expect(await trangThai(id)).toBe("submitted");
    expect(await soDongThu(id)).toBe(1);
    expect(await tin(id)).toEqual([{ loai: "da_nhan_thanh_toan", tieu_de: "Bean đã nhận thanh toán của ba mẹ ạ!" }]);
  });

  it("4. Tin 'đã xác nhận danh sách' đã gửi rồi (BB-347) → khoá vẫn chạy nhưng KHÔNG gửi lại tin đó", async () => {
    const id = await taoBo("da-bao", { daChonLucChot: 8 });
    await pg.query(
      `insert into thong_bao_khach (gallery_id, loai, tieu_de, noi_dung) values ($1,'da_xac_nhan_danh_sach','Bean đã xác nhận danh sách ảnh ạ','Fixture BB-349')`,
      [id],
    );
    const r = await thu(id, { amount: 3 * GIA, method: "chuyen_khoan", khoaBoAnh: true, chacChan: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(await trangThai(id)).toBe("in_retouch");
    const ds = await tin(id);
    expect(ds.filter((t) => t.loai === "da_xac_nhan_danh_sach")).toHaveLength(1);
    expect(ds.map((t) => t.loai)).toEqual(["da_xac_nhan_danh_sach", "da_nhan_thanh_toan"]);
  });
});
