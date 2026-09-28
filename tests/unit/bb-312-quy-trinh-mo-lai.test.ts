/**
 * BB-312 (P0, chủ studio 28/09/2026) — quy trình "khách xin mở lại" phải có
 * phản hồi ở CẢ HAI phía. Phép thử này canh đúng LOGIC TRẠNG THÁI suy từ
 * `activity_logs` (src/lib/gallery/yeu-cau-mo-lai.ts) qua một vòng đời thật
 * chạy trên cơ sở dữ liệu: khách xin (lần 1) → CSKH từ chối kèm lý do → khách
 * xin lần 2 → CSKH mở lại.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không dùng `revision_requests`
 * ---------------------------------------------------------------------------
 * Bảng đó là vòng DUYỆT ẢNH ĐÃ CHỈNH (BB-121) — khác hẳn "xin mở lại CHỌN
 * ẢNH" mà route này phục vụ. Xem chú thích đầu `src/lib/gallery/yeu-cau-mo-lai.ts`.
 *
 * ---------------------------------------------------------------------------
 * Thước đo AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên `layTrangThaiXinMoLai` về "chỉ đọc dòng gần nhất bất kể loại
 * action" (bỏ so sánh ba mốc thời gian) thì ca "3. Từ chối..." dưới đây vẫn
 * đỏ đúng cách khác — nhưng ca thực sự canh được việc SO SÁNH ba mốc là ca "6"
 * (khách xin lần 2 sau khi bị từ chối): hoàn nguyên về "luôn tin dòng
 * `reopen_requested` mới nhất bất kể có dòng xử lý sau nó hay không" thì mọi
 * thứ vẫn đúng ở ca đó (vì đúng là request mới nhất) — ca thật sự bắt lỗi là
 * "4/5" (từ chối rồi mà vẫn đọc nhầm về "cho_xu_ly" nếu hàm không so sánh mốc
 * `gallery.reopen_rejected` mới hơn `gallery.reopen_requested`).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import * as staffAuth from "@/lib/auth/staff";
import { POST as xinSuaLai } from "@/app/api/g/xin-sua-lai/route";
import { POST as moLai } from "@/app/api/admin/galleries/[id]/reopen/route";
import { POST as tuChoi } from "@/app/api/admin/galleries/[id]/reopen/tu-choi/route";
import { layTrangThaiXinMoLai, layDanhSachChoXuLyMoLai } from "@/lib/gallery/yeu-cau-mo-lai";
import { createAdminClient } from "@/lib/supabase/admin";
import { phienGiaLap } from "../fixtures/phien-nhan-su";

describe("BB-312: quy trình khách xin mở lại — trạng thái cả hai phía", () => {
  let client: Client;
  let branchId: string;
  let customerId: string;
  let galleryId: string;
  let staffId: string;

  function phienKhach(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId: "00000000-0000-0000-0000-000000000001",
      selectionId: "00000000-0000-0000-0000-000000000002",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  function phienNhanVien() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(
      phienGiaLap("owner", [branchId], staffId),
    );
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query(
      "select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1",
    );
    staffId = st[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-312 Khách','0901000001') returning id`,
      [branchId],
    );
    customerId = c[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-312 Bộ ảnh','in_retouch',$3,'https://example.com/x',5,10) returning id`,
      [branchId, customerId, `fixture-bb312-${Date.now()}`],
    );
    galleryId = g[0].id;
  });

  afterAll(async () => {
    await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
    await client.query("delete from push_dang_ky where gallery_id = $1", [galleryId]);
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Chưa từng xin -> khong_co", async () => {
    const admin = createAdminClient();
    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    expect(trangThai.trangThai).toBe("khong_co");
    expect(trangThai.lanThu).toBe(0);
  });

  it("2. Khách xin lần 1 -> cho_xu_ly, lanThu=1, giữ lời nhắn", async () => {
    phienKhach();
    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Em muốn đổi tấm số 12 sang tấm 15" }),
      }),
    );
    expect(res.status).toBe(200);

    const admin = createAdminClient();
    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    expect(trangThai.trangThai).toBe("cho_xu_ly");
    expect(trangThai.lanThu).toBe(1);
    expect(trangThai.lyDoKhach).toBe("Em muốn đổi tấm số 12 sang tấm 15");
    expect(trangThai.lyDoTuChoi).toBeNull();
  });

  it("2b. Đang có yêu cầu chờ -> xuất hiện trong danh sách 'Việc cần xử lý'", async () => {
    const admin = createAdminClient();
    const ds = await layDanhSachChoXuLyMoLai(admin, [branchId]);
    const dong = ds.find((d) => d.galleryId === galleryId);
    expect(dong).toBeDefined();
    expect(dong?.lanThu).toBe(1);
    expect(dong?.customerName).toBe("Fixture BB-312 Khách");
  });

  it("3. Bấm Từ chối không kèm lý do -> 400", async () => {
    phienNhanVien();
    const res = await tuChoi(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ lyDo: "" }) }),
      { params: Promise.resolve({ id: galleryId }) },
    );
    expect(res.status).toBe(400);
  });

  it("4. Từ chối kèm lý do -> ghi nhật ký + báo khách qua chuông, KHÔNG đổi trạng thái bộ ảnh", async () => {
    phienNhanVien();
    const res = await tuChoi(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Ảnh đã in xong, ba mẹ lấy tại studio giúp em nhé" }),
      }),
      { params: Promise.resolve({ id: galleryId }) },
    );
    expect(res.status).toBe(200);

    const { rows: log } = await client.query(
      "select metadata from activity_logs where action='gallery.reopen_rejected' and entity_id=$1",
      [galleryId],
    );
    expect(log.length).toBe(1);
    expect(log[0].metadata.lyDo).toBe("Ảnh đã in xong, ba mẹ lấy tại studio giúp em nhé");

    const { rows: gallery } = await client.query("select status::text s from galleries where id=$1", [
      galleryId,
    ]);
    expect(gallery[0].s).toBe("in_retouch");

    const { rows: hopThu } = await client.query(
      "select loai, noi_dung from thong_bao_khach where gallery_id=$1 order by created_at desc limit 1",
      [galleryId],
    );
    expect(hopThu.length).toBe(1);
    expect(hopThu[0].loai).toBe("reopen_tu_choi");
    expect(hopThu[0].noi_dung).toContain("Ảnh đã in xong");
  });

  it("5. Sau khi từ chối -> bi_tu_choi, lyDoTuChoi đúng, vẫn nhớ lyDoKhach cũ", async () => {
    const admin = createAdminClient();
    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    expect(trangThai.trangThai).toBe("bi_tu_choi");
    expect(trangThai.lyDoTuChoi).toBe("Ảnh đã in xong, ba mẹ lấy tại studio giúp em nhé");
    expect(trangThai.lyDoKhach).toBe("Em muốn đổi tấm số 12 sang tấm 15");
    expect(trangThai.lanThu).toBe(1);
  });

  it("5b. Từ chối lần nữa khi không còn gì đang chờ -> 400", async () => {
    phienNhanVien();
    const res = await tuChoi(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ lyDo: "abc" }) }),
      { params: Promise.resolve({ id: galleryId }) },
    );
    expect(res.status).toBe(400);
  });

  it("6. Khách xin LẦN 2 sau khi bị từ chối -> cho_xu_ly trở lại, lanThu=2", async () => {
    phienKhach();
    const res = await xinSuaLai(
      new Request("http://localhost/api/g/xin-sua-lai", {
        method: "POST",
        body: JSON.stringify({ lyDo: "Vậy em xin đổi màu bìa thôi được không ạ" }),
      }),
    );
    expect(res.status).toBe(200);

    const admin = createAdminClient();
    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    expect(trangThai.trangThai).toBe("cho_xu_ly");
    expect(trangThai.lanThu).toBe(2);
    expect(trangThai.lyDoKhach).toBe("Vậy em xin đổi màu bìa thôi được không ạ");
  });

  it("7. CSKH mở lại (route /reopen có sẵn) -> da_mo, báo khách qua chuông", async () => {
    // Route /reopen chỉ đảo trạng thái từ 'expired'/'submitted' (giới hạn có
    // sẵn từ BB-122, ngoài phạm vi BB-312) — đưa bộ ảnh về 'submitted' để
    // dùng ĐÚNG hành động mở lại hiện có, như brief yêu cầu.
    await client.query("update galleries set status='submitted' where id=$1", [galleryId]);

    phienNhanVien();
    const res = await moLai(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ reason: "Mở lại theo yêu cầu ba mẹ" }),
      }),
      { params: Promise.resolve({ id: galleryId }) },
    );
    expect(res.status).toBe(200);

    const admin = createAdminClient();
    const trangThai = await layTrangThaiXinMoLai(admin, galleryId);
    expect(trangThai.trangThai).toBe("da_mo");
    expect(trangThai.lanThu).toBe(2);

    const { rows: hopThu } = await client.query(
      "select loai from thong_bao_khach where gallery_id=$1 order by created_at desc limit 1",
      [galleryId],
    );
    expect(hopThu[0].loai).toBe("reopen_da_mo");
  });

  it("7b. Đã xử lý xong -> biến mất khỏi danh sách 'Việc cần xử lý'", async () => {
    const admin = createAdminClient();
    const ds = await layDanhSachChoXuLyMoLai(admin, [branchId]);
    expect(ds.find((d) => d.galleryId === galleryId)).toBeUndefined();
  });
});
