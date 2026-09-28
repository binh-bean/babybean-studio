/**
 * BB-311 (P0, mục 1a) — chốt "không ghi đệm khi đang chạy phép thử"
 * (`khongGhiDemPhepThu()`, `src/lib/kiem-thu.ts`), kiểm ở CẢ HAI nơi gọi:
 * `/api/img/[photoId]/route.ts` và `src/lib/drive/lam-nong-cache.ts`.
 *
 * KHÔNG đặt `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU` trong tệp này (khác các tệp
 * BB-137/BB-286 đã có) — đây chính là kịch bản mặc định của một phép thử
 * bình thường, đúng thứ từng ghi đè 42 ảnh thật hôm 28/09/2026.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao):
 *  · Xoá dòng `const boQuaGhiDem = khongGhiDemPhepThu();` (và nhánh dùng nó)
 *    trong `src/app/api/img/[photoId]/route.ts`, quay lại gọi `after(ghiVaoDem)`
 *    vô điều kiện → ca "route KHÔNG đăng ký ghi đệm khi đang phép thử" phải ĐỎ.
 *  · Xoá điều kiện `if (khongGhiDemPhepThu()) return ...` trong `nongMotAnh`
 *    (`src/lib/drive/lam-nong-cache.ts`) → ca "lamNongMotLo KHÔNG ghi đệm khi
 *    đang phép thử" phải ĐỎ (uploadCalls sẽ không còn rỗng).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

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

import { khongGhiDemPhepThu, dangChayPhepThu } from "@/lib/kiem-thu";
import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as driveClient from "@/lib/drive/client";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { lamNongMotLo, CO_ANH_LAM_NONG } from "@/lib/drive/lam-nong-cache";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { pngGiaHopLe } from "../fixtures/anh-gia";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-311 ${runId}`;

describe("khongGhiDemPhepThu() — điều kiện thuần", () => {
  it("true khi đang chạy Vitest (mặc định, không có cờ thoát nào)", () => {
    expect(dangChayPhepThu()).toBe(true); // môi trường vitest của chính tệp này
    expect(khongGhiDemPhepThu()).toBe(true);
  });

  it("true khi PHEP_THU_TRINH_DUYET=1, kể cả nếu dangChayPhepThu() bị thoát", () => {
    const cu = process.env.PHEP_THU_TRINH_DUYET;
    const cuThoat = process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1"; // tắt dangChayPhepThu()
    process.env.PHEP_THU_TRINH_DUYET = "1";
    try {
      expect(dangChayPhepThu()).toBe(false);
      expect(khongGhiDemPhepThu()).toBe(true); // vẫn true nhờ PHEP_THU_TRINH_DUYET
    } finally {
      if (cu === undefined) delete process.env.PHEP_THU_TRINH_DUYET;
      else process.env.PHEP_THU_TRINH_DUYET = cu;
      if (cuThoat === undefined) delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
      else process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = cuThoat;
    }
  });

  it("false khi cả hai điều kiện đều tắt (mô phỏng máy chủ thật)", () => {
    const cuThoat = process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
    const cuPhep = process.env.PHEP_THU_TRINH_DUYET;
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    delete process.env.PHEP_THU_TRINH_DUYET;
    try {
      expect(khongGhiDemPhepThu()).toBe(false);
    } finally {
      if (cuThoat === undefined) delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
      else process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = cuThoat;
      if (cuPhep === undefined) delete process.env.PHEP_THU_TRINH_DUYET;
      else process.env.PHEP_THU_TRINH_DUYET = cuPhep;
    }
  });
});

describe("/api/img — KHÔNG đăng ký ghi đệm khi đang chạy phép thử (mặc định, không cờ thoát)", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let bo = "";
  let anh = "";
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
      [branchId, khach, `${NHAN} Bộ`, `fixture-bb311-${runId}`],
    );
    bo = g[0].id;

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
      [bo, `fixture-bb311-file-${runId}`],
    );
    anh = p[0].id;
  });

  afterAll(async () => {
    const admin = createAdminClient();
    await admin.storage.from("thumbnails").remove([cachePath()]);
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  it("driveFetch trả ảnh hợp lệ, nhưng after(ghiVaoDem) KHÔNG bao giờ được gọi, đệm vẫn rỗng", async () => {
    capturedAfter.length = 0;
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo,
      customerId: "",
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000003110",
      selectionId: "",
      exp: 0,
      permissions: quyenCuaVai("owner"),
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(pngGiaHopLe(800, 533, 20_000), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const res = await layAnh(new Request(`http://localhost/api/img/${anh}?w=1600`), {
      params: Promise.resolve({ photoId: anh }),
    });

    expect(res.status).toBe(200); // khách vẫn nhận được ảnh bình thường
    // ĐÂY là toàn bộ ý nghĩa của kiểm ngược này: route KHÔNG đăng ký việc ghi
    // đệm chạy nền khi đang trong phép thử — khác hẳn BB-286 (đăng ký nhưng
    // hoãn), ở đây KHÔNG đăng ký gì cả.
    expect(capturedAfter.length).toBe(0);

    const admin = createAdminClient();
    const sauKhiGoi = await admin.storage.from("thumbnails").download(cachePath());
    expect(sauKhiGoi.data).toBeNull();
  });
});

describe("lamNongMotLo — KHÔNG ghi đệm khi đang chạy phép thử (mặc định, không cờ thoát)", () => {
  it("driveFetch trả ảnh hợp lệ, nhưng storage.upload KHÔNG bao giờ được gọi", async () => {
    const anh = { id: "anh-p0-1", drive_file_id: "file-p0-1", sort_index: 1 };
    const uploadCalls: string[] = [];
    const client = {
      from(bang: string) {
        if (bang === "galleries") {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo_count: 1 }, error: null }) }) }) };
        }
        if (bang === "photos") {
          const builder = {
            select: () => builder,
            eq: () => builder,
            gt: () => builder,
            order: () => builder,
            limit: async () => ({ data: [anh], error: null }),
          };
          return builder;
        }
        throw new Error(`bảng không mong đợi: ${bang}`);
      },
      storage: {
        from(bucket: string) {
          if (bucket !== "thumbnails") throw new Error(`bucket không mong đợi: ${bucket}`);
          return {
            list: async () => ({ data: [], error: null }), // chưa có trong đệm
            upload: async (path: string) => {
              uploadCalls.push(path);
              return { error: null };
            },
            createBucket: async () => ({ error: null }),
          };
        },
      },
    } as unknown as SupabaseClient;

    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(pngGiaHopLe(800, 533, 20_000), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const kq = await lamNongMotLo(client, "bo-p0", 0, "req-p0", CO_ANH_LAM_NONG);

    expect(uploadCalls).toEqual([]); // ĐÂY là toàn bộ ý nghĩa của kiểm ngược này
    expect(kq.soMoiNongLoNay).toBe(0);
    expect(kq.soLoiLoNay).toBe(1); // bị chốt chặn -> tính là "lỗi", thử lại lượt sau
  });
});
