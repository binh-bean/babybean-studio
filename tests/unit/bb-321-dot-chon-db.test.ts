/**
 * BB-321 — chạy THẬT trên cơ sở dữ liệu: chốt đợt, xác nhận/từ chối, mở lại theo
 * đợt, xuất "chỉ đợt N".
 *
 * ---------------------------------------------------------------------------
 * CHỜ MIGRATION 0077
 * ---------------------------------------------------------------------------
 * Migration `0077-dot-chon-anh.sql` được VIẾT nhưng CHƯA ÁP (Claude sẽ soát rồi
 * áp). Đến lúc đó tệp này TỰ SKIP (bảng `selection_rounds` chưa có) và in dòng
 * "chờ áp 0077". Sau khi áp, chạy lại: `npx vitest run tests/unit/bb-321-dot-chon-db.test.ts`.
 *
 * Mỗi lần chạy mang nhãn riêng và dọn theo nhãn của chính mình (AGENTS §5a điều 3,
 * BB-136): chỉ tạo/xoá đúng bản ghi Fixture của mình, không đụng dữ liệu thật.
 * KHÔNG bắn Lark thật: `enqueueLarkNotification` tự dừng trong phép thử.
 *
 * Ca cốt lõi — luật doanh thu: khách chốt đợt 3 ĐƯỢC ngay cả khi đợt 2 còn chờ
 * xác nhận; mua thêm KHÔNG cần yêu cầu mở lại.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { phienGiaLap } from "../fixtures/phien-nhan-su";
import type { StaffRole } from "@/types/domain";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import * as staffAuth from "@/lib/auth/staff";
import { GET as docDot } from "@/app/api/g/dot-chon/route";
import { POST as chotDot } from "@/app/api/g/dot-chon/chot/route";
import { POST as xacNhan } from "@/app/api/admin/galleries/[id]/dot-chon/[soDot]/xac-nhan/route";
import { POST as tuChoi } from "@/app/api/admin/galleries/[id]/dot-chon/[soDot]/tu-choi/route";
import { POST as moLai } from "@/app/api/admin/galleries/[id]/reopen/route";
import { GET as xuat } from "@/app/api/admin/galleries/[id]/export/route";
import { POST as chotDot1 } from "@/app/api/g/submit/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-321 ${runId}`;
const GIA_ANH = 30000;

describe("BB-321: đợt chọn chạy thật trên cơ sở dữ liệu", () => {
  let client: Client;
  let coBang = false;
  let branchId = "";
  let staffId = "";
  let customerId = "";
  let galleryId = "";
  let selectionId = "";
  let shareLinkId = "";
  let sanPhamGanAnh = "";
  const anh: string[] = [];

  function phienKhach(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  function phienNhanVien(vai: StaffRole = "owner") {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap(vai, [branchId], staffId));
  }

  const chot = (body: unknown) =>
    chotDot(new Request("http://localhost/api/g/dot-chon/chot", { method: "POST", body: JSON.stringify(body) }));
  const ctx = (soDot?: number) => ({
    params: Promise.resolve({ id: galleryId, soDot: String(soDot ?? 2) }),
  });
  const duyet = (soDot: number) => xacNhan(new Request("http://localhost", { method: "POST" }), ctx(soDot));
  const tuChoiDot = (soDot: number, body: unknown) =>
    tuChoi(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), ctx(soDot));
  const moLaiBo = (body: unknown) =>
    moLai(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: galleryId }),
    });

  async function datTrangThai(status: string) {
    await client.query("update galleries set status = $2 where id = $1", [galleryId, status]);
  }
  async function dongDot() {
    const { rows } = await client.query(
      "select so_dot, trang_thai, so_anh, so_anh_tinh_tien, tien_anh, tien_san_pham, tra_lai from selection_rounds where gallery_id = $1 order by so_dot",
      [galleryId],
    );
    return rows as {
      so_dot: number;
      trang_thai: string;
      so_anh: number;
      so_anh_tinh_tien: number;
      tien_anh: string;
      tien_san_pham: string;
      tra_lai: boolean;
    }[];
  }
  async function dotCuaAnh(photoId: string) {
    const { rows } = await client.query(
      "select dot, mark from selection_items where selection_id = $1 and photo_id = $2",
      [selectionId, photoId],
    );
    return rows[0] as { dot: number; mark: string | null } | undefined;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: kt } = await client.query(`select to_regclass('public.selection_rounds') as bang`);
    coBang = kt[0]?.bang !== null;
    if (!coBang) {
      console.warn("[BB-321] Bỏ qua: bảng selection_rounds chưa có — chờ áp migration 0077.");
      return;
    }

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    staffId = st[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',6,3,$5) returning id`,
      [branchId, customerId, NHAN, `fixture-bb321-${runId}`, GIA_ANH],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb321a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    for (let i = 1; i <= 6; i++) {
      const { rows: ph } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [galleryId, `fixture-bb321-${runId}-${i}`, `IMG_00${i}.jpg`, i],
      );
      anh.push(ph[0].id);
    }
    // Đợt 1: ba ảnh đầu, đã chốt và được xác nhận (bộ ảnh ở in_retouch).
    for (let i = 0; i < 3; i++) {
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [selectionId, anh[i]!, galleryId],
      );
    }

    const { rows: sp } = await client.query(
      `select id from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
          and (material ilike 'khung%' or kind = 'print')
        order by list_price limit 1`,
    );
    sanPhamGanAnh = sp[0]?.id ?? "";
  });

  afterAll(async () => {
    if (coBang && galleryId) {
      await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await client.query("delete from notifications where payload::text like $1", [`%${galleryId}%`]);
      await client.query("delete from selection_rounds where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
      await client.query("delete from customers where id = $1", [customerId]);
    }
    await client.end();
  });

  it("1. Chưa được xác nhận đợt 1 (submitted) → chốt đợt mới bị từ chối, ba mẹ cứ sửa đợt 1", async () => {
    if (!coBang) return;
    await datTrangThai("submitted");
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[3]!], items: [] });
    expect(res.status).toBe(409);
    expect((await dongDot()).length).toBe(0);
    await datTrangThai("in_retouch");
  });

  it("2. Người xem (viewer) không chốt được — 403", async () => {
    if (!coBang) return;
    phienKhach("viewer");
    const res = await chot({ tenNguoiChot: "Bà", photoIds: [anh[3]!], items: [] });
    expect(res.status).toBe(403);
  });

  it("3. Chốt đợt 2: hai ảnh mới → ảnh khoá ở đợt 2; tiền tính theo lát (3 trong gói, cả 2 ảnh mới tính tiền)", async () => {
    if (!coBang) return;
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[3]!, anh[4]!], items: [] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.soDot).toBe(2);
    expect(json.data.tienAnh).toBe(2 * GIA_ANH);

    const dots = await dongDot();
    expect(dots).toHaveLength(1);
    expect(dots[0]).toMatchObject({ so_dot: 2, trang_thai: "cho_xac_nhan", so_anh: 2, so_anh_tinh_tien: 2 });
    expect((await dotCuaAnh(anh[3]!))?.dot).toBe(2);
    expect((await dotCuaAnh(anh[0]!))?.dot).toBe(1); // đợt 1 không bị đụng
  });

  it("4. Ảnh đã chốt ở đợt 1 hoặc 2 KHÔNG chọn lại được — 409, không tạo đợt mới", async () => {
    if (!coBang) return;
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[0]!, anh[3]!, anh[5]!], items: [] });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(JSON.stringify(json)).toContain("mở lại");
    expect((await dongDot()).length).toBe(1);
    expect(await dotCuaAnh(anh[5]!)).toBeUndefined();
  });

  it("5. LUẬT DOANH THU: đợt 3 chốt được NGAY khi đợt 2 còn chờ xác nhận, không cần xin mở lại", async () => {
    if (!coBang) return;
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[5]!], items: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).data.soDot).toBe(3);
    const dots = await dongDot();
    expect(dots.map((d) => [d.so_dot, d.trang_thai])).toEqual([
      [2, "cho_xac_nhan"],
      [3, "cho_xac_nhan"],
    ]);
  });

  it("6. Đợt chỉ mua sản phẩm (0 ảnh) hợp lệ; thiếu ảnh cho sản phẩm cần in bị từ chối 400", async () => {
    if (!coBang || !sanPhamGanAnh) return;
    phienKhach();
    const thieu = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [], items: [{ productId: sanPhamGanAnh, soLuong: 1 }] });
    expect(thieu.status).toBe(400);
    const trong = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [], items: [] });
    expect(trong.status).toBe(400);
  });

  it("7. GET của khách: đợt, số ảnh, tiền và bản đồ ảnh→đợt (huy hiệu 'Đã chốt đợt N')", async () => {
    if (!coBang) return;
    phienKhach();
    const res = await docDot();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.cheDoChonThem).toBe(true);
    expect(data.giaMoiAnh).toBe(GIA_ANH);
    expect(data.cacDot.map((d: { soDot: number }) => d.soDot)).toEqual([2, 3]);
    expect(data.dotTheoAnh[anh[3]!]).toBe(2);
    expect(data.dotTheoAnh[anh[5]!]).toBe(3);
    expect(data.dotTheoAnh[anh[0]!]).toBeUndefined(); // đợt 1 không nằm trong bản đồ
  });

  it("8. CSKH từ chối đợt 3 phải có lý do (400), rồi ảnh trả về cho khách kèm lý do", async () => {
    if (!coBang) return;
    phienNhanVien();
    expect((await tuChoiDot(3, {})).status).toBe(400);

    const res = await tuChoiDot(3, { lyDo: "Tấm này trùng đợt trước" });
    expect(res.status).toBe(200);
    expect(await dotCuaAnh(anh[5]!)).toBeUndefined(); // dòng ảnh đã xoá — ảnh về tay khách

    phienKhach();
    const { data } = await (await docDot()).json();
    const dot3 = data.cacDot.find((d: { soDot: number }) => d.soDot === 3);
    expect(dot3.trangThai).toBe("tu_choi");
    expect(dot3.lyDoTuChoi).toBe("Tấm này trùng đợt trước");
    expect(data.banNhap.anhIds).toContain(anh[5]!);
  });

  it("9. Từ chối lần hai cho đợt đã bị từ chối → 409; đợt không tồn tại → 404", async () => {
    if (!coBang) return;
    phienNhanVien();
    expect((await tuChoiDot(3, { lyDo: "lần hai" })).status).toBe(409);
    expect((await tuChoiDot(9, { lyDo: "không có" })).status).toBe(404);
  });

  it("10. Chốt lại ảnh bị trả → đợt MỚI số 4 (không dùng lại số 3), cờ 'trả lại' hết", async () => {
    if (!coBang) return;
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[5]!], items: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).data.soDot).toBe(4);
    const dots = await dongDot();
    expect(dots.find((d) => d.so_dot === 3)?.tra_lai).toBe(false);
  });

  it("11. CSKH xác nhận đợt 2; xác nhận lần hai → 409 (không ghi đè người bấm trước)", async () => {
    if (!coBang) return;
    phienNhanVien();
    expect((await duyet(2)).status).toBe(200);
    expect((await duyet(2)).status).toBe(409);
    const dots = await dongDot();
    expect(dots.find((d) => d.so_dot === 2)?.trang_thai).toBe("da_xac_nhan");
  });

  it("12. Nhân viên chi nhánh khác không xử lý được đợt — 403", async () => {
    if (!coBang) return;
    const { rows: br2 } = await client.query("select id from branches where id <> $1 limit 1", [branchId]);
    if (!br2[0]) return;
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [br2[0].id], staffId));
    expect((await duyet(4)).status).toBe(403);
  });

  it("13. Xuất 'chỉ đợt N': đợt 2 chỉ có 2 ảnh mới, đợt 1 chỉ 3 ảnh gốc", async () => {
    if (!coBang) return;
    phienNhanVien();
    const goiXuat = async (dot: number) => {
      const res = await xuat(new Request(`http://localhost/x?dot=${dot}`), {
        params: Promise.resolve({ id: galleryId }),
      });
      expect(res.status).toBe(200);
      return (await res.text()).split(/\r?\n/).filter(Boolean);
    };
    expect(await goiXuat(2)).toEqual(["IMG_004.jpg", "IMG_005.jpg"]);
    expect(await goiXuat(1)).toEqual(["IMG_001.jpg", "IMG_002.jpg", "IMG_003.jpg"]);
    const loi = await xuat(new Request("http://localhost/x?dot=abc"), { params: Promise.resolve({ id: galleryId }) });
    expect(loi.status).toBe(400);
  });

  it("14. Mở lại ĐỢT 2 (in_retouch): ảnh trả về khách, bộ ảnh vẫn in_retouch; không truyền lý do → 400", async () => {
    if (!coBang) return;
    phienNhanVien();
    expect((await moLaiBo({ dot: 2 })).status).toBe(400);
    const res = await moLaiBo({ reason: "Khách đổi ý tấm 4", dot: 2 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("in_retouch");
    expect(await dotCuaAnh(anh[3]!)).toBeUndefined();
    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("in_retouch");
    expect((await dongDot()).find((d) => d.so_dot === 2)?.trang_thai).toBe("da_mo_lai");
  });

  it("15. Đợt chưa chốt / đợt không tồn tại không mở lại được — 400", async () => {
    if (!coBang) return;
    phienNhanVien();
    expect((await moLaiBo({ reason: "thử", dot: 7 })).status).toBe(400);
  });

  it("16. Mở lại ĐỢT 1 ở in_retouch → bộ ảnh về in_review (luồng gốc)", async () => {
    if (!coBang) return;
    phienNhanVien();
    const res = await moLaiBo({ reason: "Khách xin đổi ảnh gói", dot: 1 });
    expect(res.status).toBe(200);
    const { rows } = await client.query("select status from galleries where id = $1", [galleryId]);
    expect(rows[0].status).toBe("in_review");
    await datTrangThai("in_retouch");
  });

  it("17. delivered: KHÔNG mở lại — 400 kèm câu giải thích 'đợt mới'", async () => {
    if (!coBang) return;
    await datTrangThai("delivered");
    phienNhanVien();
    const res = await moLaiBo({ reason: "thử" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain("đợt mới");
    await datTrangThai("in_retouch");
  });

  it("18. Vai không có galleries:reopen không mở lại được", async () => {
    if (!coBang) return;
    phienNhanVien("photoshop_ctv");
    const res = await moLaiBo({ reason: "thử" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("19. Đợt có sản phẩm in CHƯA gắn ảnh: thiếu cờ 'biết ảnh chậm hơn' → 400; có cờ → 200 và lưu cờ + số lượng", async () => {
    if (!coBang || !sanPhamGanAnh) return;
    await datTrangThai("in_retouch");
    phienKhach();
    const thieu = await chot({
      tenNguoiChot: "Mẹ Fixture",
      photoIds: [],
      items: [{ productId: sanPhamGanAnh, soLuong: 2 }],
    });
    expect(thieu.status).toBe(400);
    const j = await thieu.json();
    expect(j.error.details.chiTiet ?? j.error.details).toBeDefined();
    expect(JSON.stringify(j)).toContain("2 sản phẩm in chưa chọn ảnh");
    const truoc = (await dongDot()).length;

    const co = await chot({
      tenNguoiChot: "Mẹ Fixture",
      photoIds: [],
      items: [{ productId: sanPhamGanAnh, soLuong: 2 }],
      bietAnhInChamHon: true,
    });
    expect(co.status).toBe(200);
    const dots = await dongDot();
    expect(dots.length).toBe(truoc + 1);
    const { rows } = await client.query(
      "select so_san_pham_in_chua_anh, biet_anh_in_cham_hon from selection_rounds where gallery_id = $1 order by so_dot desc limit 1",
      [galleryId],
    );
    expect(rows[0]).toEqual({ so_san_pham_in_chua_anh: 2, biet_anh_in_cham_hon: true });
  });

  it("20. Tiền đợt 2 từ ảnh đầu tiên: khách đang chọn 3/3, thêm 1 ảnh → tính tiền 1 ảnh (và nếu còn chỗ trong gói cũng KHÔNG được dùng)", async () => {
    if (!coBang) return;
    // Hạ số ảnh đợt 1 xuống 2/3 ảnh: còn 1 chỗ trống trong gói — đợt sau vẫn tính tiền đủ.
    await client.query("delete from selection_items where selection_id = $1 and photo_id = $2", [selectionId, anh[2]!]);
    phienKhach();
    const res = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[3]!], items: [] });
    expect(res.status).toBe(200);
    expect((await res.json()).data.tienAnh).toBe(GIA_ANH);
  });

  it("21. Theo Lark: bộ ảnh app còn 'in_review' nhưng Lark 'Đã chọn hình' → vẫn chốt đợt mua thêm được; Lark chưa tới thì 409", async () => {
    if (!coBang) return;
    await datTrangThai("in_review");
    await client.query("update galleries set lark_trang_thai = null where id = $1", [galleryId]);
    phienKhach();
    const chua = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[4]!], items: [] });
    expect(chua.status).toBe(409);

    // BB-336: từ BB-327 (`maLarkConHieuLuc`, 34013ae) trạng thái Lark chỉ còn
    // hiệu lực khi Lark đổi trạng thái SAU lần CSKH mở lại (`reopened_at`) —
    // bộ fixture này đã được mở lại ở ca 16. Bản cũ của ca này đặt
    // `lark_trang_thai` mà bỏ trống `lark_trang_thai_tu`, tức "không biết Lark
    // đổi lúc nào" → lần mở lại thắng → 409. Đó là đúng luật BB-327, không phải
    // hồi quy. Nên dựng đúng tình huống ca này muốn canh: Lark vừa sang
    // "Đã chọn hình" (sau lần mở lại) → đợt mua thêm mở (luật chủ studio:
    // đợt 2 mở khi CSKH xác nhận đợt 1 HOẶC Lark ≥ "Đã chọn hình").
    const { rows: moLai } = await client.query("select reopened_at from galleries where id = $1", [galleryId]);
    const sauMoLai = new Date(Math.max(Date.now(), new Date(moLai[0]?.reopened_at ?? 0).getTime() + 1000));

    // Lark "Đã chọn hình" nhưng CŨ HƠN lần mở lại → mở lại thắng, vẫn 409 (BB-327).
    if (moLai[0]?.reopened_at) {
      await client.query(
        "update galleries set lark_trang_thai = 'optl5DyKLx', lark_trang_thai_tu = $2 where id = $1",
        [galleryId, new Date(new Date(moLai[0].reopened_at).getTime() - 86_400_000)],
      );
      const cu = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[4]!], items: [] });
      expect(cu.status).toBe(409);
    }

    await client.query(
      "update galleries set lark_trang_thai = 'optl5DyKLx', lark_trang_thai_tu = $2 where id = $1",
      [galleryId, sauMoLai],
    );
    const co = await chot({ tenNguoiChot: "Mẹ Fixture", photoIds: [anh[4]!], items: [] });
    expect(co.status).toBe(200);
    const { data } = await (await docDot()).json();
    expect(data.cheDoChonThem).toBe(true);
    expect(data.cauDongY.studioChon).toBe("Tôi đồng ý với ảnh studio chọn dùm và không đổi lại");
    expect(data.cauDongY.bietAnhInCham).toBe("Tôi biết chưa chọn ảnh in thì nhận ảnh chậm hơn");
    await client.query("update galleries set lark_trang_thai = null, lark_trang_thai_tu = null where id = $1", [galleryId]);
    await datTrangThai("in_retouch");
  });
});

describe("BB-321: chốt ĐỢT 1 — nhờ studio chọn bổ sung (cần migration 0077)", () => {
  let client: Client;
  let coCot = false;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let selectionId = "";
  let shareLinkId = "";
  let quotaBiet = false;

  const submit = (body: unknown) =>
    chotDot1(new Request("http://localhost/api/g/submit", { method: "POST", body: JSON.stringify(body) }));

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: kt } = await client.query(
      `select count(*)::int n from information_schema.columns
        where table_schema = 'public' and table_name = 'selections' and column_name = 'nho_studio_chon_them'`,
    );
    coCot = kt[0].n === 1;
    if (!coCot) {
      console.warn("[BB-321] Bỏ qua chốt đợt 1: cột selections.nho_studio_chon_them chưa có — chờ áp 0077.");
      return;
    }
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách D1`],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, included_quota, extra_photo_price)
       values ($1,$2,$3,'in_review',$4,'https://example.com/x',3,3,$5) returning id`,
      [branchId, customerId, `${NHAN} D1`, `fixture-bb321-d1-${runId}`, GIA_ANH],
    );
    galleryId = g[0].id;
    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb321b', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;
    for (let i = 1; i <= 3; i++) {
      const { rows: ph } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [galleryId, `fixture-bb321-d1-${runId}-${i}`, `D1_00${i}.jpg`, i],
      );
      if (i <= 2) {
        await client.query(
          `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
          [selectionId, ph[0].id, galleryId],
        );
      }
    }
    const { rows: q } = await client.query("select gallery_quota($1) as q", [galleryId]);
    quotaBiet = q[0].q !== null;
  });

  afterAll(async () => {
    if (coCot && galleryId) {
      await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await client.query("delete from notifications where payload::text like $1", [`%${galleryId}%`]);
      await client.query("delete from galleries where id = $1", [galleryId]);
      await client.query("delete from customers where id = $1", [customerId]);
    }
    await client.end();
  });

  function phien() {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role: "owner",
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  it("chọn 2/3, nhờ studio chọn thêm mà KHÔNG tick đồng ý → 400, bộ ảnh vẫn in_review, không lưu gì", async () => {
    if (!coCot || !quotaBiet) return;
    phien();
    const res = await submit({ confirmedByName: "Mẹ Fixture", agreed: true, nhoStudioChonThem: true });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("thieu_dong_y_anh_studio_chon");
    const { rows } = await client.query(
      "select g.status::text s, x.nho_studio_chon_them n from galleries g join selections x on x.gallery_id = g.id where g.id = $1",
      [galleryId],
    );
    expect(rows[0]).toEqual({ s: "in_review", n: 0 });
  });

  it("có tick đồng ý → chốt được, lưu số ảnh nhờ (= hạn mức − đã chọn = 1) và cờ đồng ý", async () => {
    if (!coCot || !quotaBiet) return;
    phien();
    const res = await submit({
      confirmedByName: "Mẹ Fixture",
      agreed: true,
      nhoStudioChonThem: true,
      dongYAnhStudioChon: true,
    });
    expect(res.status).toBe(200);
    const { rows } = await client.query(
      "select nho_studio_chon_them n, dong_y_anh_studio_chon d from selections where id = $1",
      [selectionId],
    );
    expect(rows[0]).toEqual({ n: 1, d: true });
  });
});
