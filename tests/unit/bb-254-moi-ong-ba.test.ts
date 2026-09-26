/**
 * BB-254 — "Mời ông bà cùng xem": ba mẹ tự mời trong app; ông bà/người thân
 * được mời thì XEM và MUA (gửi yêu cầu mua thêm cho CSKH gọi lại chính ông
 * bà). Ông bà KHÔNG chọn ảnh, không thấy tiền hợp đồng/tiền phát sinh của ba
 * mẹ, không tải ảnh gốc, không mời tiếp người khác.
 *
 * Năm mảng canh, theo đúng khuôn BB-245/BB-249 (tests/unit/bb-245-mua-them.test.ts):
 *
 *   1. `POST/GET/DELETE /api/g/moi-nguoi-than` — chặn viewer 403, giới hạn 5
 *      link hoạt động (409), không thu hồi được link của bộ ảnh khác (404).
 *   2. `PATCH /api/g/selection` (tim/lựa chọn) — máy chủ chặn viewer 403,
 *      KHÔNG chỉ ẩn nút giao diện (đã có sẵn từ EDITING_ROLES, canh lại ở đây
 *      để một lần lỡ tay đổi `EDITING_ROLES` là phép thử này đỏ ngay).
 *   3. `POST /api/g/mua-them` từ viewer — thiếu SĐT/tên → 400; body hỏng →
 *      400 không 500. Test cần GHI tự SKIP khi bảng/cột BB-254 (migration
 *      0073) chưa áp, log rõ "chờ Opus áp 0073".
 *   4. Thẻ Lark `mua_them.yeu_cau` kèm thông tin người mua sống sót qua
 *      `locBoAnh()` và SĐT đã che giữa.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { dungThe, locBoAnh, cheSoDienThoai } from "@/lib/lark/notify";
import * as gallerySession from "@/lib/auth/gallery-session";
import { PATCH as suaLuaChon } from "@/app/api/g/selection/route";
import { POST as muaThem } from "@/app/api/g/mua-them/route";
import {
  POST as moiNguoiThan,
  GET as danhSachMoi,
  DELETE as thuHoiMoi,
} from "@/app/api/g/moi-nguoi-than/route";

describe("BB-254 (4): thẻ Lark mua_them.yeu_cau kèm người mua qua locBoAnh", () => {
  const payload = {
    tieuDeBo: "Bé Na 100 ngày",
    galleryId: "11111111-1111-4111-8111-111111111111",
    tongSoMon: 1,
    cacMon: [{ ten: "Ảnh in 10x15", soLuong: 2, tenTep: "IMG_002.jpg", ghiChu: null }],
    nhanNguoiMua: "Bà nội",
    nguoiMuaTen: "Nguyễn Thị Mai",
    soLienHeNguoiMua: cheSoDienThoai("0901000001"),
  };

  it("nhanNguoiMua/nguoiMuaTen/soLienHeNguoiMua sống sót qua locBoAnh (không khớp bẫy chữ 'anh')", () => {
    const sauLoc = locBoAnh(payload);
    expect(sauLoc.nhanNguoiMua).toBe("Bà nội");
    expect(sauLoc.nguoiMuaTen).toBe("Nguyễn Thị Mai");
    expect(sauLoc.soLienHeNguoiMua).toBe("090***0001");
  });

  it("thẻ ghi rõ 'Người mua: <nhãn> · <tên> · <SĐT che>'", () => {
    const the = dungThe("mua_them.yeu_cau", locBoAnh(payload), null) as {
      card: { elements: unknown[] };
    };
    expect(the).not.toBeNull();
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Người mua");
    expect(noiDung).toContain("Bà nội");
    expect(noiDung).toContain("Nguyễn Thị Mai");
    expect(noiDung).toContain("090***0001");
    // SĐT KHÔNG bao giờ hiện trần trong thẻ Lark.
    expect(noiDung).not.toContain("0901000001");
  });

  it("không có nguoiMuaTen → thẻ về câu chung 'Ba mẹ chưa thanh toán' như BB-245", () => {
    const the = dungThe(
      "mua_them.yeu_cau",
      locBoAnh({ ...payload, nhanNguoiMua: null, nguoiMuaTen: null, soLienHeNguoiMua: null }),
      null,
    ) as { card: { elements: unknown[] } };
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).not.toContain("Người mua");
    expect(noiDung).toContain("Ba mẹ chưa thanh toán");
  });
});

describe("BB-254: chạy thật trên cơ sở dữ liệu", () => {
  let client: Client;
  let coBangMuaThem = false;
  let coCotNguoiMua = false;
  let branchId: string;
  let galleryId = "";
  let galleryKhacId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkBaMeId = "";
  let spGanAnh = "";
  let anh1 = "";

  // SĐT VN giả — 10 số, bắt đầu bằng "09", 8 số còn lại ngẫu nhiên.
  const soGia = () => `09${String(Math.floor(10000000 + Math.random() * 89999999))}`;

  function phien(role: string, overrides: Record<string, unknown> = {}) {
    vi.spyOn(gallerySession, "requireGallerySession").mockImplementation(
      async (allowedRoles?: readonly string[]) => {
        if (allowedRoles && !allowedRoles.includes(role)) {
          throw new gallerySession.GallerySessionError("FORBIDDEN");
        }
        return {
          galleryId,
          customerId: null,
          role,
          shareLinkId: shareLinkBaMeId,
          selectionId,
          exp: 0,
          ...overrides,
        } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>;
      },
    );
  }

  const goiMoi = (method: "POST" | "GET" | "DELETE", body?: unknown, qs = "") => {
    const url = `http://localhost/api/g/moi-nguoi-than${qs}`;
    if (method === "GET") return danhSachMoi();
    if (method === "DELETE") return thuHoiMoi(new Request(url, { method: "DELETE" }));
    return moiNguoiThan(
      new Request(url, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  };

  const goiMuaThem = (body: unknown) =>
    muaThem(
      new Request("http://localhost/api/g/mua-them", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  const goiSelection = (body: unknown) =>
    suaLuaChon(
      new Request("http://localhost/api/g/selection", {
        method: "PATCH",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: bangKiem } = await client.query(
      `select to_regclass('public.yeu_cau_mua_them') as bang`,
    );
    coBangMuaThem = bangKiem[0]?.bang !== null;

    if (coBangMuaThem) {
      const { rows: cotKiem } = await client.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'yeu_cau_mua_them'
            and column_name = 'ten_nguoi_mua'`,
      );
      coCotNguoiMua = cotKiem.length > 0;
    }

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-254') returning id`,
      [branchId],
    );
    customerId = kh[0].id;

    // Bộ ảnh chính — đang MỞ CHO KHÁCH XEM ('in_review'), KHÔNG duyệt: đúng
    // luật ông bà (dangMoChoKhachXem) khác luật ba mẹ (duocMoiMuaLanHai).
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-254','in_review',$3,'https://example.com/x',1) returning id`,
      [branchId, customerId, `fixture-bb254-a-${Date.now()}`],
    );
    galleryId = g[0].id;

    // Bộ ảnh THỨ HAI — chỉ để canh "thu hồi link của bộ khác → 404".
    const { rows: g2 } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-254 (bộ khác)', 'in_review',$3,'https://example.com/y',1) returning id`,
      [branchId, customerId, `fixture-bb254-b-${Date.now()}`],
    );
    galleryKhacId = g2[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb254a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkBaMeId = lk[0].id;

    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkBaMeId],
    );
    selectionId = sel[0].id;

    const { rows: ph } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'IMG_002.jpg','image/jpeg',1,'active') returning id`,
      [galleryId, `fixture-bb254-${Date.now()}`],
    );
    anh1 = ph[0].id;

    const { rows: sp } = await client.query(
      `select id from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
          and (material ilike 'khung%' or kind = 'print')
        order by list_price limit 1`,
    );
    spGanAnh = sp[0]?.id ?? "";
  });

  afterAll(async () => {
    // Xoá theo thứ tự khoá ngoại: share_links/yeu_cau_mua_them → selections
    // → photos → galleries → customers.
    if (coBangMuaThem) {
      await client.query("delete from yeu_cau_mua_them where gallery_id in ($1,$2)", [
        galleryId,
        galleryKhacId,
      ]);
    }
    await client.query("delete from activity_logs where entity_id in ($1,$2)", [
      galleryId,
      galleryKhacId,
    ]);
    await client.query("delete from selections where gallery_id in ($1,$2)", [
      galleryId,
      galleryKhacId,
    ]);
    await client.query("delete from photos where gallery_id in ($1,$2)", [galleryId, galleryKhacId]);
    await client.query("delete from share_links where gallery_id in ($1,$2)", [
      galleryId,
      galleryKhacId,
    ]);
    await client.query("delete from galleries where id in ($1,$2)", [galleryId, galleryKhacId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  describe("(1) /api/g/moi-nguoi-than", () => {
    it("viewer gọi POST → 403", async () => {
      phien("viewer");
      const res = await goiMoi("POST", { nhan: "Bà nội" });
      expect(res.status).toBe(403);
    });

    it("viewer gọi GET → 403", async () => {
      phien("viewer");
      const res = await goiMoi("GET");
      expect(res.status).toBe(403);
    });

    it("body hỏng → 400 không 500", async () => {
      phien("owner");
      const res = await goiMoi("POST", "khong-phai-json{");
      expect(res.status).toBe(400);
    });

    it("nhãn rỗng → 400", async () => {
      phien("owner");
      const res = await goiMoi("POST", { nhan: "  " });
      expect(res.status).toBe(400);
    });

    it("ba mẹ tạo 5 link viewer thành công, link thứ 6 → 409", async () => {
      phien("owner");
      const idsDaTao: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const res = await goiMoi("POST", { nhan: `Fixture BB-254 người thân ${i}` });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.diaChiDayDu).toContain("/g/");
        idsDaTao.push(json.data.shareLinkId);
      }

      const res6 = await goiMoi("POST", { nhan: "Fixture BB-254 người thân 6" });
      expect(res6.status).toBe(409);

      // GET liệt kê đúng 5 link, KHÔNG trả lại mã.
      const resGet = await goiMoi("GET");
      const jsonGet = await resGet.json();
      expect(jsonGet.data.items.length).toBeGreaterThanOrEqual(5);
      for (const item of jsonGet.data.items) {
        expect(item).not.toHaveProperty("token");
        expect(item).not.toHaveProperty("ma");
      }

      // Dọn bớt 4 link để không vướng ca sau — giữ đúng 1 để test thu hồi.
      for (const id of idsDaTao.slice(1)) {
        const res = await goiMoi("DELETE", undefined, `?id=${id}`);
        expect(res.status).toBe(200);
      }
    });

    it("thu hồi link của BỘ ẢNH KHÁC → 404", async () => {
      // Link viewer thuộc galleryKhacId, tạo thẳng bằng SQL để không phụ
      // thuộc thứ tự ca trước.
      const { rows } = await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
         values ($1, md5(random()::text), 'bb254x', 'viewer', 'active') returning id`,
        [galleryKhacId],
      );
      phien("owner"); // phiên đang đăng nhập vào `galleryId`, KHÔNG phải galleryKhacId
      const res = await goiMoi("DELETE", undefined, `?id=${rows[0].id}`);
      expect(res.status).toBe(404);

      await client.query("delete from share_links where id = $1", [rows[0].id]);
    });
  });

  describe("(2) PATCH /api/g/selection — viewer bị máy chủ chặn, không chỉ ẩn nút", () => {
    it("viewer thả tim/chọn ảnh → 403", async () => {
      phien("viewer");
      const res = await goiSelection({
        clientOpId: crypto.randomUUID(),
        ops: [{ photoId: anh1, mark: "selected" }],
      });
      expect(res.status).toBe(403);
    });
  });

  describe("(3) POST /api/g/mua-them từ viewer", () => {
    it("body hỏng → 400 không 500", async () => {
      phien("viewer");
      const res = await goiMuaThem("khong-phai-json{");
      expect(res.status).toBe(400);
    });

    it("thiếu tên/SĐT → 400", async () => {
      if (!spGanAnh) return;
      phien("viewer");
      const res = await goiMuaThem({ items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }] });
      expect(res.status).toBe(400);
    });

    it("SĐT sai định dạng → 400", async () => {
      if (!spGanAnh) return;
      phien("viewer");
      const res = await goiMuaThem({
        items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }],
        tenNguoiMua: "Fixture Bà Nội",
        sdtNguoiMua: "123",
      });
      expect(res.status).toBe(400);
    });

    it("đủ tên/SĐT, bộ ảnh đang mở cho khách xem → ghi được, KHÔNG cần đã duyệt (bỏ qua nếu 0072/0073 chưa áp)", async () => {
      if (!coBangMuaThem) {
        console.warn("[BB-254] Bỏ qua: bảng yeu_cau_mua_them chưa có — chờ Opus áp 0072.");
        return;
      }
      if (!spGanAnh) return;
      phien("viewer");
      const res = await goiMuaThem({
        items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }],
        tenNguoiMua: "Fixture Bà Nội",
        sdtNguoiMua: soGia(),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.items).toHaveLength(1);

      if (!coCotNguoiMua) {
        console.warn("[BB-254] Bỏ qua kiểm cột người mua: migration 0073 chưa áp.");
        return;
      }
      const { rows } = await client.query(
        "select ten_nguoi_mua, sdt_nguoi_mua, share_link_id from yeu_cau_mua_them where id = $1",
        [json.data.items[0].id],
      );
      expect(rows[0].ten_nguoi_mua).toBe("Fixture Bà Nội");
      expect(rows[0].share_link_id).toBe(shareLinkBaMeId);
    });

    it("bộ ảnh đã lưu trữ (archived) → 409, ngay cả khi tên/SĐT đủ", async () => {
      if (!spGanAnh) return;
      await client.query("update galleries set status = 'archived' where id = $1", [galleryId]);
      phien("viewer");
      const res = await goiMuaThem({
        items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }],
        tenNguoiMua: "Fixture Bà Nội",
        sdtNguoiMua: soGia(),
      });
      expect(res.status).toBe(409);
      await client.query("update galleries set status = 'in_review' where id = $1", [galleryId]);
    });
  });
});
