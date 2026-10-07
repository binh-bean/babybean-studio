/**
 * BB-377 — phép thử PHỦ ĐỊNH cho ảnh chỉnh của ảnh MUA THÊM.
 *
 *   | Ai                          | Ảnh chỉnh mua thêm bộ mình (chưa gửi) | Ảnh chỉnh mua thêm bộ khác | Gửi yêu cầu sửa |
 *   |-----------------------------|---------------------------------------|----------------------------|-----------------|
 *   | ba mẹ (link chính)          | KHÔNG (danh sách + /api/img)          | KHÔNG (403)                | được (đợt mình) |
 *   | người thân (link mời viewer)| KHÔNG                                 | KHÔNG                      | KHÔNG (403)     |
 *
 * Gọi THẲNG hàm route thật trên bb-dev (nền "Fixture BB-371 …", dọn theo id); chỉ
 * giả phiên (requireGallerySession) và "không phải nhân viên" (requireStaff). Phần
 * kiểm ngược chạy trên hàm thuần (`khachThayAnhChinhTheoDot`, `duocQuyetAnhChinh`) —
 * không tắt chốt nào trên bb-dev.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as docAnhChinh } from "@/app/api/g/anh-chinh-sua/route";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { POST as quyetDuyet } from "@/app/api/g/review/route";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungNenBb371 } from "../fixtures/bb-371";
import { dungBoBb377, type BoBb377 } from "../fixtures/bb-377";
import { quenNhoTinhNang, quenNhoTheoDot } from "@/lib/anh-chinh-sua/du-lieu";
import { duocQuyetAnhChinh, khachThayAnhChinhTheoDot } from "@/lib/anh-chinh-sua/theo-dot";

describe("BB-377: ảnh chỉnh mua thêm không lọt sang bộ khác, không lộ trước khi CSKH gửi đợt", () => {
  let pg: Client;
  let nen: NenFixture;
  let A: BoBb377;
  let B: BoBb377;

  function phien(bo: BoBb377, role: "owner" | "viewer" = "owner") {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValue(new staffAuth.AuthError("UNAUTHENTICATED"));
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo.id,
      customerId: null,
      selectionId: bo.selectionId,
      shareLinkId: bo.ownerLinkId,
      role,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  const danhSach = async () => {
    const res = await docAnhChinh(new Request("http://localhost/api/g/anh-chinh-sua"));
    expect(res.status).toBe(200);
    return (await res.json()).data as { anh: { id: string; khoa: string }[]; nhom: { khoa: string; nhan: string }[] };
  };
  const img = (id: string) =>
    layAnh(new Request(`http://localhost/api/img/${id}?w=400`), { params: Promise.resolve({ photoId: id }) });
  const quyet = (body: unknown) =>
    quyetDuyet(
      new Request("http://localhost/api/g/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { nen: n, customerB } = await dungNenBb371(pg);
    nen = n;
    // Cả hai bộ: ảnh trong gói đã gửi khách và đang chờ duyệt; đợt 2 mua thêm 2 tấm,
    // ảnh chỉnh mua thêm về SAU lần gửi đó.
    A = await dungBoBb377(pg, nen, "A377", { status: "awaiting_approval", guiTrongGoi: true });
    B = await dungBoBb377(pg, nen, "B377", { status: "awaiting_approval", guiTrongGoi: true, customerId: customerB });
    quenNhoTinhNang();
    quenNhoTheoDot();
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (!pg) return;
    try {
      await donNenFixture(pg, { galleryIds: [A?.id, B?.id], branchIds: [nen?.branchId] });
    } finally {
      await pg.end();
    }
  }, 60_000);

  it("ba mẹ A: thấy ảnh trong gói đã gửi, KHÔNG thấy ảnh mua thêm chưa gửi, không tấm nào của B", async () => {
    phien(A);
    const d = await danhSach();
    const ids = d.anh.map((a) => a.id).sort();
    expect(ids).toEqual(A.chinh.map((c) => c.id).sort());
    for (const c of [...A.chinhMuaThem, ...B.chinh, ...B.chinhMuaThem]) expect(ids).not.toContain(c.id);
  });

  it("ảnh mua thêm CHƯA gửi: /api/img của chính bộ mình → 404", async () => {
    phien(A);
    for (const c of A.chinhMuaThem) expect((await img(c.id)).status).toBe(404);
  });

  it("ba mẹ A xin ảnh chỉnh mua thêm của B qua /api/img → 403", async () => {
    phien(A);
    for (const c of B.chinhMuaThem) expect((await img(c.id)).status).toBe(403);
  });

  it("ba mẹ A gửi yêu cầu sửa trỏ vào ảnh mua thêm của B (hay của A chưa gửi) → bị chặn, không ghi vòng sửa", async () => {
    phien(A);
    for (const id of [B.chinhMuaThem[0]!.id, A.chinhMuaThem[0]!.id]) {
      const r = await quyet({ decision: "revise", items: [{ photoId: id, note: "Fixture thử" }] });
      expect([400, 404]).toContain(r.status);
      const r2 = await quyet({ decision: "revise", khoa: "dot:2", items: [{ photoId: id, note: "Fixture thử" }] });
      expect([400, 404]).toContain(r2.status);
    }
    const { rows } = await pg.query(`select count(*)::int n from revision_requests where gallery_id in ($1,$2)`, [A.id, B.id]);
    expect(rows[0].n).toBe(0);
  });

  it("người thân (link mời viewer) KHÔNG gửi được yêu cầu sửa — cả trong gói lẫn đợt mua thêm", async () => {
    phien(A, "viewer");
    for (const body of [
      { decision: "revise", items: [{ photoId: A.chinh[0]!.id, note: "Fixture bà nội" }] },
      { decision: "revise", khoa: "dot:2", items: [{ photoId: A.chinhMuaThem[0]!.id, note: "Fixture bà nội" }] },
      { decision: "approve", khoa: "dot:2" },
    ]) {
      expect((await quyet(body)).status).toBe(403);
    }
    const { rows } = await pg.query(`select count(*)::int n from revision_requests where gallery_id = $1`, [A.id]);
    expect(rows[0].n).toBe(0);
  });

  it("khoá đợt lạ (tiêm chuỗi) → 400", async () => {
    phien(A);
    expect((await quyet({ decision: "approve", khoa: "dot:2' or 1=1" })).status).toBe(400);
  });

  // ---- Kiểm ngược trên hàm thuần (không chạm bb-dev) ------------------------
  it("KIỂM NGƯỢC: nếu cổng dùng mốc chung cho ảnh mua thêm, ảnh chưa gửi sẽ lộ — cổng theo đợt chặn được", () => {
    const v = {
      trangThaiBo: "approved",
      khoa: "dot:2",
      mocChung: "2026-10-06T12:00:00Z",
      mocDot: new Map([["dot:3", { guiLuc: "2026-10-06T12:00:00Z", duyetLuc: null }]]),
      anhTaoLuc: "2026-10-06T11:00:00Z",
    };
    // Bản "lỗi" (luật BB-371 một mốc chung) cho khách thấy tấm đợt 2 chưa gửi:
    expect(khachThayAnhChinhTheoDot({ ...v, mocDot: null })).toBe(true);
    // Bản vá: mốc chung và mốc của đợt KHÁC đều không mở ảnh đợt 2.
    expect(khachThayAnhChinhTheoDot(v)).toBe(false);
  });

  it("chỉ vai owner được quyết; viewer/co_editor/suggester thì không", () => {
    expect(duocQuyetAnhChinh("owner")).toBe(true);
    for (const r of ["viewer", "co_editor", "suggester", "", null, undefined]) expect(duocQuyetAnhChinh(r)).toBe(false);
  });
});
