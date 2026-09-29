/**
 * BB-326 mục 5 — bộ ảnh lỗi Drive tự lành khi thư mục đã chia sẻ.
 *
 * Dữ liệu thật trên bb-dev nhưng NẰM TRONG MỘT CHI NHÁNH FIXTURE riêng: hàm
 * `kiemTraLaiCacBoLoi` lọc theo `branchIds`, nên phép thử KHÔNG BAO GIỜ chạm
 * 76 bộ lỗi thật của studio. Drive giả lập ở biên `driveFetch`. Dọn theo id,
 * cả chi nhánh.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as clientModule from "@/lib/drive/client";
import { DriveAccessDeniedError } from "@/lib/drive/client";
import { kiemTraLaiMotBo, kiemTraLaiCacBoLoi } from "@/lib/drive/kiem-tra-lai-loi";
import { createAdminClient } from "@/lib/supabase/admin";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-326-kiem-lai ${runId}`;
const LY_DO = "Thư mục chưa được chia sẻ công khai";

const traThuMuc = () =>
  new Response(JSON.stringify({ id: "x", mimeType: "application/vnd.google-apps.folder" }), { status: 200 });
const traDanhSach = () =>
  new Response(
    JSON.stringify({
      files: [
        { id: `fixture-bb326-a-${runId}`, name: "BB_001.jpg", mimeType: "image/jpeg", size: "1000" },
        { id: `fixture-bb326-b-${runId}`, name: "BB_002.jpg", mimeType: "image/jpeg", size: "1000" },
      ],
    }),
    { status: 200 },
  );

describe("BB-326: kiểm tra lại bộ ảnh lỗi Drive", () => {
  let pg: Client;
  let branchId: string;
  let customerId: string;
  const galleryIds: string[] = [];
  const admin = createAdminClient();

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query(
      `insert into branches (code, name) values ($1,$2) returning id`,
      [`FX326${runId}`.slice(0, 20), `${NHAN} Chi nhánh`],
    );
    branchId = br[0].id;
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    if (galleryIds.length) {
      await pg.query("update galleries set cover_photo_id = null where id = any($1)", [galleryIds]);
      await pg.query("delete from photos where gallery_id = any($1)", [galleryIds]);
      await pg.query("delete from galleries where id = any($1)", [galleryIds]);
    }
    if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
    if (branchId) await pg.query("delete from branches where id = $1", [branchId]);
    await pg.end();
  });

  async function taoBoLoi(ten: string) {
    const { rows } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, sync_error)
       values ($1,$2,$3,'sync_error',$4,'https://example.com/x',0,$5) returning id`,
      [branchId, customerId, `${NHAN} ${ten}`, `fixture-bb326-folder-${ten}-${runId}`, LY_DO],
    );
    galleryIds.push(rows[0].id);
    return rows[0].id as string;
  }
  const doc = async (id: string) =>
    (await pg.query("select status, sync_error, photo_count from galleries where id = $1", [id])).rows[0];

  it("Thư mục ĐÃ chia sẻ → lỗi được xoá, ảnh kéo về, bộ sang ready", async () => {
    const id = await taoBoLoi("da-chia-se");
    vi.spyOn(clientModule, "driveFetch")
      .mockResolvedValueOnce(traThuMuc()) // bước 1: metadata
      .mockResolvedValueOnce(traThuMuc()) // listImageFiles tự hỏi lại metadata
      .mockResolvedValueOnce(traDanhSach());

    const kq = await kiemTraLaiMotBo(admin, id, `req-${runId}-1`);
    expect(kq).toMatchObject({ hetLoi: true, soAnh: 2 });
    expect(await doc(id)).toMatchObject({ status: "ready", sync_error: null, photo_count: 2 });
  });

  it("Thư mục VẪN chưa chia sẻ → giữ lỗi, không đổi trạng thái, chỉ tốn MỘT lời gọi Drive", async () => {
    const id = await taoBoLoi("chua-chia-se");
    const spy = vi.spyOn(clientModule, "driveFetch").mockRejectedValue(new DriveAccessDeniedError("x"));

    const kq = await kiemTraLaiMotBo(admin, id, `req-${runId}-2`);
    expect(kq).toMatchObject({ hetLoi: false, loi: LY_DO });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await doc(id)).toMatchObject({ status: "sync_error", sync_error: LY_DO, photo_count: 0 });
  });

  it("Kiểm lại tất cả trong chi nhánh: đếm trước/sau đúng, bộ đọc được thì hết lỗi", async () => {
    const lanh = await taoBoLoi("tat-ca-lanh");
    const hong = await taoBoLoi("tat-ca-hong");
    // Bộ `lanh` là bộ có updated_at cũ nhất trong số lỗi còn lại? Không chắc
    // thứ tự — nên trả lời Drive theo THƯ MỤC của từng lời gọi, không theo thứ tự.
    vi.spyOn(clientModule, "driveFetch").mockImplementation(async (path, params, ctx) => {
      const thuMuc = String(ctx.folderId ?? "");
      if (thuMuc.includes("tat-ca-hong")) throw new DriveAccessDeniedError(thuMuc);
      return String(path).startsWith("/files/") ? traThuMuc() : traDanhSach();
    });

    const kq = await kiemTraLaiCacBoLoi(admin, {
      branchIds: [branchId],
      gioiHan: 50,
      hetGioLuc: Date.now() + 30_000,
      requestId: `req-${runId}-3`,
    });
    // Hai bộ lỗi của ca 2 và ca này + (ca 1 đã lành) → trước = 3 bộ lỗi.
    expect(kq.loiTruoc).toBe(3);
    expect(kq.daKiem).toBe(3);
    // `chua-chia-se` (ca 2) lần này Drive đọc được → lành; `tat-ca-hong` thì không.
    expect(kq.hetLoi).toBe(2);
    expect(kq.loiSau).toBe(1);
    expect((await doc(lanh)).sync_error).toBeNull();
    expect((await doc(hong)).sync_error).toBe(LY_DO);
  });

  it("Hết giờ thì dừng, báo còn bộ chưa kiểm", async () => {
    const kq = await kiemTraLaiCacBoLoi(admin, {
      branchIds: [branchId],
      gioiHan: 50,
      hetGioLuc: Date.now() - 1,
      requestId: `req-${runId}-4`,
    });
    expect(kq).toMatchObject({ loiTruoc: 1, daKiem: 0, loiSau: 1, conChuaKiem: true });
  });
});
