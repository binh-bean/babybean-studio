/**
 * BB-345 — phép thử PHỦ ĐỊNH cho bảng `tim_gia_dinh` (migration 0083).
 *
 * Ai đọc/ghi được gì:
 *   | Ai                         | Tim của link mình | Tim của link khác cùng bộ | Tim của bộ ảnh khác |
 *   |----------------------------|-------------------|---------------------------|---------------------|
 *   | viewer (link mời)          | đọc + ghi         | không                     | không               |
 *   | ba mẹ (owner…)             | —                 | đọc (gom theo tấm)        | không               |
 *   | anon / authenticated (khoá | không (RLS bật, không policy, revoke all)                             |
 *   |  công khai trong trình duyệt)                                                                     |
 *
 * Canh ở đây:
 *   1. Viewer của bộ A gửi id ảnh của bộ B → 404, KHÔNG ghi gì (cả các tấm hợp lệ
 *      đi kèm trong cùng lượt). Phần này canh được cả khi CHƯA áp 0083 vì kiểm ảnh
 *      đứng trước khi chạm bảng.
 *   2. (sau 0083) Có tim của link bộ B trong DB → phiên viewer A và ba mẹ A KHÔNG
 *      đọc thấy; viewer A "bỏ tim" tấm của B → 404 và tim của B còn nguyên; đặt
 *      chỉnh sửa từ A không kéo theo tấm của B.
 *   3. (sau 0083) Khoá anon đọc thẳng bảng → không ra dòng nào.
 *
 * Dữ liệu "Fixture BB-345-…" (chi nhánh riêng), dọn theo id ở afterAll.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as docTim, POST as guiTim } from "@/app/api/g/tim-gia-dinh/route";
import { POST as datChinhSua } from "@/app/api/g/tim-gia-dinh/dat-chinh-sua/route";
import { taoBb345, donBb345, coBangTimGiaDinh, type DuLieuBb345, type BoBb345 } from "../fixtures/bb-345";

describe("BB-345: tim gia đình không lọt sang bộ ảnh/link khác", () => {
  let d: DuLieuBb345;
  let coBang = false;

  function phien(bo: BoBb345, vai: "viewer" | "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo.id,
      customerId: null,
      selectionId: bo.selectionId,
      shareLinkId: vai === "viewer" ? bo.viewerLinkId : bo.ownerLinkId,
      role: vai,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  const post = (url: string, body: unknown) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const soDongTim = async (galleryId: string) =>
    (await d.pg.query(`select count(*)::int n from tim_gia_dinh where gallery_id = $1`, [galleryId])).rows[0].n as number;

  beforeAll(async () => {
    d = await taoBb345();
    coBang = await coBangTimGiaDinh(d.pg);
    if (coBang) {
      // Tim của link mời bộ B (nạn nhân) — chèn thẳng, không qua route.
      await d.pg.query(`insert into tim_gia_dinh (gallery_id, share_link_id, photo_id) values ($1,$2,$3)`, [
        d.B.id,
        d.B.viewerLinkId,
        d.B.anh[0]!.id,
      ]);
    }
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (d) await donBb345(d);
  }, 60_000);

  it("viewer A thả tim ảnh của bộ B → 404, không ghi gì", async () => {
    phien(d.A, "viewer");
    const res = await guiTim(post("/api/g/tim-gia-dinh", { them: [d.B.anh[1]!.id] }));
    expect(res.status).toBe(404);
    if (coBang) {
      const { rows } = await d.pg.query(`select count(*)::int n from tim_gia_dinh where photo_id = $1`, [d.B.anh[1]!.id]);
      expect(rows[0].n).toBe(0);
    }
  });

  it("viewer A gửi lẫn ảnh A + ảnh B trong một lượt → 404 cả lượt, ảnh A cũng không được ghi", async () => {
    phien(d.A, "viewer");
    const res = await guiTim(post("/api/g/tim-gia-dinh", { them: [d.A.anh[0]!.id, d.B.anh[1]!.id] }));
    expect(res.status).toBe(404);
    if (coBang) expect(await soDongTim(d.A.id)).toBe(0);
  });

  it("viewer A 'bỏ tim' tấm của B → 404, tim của B còn nguyên", async () => {
    phien(d.A, "viewer");
    const res = await guiTim(post("/api/g/tim-gia-dinh", { bo: [d.B.anh[0]!.id] }));
    expect(res.status).toBe(404);
    if (coBang) expect(await soDongTim(d.B.id)).toBe(1);
  });

  it("(sau 0083) phiên viewer A và ba mẹ A không đọc được tim của bộ B", async (ctx) => {
    if (!coBang) ctx.skip();
    phien(d.A, "viewer");
    const v = await (await docTim()).json();
    expect(v.data.cuaToi).not.toContain(d.B.anh[0]!.id);
    expect(v.data.cuaToi).toEqual([]);

    phien(d.A, "owner");
    const o = await (await docTim()).json();
    expect(o.data.giaDinh.map((x: { photoId: string }) => x.photoId)).not.toContain(d.B.anh[0]!.id);
    expect(o.data.giaDinh).toEqual([]);

    // Đối chứng: phiên ba mẹ B THẤY đúng tấm đó — phép thử không xanh vì route luôn trả rỗng.
    phien(d.B, "owner");
    const ob = await (await docTim()).json();
    expect(ob.data.giaDinh.map((x: { photoId: string }) => x.photoId)).toEqual([d.B.anh[0]!.id]);
  });

  it("(sau 0083) đặt chỉnh sửa từ viewer A không kéo theo tấm của B", async (ctx) => {
    if (!coBang) ctx.skip();
    phien(d.A, "viewer");
    // A chưa có tim nào → 400, KHÔNG lấy tim của B.
    const res = await datChinhSua(
      post("/api/g/tim-gia-dinh/dat-chinh-sua", { tenNguoiMua: "Fixture BB-345", sdtNguoiMua: "0901000001" }),
    );
    expect(res.status).toBe(400);
    const { rows } = await d.pg.query(`select count(*)::int n from yeu_cau_mua_them where gallery_id in ($1,$2)`, [
      d.A.id,
      d.B.id,
    ]);
    expect(rows[0].n).toBe(0);
  });

  it("(sau 0083) khoá anon đọc thẳng bảng tim → không ra dòng nào", async (ctx) => {
    if (!coBang) ctx.skip();
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await anon.from("tim_gia_dinh").select("photo_id").eq("gallery_id", d.B.id);
    expect(data ?? []).toEqual([]);
  });
});
