/**
 * BB-363 mục 1 — mốc "mở link" không bị bước cắt sang bb-prod đặt lại.
 *
 * `db:nap-lai --xoa` xoá share_links + activity_logs + galleries của bb-prod rồi dựng lại từ
 * Lark: mọi bộ nhận created_at = ngày cắt, không lần mở nào. `chep-moc-mo-link` chép mốc từ
 * bb-dev. Ở đây kiểm (a) hàm ghép thuần, (b) đọc nguồn thật trên bb-dev (CHỈ ĐỌC, giao dịch
 * read only) — chạy được khi bb-dev chưa áp 0088.
 *
 * Kiểm ngược (dán trong bàn giao): cho `ghepMocMoLink` lấy mốc của ĐÍCH (bỏ nguồn) → ca
 * "đích vừa nạp lại nhận mốc nguồn" ĐỎ; đổi muonHon thành lấy nguồn luôn → ca "không bao giờ
 * làm mốc muộn hơn / sớm hơn sai" ĐỎ.
 */
import { describe, it, expect } from "vitest";
import pg from "pg";
import { ghepMocMoLink, docMocNguon, bamKhoa } from "../../scripts/chep-moc-mo-link.mjs";

const NGAY_CAT = "2026-10-06T01:00:00.000Z";

describe("BB-363 ghepMocMoLink (thuần)", () => {
  const k = (s: string) => bamKhoa(`SEED_FOLDER_ID_363_${s}`);

  it("đích vừa nạp lại (created_at = ngày cắt, chưa mở) nhận mốc của nguồn", () => {
    const { capNhat, dem } = ghepMocMoLink(
      [
        { khoa: k("A"), mo: "2026-09-20T00:00:00.000Z", gui: "2026-09-15T00:00:00.000Z", tao: "2026-09-12T00:00:00.000Z" },
        { khoa: k("B"), mo: null, gui: null, tao: "2026-09-12T00:00:00.000Z" },
      ],
      [
        { id: "g-a", khoa: k("A"), mo: null, gui: null, tao: NGAY_CAT },
        { id: "g-b", khoa: k("B"), mo: null, gui: null, tao: NGAY_CAT },
      ],
    );
    expect(dem.khop).toBe(2);
    expect(capNhat).toEqual([
      { id: "g-a", mo: "2026-09-20T00:00:00.000Z", gui: "2026-09-15T00:00:00.000Z", tao: "2026-09-12T00:00:00.000Z" },
      { id: "g-b", mo: null, gui: null, tao: "2026-09-12T00:00:00.000Z" },
    ]);
  });

  it("không bao giờ làm mốc mở SỚM hơn đích, không làm created_at MUỘN hơn đích; đích đã có sent_at thì giữ", () => {
    const { capNhat } = ghepMocMoLink(
      [{ khoa: k("C"), mo: "2026-09-01T00:00:00.000Z", gui: "2026-08-01T00:00:00.000Z", tao: "2026-11-01T00:00:00.000Z" }],
      [{ id: "g-c", khoa: k("C"), mo: "2026-10-10T00:00:00.000Z", gui: "2026-10-07T00:00:00.000Z", tao: NGAY_CAT }],
    );
    expect(capNhat).toEqual([]); // đích đã mới hơn ở mọi cột → không đổi gì
  });

  it("khoá trùng ở nguồn → bỏ qua (không đoán); bộ không khớp → không đụng", () => {
    const { capNhat, dem } = ghepMocMoLink(
      [
        { khoa: k("D"), mo: "2026-09-20T00:00:00.000Z", gui: null, tao: "2026-09-12T00:00:00.000Z" },
        { khoa: k("D"), mo: "2026-09-25T00:00:00.000Z", gui: null, tao: "2026-09-12T00:00:00.000Z" },
      ],
      [
        { id: "g-d", khoa: k("D"), mo: null, gui: null, tao: NGAY_CAT },
        { id: "g-e", khoa: k("E"), mo: null, gui: null, tao: NGAY_CAT },
      ],
    );
    expect(capNhat).toEqual([]);
    expect(dem.khoaTrung).toBe(1);
    expect(dem.khop).toBe(0);
  });
});

const dbUrl = process.env.SUPABASE_DB_URL;
describe.skipIf(!dbUrl)("BB-363 đọc mốc nguồn trên bb-dev (chỉ đọc)", () => {
  it("đọc được khi chưa áp 0088; mốc mở = share_links.last_viewed_at; khoá đã băm (không lộ mã thư mục)", async () => {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    try {
      await c.query("begin read only");
      const moc = (await docMocNguon(c)) as { khoa: string; mo: string | null }[];
      const { rows } = await c.query(
        `select count(distinct gallery_id)::int n from share_links s join galleries g on g.id = s.gallery_id
          where s.last_viewed_at is not null and g.drive_folder_id is not null`,
      );
      await c.query("rollback");
      expect(moc.length).toBeGreaterThan(0);
      expect(moc.filter((m) => m.mo !== null).length).toBeGreaterThanOrEqual(rows[0].n);
      expect(moc.every((m) => /^[0-9a-f]{64}$/.test(m.khoa))).toBe(true);
    } finally {
      await c.end();
    }
  });
});
