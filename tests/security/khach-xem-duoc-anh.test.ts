/**
 * Khách phải xem được ảnh CỦA MÌNH — và chỉ của mình.
 *
 * OWNER: PM. Task BB-133.
 *
 * ---------------------------------------------------------------------------
 * Lỗ hổng này chặn toàn bộ dự án, và nấp sau một dòng TODO
 * ---------------------------------------------------------------------------
 * `/api/img/[photoId]` chỉ nhận đăng nhập NHÂN VIÊN. Phần dành cho khách là
 * một dòng `TODO(BB-030)` kèm chú thích "tạm thời, nhân viên không đăng nhập
 * được thì chặn".
 *
 * Màn khách nạp MỌI tấm ảnh qua đúng đường đó — cả ảnh nhỏ lẫn ảnh lớn. Nên
 * ba mẹ mở link ra sẽ thấy **không một tấm nào**: 403 toàn bộ, không có tấm
 * nào để chọn, và cũng không có thông báo nào giải thích.
 *
 * Không phép thử nào đỏ. Không màn hình nào vỡ lúc dựng. `npm run build` chạy
 * được. Nó chỉ lộ ra vào đúng giây phút gửi link đầu tiên cho khách thật —
 * và lúc đó người phát hiện là phụ huynh, không phải studio.
 *
 * Vì thế phép thử ở đây canh CẢ HAI chiều: khách xem được ảnh của mình, và
 * KHÔNG xem được ảnh của nhà khác.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

// KHÔNG giả lập máy khách cơ sở dữ liệu nữa.
//
// Bản đầu của phép thử này giả lập createServerClient() thành máy khách quản
// trị "để đo luật xét quyền, không đo cách lấy cookie". Nó XANH — và che mất
// đúng lỗi làm hỏng mọi thứ: route thật dùng máy khách theo phiên Supabase,
// mà khách hàng không có phiên Supabase, nên RLS chặn sạch và mọi tấm ảnh trả
// 404. Giả lập đã thay chính cái đang hỏng bằng một cái chạy được.
//
// Lỗi chỉ lộ ra khi mở thật một bộ ảnh bằng link khách. Giờ route dùng máy
// khách quản trị thẳng, và phép thử chạy đúng đường thật.

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

describe("BB-133: khách xem được ảnh của mình, không xem được của nhà khác", () => {
  let client: Client;
  let branchId: string;
  let khachA = "";
  let khachB = "";
  let boA = "";
  let boB = "";
  let anhA = "";
  let anhB = "";

  const goi = (photoId: string) =>
    layAnh(new Request(`http://localhost/api/img/${photoId}?w=200`), {
      params: Promise.resolve({ photoId }),
    });

  /** Không đăng nhập được bằng tài khoản nhân viên — đúng cảnh của khách. */
  function khongPhaiNhanVien() {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
  }

  function phienKhach(s: { galleryId?: string; customerId?: string }) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: s.galleryId ?? "",
      customerId: s.customerId ?? "",
      role: "owner",
      shareLinkId: "00000000-0000-4000-8000-000000000133",
      selectionId: "",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  function khongCoPhien() {
    vi.spyOn(gallerySession, "requireGallerySession").mockRejectedValue(
      new gallerySession.GallerySessionError("UNAUTHENTICATED"),
    );
  }

  const maLoi = async (res: Response) => {
    const j = await res.json().catch(() => null);
    if (j?.error?.code === "INTERNAL") console.error("THAN LOI:", JSON.stringify(j));
    return j?.error?.code ?? null;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const dung = async (ten: string) => {
      const { rows: c } = await client.query(
        `insert into customers (branch_id, full_name)
         values ($1,$2) returning id`,
        [branchId, `Fixture BB-133 Khách ${ten}`],
      );
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',1) returning id`,
        [branchId, c[0].id, `Fixture BB-133 ${ten}`, `fixture-bb133-${ten}-${Date.now()}`],
      );
      const { rows: p } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,'anh.jpg','image/jpeg',1,'active') returning id`,
        [g[0].id, `fixture-bb133-file-${ten}-${Date.now()}`],
      );
      return { khach: c[0].id as string, bo: g[0].id as string, anh: p[0].id as string };
    };

    const a = await dung("A");
    const b = await dung("B");
    khachA = a.khach; boA = a.bo; anhA = a.anh;
    khachB = b.khach; boB = b.bo; anhB = b.anh;
  });

  afterAll(async () => {
    await client.query("delete from photos where gallery_id = any($1)", [[boA, boB]]);
    await client.query("delete from galleries where id = any($1)", [[boA, boB]]);
    await client.query("delete from customers where id = any($1)", [[khachA, khachB]]);
    await client.end();
  });

  it("1. Link theo bộ ảnh: khách XEM ĐƯỢC ảnh của bộ mình", async () => {
    // Đây chính là ca đã hỏng. Không đòi ảnh về thật (Drive không có tệp giả
    // này) — chỉ đòi KHÔNG bị chặn quyền. Qua được cửa là đủ.
    khongPhaiNhanVien();
    phienKhach({ galleryId: boA });
    expect(await maLoi(await goi(anhA))).not.toBe("FORBIDDEN");
  });

  it("2. Link theo bộ ảnh: KHÔNG xem được ảnh của nhà khác", async () => {
    khongPhaiNhanVien();
    phienKhach({ galleryId: boA });
    expect(await maLoi(await goi(anhB))).toBe("FORBIDDEN");
  });

  it("3. Cổng khách: xem được ảnh của mọi bộ THUỘC VỀ MÌNH", async () => {
    khongPhaiNhanVien();
    phienKhach({ customerId: khachA });
    expect(await maLoi(await goi(anhA))).not.toBe("FORBIDDEN");
  });

  it("4. Cổng khách: KHÔNG xem được ảnh của khách khác", async () => {
    khongPhaiNhanVien();
    phienKhach({ customerId: khachA });
    expect(await maLoi(await goi(anhB))).toBe("FORBIDDEN");
  });

  it("5. Phiên rỗng cả hai đầu -> chặn", async () => {
    // Phiên không trỏ vào bộ ảnh nào mà cũng không có khách — link hỏng, hoặc
    // phiên cũ còn sót.
    //
    // NÓI RÕ ca này chứng minh tới đâu: nó chỉ chứng minh phiên rỗng bị chặn.
    // Nó KHÔNG chạm tới chốt `!!session.customerId` trong route, vì để chạm
    // được thì `galleries.customer_id` phải rỗng — mà đó là cột BẮT BUỘC, nên
    // không dựng nổi dữ liệu như vậy.
    //
    // Chốt `!!` ấy vì thế là phòng xa cho ngày cột đó được nới thành cho phép
    // rỗng, và hôm nay không phép thử nào canh nó. Ghi ra đây thay vì để
    // người đọc sau tưởng ca này đang canh.
    khongPhaiNhanVien();
    phienKhach({ customerId: "", galleryId: "" });
    expect(await maLoi(await goi(anhA))).toBe("FORBIDDEN");
  });

  it("6. Không có phiên nào -> chặn", async () => {
    khongPhaiNhanVien();
    khongCoPhien();
    expect(await maLoi(await goi(anhA))).toBe("FORBIDDEN");
  });
});
