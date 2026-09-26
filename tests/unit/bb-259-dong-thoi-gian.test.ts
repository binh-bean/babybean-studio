import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import { dichHoatDong } from "@/lib/nhat-ky/dich-hoat-dong";
import { xepDongThoiGian, type RawActivityRow } from "@/lib/nhat-ky/xep-dong-thoi-gian";
import { GET } from "@/app/api/admin/galleries/[id]/dong-thoi-gian/route";
import * as staffAuth from "@/lib/auth/staff";

/**
 * BB-259 — khối "Dòng thời gian hoạt động" ở màn chi tiết bộ ảnh quản trị.
 *
 * Hai lớp phép thử:
 *   1. Hàm thuần dich-hoat-dong.ts / xep-dong-thoi-gian.ts — không đụng DB.
 *   2. Route GET .../dong-thoi-gian — dùng Fixture BB-259 thật trên bb-dev,
 *      dọn sạch ở afterAll (đúng luật §6 AGENTS.md: chỉ dữ liệu giả).
 */

function dongMau(overrides: Partial<RawActivityRow>): RawActivityRow {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    actorType: "customer",
    actorId: "selection-1",
    actorLabel: "Khách chính",
    action: "selection.patch",
    metadata: { applied: 1 },
    staffFullName: null,
    ...overrides,
  };
}

describe("BB-259 — dich-hoat-dong.ts (hàm thuần)", () => {
  it("dịch từng action phổ biến ra đúng câu", () => {
    expect(dichHoatDong("share_link.created")).toEqual({
      nhom: "nhan_vien",
      cau: "Nhân viên tạo link gửi khách",
    });
    expect(dichHoatDong("gallery.retouch_sent")).toEqual({
      nhom: "nhan_vien",
      cau: "Nhân viên gửi ảnh đã chỉnh cho khách",
    });
    expect(dichHoatDong("gallery.confirm_retouch")).toEqual({
      nhom: "nhan_vien",
      cau: "Nhân viên bắt đầu hậu kỳ ảnh",
    });
    expect(dichHoatDong("gallery.review_approved")).toEqual({
      nhom: "khach",
      cau: "Ba mẹ duyệt ảnh đã chỉnh",
    });
    expect(dichHoatDong("gallery.review_revise")).toEqual({
      nhom: "khach",
      cau: "Ba mẹ yêu cầu chỉnh sửa lại",
    });
    expect(dichHoatDong("gallery.reopen")).toEqual({
      nhom: "nhan_vien",
      cau: "Nhân viên mở lại bộ ảnh",
    });
    expect(dichHoatDong("gallery.payment_recorded", { amount: 750000 })).toEqual({
      nhom: "tien",
      cau: "Nhân viên ghi nhận thu 750.000đ",
    });
    expect(dichHoatDong("gallery.payment_recorded", { amount: -50000 })).toEqual({
      nhom: "tien",
      cau: "Nhân viên ghi nhận hoàn 50.000đ",
    });
    expect(dichHoatDong("selection.submit", { selectedCount: 62 })).toEqual({
      nhom: "khach",
      cau: "Ba mẹ chốt lựa chọn 62 tấm",
    });
    expect(dichHoatDong("mua_them.yeu_cau", { soDong: 2 })).toEqual({
      nhom: "khach",
      cau: "Ba mẹ gửi yêu cầu mua thêm 2 sản phẩm",
    });
    expect(dichHoatDong("mua_them.doi_trang_thai", { denTrangThai: "da_chot" })).toEqual({
      nhom: "nhan_vien",
      cau: 'Nhân viên chuyển yêu cầu mua thêm sang "Đã chốt"',
    });
    expect(dichHoatDong("gallery.auth")).toEqual({
      nhom: "khach",
      cau: "Ba mẹ mở link lần đầu",
    });
  });

  it("action lạ chưa dịch → câu chung 'Thao tác khác', nhóm mang tên action, không vỡ", () => {
    const ketQua = dichHoatDong("mot_action_chua_tung_thay", { batKy: "gì đó" });
    expect(ketQua.cau).toBe("Thao tác khác");
    expect(ketQua.nhom).toBe("mot_action_chua_tung_thay");
  });

  it("metadata sai kiểu (thiếu trường số) không làm ném lỗi", () => {
    expect(() => dichHoatDong("gallery.payment_recorded", {})).not.toThrow();
    expect(() => dichHoatDong("selection.patch", { applied: "không phải số" })).not.toThrow();
    expect(() => dichHoatDong("selection.patch", null)).not.toThrow();
  });

  it("KHÔNG bao giờ ghép tên/SĐT khách vào câu dù metadata có mang theo", () => {
    // mua_them.yeu_cau có thể mang nguoiMua.ten (tên NGƯỜI KHÁC nhờ mua hộ) —
    // câu dịch không được nhắc tới trường này dù có mặt trong metadata.
    const ketQua = dichHoatDong("mua_them.yeu_cau", {
      soDong: 1,
      nguoiMua: { ten: "Nguyễn Thị Mai", sdtChe: "090***001" },
    });
    expect(ketQua.cau).not.toContain("Mai");
    expect(ketQua.cau).not.toContain("090");
  });
});

