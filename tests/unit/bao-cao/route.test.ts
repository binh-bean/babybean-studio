/**
 * BB-260 — GET /api/admin/bao-cao/[ma]: quyền, lỗi query, cách ly chi nhánh,
 * và hai báo cáo đầu đếm đúng CHÊNH LỆCH khi thêm bộ Fixture.
 *
 * ---------------------------------------------------------------------------
 * Vì sao "đếm đúng chênh lệch" ở đây nghĩa là chênh lệch = 0
 * ---------------------------------------------------------------------------
 * Brief BB-260 bắt buộc mọi báo cáo loại bộ ảnh `title like 'Fixture%'` khỏi
 * số liệu (AGENTS.md §6: dữ liệu mẫu chỉ được là dữ liệu giả, và phải loại
 * được khỏi số liệu thật). Test tạo bộ ảnh Fixture trong một Ô THỜI GIAN CÔ
 * LẬP (năm 2099, chắc chắn không có dữ liệu thật), rồi khẳng định con số
 * KHÔNG đổi trước/sau khi thêm — nếu ai đó bỏ `locBoAnhThat()` khỏi báo cáo,
 * test này đỏ ngay vì con số sẽ nhảy từ 0 lên 1.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { phienGiaLap } from "../../fixtures/phien-nhan-su";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/bao-cao/[ma]/route";
import { GET as GET_DANH_SACH } from "@/app/api/admin/bao-cao/route";

const KY_COLAP = { tu: "2099-01-01", den: "2099-01-07" };

function call(ma: string, qs = "") {
  return GET(new Request(`http://localhost/api/admin/bao-cao/${ma}?${qs}`), {
    params: Promise.resolve({ ma }),
  });
}

function asStaff(vai: Parameters<typeof phienGiaLap>[0], branchIds: string[]) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap(vai, branchIds));
}

describe("BB-260: GET /api/admin/bao-cao (danh sách)", () => {
  it("chỉ liệt kê báo cáo mà bộ quyền của nhân viên có", async () => {
    asStaff("photoshop_ctv", []);
    const body = await (await GET_DANH_SACH()).json();
    expect(body.data.danhSach).toEqual([]);
  });

  it("nhân viên có reports:operations thấy hai báo cáo BB-260", async () => {
    asStaff("cs", ["00000000-0000-0000-0000-000000000000"]);
    const body = await (await GET_DANH_SACH()).json();
    const ma = body.data.danhSach.map((b: { ma: string }) => b.ma);
    expect(ma).toContain("tien-do-chon-anh");
    expect(ma).toContain("hau-ky-canh-bao");
  });
});

describe("BB-260: GET /api/admin/bao-cao/[ma] — quyền và lỗi cơ bản", () => {
  it("mã báo cáo lạ -> 404, không phải 500", async () => {
    asStaff("owner", []);
    const res = await call("khong-ton-tai");
    expect(res.status).toBe(404);
  });

  it("không có quyền reports:operations -> 403", async () => {
    asStaff("photoshop_ctv", []);
    const res = await call("tien-do-chon-anh");
    expect(res.status).toBe(403);
  });

  it("nhom sai giá trị enum -> 400, không phải 500", async () => {
    asStaff("owner", []);
    const res = await call("tien-do-chon-anh", "nhom=nam");
    expect(res.status).toBe(400);
  });

  it("ngày tu sai định dạng -> 400, không phải 500", async () => {
    asStaff("owner", []);
    const res = await call("tien-do-chon-anh", "tu=15-03-2026&den=2026-03-20");
    expect(res.status).toBe(400);
  });

  it("tu sau den -> 400", async () => {
    asStaff("owner", []);
    const res = await call("tien-do-chon-anh", "tu=2026-03-20&den=2026-03-01");
    expect(res.status).toBe(400);
  });

  it("chiNhanh không phải UUID -> 400", async () => {
    asStaff("owner", []);
    const res = await call("tien-do-chon-anh", "chiNhanh=khong-phai-uuid");
    expect(res.status).toBe(400);
  });
});

describe("BB-260: hai báo cáo — cách ly chi nhánh và chênh lệch Fixture", () => {
  let client: Client;
  let branchA: string;
  let branchB: string;
  const donDep: { table: string; id: string }[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select id from branches order by name limit 2");
    branchA = rows[0].id;
    branchB = rows[1].id;
  });

  afterAll(async () => {
    for (const d of donDep.reverse()) {
      await client.query(`delete from ${d.table} where id = $1`, [d.id]);
    }
    await client.end();
  });

  async function taoFixtureGallery(opts: {
    branchId: string;
    sentAt?: string;
    submittedAt?: string;
    larkTrangThai?: string;
    status?: string;
  }) {
    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, 'Fixture BB-260 Khách') returning id`,
      [opts.branchId],
    );
    donDep.push({ table: "customers", id: cust[0].id });
    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
          included_quota, extra_photo_price, sent_at, submitted_at, lark_trang_thai)
       values ($1,$2,'Fixture BB-260',$3,$4,'https://example.com/x',2,50000,$5,$6,$7)
       returning id`,
      [
        opts.branchId,
        cust[0].id,
        opts.status ?? "in_review",
        `fixture-bb260-${Date.now()}-${Math.random()}`,
        opts.sentAt ?? null,
        opts.submittedAt ?? null,
        opts.larkTrangThai ?? null,
      ],
    );
    donDep.push({ table: "galleries", id: gal[0].id });
    return gal[0].id as string;
  }

  it("1. Quản lý chi nhánh A không thấy dòng chi nhánh B trong bảng", async () => {
    asStaff("branch_manager", [branchA]);
    const res = await call("tien-do-chon-anh", "chiNhanh=" + branchB);
    expect(res.status).toBe(403);
  });

  it("2. Không truyền chiNhanh: bảng chỉ có chi nhánh nhân viên được gán", async () => {
    asStaff("branch_manager", [branchA]);
    const body = await (await call("tien-do-chon-anh")).json();
    const tenChiNhanh: string[] = body.data.ketQua.bang.dong.map((d: unknown[]) => d[0]);
    // Bảng chỉ dựng từ branchIds được gán -> đúng 1 dòng (branchA).
    expect(tenChiNhanh).toHaveLength(1);
  });

  it("3. tien-do-chon-anh: thêm bộ Fixture 'đã gửi link' trong ô thời gian cô lập KHÔNG làm đổi con số", async () => {
    asStaff("owner", [branchA, branchB]);
    const qs = `tu=${KY_COLAP.tu}&den=${KY_COLAP.den}&chiNhanh=${branchA}`;

    const truoc = await (await call("tien-do-chon-anh", qs)).json();
    const guiLinkTruoc = truoc.data.ketQua.theSo.find((t: { nhan: string }) => t.nhan === "Đã gửi link")
      .giaTri as number;

    await taoFixtureGallery({ branchId: branchA, sentAt: "2099-01-03T03:00:00Z" });

    const sau = await (await call("tien-do-chon-anh", qs)).json();
    const guiLinkSau = sau.data.ketQua.theSo.find((t: { nhan: string }) => t.nhan === "Đã gửi link")
      .giaTri as number;

    expect(guiLinkSau).toBe(guiLinkTruoc);
    expect(guiLinkTruoc).toBe(0); // ô thời gian 2099 cô lập, chắc chắn rỗng lúc bắt đầu.
  });

  it("4. hau-ky-canh-bao: thêm bộ Fixture với giai đoạn Lark KHÔNG làm đổi số theo giai đoạn", async () => {
    asStaff("owner", [branchA, branchB]);
    const qs = `tu=${KY_COLAP.tu}&den=${KY_COLAP.den}&chiNhanh=${branchA}`;

    const truoc = await (await call("hau-ky-canh-bao", qs)).json();
    const dangLamTruoc = truoc.data.ketQua.theSo.find((t: { nhan: string }) => t.nhan === "Chỉnh").giaTri as number;

    // optmhzW4sL = giai đoạn 3 "Đang làm" -> nhóm "Chỉnh".
    await taoFixtureGallery({ branchId: branchA, larkTrangThai: "optmhzW4sL" });

    const sau = await (await call("hau-ky-canh-bao", qs)).json();
    const dangLamSau = sau.data.ketQua.theSo.find((t: { nhan: string }) => t.nhan === "Chỉnh").giaTri as number;

    expect(dangLamSau).toBe(dangLamTruoc);
  });

  it("5. Xuất CSV: có Content-Disposition tải tệp, thân trả về bắt đầu bằng BOM", async () => {
    asStaff("owner", [branchA, branchB]);
    const res = await call("tien-do-chon-anh", "dinhDang=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    // `Response.text()` tự strip BOM khi giải mã UTF-8 (theo spec WHATWG
    // TextDecoder) — phải đọc BYTE THÔ qua arrayBuffer() mới thấy BOM thật sự
    // có nằm trong thân trả về hay không.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
