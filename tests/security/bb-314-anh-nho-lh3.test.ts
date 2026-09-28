/**
 * BB-314 — `/api/img` cỡ NHỎ (w<=800) điều hướng 302 thẳng sang lh3, nhưng
 * CHỈ SAU KHI xét quyền xong. Phép thử này canh đúng thứ khó thấy nhất của
 * bản vá: một token sai hay một bộ ảnh hết hạn KHÔNG được nhận một điều
 * hướng — phải nhận 403/404 y như trước bản vá.
 *
 * OWNER task: BB-314 (worktree bb314). Dùng lại đúng khuôn phép thử của
 * `tests/security/khach-xem-duoc-anh.test.ts` (BB-133) và
 * `tests/unit/bb-311-chi-dem-anh-bia.test.ts` — kết nối bb-dev THẬT qua `pg`,
 * dữ liệu gắn nhãn "Fixture BB-314 …", dọn sạch ở `afterAll`.
 *
 * KIỂM NGƯỢC (chạy tay theo AGENTS §5a, dán cả hai kết quả vào bàn giao):
 * đổi điều kiện redirect trong `route.ts` — ví dụ đổi
 * `if (nenDieuHuongLh3(width, taiVe, quaProxy))` thành
 * `if (nenDieuHuongLh3(width, taiVe, quaProxy) && false /* KIEM NGUOC *\/)`
 * (tắt hẳn nhánh redirect) → ca "302 với ảnh nhỏ" bên dưới phải ĐỎ. Khôi phục
 * lại rồi chạy lại thấy XANH.
 *
 * Không in ra `drive_file_id`, URL đầy đủ hay tên khách — chỉ so khớp
 * tiền tố/pattern của Location, không log giá trị thật.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { pngGiaHopLe } from "../fixtures/anh-gia";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-314 ${runId}`;

describe("BB-314: /api/img điều hướng lh3 cho ảnh nhỏ, chỉ SAU KHI xét quyền", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anh = "";

  const goi = (photoId: string, qs: string) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?${qs}`), {
      params: Promise.resolve({ photoId }),
    });

  function khongPhaiNhanVien() {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
  }
  function phienKhachHopLe() {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo,
      customerId: "",
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000003140",
      selectionId: "",
      exp: 0,
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  /** Token sai hoặc bộ ảnh hết hạn — cả hai đều đi qua GallerySessionError. */
  function phienSaiHoacHetHan(ma: "UNAUTHENTICATED" | "LINK_EXPIRED" | "FORBIDDEN") {
    vi.spyOn(gallerySession, "requireGallerySession").mockRejectedValue(
      new gallerySession.GallerySessionError(ma),
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
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb314-${runId}`],
    );
    bo = g[0].id;

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
      [bo, `fixture-bb314-file-${runId}`],
    );
    anh = p[0].id;

    // driveFetch chỉ cần khi route ĐI QUA PROXY (qua=1, tai=1) — nhánh
    // redirect (302) không hề gọi tới nó.
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(pngGiaHopLe(400, 300, 5_000), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });
  });

  afterAll(async () => {
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  it("1. Khách hợp lệ, w=200 (lưới) -> 302, Location sang lh3, Cache-Control private", async () => {
    khongPhaiNhanVien();
    phienKhachHopLe();
    const res = await goi(anh, "w=200");
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location") ?? "";
    expect(loc.startsWith("https://lh3.googleusercontent.com/d/")).toBe(true);
    expect(loc.endsWith("=w200")).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("2. Khách hợp lệ, w=800 (biên trên của cỡ nhỏ) -> 302 sang lh3", async () => {
    khongPhaiNhanVien();
    phienKhachHopLe();
    const res = await goi(anh, "w=800");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")?.endsWith("=w800")).toBe(true);
  });

  it("3. Khách hợp lệ, w=1600 (ảnh bìa/xem lớn, BB-311) -> KHÔNG điều hướng, trả ảnh 200", async () => {
    khongPhaiNhanVien();
    phienKhachHopLe();
    const res = await goi(anh, "w=1600");
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("4. Khách hợp lệ, w=200&qua=1 (retry sau khi lh3 lỗi ở trình duyệt) -> KHÔNG điều hướng, đi qua proxy, trả 200", async () => {
    khongPhaiNhanVien();
    phienKhachHopLe();
    const res = await goi(anh, "w=200&qua=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("5. Khách hợp lệ, w=200&tai=1 (tải ảnh gốc) -> KHÔNG điều hướng, có Content-Disposition", async () => {
    khongPhaiNhanVien();
    phienKhachHopLe();
    const res = await goi(anh, "w=200&tai=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("6. Token/phiên SAI (UNAUTHENTICATED) -> 403, KHÔNG bao giờ 302, dù w<=800", async () => {
    khongPhaiNhanVien();
    phienSaiHoacHetHan("UNAUTHENTICATED");
    const res = await goi(anh, "w=200");
    expect(res.status).not.toBe(302);
    expect(res.headers.get("Location")).toBeNull();
    expect([403, 404]).toContain(res.status);
  });

  it("7. Bộ ảnh/link HẾT HẠN (LINK_EXPIRED) -> 403, KHÔNG bao giờ 302, dù w<=800", async () => {
    khongPhaiNhanVien();
    phienSaiHoacHetHan("LINK_EXPIRED");
    const res = await goi(anh, "w=200");
    expect(res.status).not.toBe(302);
    expect(res.headers.get("Location")).toBeNull();
    expect([403, 404]).toContain(res.status);
  });

  it("8. Không có phiên nào cả -> 403, KHÔNG bao giờ 302", async () => {
    khongPhaiNhanVien();
    vi.spyOn(gallerySession, "requireGallerySession").mockRejectedValue(
      new gallerySession.GallerySessionError("UNAUTHENTICATED"),
    );
    const res = await goi(anh, "w=800");
    expect(res.status).not.toBe(302);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("9. photoId không tồn tại -> 404, KHÔNG bao giờ 302", async () => {
    const res = await goi("00000000-0000-0000-0000-000000000000", "w=200");
    expect(res.status).toBe(404);
    expect(res.headers.get("Location")).toBeNull();
  });
});
