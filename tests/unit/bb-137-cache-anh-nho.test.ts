/**
 * BB-137 — ảnh nhỏ không gọi sang Drive mỗi lần xem.
 *
 * Hai thứ được canh, và thiếu thứ nào thì bản sửa cũng vô nghĩa:
 *
 *   1. Lần hai KHÔNG gọi sang Google. Đó là toàn bộ lý do task này tồn tại:
 *      152.472 ảnh, bộ lớn nhất 1.235 tấm, một buổi tối vài nhà cùng mở là vài
 *      nghìn lượt gọi. Chạm hạn mức Google thì ảnh TẮT cho tất cả mọi người.
 *
 *   2. Ảnh đã nằm trong bộ nhớ đệm VẪN bị chặn khi không có phiên. Một kho ảnh
 *      đệm đọc được tự do là cách biến bản vá BB-133 thành vô nghĩa — và đó là
 *      kiểu hỏng không ai thấy cho tới khi ảnh của một nhà lọt sang nhà khác.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-137 ${runId}`;

describe("BB-137: ảnh nhỏ giữ lại, thôi gọi Drive mỗi lần", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anh = "";
  let soLuotGoiDrive = 0;

  const goi = (photoId: string) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?w=200`), {
      params: Promise.resolve({ photoId }),
    });

  function khongPhaiNhanVien() {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
  }

  function phienKhach(galleryId: string) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: "",
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000000137",
      selectionId: "",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  function khongCoPhien() {
    vi.spyOn(gallerySession, "requireGallerySession").mockRejectedValue(
      new gallerySession.GallerySessionError("UNAUTHENTICATED"),
    );
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: k } = await client.query(
      "insert into customers (branch_id, full_name) values ($1,$2) returning id",
      [branchId, `${NHAN} Khách`],
    );
    khach = k[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1) returning id`,
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb137-${runId}`],
    );
    bo = g[0].id;

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
      [bo, `fixture-bb137-file-${runId}`],
    );
    anh = p[0].id;

    // Giả lập DUY NHẤT đường ra Google — thứ không nên gọi thật trong phép thử,
    // và cũng chính là thứ cần ĐẾM. Tầng xét quyền giữ nguyên đồ thật.
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      soLuotGoiDrive += 1;
      return new Response(new Uint8Array([255, 216, 255, 0, 1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });
  });

  afterAll(async () => {
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  it("Lần đầu gọi sang Drive, lần hai KHÔNG gọi nữa", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);

    soLuotGoiDrive = 0;
    const lan1 = await goi(anh);
    expect(lan1.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);

    const lan2 = await goi(anh);
    expect(lan2.status).toBe(200);
    // Con số này là toàn bộ ý nghĩa của BB-137.
    expect(soLuotGoiDrive).toBe(1);

    const lan3 = await goi(anh);
    expect(lan3.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);
  });

  it("Ảnh đã nằm trong bộ nhớ đệm VẪN bị chặn khi không có phiên", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);
    await goi(anh); // chắc chắn đã có trong đệm

    khongCoPhien();
    const res = await goi(anh);
    expect(res.status).toBe(403);
  });

  it("Phiên của bộ ảnh KHÁC vẫn không lấy được ảnh trong đệm", async () => {
    khongPhaiNhanVien();
    phienKhach("00000000-0000-4000-8000-000000000999");
    const res = await goi(anh);
    expect(res.status).toBe(403);
  });
});
