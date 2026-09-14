/**
 * BB-130 — cổng khách: một link, nhiều buổi chụp.
 *
 * Migration `0010` đổi link sang "một link một KHÁCH HÀNG" làm địa chỉ vĩnh
 * viễn, nhưng nửa còn lại chưa làm: link theo khách mint ra phiên có
 * `galleryId` RỖNG và không tạo lượt chọn. Gửi link đó cho ba mẹ là gửi một
 * đường dẫn mở ra lỗi.
 *
 * Phép thử ĐI HẾT ĐƯỜNG, đúng thứ tự ba mẹ thật sẽ đi:
 *
 *   tạo link theo khách → đăng nhập bằng chính mã đó → xem danh sách buổi
 *   chụp → bấm vào một buổi → phiên trỏ đúng bộ ảnh và có lượt chọn.
 *
 * Điều đáng canh nhất nằm ở ca 3 và ca 6: khách A KHÔNG được thấy, và KHÔNG
 * được mở, buổi chụp của khách B. Cả hai ca đều đi qua đúng cái điều kiện lọc
 * `customer_id` trong `api/g/buoi-chup/route.ts` — bỏ điều kiện đó ra thì hai
 * ca này phải đỏ.
 *
 * Dữ liệu đều là dữ liệu giả, tự dựng trong tệp này. Kho mã nguồn công khai —
 * xem AGENTS.md §6.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST as dangNhap } from "@/app/api/auth/gallery/route";
import {
  SESSION_COOKIE,
  verifyGallerySession,
  signGallerySession,
} from "@/lib/auth/gallery-session";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN_FIXTURE = `Fixture BB-130 ${runId}`;

describe("BB-130: cổng khách, một link nhiều buổi chụp", () => {
  let client: Client;
  let branchId: string;

  let khachA: string;
  let khachB: string;

  /** Ba buổi chụp của khách A: hai buổi có ảnh, một buổi chưa có tấm nào. */
  let buoiA1: string;
  let buoiA2: string;
  let buoiTrong: string;
  /** Buổi chụp của khách B — khách A không bao giờ được thấy. */
  let buoiB: string;

  let maLinkA: string;
  let linkAId: string;

  const bam = (s: string) => createHash("sha256").update(s).digest("hex");

  /**
   * Mỗi lần chạy một dải IP riêng kết hợp PID. Bộ giới hạn tần suất đếm theo IP trong 15
   * phút, nên IP cố định mang sẵn lịch sử của lần chạy trước — đúng bệnh đã
   * ghi trong tests/security/gallery-auth.test.ts.
   */
  const ipRun = `10.${((process.pid ?? 1) % 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  let demIp = 0;

  async function themKhach(ten: string): Promise<string> {
    const { rows } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, $2) returning id`,
      [branchId, `${NHAN_FIXTURE} ${ten}`],
    );
    return rows[0].id;
  }

  /** Một buổi chụp = một dòng `shoots` + một dòng `galleries` trỏ vào nó. */
  async function themBuoiChup(
    customerId: string,
    ten: string,
    soAnh: number,
    ngay: string,
  ): Promise<string> {
    const { rows: s } = await client.query(
      `insert into shoots (branch_id, customer_id, shoot_date) values ($1,$2,$3) returning id`,
      [branchId, customerId, ngay],
    );
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, shoot_id, title, status,
                              drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,$3,$4,'ready',$5,'https://example.com/gia', $6)
       returning id`,
      [branchId, customerId, s[0].id, `${NHAN_FIXTURE} ${ten}`, `fixture-bb130-${randomUUID()}`, soAnh],
    );
    return g[0].id;
  }

  /** Link gắn theo KHÁCH: `customer_id` có giá trị, `gallery_id` để trống. */
  async function themLinkTheoKhach(customerId: string): Promise<{ ma: string; id: string }> {
    const ma = `bb130-${randomUUID()}`;
    const { rows } = await client.query(
      `insert into share_links (customer_id, token_hash, token_prefix, role, status, requires_pin)
       values ($1,$2,$3,'owner','active',false) returning id`,
      [customerId, bam(ma), ma.slice(0, 6)],
    );
    return { ma, id: rows[0].id };
  }

  /** Gọi đường đăng nhập như trình duyệt gọi, trả về cookie phiên đã ký. */
  async function dangNhapBangMa(ma: string): Promise<string> {
    demIp += 1;
    const res = await dangNhap(
      new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `${ipRun}.${demIp}`,
        },
        body: JSON.stringify({ token: ma }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(SESSION_COOKIE)?.value;
    expect(cookie).toBeTruthy();
    return cookie!;
  }

  /**
   * Mọi đường `/api/g/*` đọc phiên qua `cookies()` của next, mà hàm đó cần một
   * ngữ cảnh request thật. Ở đây giả lập đúng một việc: trả ra cookie đang
   * cầm. Không giả lập phần xác minh chữ ký — cookie vẫn là cookie thật do máy
   * chủ ký, nên nếu chữ ký sai thì phép thử vẫn đỏ.
   */
  function dungPhien(cookie: string): void {
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: (ten: string) => (ten === SESSION_COOKIE ? { value: cookie } : undefined) }),
    }));
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác của lần chạy TRƯỚC bị chết giữa chừng, nhưng CHỈ DỌN RÁC CŨ HƠN MỘT GIỜ.
    // Không bao giờ dọn theo tiền tố chung vì sẽ giẫm vào tiến trình khác đang chạy song song.
    await donDepRacCu(client);

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    if (!br[0]) throw new Error("Cần ít nhất một chi nhánh, chạy npm run db:seed trước");
    branchId = br[0].id;

    khachA = await themKhach("Khách A");
    khachB = await themKhach("Khách B");

    buoiA1 = await themBuoiChup(khachA, "A buổi đầy tháng", 12, "2026-03-01");
    buoiA2 = await themBuoiChup(khachA, "A buổi thôi nôi", 30, "2026-08-01");
    buoiTrong = await themBuoiChup(khachA, "A buổi chưa có ảnh", 0, "2026-09-01");
    buoiB = await themBuoiChup(khachB, "B buổi riêng", 9, "2026-05-01");

    const link = await themLinkTheoKhach(khachA);
    maLinkA = link.ma;
    linkAId = link.id;
  });

  afterAll(async () => {
    if (client) {
      await donDep(client);
      await client.end();
    }
  });

  /** Dọn rác chết dở của những lần chạy cũ hơn 1 giờ. */
  async function donDepRacCu(c: Client): Promise<void> {
    await c.query(
      `delete from share_links where customer_id in
         (select id from customers where full_name like 'Fixture BB-130%' and created_at < now() - interval '1 hour')`,
    );
    await c.query(
      `delete from galleries where title like 'Fixture BB-130%' and created_at < now() - interval '1 hour'`,
    );
    await c.query(
      `delete from shoots where customer_id in
         (select id from customers where full_name like 'Fixture BB-130%' and created_at < now() - interval '1 hour')`,
    );
    await c.query(
      `delete from customers where full_name like 'Fixture BB-130%' and created_at < now() - interval '1 hour'`,
    );
  }

  /** Dọn dẹp chỉ đúng nhãn của lần chạy này. */
  async function donDep(c: Client): Promise<void> {
    await c.query(
      `delete from share_links where customer_id in
         (select id from customers where full_name like $1)`,
      [`${NHAN_FIXTURE}%`],
    );
    await c.query("delete from galleries where title like $1", [`${NHAN_FIXTURE}%`]);
    // Buổi chụp phải đi trước khách: `shoots.customer_id` không cascade.
    await c.query(
      `delete from shoots where customer_id in
         (select id from customers where full_name like $1)`,
      [`${NHAN_FIXTURE}%`],
    );
    await c.query("delete from customers where full_name like $1", [`${NHAN_FIXTURE}%`]);
    // Nhật ký đăng nhập KHÔNG dọn ở đây: bộ đếm tần suất đọc theo IP, mà mỗi
    // lần chạy đã bốc một dải IP riêng nên không lần nào giẫm lên lần nào. Dọn
    // theo `action` thì xoá luôn nhật ký của tệp phép thử khác đang chạy cùng.
  }

  it("1. Link theo khách đăng nhập được, phiên mang customerId và chưa trỏ bộ ảnh nào", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    const phien = await verifyGallerySession(cookie);

    expect(phien?.customerId).toBe(khachA);
    // Chưa chọn buổi nào thì chưa có bộ ảnh — đây chính là trạng thái mà trước
    // BB-130 dẫn thẳng tới màn hình lỗi.
    expect(phien?.galleryId).toBe("");
    expect(phien?.shareLinkId).toBe(linkAId);
  });

  it("2. Danh sách trả đúng buổi chụp của khách, mới nhất trước, bộ trống thì ẩn", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { GET } = await import("@/app/api/g/buoi-chup/route");

    const json = await (await GET()).json();
    expect(json.data.theoKhach).toBe(true);

    const ids = json.data.buoiChup.map((b: { id: string }) => b.id);
    // Thôi nôi (01.08) chụp sau đầy tháng (01.03) nên đứng trước.
    expect(ids).toEqual([buoiA2, buoiA1]);

    // Bộ chưa có tấm nào KHÔNG được hiện: ba mẹ bấm vào thấy trang trắng là
    // gọi điện ngay.
    expect(ids).not.toContain(buoiTrong);

    const dauTien = json.data.buoiChup[0];
    expect(dauTien.soAnh).toBe(30);
    expect(dauTien.ngayChup).toContain("2026-08-01");
    // Nhãn viết cho ba mẹ đọc, không phải tên trạng thái trong máy.
    expect(dauTien.nhanTrangThai).toBe("Mời ba mẹ chọn ảnh");
  });

  it("3. Khách A KHÔNG thấy buổi chụp của khách B", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { GET } = await import("@/app/api/g/buoi-chup/route");

    const json = await (await GET()).json();
    const ids = json.data.buoiChup.map((b: { id: string }) => b.id);

    expect(ids).not.toContain(buoiB);
    // Đối chứng dương: buổi của chính khách A thì có, nên một danh sách rỗng
    // vì lý do khác không làm phép thử này xanh giả.
    expect(ids).toContain(buoiA1);
  });

  it("4. Chọn một buổi -> phiên trỏ đúng bộ ảnh và CÓ lượt chọn", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { POST } = await import("@/app/api/g/buoi-chup/route");

    const res = await POST(
      new Request("http://localhost/api/g/buoi-chup", {
        method: "POST",
        body: JSON.stringify({ buoiChupId: buoiA1 }),
      }),
    );
    expect(res.status).toBe(200);

    const cookieMoi = res.cookies.get(SESSION_COOKIE)?.value;
    expect(cookieMoi).toBeTruthy();

    const phien = await verifyGallerySession(cookieMoi!);
    expect(phien?.galleryId).toBe(buoiA1);
    // Khách vẫn là khách cũ — chọn buổi chụp không được đổi người.
    expect(phien?.customerId).toBe(khachA);
    expect(phien?.selectionId).toBeTruthy();

    const { rows } = await client.query(
      "select id, gallery_id from selections where share_link_id = $1 and gallery_id = $2",
      [linkAId, buoiA1],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(phien?.selectionId);
  });

  it("5. Chọn buổi THỨ HAI -> lượt chọn riêng, không đè lên buổi trước", async () => {
    // Đây là chỗ chỉ số cũ `uq_selections_share_link` (một lượt chọn cho một
    // link) làm hỏng: buổi thứ hai đâm vào lỗi trùng khoá. Migration 0040 nới
    // thành (link, bộ ảnh).
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { POST } = await import("@/app/api/g/buoi-chup/route");

    const goi = async (id: string) =>
      POST(
        new Request("http://localhost/api/g/buoi-chup", {
          method: "POST",
          body: JSON.stringify({ buoiChupId: id }),
        }),
      );

    expect((await goi(buoiA1)).status).toBe(200);
    const res2 = await goi(buoiA2);
    expect(res2.status).toBe(200);

    const phien2 = await verifyGallerySession(res2.cookies.get(SESSION_COOKIE)!.value);
    expect(phien2?.galleryId).toBe(buoiA2);

    const { rows } = await client.query(
      "select gallery_id from selections where share_link_id = $1 order by created_at",
      [linkAId],
    );
    expect(rows.map((r) => r.gallery_id).sort()).toEqual([buoiA1, buoiA2].sort());

    // Bấm lại buổi cũ thì dùng lại ĐÚNG lượt chọn cũ, không sinh thêm dòng
    // nào — nếu không thì ảnh ba mẹ đã chọn biến mất mỗi lần quay lại danh
    // sách.
    const phienA1 = await verifyGallerySession((await goi(buoiA1)).cookies.get(SESSION_COOKIE)!.value);
    const { rows: cua1 } = await client.query(
      "select id from selections where share_link_id = $1 and gallery_id = $2",
      [linkAId, buoiA1],
    );
    expect(cua1).toHaveLength(1);
    expect(phienA1?.selectionId).toBe(cua1[0].id);

    const { rows: sau } = await client.query(
      "select count(*)::int n from selections where share_link_id = $1",
      [linkAId],
    );
    expect(sau[0].n).toBe(2);
  });

  it("6. Khách A KHÔNG mở được buổi chụp của khách B, dù gửi thẳng id", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { POST } = await import("@/app/api/g/buoi-chup/route");

    const res = await POST(
      new Request("http://localhost/api/g/buoi-chup", {
        method: "POST",
        body: JSON.stringify({ buoiChupId: buoiB }),
      }),
    );

    // NOT_FOUND chứ không phải FORBIDDEN: FORBIDDEN xác nhận bộ ảnh đó có
    // thật, tức là biến đường này thành máy dò.
    expect(res.status).toBe(404);
    expect(res.cookies.get(SESSION_COOKIE)).toBeFalsy();

    // Và không có lượt chọn nào rò sang bộ ảnh của khách B.
    const { rows } = await client.query(
      "select count(*)::int n from selections where gallery_id = $1",
      [buoiB],
    );
    expect(rows[0].n).toBe(0);
  });

  it("7. Bộ ảnh chưa có tấm nào thì không mở được, dù gửi thẳng id", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { POST } = await import("@/app/api/g/buoi-chup/route");

    const res = await POST(
      new Request("http://localhost/api/g/buoi-chup", {
        method: "POST",
        body: JSON.stringify({ buoiChupId: buoiTrong }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("8. Phiên theo khách chưa chọn buổi -> /api/g/gallery mời chọn, không báo lỗi lạ", async () => {
    const cookie = await dangNhapBangMa(maLinkA);
    vi.resetModules();
    dungPhien(cookie);
    const { GET } = await import("@/app/api/g/gallery/route");

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(404);
    // Dấu hiệu để màn hình rẽ sang danh sách buổi chụp thay vì hiện màn lỗi.
    expect(json.error.details.canChonBuoiChup).toBe(true);
    expect(json.error.message).toContain("buổi chụp");
  });

  it("9. Link kiểu cũ (gắn theo bộ ảnh) KHÔNG đi qua cổng khách — đường cũ giữ nguyên", async () => {
    // Không dựng link mới: ký thẳng một phiên kiểu cũ, đúng hình dạng
    // `api/auth/gallery` tạo ra cho link gắn theo bộ ảnh.
    const { rows } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, requires_pin)
       values ($1,$2,$3,'owner','active',false) returning id`,
      [buoiA1, bam(`cu-${randomUUID()}`), "cu0000"],
    );
    const { token } = await signGallerySession({
      customerId: "",
      galleryId: buoiA1,
      shareLinkId: rows[0].id,
      selectionId: "",
      role: "owner",
    });

    vi.resetModules();
    dungPhien(token);
    const { GET, POST } = await import("@/app/api/g/buoi-chup/route");

    // Danh sách trả về rỗng kèm `theoKhach: false` — màn hình đọc dấu hiệu đó
    // rồi đi tiếp đường cũ, không phải bắt lỗi.
    const json = await (await GET()).json();
    expect(json.data.theoKhach).toBe(false);
    expect(json.data.buoiChup).toEqual([]);

    // Và không mint lại phiên qua cổng khách được.
    const res = await POST(
      new Request("http://localhost/api/g/buoi-chup", {
        method: "POST",
        body: JSON.stringify({ buoiChupId: buoiA2 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("10. Không đăng nhập thì không đọc được gì", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
    const { GET, POST } = await import("@/app/api/g/buoi-chup/route");

    expect((await GET()).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/g/buoi-chup", {
            method: "POST",
            body: JSON.stringify({ buoiChupId: buoiA1 }),
          }),
        )
      ).status,
    ).toBe(401);
  });
});
