/**
 * BB-334A — phép thử PHỦ ĐỊNH cho link gia đình và phiên "mỗi lượt gọi nêu bộ ảnh".
 *
 * Chạy ĐƯỜNG THẬT: cookie phiên ký bằng `signGallerySession` (đúng APP_SECRET),
 * `requireGallerySession` + `assertShareLinkUsable` thật, route `/api/g/*` thật,
 * cơ sở dữ liệu thật (bb-dev, dữ liệu "Fixture BB-334A-…" dọn theo id). Chỉ
 * `next/headers` là giả (không có ngữ cảnh yêu cầu của Next trong vitest).
 *
 * Ai làm được gì:
 *   | Phiên                         | Bộ của nhà mình        | Bộ của nhà khác | Bộ khác cùng nhà |
 *   |-------------------------------|------------------------|-----------------|------------------|
 *   | link gia đình A (owner)       | đọc + ghi (nêu x-bb-bo) | 403, không ghi  | —                |
 *   | link cũ theo bộ A1            | chỉ A1                 | 403             | 403 (A2)         |
 *   | link gia đình đã thu hồi      | 410 LINK_EXPIRED       | 410             | 410              |
 *
 * Kiểm ngược (AGENTS §5a) — đã chạy, kết quả dán trong bàn giao:
 *   - bỏ `.eq("customer_id", …)` trong `boAnhCuaKhach` → nhóm 1 ĐỎ;
 *   - cho `chotBoAnhChoPhien` bỏ qua `x-bb-bo` → nhóm 2 ĐỎ;
 *   - bỏ phép so `boYeuCau !== session.galleryId` của link cũ → nhóm 3 ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";

const chonAnh = (photoId: string | undefined) =>
  JSON.stringify({ clientOpId: randomUUID(), ops: [{ photoId, mark: "selected" }] });

vi.mock("server-only", () => ({}));

let cookieHienTai = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (ten: string) => (ten === "bb_gs" && cookieHienTai ? { value: cookieHienTai } : undefined),
    getAll: () => [],
    set: () => {},
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));

import { signGallerySession } from "@/lib/auth/gallery-session";
import { GET as docBoAnh } from "@/app/api/g/gallery/route";
import { GET as docAnh } from "@/app/api/g/photos/route";
import { PATCH as doiChon } from "@/app/api/g/selection/route";
import { POST as chot } from "@/app/api/g/submit/route";
import { GET as layKenh } from "@/app/api/g/tuc-thi/route";
import { POST as thaTim } from "@/app/api/g/tim-gia-dinh/route";
import { GET as trangGiaDinh } from "@/app/api/k/[ma]/route";
import { GET as manifestNha } from "@/app/api/k/[ma]/manifest.webmanifest/route";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";
import { kenhKhach } from "@/lib/supabase/tuc-thi";
import { taoBb334a, donBb334a, type DuLieuBb334a } from "../fixtures/bb-334a";

const ipRun = `10.${((process.pid ?? 1) % 200) + 1}.${Math.floor(Math.random() * 250) + 1}`;
let ipDem = 0;

describe("BB-334A: link gia đình — phiên theo lượt gọi, không lọt chéo", () => {
  let d: DuLieuBb334a;

  async function dangNhap(p: {
    customerId: string;
    galleryId: string;
    shareLinkId: string;
    selectionId: string;
    role: "owner" | "viewer";
  }) {
    const { token } = await signGallerySession(p);
    cookieHienTai = token;
  }
  const giaDinhA = (galleryId = "", selectionId = "") =>
    dangNhap({ customerId: d.khachA, galleryId, shareLinkId: d.giaDinhA.id, selectionId, role: "owner" });
  const linkCuA1 = () =>
    dangNhap({ customerId: "", galleryId: d.A1.id, shareLinkId: d.linkCuA1.id, selectionId: d.linkCuA1.selectionId, role: "owner" });

  const yc = (duong: string, bo: string | null, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    if (bo) h.set("x-bb-bo", bo);
    h.set("x-forwarded-for", `${ipRun}.${++ipDem % 250}`);
    if (init.body) h.set("content-type", "application/json");
    return new Request(`http://localhost${duong}`, { ...init, headers: h });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thân JSON của phản hồi, đọc theo từng phép thử
  const json = async (r: Response) => (await r.json().catch(() => null)) as { data?: Record<string, any>; error?: { code?: string } } | null;
  const dem = async (sql: string, args: unknown[]) => (await d.pg.query(sql, args)).rows[0].n as number;

  beforeAll(async () => {
    d = await taoBb334a();
  }, 60_000);

  afterAll(async () => {
    cookieHienTai = "";
    if (d) await donBb334a(d);
  }, 60_000);

  // -------------------------------------------------------------------------
  // 1. Link gia đình KHÔNG đọc/ghi được bộ của khách khác
  // -------------------------------------------------------------------------
  describe("1. link gia đình A nêu bộ B1 của nhà khác", () => {
    it("đối chứng: nêu A1 (nhà mình) → 200 đúng bộ A1", async () => {
      await giaDinhA();
      const r = await docBoAnh(yc("/api/g/gallery", d.A1.id));
      expect(r.status).toBe(200);
      expect((await json(r))?.data?.id).toBe(d.A1.id);
    });

    it("GET /api/g/gallery và /api/g/photos với x-bb-bo = B1 → 403, không lộ dữ liệu B1", async () => {
      await giaDinhA();
      const r1 = await docBoAnh(yc("/api/g/gallery", d.B1.id));
      expect(r1.status).toBe(403);
      expect(JSON.stringify(await json(r1))).not.toContain(d.B1.id);
      const r2 = await docAnh(yc("/api/g/photos", d.B1.id) as never);
      expect(r2.status).toBe(403);
      expect(JSON.stringify(await json(r2))).not.toContain(d.B1.anh[0]);
    });

    it("PATCH /api/g/selection + POST /api/g/submit với x-bb-bo = B1 → 403, B1 không đổi", async () => {
      await giaDinhA();
      const r1 = await doiChon(
        yc("/api/g/selection", d.B1.id, { method: "PATCH", body: chonAnh(d.B1.anh[0]) }),
      );
      expect(r1.status).toBe(403);
      const r2 = await chot(
        yc("/api/g/submit", d.B1.id, {
          method: "POST",
          body: JSON.stringify({ confirmedByName: "Fixture BB-334A", agreed: true, dongYAnhStudioChon: true }),
        }),
      );
      expect(r2.status).toBe(403);
      expect(await dem(`select count(*)::int n from selection_items where gallery_id = $1`, [d.B1.id])).toBe(0);
      expect(await dem(`select count(*)::int n from selections where gallery_id = $1 and submitted_at is not null`, [d.B1.id])).toBe(0);
      // Không đẻ lượt chọn nào của link gia đình A trên bộ B1.
      expect(await dem(`select count(*)::int n from selections where gallery_id = $1 and share_link_id = $2`, [d.B1.id, d.giaDinhA.id])).toBe(0);
    });

    it("tim + kênh tức thì của link mời theo khách A: A1 được, B1 → 403", async () => {
      await dangNhap({ customerId: d.khachA, galleryId: "", shareLinkId: d.moiGiaDinhA.id, selectionId: "", role: "viewer" });
      const k = await layKenh(yc("/api/g/tuc-thi", d.A1.id));
      expect((await json(k))?.data?.kenh).toEqual([kenhKhach(d.A1.id)]);
      expect((await layKenh(yc("/api/g/tuc-thi", d.B1.id))).status).toBe(403);

      expect((await thaTim(yc("/api/g/tim-gia-dinh", d.B1.id, { method: "POST", body: JSON.stringify({ them: [d.B1.anh[0]] }) }))).status).toBe(403);
      const ok = await thaTim(yc("/api/g/tim-gia-dinh", d.A1.id, { method: "POST", body: JSON.stringify({ them: [d.A1.anh[1]] }) }));
      expect(ok.status).toBe(200);
      const { rows } = await d.pg.query(`select gallery_id, share_link_id from tim_gia_dinh where photo_id = $1`, [d.A1.anh[1]]);
      expect(rows).toEqual([{ gallery_id: d.A1.id, share_link_id: d.moiGiaDinhA.id }]);
      expect(await dem(`select count(*)::int n from tim_gia_dinh where gallery_id = $1`, [d.B1.id])).toBe(0);
    });

    it("GET /api/k/<mã gia đình A> chỉ liệt kê A1, A2 — không có B1, không lộ SĐT", async () => {
      cookieHienTai = "";
      const r = await trangGiaDinh(yc(`/api/k/x`, null), { params: Promise.resolve({ ma: d.giaDinhA.ma }) });
      expect(r.status).toBe(200);
      const body = await json(r);
      const ids = (body?.data?.boAnh ?? []).map((b: { id: string }) => b.id).sort();
      expect(ids).toEqual([d.A1.id, d.A2.id].sort());
      expect(body?.data?.loaiLink).toBe("gia_dinh");
      // Số thứ tự theo lúc tạo: A1 (01/09) = 1, A2 (20/09) = 2.
      const so = Object.fromEntries((body?.data?.boAnh ?? []).map((b: { id: string; soThuTu: number }) => [b.id, b.soThuTu]));
      expect(so[d.A1.id]).toBe(1);
      expect(so[d.A2.id]).toBe(2);
      expect(JSON.stringify(body)).not.toContain("0901000001");
      expect(r.headers.get("set-cookie") ?? "").toContain("bb_gs=");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Hai tab hai bộ không chốt vào nhau
  // -------------------------------------------------------------------------
  describe("2. hai tab: cookie đang trỏ A2 (tab B), tab A chốt A1", () => {
    it("phiên /k/ (cookie không trỏ bộ nào) mà KHÔNG nêu x-bb-bo → 403, không đoán bộ", async () => {
      await giaDinhA();
      const r = await chot(
        yc("/api/g/submit", null, {
          method: "POST",
          body: JSON.stringify({ confirmedByName: "Fixture BB-334A", agreed: true, dongYAnhStudioChon: true }),
        }),
      );
      expect(r.status).toBe(403);
      expect((await doiChon(yc("/api/g/selection", null, { method: "PATCH", body: chonAnh(d.A1.anh[0]) }))).status).toBe(403);
      expect(await dem(`select count(*)::int n from selection_items where gallery_id in ($1,$2)`, [d.A1.id, d.A2.id])).toBe(0);
    });

    it("chọn + chốt với x-bb-bo = A1 đi vào A1, A2 nguyên vẹn", async () => {
      // Tab B vừa mở A2 qua luồng cũ (ký lại cookie sang A2, có lượt chọn riêng của A2).
      const { rows } = await d.pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
        [d.A2.id, d.giaDinhA.id],
      );
      await giaDinhA(d.A2.id, rows[0].id as string);

      // Tab A (đang hiện A1) bấm chọn rồi chốt.
      const r1 = await doiChon(
        yc("/api/g/selection", d.A1.id, { method: "PATCH", body: chonAnh(d.A1.anh[0]) }),
      );
      expect(r1.status).toBe(200);
      const r2 = await chot(
        yc("/api/g/submit", d.A1.id, {
          method: "POST",
          body: JSON.stringify({ confirmedByName: "Fixture BB-334A", agreed: true, dongYAnhStudioChon: true }),
        }),
      );
      expect(r2.status).toBe(200);

      // Vào A1 — và vào ĐÚNG lượt chọn chính của A1 (dùng chung với link cũ theo bộ).
      expect(await dem(`select count(*)::int n from selection_items where selection_id = $1 and mark = 'selected'`, [d.linkCuA1.selectionId])).toBe(1);
      expect(await dem(`select count(*)::int n from selections where id = $1 and submitted_at is not null`, [d.linkCuA1.selectionId])).toBe(1);
      // A2 (bộ của cookie) KHÔNG bị chạm.
      expect(await dem(`select count(*)::int n from selection_items where gallery_id = $1`, [d.A2.id])).toBe(0);
      expect(await dem(`select count(*)::int n from selections where gallery_id = $1 and submitted_at is not null`, [d.A2.id])).toBe(0);
      const { rows: g } = await d.pg.query(`select status from galleries where id = $1`, [d.A2.id]);
      expect(g[0].status).toBe("in_review");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Link cũ theo bộ không được thêm quyền
  // -------------------------------------------------------------------------
  describe("3. link cũ theo bộ A1", () => {
    it("đối chứng: không nêu bộ, hoặc nêu đúng A1 → 200 bộ A1 (chạy y như cũ)", async () => {
      await linkCuA1();
      expect((await json(await docBoAnh(yc("/api/g/gallery", null))))?.data?.id).toBe(d.A1.id);
      expect((await json(await docBoAnh(yc("/api/g/gallery", d.A1.id))))?.data?.id).toBe(d.A1.id);
    });

    it("nêu A2 (CÙNG nhà) → 403 khi đọc và khi ghi", async () => {
      await linkCuA1();
      expect((await docBoAnh(yc("/api/g/gallery", d.A2.id))).status).toBe(403);
      expect((await docAnh(yc("/api/g/photos", d.A2.id) as never)).status).toBe(403);
      const r = await doiChon(
        yc("/api/g/selection", d.A2.id, { method: "PATCH", body: chonAnh(d.A2.anh[1]) }),
      );
      expect(r.status).toBe(403);
      expect(await dem(`select count(*)::int n from selection_items where gallery_id = $1`, [d.A2.id])).toBe(0);
    });

    it("đối chứng ảnh: link cũ A1 xin ảnh CỦA A1 → không bị chặn quyền (khách link cũ vẫn thấy ảnh)", async () => {
      await linkCuA1();
      const r = await layAnh(yc(`/api/img/${d.A1.anh[0]}?w=400`, null), { params: Promise.resolve({ photoId: d.A1.anh[0]! }) });
      // Ảnh giả không có trên Drive nên có thể không ra 200 — điều canh ở đây là
      // tầng QUYỀN không chặn (401/403) ảnh đúng bộ của link cũ.
      expect([401, 403]).not.toContain(r.status);
    });

    it("ảnh qua /api/img: link cũ A1 xin ảnh A2 → 403; link gia đình A xin ảnh B1 → 403", async () => {
      await linkCuA1();
      const r1 = await layAnh(yc(`/api/img/${d.A2.anh[0]}?w=400`, null), { params: Promise.resolve({ photoId: d.A2.anh[0]! }) });
      expect(r1.status).toBe(403);
      await giaDinhA(d.A2.id);
      const r2 = await layAnh(yc(`/api/img/${d.B1.anh[0]}?w=400`, null), { params: Promise.resolve({ photoId: d.B1.anh[0]! }) });
      expect(r2.status).toBe(403);
    });

    it("mở qua /api/k/<mã link cũ> → chỉ đúng A1, loaiLink theo_bo", async () => {
      cookieHienTai = "";
      const r = await trangGiaDinh(yc(`/api/k/x`, null), { params: Promise.resolve({ ma: d.linkCuA1.ma }) });
      const body = await json(r);
      expect(r.status).toBe(200);
      expect(body?.data?.loaiLink).toBe("theo_bo");
      expect((body?.data?.boAnh ?? []).map((b: { id: string }) => b.id)).toEqual([d.A1.id]);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Link gia đình đã thu hồi bị chặn
  // -------------------------------------------------------------------------
  describe("4. link gia đình đã thu hồi", () => {
    it("cookie còn hạn của link đã thu hồi → 410 LINK_EXPIRED, kể cả khi nêu bộ của nhà mình", async () => {
      await dangNhap({ customerId: d.khachA, galleryId: "", shareLinkId: d.giaDinhAThuHoi.id, selectionId: "", role: "owner" });
      const r = await docBoAnh(yc("/api/g/gallery", d.A1.id));
      expect(r.status).toBe(410);
      expect((await json(r))?.error?.code).toBe("LINK_EXPIRED");
      expect((await doiChon(yc("/api/g/selection", d.A1.id, { method: "PATCH", body: chonAnh(d.A1.anh[1]) }))).status).toBe(410);
    });

    it("GET /api/k/<mã đã thu hồi> → 404; manifest → 404", async () => {
      cookieHienTai = "";
      const r = await trangGiaDinh(yc(`/api/k/x`, null), { params: Promise.resolve({ ma: d.giaDinhAThuHoi.ma }) });
      expect(r.status).toBe(404);
      const m = await manifestNha(yc(`/api/k/x/manifest.webmanifest`, null), { params: Promise.resolve({ ma: d.giaDinhAThuHoi.ma }) });
      expect(m.status).toBe(404);
      // Đối chứng: link sống → manifest 200, start_url là trang gia đình.
      const ok = await manifestNha(yc(`/api/k/x/manifest.webmanifest`, null), { params: Promise.resolve({ ma: d.giaDinhA.ma }) });
      expect(ok.status).toBe(200);
      expect((await ok.json()).start_url).toBe(`/k/${d.giaDinhA.ma}`);
    });

    it("mã bịa → 404 (không phân biệt với thu hồi)", async () => {
      cookieHienTai = "";
      const r = await trangGiaDinh(yc(`/api/k/x`, null), { params: Promise.resolve({ ma: randomBytes(32).toString("base64url") }) });
      expect(r.status).toBe(404);
    });
  });
});
