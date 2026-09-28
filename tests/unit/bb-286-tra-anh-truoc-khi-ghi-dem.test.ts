/**
 * BB-286 (a) — `/api/img/[photoId]` phải TRẢ ẢNH trước khi ghi xong bộ đệm.
 *
 * Trước bản vá: route `await storage.upload(...)` TRƯỚC KHI trả ảnh, nên lần
 * đầu mở một bộ ảnh mới toanh (chưa có gì trong đệm) khách phải đợi CẢ lượt
 * kéo Drive LẪN lượt ghi Storage mới thấy ảnh — đúng lúc quan trọng nhất
 * (xem báo cáo vận hành 27/09/2026 §4.2, §4.3 "Ngoài ra khi bộ đệm chưa có,
 * lệnh `upload` vào bộ đệm được CHỜ XONG rồi mới trả ảnh").
 *
 * Cách canh: thay `after()` (next/server) bằng một bản ghi lại lời gọi, KHÔNG
 * tự chạy ngay — mô phỏng đúng điều Storage "chậm" nghĩa là gì: việc ghi đệm
 * chưa xảy ra tại thời điểm phản hồi đã trả về. Sau đó tự tay "đến lượt" gọi
 * callback đã ghi lại và xác nhận ảnh MỚI xuất hiện trong đệm lúc đó, không
 * sớm hơn.
 *
 * Google Drive bị giả lập (`driveClient.driveFetch`), đúng ranh giới đã dùng ở
 * `tests/unit/bb-137-cache-anh-nho.test.ts`. Cơ sở dữ liệu và Storage là bb-dev
 * thật (chỉ đọc/ghi đúng fixture, dọn sạch ở afterAll) — cùng khuôn với
 * BB-137, vì route này gọi thẳng `createAdminClient()`, không nhận client qua
 * tham số.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): bỏ khối `after(async () =>
 * {...})` trong `src/app/api/img/[photoId]/route.ts`, quay lại
 * `await storage.upload(...)` như cũ → ca "trả ảnh xong mà đệm CHƯA có gì"
 * phải ĐỎ, vì lúc đó đệm đã có sẵn (ghi trước khi trả).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { pngGiaHopLe } from "../fixtures/anh-gia";

vi.mock("server-only", () => ({}));

// BB-311: chốt "không ghi đệm khi đang chạy phép thử" chặn CẢ phép thử này
// theo mặc định — nó CỐ Ý ghi vào đệm thật (fixture riêng, dọn ở afterAll) để
// canh đúng THỜI ĐIỂM ghi. Xin đi qua bằng cờ thoát đã có sẵn trong
// kiem-thu.ts (biên giới mạng driveFetch đã bị giả lập ngay dưới đây).
process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

const capturedAfter = vi.hoisted(() => [] as Array<() => void | Promise<void>>);

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (cb: () => void | Promise<void>) => {
      capturedAfter.push(cb);
    },
  };
});

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-286 ${runId}`;

describe("BB-286(a): /api/img trả ảnh TRƯỚC KHI ghi xong bộ đệm", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anh = "";
  // BB-311: chỉ ảnh BÌA (w>=1600) mới đi qua đệm — đổi từ 800 sang 1600,
  // đúng khuôn "canh thời điểm ghi đệm" vẫn giữ nguyên ý nghĩa gốc.
  const cachePath = () => `${anh}/1600.jpg`;

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
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb286-${runId}`],
    );
    bo = g[0].id;

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
      [bo, `fixture-bb286-file-${runId}`],
    );
    anh = p[0].id;

    // BB-311: /api/img giờ CHỈ đệm ẢNH BÌA (w>=1600 KHÔNG đủ một mình — phải
    // đúng galleries.cover_photo_id). Đánh dấu ảnh fixture này LÀ bìa để phép
    // thử "canh thời điểm ghi đệm" còn đúng ý nghĩa.
    await client.query("update galleries set cover_photo_id = $1 where id = $2", [anh, bo]);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    await admin.storage.from("thumbnails").remove([cachePath()]);
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  beforeEach(() => {
    capturedAfter.length = 0;
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo,
      customerId: "",
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000000286",
      selectionId: "",
      exp: 0,
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(pngGiaHopLe(), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });
  });

  it("Phản hồi trả về TRƯỚC KHI ghi đệm; đệm chỉ có ảnh SAU KHI việc nền chạy xong", async () => {
    const admin = createAdminClient();
    // Chắc chắn đệm đang rỗng trước khi bắt đầu.
    await admin.storage.from("thumbnails").remove([cachePath()]);

    const res = await layAnh(new Request(`http://localhost/api/img/${anh}?w=1600`), {
      params: Promise.resolve({ photoId: anh }),
    });

    expect(res.status).toBe(200);
    // Việc ghi đệm đã được ĐĂNG KÝ chạy nền (after()), không chạy ngay trong
    // lúc xử lý yêu cầu.
    expect(capturedAfter.length).toBe(1);

    // Tại đúng thời điểm phản hồi đã trả về, đệm CHƯA có gì — đây là toàn bộ
    // ý nghĩa của (a): khách không phải đợi bước ghi đệm.
    const truocKhiChayNen = await admin.storage.from("thumbnails").download(cachePath());
    expect(truocKhiChayNen.data).toBeNull();

    // Giả lập "tới lượt" việc nền chạy (đây là lúc Next.js thật sự gọi sau khi
    // phản hồi đã rời máy chủ).
    await capturedAfter[0]!();

    // Bây giờ, và chỉ bây giờ, đệm mới có ảnh.
    const sauKhiChayNen = await admin.storage.from("thumbnails").download(cachePath());
    expect(sauKhiChayNen.data).not.toBeNull();
  });

  it("Ảnh gốc (?tai=1) KHÔNG bao giờ được ghi vào đệm, kể cả chạy nền", async () => {
    const res = await layAnh(new Request(`http://localhost/api/img/${anh}?tai=1`), {
      params: Promise.resolve({ photoId: anh }),
    });
    expect(res.status).toBe(200);
    // Không có việc nền nào được đăng ký cho đường tải ảnh gốc.
    expect(capturedAfter.length).toBe(0);
  });
});
