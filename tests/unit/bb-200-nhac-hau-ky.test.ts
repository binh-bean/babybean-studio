/**
 * BB-200 — bộ nhắc hậu kỳ chạy trên cơ sở dữ liệu thật (chỉ bộ ảnh Fixture).
 *
 * Canh ba điều: đúng mốc; KHÔNG nhắc lại ở lượt sau (khoá lark_nhac_da_gui);
 * vào lại giai đoạn (lượt gửi duyệt thứ hai) thì nhắc lại từ đầu.
 * Hàm `gui` là hàm giả thu tin lại — không gì đi sang Lark.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { chayNhacHauKy, type TinNhacHauKy } from "@/lib/lark/nhac-hau-ky";

const GUI_DUYET = "optjJ9MNLL";
const DA_CHON = "optl5DyKLx";
const runId = Math.random().toString(36).slice(2, 8);
const homNay = new Date("2026-09-25T01:00:00Z"); // 08:00 VN
const truoc = (n: number) => new Date(homNay.getTime() - n * 86_400_000);
const cheSo = (s: string | null) => (s ? "090***0001" : null);

describe("BB-200: chayNhacHauKy", () => {
  let client: Client;
  let customerId = "";
  let gDuyet = "";
  let gChon = "";

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000001') returning id`,
      [br[0].id, `Fixture BB-200 nhắc ${runId}`],
    );
    customerId = kh[0].id;
    const tao = async (ten: string, ma: string, tu: Date) =>
      (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                  lark_trang_thai, lark_trang_thai_tu)
           values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',$5,$6) returning id`,
          [br[0].id, customerId, `Fixture BB-200 ${ten} ${runId}`, `fixture-bb200-${ten}-${runId}`, ma, tu],
        )
      ).rows[0].id as string;
    gDuyet = await tao("duyet", GUI_DUYET, truoc(6));
    gChon = await tao("chon", DA_CHON, truoc(4));
  });

  afterAll(async () => {
    for (const id of [gDuyet, gChon].filter(Boolean)) {
      await client.query("delete from lark_nhac_da_gui where gallery_id = $1", [id]);
      await client.query("delete from galleries where id = $1", [id]);
    }
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  const chay = async () => {
    const tin: TinNhacHauKy[] = [];
    const kq = await chayNhacHauKy({
      client,
      homNay,
      cheSo,
      gui: async (t) => void tin.push(t),
      chiBoAnh: [gDuyet, gChon],
    });
    return { kq, tin };
  };

  it("lượt 1: đã gửi duyệt 6 ngày → một tin mốc 5 cho CSKH; nhánh C đã chọn 4 ngày → im", async () => {
    const { kq, tin } = await chay();
    expect(kq.xet).toBe(2);
    expect(tin).toHaveLength(1);
    expect(tin[0]!.maNhac).toBe("cho_khach_duyet");
    expect(tin[0]!.nguoiNhan).toBe("cskh");
    expect(tin[0]!.boAnh.map((b) => [b.galleryId, b.moc, b.soNgay, b.customerPhone])).toEqual([
      [gDuyet, 5, 6, "090***0001"],
    ]);
    // Mốc 2 đã qua cũng được ghi là đã gửi (không dội hai tin).
    const { rows } = await client.query(
      "select moc from lark_nhac_da_gui where gallery_id = $1 order by moc",
      [gDuyet],
    );
    expect(rows.map((r) => r.moc)).toEqual([2, 5]);
  });

  it("lượt 2 cùng ngày: không nhắc lại", async () => {
    const { tin } = await chay();
    expect(tin).toEqual([]);
  });

  it("gửi duyệt LẦN HAI (vào lại giai đoạn): nhắc lại từ mốc đầu", async () => {
    await client.query("update galleries set lark_trang_thai_tu = $2 where id = $1", [gDuyet, truoc(2)]);
    const { tin } = await chay();
    expect(tin.map((t) => [t.maNhac, t.boAnh[0]!.moc])).toEqual([["cho_khach_duyet", 2]]);
  });
});