describe("BB-259 — xep-dong-thoi-gian.ts (gộp + lọc, hàm thuần)", () => {
  it("gộp 5 dòng selection.patch trong 10 phút của cùng một người thành 1 dòng 'chọn/bỏ 5 tấm'", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = Array.from({ length: 5 }).map((_, i) =>
      dongMau({
        id: `p${i}`,
        createdAt: new Date(goc + i * 2 * 60_000).toISOString(), // cách nhau 2 phút
        metadata: { applied: 1 },
      }),
    );

    const ketQua = xepDongThoiGian(rows);
    expect(ketQua).toHaveLength(1);
    expect(ketQua[0]!.cau).toBe("Ba mẹ chọn/bỏ 5 tấm");
    expect(ketQua[0]!.nhom).toBe("khach");
  });

  it("cách nhau 11 phút thì KHÔNG gộp — ra 2 dòng riêng", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = [
      dongMau({ id: "a", createdAt: new Date(goc).toISOString(), metadata: { applied: 1 } }),
      dongMau({
        id: "b",
        createdAt: new Date(goc + 11 * 60_000).toISOString(),
        metadata: { applied: 1 },
      }),
    ];

    const ketQua = xepDongThoiGian(rows);
    expect(ketQua).toHaveLength(2);
    expect(ketQua.every((d) => d.cau === "Ba mẹ chọn/bỏ 1 tấm")).toBe(true);
  });

  it("selection.patch của HAI NGƯỜI KHÁC NHAU trong cùng 10 phút không gộp chung", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = [
      dongMau({ id: "a", actorId: "sel-A", createdAt: new Date(goc).toISOString() }),
      dongMau({ id: "b", actorId: "sel-B", createdAt: new Date(goc + 60_000).toISOString() }),
    ];
    const ketQua = xepDongThoiGian(rows);
    expect(ketQua).toHaveLength(2);
  });

  it("hành động khác chen giữa hai đợt selection.patch thì KHÔNG gộp xuyên qua nó", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = [
      dongMau({ id: "a", createdAt: new Date(goc).toISOString() }),
      dongMau({
        id: "mid",
        createdAt: new Date(goc + 60_000).toISOString(),
        action: "addon.set",
        metadata: { productName: "In ảnh 13x18", quantity: 1 },
      }),
      dongMau({ id: "b", createdAt: new Date(goc + 120_000).toISOString() }),
    ];
    const ketQua = xepDongThoiGian(rows);
    expect(ketQua).toHaveLength(3);
  });

  it("gallery.auth chỉ giữ dòng đầu tiên (sớm nhất), các lần mở lại sau bị bỏ", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = [
      dongMau({
        id: "auth-1",
        actorType: "customer",
        actorLabel: null,
        action: "gallery.auth",
        metadata: {},
        createdAt: new Date(goc).toISOString(),
      }),
      dongMau({
        id: "auth-2",
        actorType: "customer",
        actorLabel: null,
        action: "gallery.auth",
        metadata: {},
        createdAt: new Date(goc + 3600_000).toISOString(),
      }),
      dongMau({
        id: "auth-3",
        actorType: "customer",
        actorLabel: null,
        action: "gallery.auth",
        metadata: {},
        createdAt: new Date(goc + 7200_000).toISOString(),
      }),
    ];
    const ketQua = xepDongThoiGian(rows);
    expect(ketQua).toHaveLength(1);
    expect(ketQua[0]!.cau).toBe("Ba mẹ mở link lần đầu");
    expect(ketQua[0]!.luc).toBe(new Date(goc).toISOString());
  });

  it("sắp mới nhất trước", () => {
    const goc = new Date("2026-09-20T10:00:00.000Z").getTime();
    const rows: RawActivityRow[] = [
      dongMau({
        id: "old",
        action: "gallery.retouch_sent",
        actorType: "staff",
        actorId: "staff-1",
        staffFullName: "Nguyễn Văn A",
        createdAt: new Date(goc).toISOString(),
      }),
      dongMau({
        id: "new",
        action: "gallery.confirm_retouch",
        actorType: "staff",
        actorId: "staff-1",
        staffFullName: "Nguyễn Văn A",
        createdAt: new Date(goc + 3600_000).toISOString(),
      }),
    ];
    const ketQua = xepDongThoiGian(rows);
    expect(ketQua[0]!.cau).toBe("Nhân viên bắt đầu hậu kỳ ảnh");
    expect(ketQua[1]!.cau).toBe("Nhân viên gửi ảnh đã chỉnh cho khách");
    expect(ketQua[0]!.nguoi).toBe("Nguyễn Văn A");
  });
});

