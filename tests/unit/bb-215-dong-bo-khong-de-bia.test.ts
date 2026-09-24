/**
 * BB-215 — đồng bộ lại KHÔNG được đè ảnh bìa CSKH đã chọn.
 *
 * `dongBoBoAnh` (src/lib/drive/sync-gallery.ts) chỉ tự đặt ảnh bìa khi
 * `cover_photo_id` đang RỖNG — luật đó có từ trước BB-215. Phép thử này khẳng
 * định lại luật đó bằng dữ liệu THẬT trên bb-dev, và thêm ca CSKH đã chọn một
 * tấm KHÁC tấm đầu tiên của Drive: đồng bộ lại vẫn phải giữ đúng tấm CSKH chọn.
 *
 * Mỗi lần chạy mang một nhãn riêng và dọn theo nhãn của chính mình — BB-136.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as clientModule from "@/lib/drive/client";
import { batDauDongBo, dongBoBoAnh } from "@/lib/drive/sync-gallery";
import { createAdminClient } from "@/lib/supabase/admin";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-215-sync ${runId}`;

const FOLDER_ID = `fixture-bb215-folder-${runId}`;

function danhSachAnhDrive() {
  return {
    files: [
      {
        id: `fixture-bb215-drive-1-${runId}`,
        name: "BB_001.jpg",
        mimeType: "image/jpeg",
        size: "1000",
      },
      {
        id: `fixture-bb215-drive-2-${runId}`,
        name: "BB_002.jpg",
        mimeType: "image/jpeg",
        size: "1000",
      },
    ],
  };
}

const dapAnKiemTra = () =>
  new Response(JSON.stringify({ id: FOLDER_ID, mimeType: "application/vnd.google-apps.folder" }), {
    status: 200,
  });

describe("BB-215: đồng bộ không đè ảnh bìa đã chọn", () => {
  let client: Client;
  let branchId: string;
  let customerId: string;

  const admin = createAdminClient();

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await client.query(
      "delete from photos where gallery_id in (select id from galleries where title like $1)",
      [`${NHAN}%`],
    );
    await client.query("delete from galleries where title like $1", [`${NHAN}%`]);
    await client.query("delete from customers where full_name like $1", [`${NHAN}%`]);
    await client.end();
  });

  let demBo = 0;
  async function taoBoDeDongBo(coverPhotoId: string | null) {
    demBo += 1;
    const { rows } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, cover_photo_id)
       values ($1,$2,$3,'draft',$4,'https://example.com/x',0,$5) returning id`,
      [branchId, customerId, `${NHAN} bộ ${demBo}`, `${FOLDER_ID}-${demBo}`, coverPhotoId],
    );
    return rows[0].id as string;
  }

  const coverCua = async (id: string) => {
    const { rows } = await client.query("select cover_photo_id from galleries where id = $1", [id]);
    return rows[0].cover_photo_id as string | null;
  };

  it("Bộ ảnh CHƯA có bìa -> đồng bộ tự đặt tấm đầu tiên", async () => {
    vi.spyOn(clientModule, "driveFetch")
      .mockResolvedValueOnce(dapAnKiemTra())
      .mockResolvedValueOnce(new Response(JSON.stringify(danhSachAnhDrive()), { status: 200 }));

    const galleryId = await taoBoDeDongBo(null);
    const info = await batDauDongBo(admin, galleryId);
    await dongBoBoAnh(admin, galleryId, info, `req-${runId}-trong`);

    const sau = await coverCua(galleryId);
    expect(sau).not.toBeNull();

    const { rows: p } = await client.query("select drive_file_id from photos where id = $1", [sau]);
    expect(p[0].drive_file_id).toBe(`fixture-bb215-drive-1-${runId}`);
  });

  it("Bộ ảnh ĐÃ có bìa CSKH chọn (tấm thứ hai) -> đồng bộ lại vẫn giữ nguyên", async () => {
    // Đồng bộ lần đầu để có hai dòng `photos` thật trong cơ sở dữ liệu.
    vi.spyOn(clientModule, "driveFetch")
      .mockResolvedValueOnce(dapAnKiemTra())
      .mockResolvedValueOnce(new Response(JSON.stringify(danhSachAnhDrive()), { status: 200 }));

    const galleryId = await taoBoDeDongBo(null);
    const info1 = await batDauDongBo(admin, galleryId);
    await dongBoBoAnh(admin, galleryId, info1, `req-${runId}-lan1`);

    // CSKH chọn TẤM THỨ HAI làm bìa — khác hẳn tấm đầu tiên Drive vẫn trả về.
    const { rows: anh2 } = await client.query(
      "select id from photos where gallery_id = $1 and drive_file_id = $2",
      [galleryId, `fixture-bb215-drive-2-${runId}`],
    );
    const anhCskhChon = anh2[0].id as string;
    await client.query("update galleries set cover_photo_id = $1 where id = $2", [anhCskhChon, galleryId]);

    // Đồng bộ lại — Drive trả về đúng danh sách cũ, tấm đầu tiên vẫn là ảnh 1.
    vi.spyOn(clientModule, "driveFetch")
      .mockResolvedValueOnce(dapAnKiemTra())
      .mockResolvedValueOnce(new Response(JSON.stringify(danhSachAnhDrive()), { status: 200 }));

    const info2 = await batDauDongBo(admin, galleryId);
    // `giaiDoanDau` của batDauDongBo (2) sẽ khớp trạng thái hiện tại của bộ —
    // dùng lại `info2.coverPhotoId` đúng như route thật đang làm.
    await dongBoBoAnh(admin, galleryId, info2, `req-${runId}-lan2`);

    const sau = await coverCua(galleryId);
    expect(sau).toBe(anhCskhChon);
  });
});
