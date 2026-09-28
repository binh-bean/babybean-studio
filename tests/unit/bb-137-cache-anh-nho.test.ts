/**
 * BB-137 — ảnh nhỏ, VÀ (từ BB-311, 28/09/2026) ảnh BÌA.
 *
 * ---------------------------------------------------------------------------
 * ĐỔI 28/09/2026 (BB-311 mục A, admin) — ĐỌC TRƯỚC KHI SỬA TỆP NÀY
 * ---------------------------------------------------------------------------
 * BB-137 gốc canh: MỌI cỡ ảnh (kể cả 200w) chỉ gọi Drive lần đầu, lần sau lấy
 * từ đệm Storage. Admin sau đó CHỦ Ý đảo ngược điều này cho ảnh NHỎ: "Không
 * đệm ảnh nhỏ" — Storage 1GB/egress 5GB của gói miễn phí gần vỡ vì đệm ảnh
 * lưới không bao giờ xoá (báo cáo vận hành vòng 4 §5). Từ nay:
 *   - w < 1600 (200/400/800 — lưới, xem nhỏ): KHÔNG đệm nữa — MỖI lượt xem
 *     đều gọi Drive lại. Đây là hành vi ĐÚNG, không phải hồi quy.
 *   - w ≥ 1600 (1600/2048 — ảnh BÌA): VẪN đệm như BB-137 gốc.
 * Test "Lần hai KHÔNG gọi Drive" giờ chỉ còn đúng cho ảnh BÌA — xem describe
 * thứ hai bên dưới. Ảnh nhỏ có describe riêng canh đúng điều NGƯỢC LẠI.
 *
 * Vẫn còn nguyên từ BB-137 gốc, ÁP DỤNG CHO MỌI CỠ (không đổi theo BB-311):
 * Ảnh (dù có nằm trong đệm hay không) VẪN bị chặn khi không có phiên đúng —
 * một kho ảnh đọc được tự do là cách biến bản vá BB-133 thành vô nghĩa.
 *
 * ---------------------------------------------------------------------------
 * ĐỔI TIẾP 28/09/2026 (BB-314) — ĐỌC TRƯỚC KHI SỬA TỆP NÀY
 * ---------------------------------------------------------------------------
 * "Không đệm ảnh nhỏ" (BB-311) giờ đi xa hơn một bước: ảnh nhỏ (w<=800)
 * KHÔNG còn gọi Drive từ hàm Vercel theo đường MẶC ĐỊNH nữa — route điều
 * hướng 302 thẳng sang lh3.googleusercontent.com, trình duyệt khách tự kéo
 * ảnh từ Google, hàm Vercel không hề chạm byte ảnh. `soLuotGoiDrive` do đó
 * phải là 0 cho ca mặc định. Đường GỌI DRIVE cũ (không đệm, mỗi lượt gọi
 * lại) vẫn còn — nhưng giờ chỉ chạy khi trình duyệt tự thêm `?qua=1` (lh3
 * lỗi ở phía khách, xem `luoi-anh.tsx`/`photo-lightbox.tsx`), xem
 * `tests/security/bb-314-anh-nho-lh3.test.ts` cho phần điều hướng.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { pngGiaHopLe } from "../fixtures/anh-gia";
vi.mock("server-only", () => ({}));

// BB-311: chốt "không ghi đệm khi đang chạy phép thử" (kiem-thu.ts) mặc định
// chặn CẢ phép thử này — nó CỐ Ý ghi đệm thật (fixture, dọn ở afterAll) để
// canh hành vi "chỉ gọi Drive một lần rồi nhớ". Cờ thoát này đã tồn tại từ
// trước cho đúng mục đích: phép thử giả lập biên giới mạng (driveFetch) rồi
// tự xin đi qua chốt. Không đặt cờ này thì mọi lượt gọi đều là "lần đầu" (đệm
// không bao giờ được ghi) và bài kiểm chính của tệp này (chỉ gọi Drive 1 lần)
// sẽ luôn đỏ.
process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-137 ${runId}`;

describe("BB-137 / BB-311: ảnh nhỏ KHÔNG đệm, ảnh bìa VẪN đệm", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anh = "";
  let soLuotGoiDrive = 0;

  const goi = (photoId: string, w: number) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?w=${w}`), {
      params: Promise.resolve({ photoId }),
    });

  // BB-314: ép route đi qua đường proxy cũ (bỏ qua điều hướng 302 sang lh3) —
  // đúng như trình duyệt tự làm khi lh3 lỗi.
  const goiQua = (photoId: string, w: number) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?w=${w}&qua=1`), {
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
      exp: 0, permissions: quyenCuaVai("owner"), } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
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

    // BB-311: /api/img giờ CHỈ đệm ẢNH BÌA (w>=1600 KHÔNG đủ — phải đúng
    // galleries.cover_photo_id, xem tests/unit/bb-311-chi-dem-anh-bia.test.ts).
    // Ca "BB-137 vẫn đúng cho ẢNH BÌA" bên dưới cần đúng ảnh này LÀ bìa.
    await client.query("update galleries set cover_photo_id = $1 where id = $2", [anh, bo]);

    // Giả lập DUY NHẤT đường ra Google — thứ không nên gọi thật trong phép thử,
    // và cũng chính là thứ cần ĐẾM. Tầng xét quyền giữ nguyên đồ thật.
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      soLuotGoiDrive += 1;
      return new Response(pngGiaHopLe(), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });
  });

  afterAll(async () => {
    const admin = (await import("@/lib/supabase/admin")).createAdminClient();
    await admin.storage.from("thumbnails").remove([`${anh}/1600.jpg`, `${anh}/1600.webp`]);
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  it("BB-314: ảnh NHỎ mặc định (w=200, lưới) điều hướng 302 sang lh3 — KHÔNG gọi Drive từ hàm Vercel", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);

    soLuotGoiDrive = 0;
    const lan1 = await goi(anh, 200);
    expect(lan1.status).toBe(302);
    expect(lan1.headers.get("Location")).toContain("lh3.googleusercontent.com");
    expect(soLuotGoiDrive).toBe(0);

    const lan2 = await goi(anh, 200);
    expect(lan2.status).toBe(302);
    expect(soLuotGoiDrive).toBe(0);
  });

  it("BB-311/BB-314: ảnh NHỎ qua fallback proxy (?qua=1, lh3 lỗi ở khách) gọi Drive MỖI lần xem — không đệm nữa", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);

    soLuotGoiDrive = 0;
    const lan1 = await goiQua(anh, 200);
    expect(lan1.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);

    const lan2 = await goiQua(anh, 200);
    expect(lan2.status).toBe(200);
    // ĐẢO NGƯỢC so với BB-137 gốc: đây chính là ý nghĩa của quyết định "không
    // đệm ảnh nhỏ" (BB-311 mục A) — mỗi lượt xem gọi lại Drive, không tích luỹ
    // vào Storage. BB-314 chỉ đổi ĐƯỜNG VÀO (mặc định giờ là 302, đường proxy
    // cũ này chỉ còn chạy qua `?qua=1`) — hành vi KHÔNG ĐỆM bên trong đường
    // proxy giữ nguyên.
    expect(soLuotGoiDrive).toBe(2);

    const lan3 = await goiQua(anh, 200);
    expect(lan3.status).toBe(200);
    expect(soLuotGoiDrive).toBe(3);
  });

  it("BB-137 (vẫn đúng cho ẢNH BÌA, w=1600): lần đầu gọi Drive, lần hai KHÔNG gọi nữa", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);

    soLuotGoiDrive = 0;
    const lan1 = await goi(anh, 1600);
    expect(lan1.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);

    const lan2 = await goi(anh, 1600);
    expect(lan2.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);

    const lan3 = await goi(anh, 1600);
    expect(lan3.status).toBe(200);
    expect(soLuotGoiDrive).toBe(1);
  });

  it("Ảnh BÌA đã nằm trong bộ nhớ đệm VẪN bị chặn khi không có phiên", async () => {
    khongPhaiNhanVien();
    phienKhach(bo);
    await goi(anh, 1600); // chắc chắn đã có trong đệm

    khongCoPhien();
    const res = await goi(anh, 1600);
    expect(res.status).toBe(403);
  });

  it("Phiên của bộ ảnh KHÁC vẫn không lấy được ảnh bìa trong đệm", async () => {
    khongPhaiNhanVien();
    phienKhach("00000000-0000-4000-8000-000000000999");
    const res = await goi(anh, 1600);
    expect(res.status).toBe(403);
  });
});