describe("GET /api/admin/galleries/[id]/dong-thoi-gian (BB-259, dùng Fixture thật)", () => {
  let client: Client;
  let branchAId: string;
  let branchBId: string;
  let customerId: string;
  let galleryId: string;
  let staffFixtureId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: branches } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 2");
    if (branches.length < 2) throw new Error("Cần ít nhất 2 chi nhánh trong DB");
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    const { rows: custs } = await client.query(
      `INSERT INTO customers (branch_id, full_name) VALUES ($1, 'Fixture BB-259 Khách') RETURNING id`,
      [branchAId],
    );
    customerId = custs[0].id;

    // `drive_folder_id` cố định va chạm `uq_galleries_drive_folder` khi hai
    // agent chạy vitest song song trên bb-dev — mỗi lượt cần một giá trị riêng.
    const driveFolderId = `FIXTURE_BB259_FOLDER_${randomUUID()}`;
    const { rows: gal } = await client.query(
      `INSERT INTO galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status)
       VALUES ($1, $2, 'Fixture BB-259 Dòng thời gian', $3, 'https://drive.google.com/fixture-bb259', 'submitted')
       RETURNING id`,
      [branchAId, customerId, driveFolderId],
    );
    galleryId = gal[0].id;

    // Nhân viên giả — không cần ĐĂNG NHẬP thật vì requireStaff bị mock trong
    // phép thử này, nhưng staff_profiles.id vẫn khoá ngoại vào auth.users nên
    // phải có một dòng auth.users tối thiểu để insert không bị chặn.
    staffFixtureId = randomUUID();
    const emailNhanVien = `fixture.bb259.${staffFixtureId}@babybeanstudio.vn`;
    await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now())`,
      [staffFixtureId, emailNhanVien],
    );
    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       VALUES ($1, 'Fixture BB-259 Nhân viên', $2, 'cs', true)`,
      [staffFixtureId, emailNhanVien],
    );

    const goc = Date.now() - 6 * 3600_000;
    const dong = (msSauGoc: number, hang: Record<string, unknown>) =>
      client.query(
        `INSERT INTO activity_logs (branch_id, actor_type, actor_id, actor_label, action, entity_type, entity_id, gallery_id, metadata, ip, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          branchAId,
          hang.actorType,
          hang.actorId ?? null,
          hang.actorLabel ?? null,
          hang.action,
          hang.entityType ?? "gallery",
          hang.entityId ?? galleryId,
          hang.galleryId === undefined ? galleryId : hang.galleryId,
          JSON.stringify(hang.metadata ?? {}),
          "203.0.113.9",
          "Fixture-UA/1.0",
          new Date(goc + (msSauGoc as number)).toISOString(),
        ],
      );

    // Route CŨ: chỉ ghi entity_type/entity_id, KHÔNG ghi gallery_id — kiểm câu
    // "route cũ ghi entity_id" của brief.
    await dong(0, {
      actorType: "staff",
      actorId: staffFixtureId,
      actorLabel: "cs",
      action: "share_link.created",
      galleryId: null,
      metadata: { shareLinkId: randomUUID() },
    });

    // Route MỚI: ghi thẳng gallery_id.
    await dong(60_000, {
      actorType: "staff",
      actorId: staffFixtureId,
      actorLabel: "cs",
      action: "gallery.payment_recorded",
      metadata: { amount: 300000, method: "tien_mat" },
    });

    await client.query(
      `UPDATE activity_logs SET gallery_id = $1
       WHERE gallery_id IS NULL AND entity_type = 'gallery' AND entity_id = $1`,
      [galleryId],
    );
  });

  afterAll(async () => {
    await client.query("DELETE FROM activity_logs WHERE gallery_id = $1 OR entity_id = $1", [galleryId]);
    await client.query("DELETE FROM galleries WHERE id = $1", [galleryId]);
    await client.query("DELETE FROM customers WHERE id = $1", [customerId]);
    await client.query("DELETE FROM staff_profiles WHERE id = $1", [staffFixtureId]);
    await client.query("DELETE FROM auth.users WHERE id = $1", [staffFixtureId]);
    await client.end();
  });

  it("nhân viên đúng chi nhánh: thấy dòng thời gian, mới nhất trước, câu tiếng Việt đúng", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: staffFixtureId,
      role: "cs",
      permissions: quyenCuaVai("cs"),
      branchIds: [branchAId],
    });

    const req = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/dong-thoi-gian`);
    const res = await GET(req, { params: Promise.resolve({ id: galleryId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    const items: Array<{ luc: string; nhom: string; cau: string; nguoi: string }> = body.data.items;
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Mới nhất trước.
    expect(items[0]!.cau).toBe("Nhân viên ghi nhận thu 300.000đ");
    expect(items[0]!.nguoi).toBe("Fixture BB-259 Nhân viên");
    expect(items[0]!.nhom).toBe("tien");

    const dongLinkCu = items.find((i) => i.cau === "Nhân viên tạo link gửi khách");
    expect(dongLinkCu).toBeDefined();
    expect(dongLinkCu?.nguoi).toBe("Fixture BB-259 Nhân viên");
  });

  it("nhân viên chi nhánh khác không xem được (403/404)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: randomUUID(),
      role: "cs",
      permissions: quyenCuaVai("cs"),
      branchIds: [branchBId],
    });

    const req = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/dong-thoi-gian`);
    const res = await GET(req, { params: Promise.resolve({ id: galleryId }) });
    expect([403, 404]).toContain(res.status);
  });

  it("phản hồi KHÔNG lộ ip, user_agent, hay metadata thô", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: staffFixtureId,
      role: "cs",
      permissions: quyenCuaVai("cs"),
      branchIds: [branchAId],
    });

    const req = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/dong-thoi-gian`);
    const res = await GET(req, { params: Promise.resolve({ id: galleryId }) });
    const text = await res.text();
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("Fixture-UA");
    expect(text).not.toContain("ip\":");
    expect(text).not.toContain("user_agent");
    expect(text).not.toContain("metadata");
  });
});
