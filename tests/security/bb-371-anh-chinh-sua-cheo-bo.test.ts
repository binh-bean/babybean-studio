/**
 * BB-371 — phép thử PHỦ ĐỊNH cho ảnh chỉnh sửa trong app.
 *
 *   | Ai                      | Ảnh chỉnh bộ mình (đã gửi) | Ảnh chỉnh bộ mình (CHƯA gửi) | Ảnh chỉnh / ảnh mẫu bộ khác |
 *   |-------------------------|----------------------------|------------------------------|-----------------------------|
 *   | ba mẹ (phiên link chính)| xem được                   | KHÔNG (danh sách + /api/img) | KHÔNG                       |
 *   | lưới chọn ảnh gốc       | KHÔNG BAO GIỜ có ảnh chỉnh | —                            | —                           |
 *
 * Gọi THẲNG hàm route thật trên bb-dev (nền "Fixture BB-371 …", dọn theo id);
 * chỉ giả phiên (requireGallerySession) và "không phải nhân viên" (requireStaff).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as docAnhChinh } from "@/app/api/g/anh-chinh-sua/route";
import { GET as docLuoi } from "@/app/api/g/photos/route";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { POST as quyetDuyet } from "@/app/api/g/review/route";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungBoBb371, dungNenBb371, type BoBb371 } from "../fixtures/bb-371";
import { quenNhoTinhNang } from "@/lib/anh-chinh-sua/du-lieu";
import { NextRequest } from "next/server";

describe("BB-371: ảnh chỉnh sửa không lọt sang bộ khác, không lộ trước khi CSKH gửi", () => {
  let pg: Client;
  let nen: NenFixture;
  let A: BoBb371;
  let B: BoBb371;

  function phien(bo: BoBb371) {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo.id,
      customerId: null,
      selectionId: bo.selectionId,
      shareLinkId: bo.ownerLinkId,
      role: "owner",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  const anhChinhKhachThay = async () => {
    const res = await docAnhChinh(new Request("http://localhost/api/g/anh-chinh-sua"));
    expect(res.status).toBe(200);
    const j = await res.json();
    return (j.data.anh as { id: string; goc: { id: string } | null }[]);
  };
  const img = (id: string) =>
    layAnh(new Request(`http://localhost/api/img/${id}?w=400`), { params: Promise.resolve({ photoId: id }) });
  const revise = (body: unknown) =>
    quyetDuyet(
      new Request("http://localhost/api/g/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const soVong = async (galleryId: string) =>
    (await pg.query(`select count(*)::int n from revision_requests where gallery_id = $1`, [galleryId])).rows[0].n as number;

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const r = await dungNenBb371(pg);
    nen = r.nen;
    A = await dungBoBb371(pg, nen, "A", { status: "awaiting_approval", daGui: true });
    B = await dungBoBb371(pg, nen, "B", { status: "awaiting_approval", customerId: r.customerB, daGui: true });
    quenNhoTinhNang();
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (pg) {
      try {
        await donNenFixture(pg, { galleryIds: [A?.id, B?.id], branchIds: [nen?.branchId] });
      } finally {
        await pg.end();
      }
    }
  }, 60_000);

  it("ba mẹ A thấy ĐÚNG 2 ảnh chỉnh của A (kèm ảnh gốc ghép theo tên), không tấm nào của B", async () => {
    phien(A);
    const anh = await anhChinhKhachThay();
    expect(anh.map((a) => a.id).sort()).toEqual(A.chinh.map((c) => c.id).sort());
    for (const c of B.chinh) expect(anh.map((a) => a.id)).not.toContain(c.id);
    // IMG_0001-Edit ↔ IMG_0001, IMG_0003 ↔ IMG_0003
    const theoId = new Map(anh.map((a) => [a.id, a.goc?.id]));
    expect(theoId.get(A.chinh[0]!.id)).toBe(A.goc[0]!.id);
    expect(theoId.get(A.chinh[1]!.id)).toBe(A.goc[2]!.id);
  });

  it("công cụ khoanh vùng / ảnh mẫu chỉ bật khi bảng 0091 có thật (chưa áp thì ẩn)", async () => {
    phien(A);
    quenNhoTinhNang();
    const j = await (await docAnhChinh(new Request("http://localhost/api/g/anh-chinh-sua"))).json();
    const { rows } = await pg.query(`select to_regclass('public.revision_request_items')::text t`);
    expect(j.data.tinhNang.vungKhoanh).toBe(!!rows[0].t);
    if (!rows[0].t) expect(j.data.tinhNang.anhMau).toBe(false);
  });

  it("lưới chọn ảnh gốc (/api/g/photos) KHÔNG có ảnh chỉnh, vẫn đủ 4 ảnh gốc", async () => {
    phien(A);
    const res = await docLuoi(new NextRequest("http://localhost/api/g/photos?limit=200"));
    const j = await res.json();
    const ids = (j.data as { id: string }[]).map((p) => p.id);
    expect(ids.sort()).toEqual(A.goc.map((g) => g.id).sort());
  });

  it("ba mẹ A xin ảnh chỉnh của B qua /api/img → 403", async () => {
    phien(A);
    expect((await img(B.chinh[0]!.id)).status).toBe(403);
    // Đối chứng: ảnh chỉnh của chính A (đã gửi) thì mở được (302 sang lh3 hoặc 200).
    expect([200, 302]).toContain((await img(A.chinh[0]!.id)).status);
  });

  it("ba mẹ A gửi yêu cầu sửa trỏ vào ảnh chỉnh của B → 404, không ghi vòng sửa nào", async () => {
    phien(A);
    const res = await revise({ decision: "revise", note: "", items: [{ photoId: B.chinh[0]!.id, note: "Fixture" }] });
    expect(res.status).toBe(404);
    expect(await soVong(A.id)).toBe(0);
    expect(await soVong(B.id)).toBe(0);
  });

  it("ảnh mẫu trỏ vào thư mục của bộ B → 400, không ghi gì", async () => {
    phien(A);
    const res = await revise({
      decision: "revise",
      items: [
        {
          photoId: A.chinh[0]!.id,
          note: "Fixture",
          anhMau: [`${B.id}/00000000-0000-4000-8000-000000000371.jpg`],
        },
      ],
    });
    expect(res.status).toBe(400);
    expect(await soVong(A.id)).toBe(0);
  });

  it("CHƯA gửi khách (bộ còn in_retouch) → danh sách rỗng, /api/img 404", async () => {
    await pg.query(`update galleries set status = 'in_retouch' where id = $1`, [A.id]);
    try {
      phien(A);
      expect(await anhChinhKhachThay()).toEqual([]);
      expect((await img(A.chinh[0]!.id)).status).toBe(404);
    } finally {
      await pg.query(`update galleries set status = 'awaiting_approval' where id = $1`, [A.id]);
    }
  });

  it("ảnh chỉnh về SAU lần gửi (thợ thả thêm khi khách đang duyệt) → khách chưa thấy", async () => {
    const { rows } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, subfolder, created_at)
       values ($1,$2,'IMG_0004.jpg','image/jpeg',99,'active','anh chinh sua', now() + interval '1 minute') returning id`,
      [A.id, `bb371fixture${nen.runId}Amoi`],
    );
    const moi = rows[0].id as string;
    phien(A);
    const ids = (await anhChinhKhachThay()).map((a) => a.id);
    expect(ids).not.toContain(moi);
    expect(ids).toHaveLength(2);
    expect((await img(moi)).status).toBe(404);
  });

  it("yêu cầu sửa hợp lệ của A → vòng 1, ghi đủ chữ từng tấm, bộ về in_retouch", async () => {
    phien(A);
    const res = await revise({
      decision: "revise",
      note: "Fixture ghi chú chung",
      items: [{ photoId: A.chinh[0]!.id, note: "Fixture da sáng hơn", marks: [{ x: 0.5, y: 0.4, r: 0.07 }] }],
    });
    expect(res.status).toBe(200);
    const { rows } = await pg.query(`select round, note from revision_requests where gallery_id = $1`, [A.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].round).toBe(1);
    expect(rows[0].note).toContain("IMG_0001-Edit.jpg: Fixture da sáng hơn");
    const { rows: g } = await pg.query(`select status from galleries where id = $1`, [A.id]);
    expect(g[0].status).toBe("in_retouch");
    expect(await soVong(B.id)).toBe(0);
  });
});
