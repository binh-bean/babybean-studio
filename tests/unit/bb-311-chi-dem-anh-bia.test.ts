/**
 * BB-311 mục A — `/api/img` chỉ đệm ẢNH BÌA (bộ ảnh HOẶC album), không đệm
 * mọi ảnh w≥1600.
 *
 * LỖI SUÝT LỌT: bản đầu chỉ xét `width >= 1600` để quyết định có đệm không.
 * Nhưng màn xem lớn (`photo-lightbox.tsx`) xin đúng 1600/2048 cho MỌI tấm
 * khách bấm mở — không riêng ảnh bìa. Phép thử này canh ĐÚNG cái đã suýt sai:
 * một tấm ảnh THƯỜNG (không phải bìa gì cả) ở w=1600 KHÔNG được ghi đệm, dù
 * nội dung tải về hợp lệ.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): đổi lại
 * `const laAnhBia = laAnhBiaBoAnh || laAnhBiaAlbum;` thành
 * `const laAnhBia = width >= 1600 && !taiVe;` (bản lỗi cũ) → ca "ảnh THƯỜNG
 * ở w=1600 không bị đệm" phải ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { pngGiaHopLe } from "../fixtures/anh-gia";

vi.mock("server-only", () => ({}));
process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1"; // ghi đệm fixture thật để canh — xem BB-137/BB-286

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-311 ${runId}`;

describe("BB-311: /api/img chỉ đệm ẢNH BÌA, không đệm mọi ảnh w>=1600", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anhBia = ""; // gallery.cover_photo_id
  let anhThuong = ""; // ảnh bình thường, KHÔNG phải bìa gì cả

  const goi = (photoId: string, w: number) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?w=${w}`), {
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
      shareLinkId: "00000000-0000-4000-8000-000000003111",
      selectionId: "",
      exp: 0,
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
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
       values ($1,$2,$3,'ready',$4,'https://example.com/x',2) returning id`,
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb311-bia-${runId}`],
    );
    bo = g[0].id;

    const { rows: pBia } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'bia.jpg','image/jpeg',1,'active') returning id`,
      [bo, `fixture-bb311-bia-file-${runId}`],
    );
    anhBia = pBia[0].id;

    const { rows: pThuong } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'thuong.jpg','image/jpeg',2,'active') returning id`,
      [bo, `fixture-bb311-thuong-file-${runId}`],
    );
    anhThuong = pThuong[0].id;

    await client.query("update galleries set cover_photo_id = $1 where id = $2", [anhBia, bo]);

    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(pngGiaHopLe(1200, 800, 20_000), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });
  });

  afterAll(async () => {
    const admin = createAdminClient();
    await admin.storage.from("thumbnails").remove([
      `${anhBia}/1600.jpg`,
      `${anhBia}/1600.webp`,
      `${anhThuong}/1600.jpg`,
      `${anhThuong}/1600.webp`,
    ]);
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  it("ảnh BÌA (galleries.cover_photo_id) ở w=1600 -> ĐƯỢC ghi đệm", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);
    const admin = createAdminClient();
    await admin.storage.from("thumbnails").remove([`${anhBia}/1600.jpg`, `${anhBia}/1600.webp`]);

    const res = await goi(anhBia, 1600);
    expect(res.status).toBe(200);

    const jpg = await admin.storage.from("thumbnails").download(`${anhBia}/1600.jpg`);
    const webp = await admin.storage.from("thumbnails").download(`${anhBia}/1600.webp`);
    expect(jpg.data || webp.data).not.toBeNull();
  });

  it("ảnh THƯỜNG (không phải bìa gì cả) ở w=1600 -> KHÔNG được ghi đệm, dù nội dung hợp lệ", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);
    const admin = createAdminClient();
    await admin.storage.from("thumbnails").remove([`${anhThuong}/1600.jpg`, `${anhThuong}/1600.webp`]);

    const res = await goi(anhThuong, 1600);
    expect(res.status).toBe(200); // vẫn trả ảnh bình thường cho khách

    const jpg = await admin.storage.from("thumbnails").download(`${anhThuong}/1600.jpg`);
    const webp = await admin.storage.from("thumbnails").download(`${anhThuong}/1600.webp`);
    // ĐÂY là toàn bộ ý nghĩa của phép thử: KHÔNG có object nào được ghi.
    expect(jpg.data).toBeNull();
    expect(webp.data).toBeNull();
  });
});
