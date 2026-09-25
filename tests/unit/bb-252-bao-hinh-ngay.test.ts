/**
 * BB-252 — hook Lark cập nhật trạng thái hậu kỳ ngay và báo "Hình đã về" một lần.
 * Chỉ dùng bộ `Fixture BB-252`; đọc Lark và báo push đều được truyền vào (giả).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { capNhatTrangThaiTuHook } from "@/lib/lark/cap-nhat-tu-hook";
import type { TrangThaiDoc } from "@/lib/lark/doc-trang-thai-lark";

const DA_GUI_IN = "optxMAdtNX";
const HINH_DA_VE = "opttKmVbce";

describe("BB-252: capNhatTrangThaiTuHook", () => {
  let client: Client;
  let galleryId: string;
  let customerId: string;
  const maBanGhi = `rec_fixture_bb252_${Date.now()}`;
  const sdt = "0900" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  const tt = (ma: string): TrangThaiDoc => ({ maTrangThai: ma, maCanhBao: null, ngayVaoGiaiDoan: null, suaLuc: null });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-252',$2) returning id`,
      [br[0].id, sdt],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, lark_hauky_record_id, lark_trang_thai)
       values ($1,$2,'Fixture BB-252','approved','SEED_FOLDER_ID_BB252','https://example.com/x',0,$3,$4)
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

  it("8 → 9: ghi mã mới, báo đúng bộ; bản ghi đọc hỏng không chặn bản ghi khác", async () => {
    const bao = vi.fn().mockResolvedValue(undefined);
    const kq = await capNhatTrangThaiTuHook({
      client,
      recordIds: ["rec_doc_hong", maBanGhi],
      docMotBanGhi: async (id) => {
        if (id === "rec_doc_hong") throw new Error("Lark 500");
        return tt(HINH_DA_VE);
      },
      bao,
    });
    expect(bao).toHaveBeenCalledTimes(1);
    expect(bao).toHaveBeenCalledWith(galleryId);
    expect(kq.baoHinhDaVe).toBe(1);
    const { rows } = await client.query("select lark_trang_thai from galleries where id = $1", [galleryId]);
    expect(rows[0].lark_trang_thai).toBe(HINH_DA_VE);
  });

  it("Lark đẩy lại cùng bản ghi (vẫn 9) → không báo lần hai", async () => {
    const bao = vi.fn().mockResolvedValue(undefined);
    await capNhatTrangThaiTuHook({ client, recordIds: [maBanGhi], docMotBanGhi: async () => tt(HINH_DA_VE), bao });
    expect(bao).not.toHaveBeenCalled();
  });
});
