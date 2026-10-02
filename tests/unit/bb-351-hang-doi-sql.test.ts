/**
 * BB-351 — các câu SQL của hàng đợi hook chạy ĐÚNG trên Postgres thật (bb-dev), trên
 * một dòng `settings` RIÊNG ("fixture_bb351_hang_doi_<lượt>"), xoá theo khoá ở afterAll.
 * Không bao giờ đọc/ghi hàng đợi thật `lark_hook_queue`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import pg from "pg";

vi.mock("server-only", () => ({}));
import { docHangDoi, ghiSoLanLoi, themVaoHangDoi, xoaKhoiHangDoi, KHOA_HANG_DOI } from "@/lib/lark/hang-doi-hook";

const KHOA = `fixture_bb351_hang_doi_${Date.now()}`;
const dbUrl = process.env.SUPABASE_DB_URL;
let client: pg.Client;

beforeAll(async () => {
  expect(KHOA).not.toBe(KHOA_HANG_DOI);
  client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
});
afterAll(async () => {
  await client.query("delete from settings where key = $1 and branch_id is null", [KHOA]);
  const { rows } = await client.query("select count(*)::int as n from settings where key like 'fixture_bb351_%'");
  console.log("BB351_DON_HANG_DOI", JSON.stringify(rows[0]));
  await client.end();
});

describe.skipIf(!dbUrl)("BB-351 SQL hàng đợi hook trên Postgres thật (dòng fixture riêng)", () => {
  it("thêm (không trùng) → đọc → ghi số lần lỗi → xoá đúng id, giữ id khác", async () => {
    await themVaoHangDoi(client, ["r1", "r2"], KHOA);
    await themVaoHangDoi(client, ["r2", "r3"], KHOA);
    expect((await docHangDoi(client, KHOA)).recordIds).toEqual(["r1", "r2", "r3"]);

    await ghiSoLanLoi(client, { r2: 1, r3: 2 }, KHOA);
    expect((await docHangDoi(client, KHOA)).soLanLoi).toEqual({ r2: 1, r3: 2 });

    await xoaKhoiHangDoi(client, ["r1", "r3"], KHOA);
    const sau = await docHangDoi(client, KHOA);
    expect(sau.recordIds).toEqual(["r2"]);
    expect(sau.soLanLoi).toEqual({ r2: 1 });

    // Xoá hết → mảng rỗng (không phải null)
    await xoaKhoiHangDoi(client, ["r2"], KHOA);
    const { rows } = await client.query("select value from settings where key = $1 and branch_id is null", [KHOA]);
    expect(rows[0].value.record_ids).toEqual([]);
  });

  it("hàng đợi chưa có dòng: xoá / ghi lỗi không ném, đọc ra rỗng", async () => {
    const k2 = `${KHOA}_trong`;
    await xoaKhoiHangDoi(client, ["x"], k2);
    await ghiSoLanLoi(client, { x: 1 }, k2);
    expect(await docHangDoi(client, k2)).toEqual({ recordIds: [], soLanLoi: {} });
  });
});
