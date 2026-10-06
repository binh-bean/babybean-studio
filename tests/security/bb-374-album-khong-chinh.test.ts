/**
 * BB-374 — "Ảnh album không chỉnh sửa": an ninh + tiền, chạy route THẬT trên nền Fixture.
 *
 * Ai làm được gì:
 *   | Ai                          | Thêm suất (dòng hợp đồng)      | Chọn tấm cho suất                  |
 *   |-----------------------------|--------------------------------|------------------------------------|
 *   | CSKH (galleries:write)      | được — "Thêm sản phẩm"         | —                                  |
 *   | ba mẹ (owner/co_editor)     | KHÔNG (cửa hàng/addons từ chối) | được, tối đa N, chỉ ảnh của bộ mình |
 *   | anon (khoá trong trình duyệt)| không                         | không đọc được bảng                |
 *
 * Tiền (anh chốt 06/10): tấm "không chỉnh" 0 ₫, không vào hạn mức, "Phải thu" không đổi —
 * kiểm cả hai trường hợp: bộ KHÔNG có suất và bộ CÓ suất (kể cả khi bộ đang vượt hạn mức).
 *
 * Phần ghi bảng `anh_album_khong_chinh` / sản phẩm loại `album_unedited` cần migration
 * 0092 + 0093 (CHƯA ÁP lúc viết) — tự bỏ qua kèm lý do khi chưa áp. Phần còn lại chạy luôn.
 *
 * Dữ liệu "Fixture BB-374 …" (chi nhánh riêng) + sản phẩm "Mẫu kiểm thử BB-374 …", dọn
 * theo id ở afterAll (`donNenFixture` đọc lại, còn sót là ĐỎ).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as chonKc, DELETE as boKc } from "@/app/api/g/album-khong-chinh/route";
import { POST as postAddon } from "@/app/api/g/addons/route";
import { patchSelection } from "@/lib/selection/mutate";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GallerySession } from "@/types/domain";
import { taoBb345, donBb345, type DuLieuBb345, type BoBb345 } from "../fixtures/bb-345";
import { donNenFixture } from "../fixtures/nen-fixture";

const GIA = 50000;

// Route thật + bb-dev dùng chung với các đội khác: mỗi ca tới vài chục giây lúc tải nặng.
describe("BB-374: ảnh album không chỉnh sửa — an ninh và tiền", { timeout: 90_000 }, () => {
  let d: DuLieuBb345;
  let coMigration = false;
  const productIds: string[] = [];
  let pEdit = "";
  let pKc = "";

  function phien(bo: BoBb345): GallerySession {
    const s = {
      galleryId: bo.id,
      customerId: null,
      selectionId: bo.selectionId,
      shareLinkId: bo.ownerLinkId,
      role: "owner",
      exp: 0,
    } as unknown as GallerySession;
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue(
      s as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>,
    );
    return s;
  }
  const req = (method: "POST" | "DELETE", url: string, body: unknown) =>
    new Request(`http://localhost${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof chonKc>[0];
  const soDongKc = async (galleryId: string) =>
    coMigration
      ? ((await d.pg.query(`select count(*)::int n from anh_album_khong_chinh where gallery_id = $1`, [galleryId])).rows[0]
          .n as number)
      : 0;
  const soAnhChon = async (selectionId: string) =>
    (await d.pg.query(`select count(*)::int n from selection_items where selection_id = $1 and mark = 'selected'`, [selectionId]))
      .rows[0].n as number;
  const thaTimThang = async (bo: BoBb345, idx: number[]) => {
    for (const i of idx) {
      await d.pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [bo.selectionId, bo.anh[i]!.id, bo.id],
      );
    }
  };

  beforeAll(async () => {
    d = await taoBb345({ nhan: "Fixture BB-374", soAnhA: 8 });
    const { rows: en } = await d.pg.query(
      `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'product_kind' and e.enumlabel = 'album_unedited'`,
    );
    const { rows: bang } = await d.pg.query(`select to_regclass('public.anh_album_khong_chinh')::text as t`);
    coMigration = en.length > 0 && !!bang[0]?.t;

    // Hạn mức chỉnh sửa của bộ A = 3 (dòng "Edit file ×3"), giá ảnh thêm 50.000 ₫ (fixture).
    pEdit = randomUUID();
    await d.pg.query(
      `insert into products (id, name, kind, list_price, is_active) values ($1,'Fixture BB-374 Edit file','edited_photo',${GIA},false)`,
      [pEdit],
    );
    productIds.push(pEdit);
    await d.pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,3,0)`, [d.A.id, pEdit]);

    if (coMigration) {
      // `is_active = true` + chất liệu "Album (Ultra HD) 20x20" có trong bảng giá + giá đủ chắc:
      // mọi luật bán khác đều QUA, chỉ còn luật loại `album_unedited` chặn — phép thử addons
      // bên dưới đỏ đúng lý do. Tên "Mẫu kiểm thử …" (không "Fixture …": tên Fixture bị chặn
      // theo tên, phép thử sẽ xanh vì lý do sai — xem BB-288).
      pKc = randomUUID();
      await d.pg.query(
        `insert into products (id, name, kind, material, size, list_price, price_confidence, price_samples, is_active)
         values ($1,'Mẫu kiểm thử BB-374 Ảnh album không chỉnh sửa','album_unedited','Album (Ultra HD)','20x20',300000,1,10,true)`,
        [pKc],
      );
      productIds.push(pKc);
      await d.pg.query(`insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,2,0)`, [d.A.id, pKc]);
    }
  }, 90_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (!d) return;
    try {
      await donNenFixture(d.pg, { galleryIds: [d.A.id, d.B.id], branchIds: [d.branchId], productIds });
    } finally {
      await donBb345(d);
    }
  }, 90_000);

  it("ảnh của bộ KHÁC → 404, không ghi gì", async () => {
    phien(d.A);
    const res = await chonKc(req("POST", "/api/g/album-khong-chinh", { photoId: d.B.anh[0]!.id }));
    expect(res.status).toBe(404);
    expect(await soDongKc(d.B.id)).toBe(0);
    expect(await soDongKc(d.A.id)).toBe(0);
  });

  it("bộ KHÔNG có suất → 409, không ghi gì, hạn mức và tiền không đổi", async () => {
    phien(d.B);
    const tienTruoc = await layTienCanThu(createAdminClient(), d.B.id);
    const res = await chonKc(req("POST", "/api/g/album-khong-chinh", { photoId: d.B.anh[0]!.id }));
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error?.details?.lyDo ?? j.error?.lyDo).toBe("KHONG_CO_SUAT");
    expect(await soDongKc(d.B.id)).toBe(0);
    expect(await soAnhChon(d.B.selectionId)).toBe(0);
    const tienSau = await layTienCanThu(createAdminClient(), d.B.id);
    expect(tienSau.tongPhaiThu).toBe(tienTruoc.tongPhaiThu);
  });

  it("(sau 0092/0093) khách KHÔNG tự thêm suất qua /api/g/addons", async (ctx) => {
    if (!coMigration) ctx.skip();
    phien(d.A);
    const res = await postAddon(
      req("POST", "/api/g/addons", { productId: pKc, quantity: 5, photoId: null }) as unknown as Parameters<typeof postAddon>[0],
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { rows } = await d.pg.query(`select count(*)::int n from selection_addons where product_id = $1`, [pKc]);
    expect(rows[0].n).toBe(0);
  });

  it("(sau 0092/0093) suất KHÔNG cộng vào hạn mức chỉnh sửa", async (ctx) => {
    if (!coMigration) ctx.skip();
    const { rows } = await d.pg.query(`select app.gallery_quota($1) as q`, [d.A.id]);
    expect(rows[0].q).toBe(3);
  });

  it("(sau 0092/0093) chọn đúng N tấm, 0 ₫: không vào selection_items, Phải thu = 0", async (ctx) => {
    if (!coMigration) ctx.skip();
    const s = phien(d.A);
    await thaTimThang(d.A, [0, 1, 2]); // đúng hạn mức 3 → chưa vượt

    for (const i of [3, 4]) {
      const r = await chonKc(req("POST", "/api/g/album-khong-chinh", { photoId: d.A.anh[i]!.id }));
      expect(r.status).toBe(200);
    }
    // Tấm thứ N+1 → hết suất.
    const qua = await chonKc(req("POST", "/api/g/album-khong-chinh", { photoId: d.A.anh[5]!.id }));
    expect(qua.status).toBe(409);
    // Tấm đang thả tim → không vào được (một tấm không là cả hai).
    const trung = await chonKc(req("POST", "/api/g/album-khong-chinh", { photoId: d.A.anh[0]!.id }));
    expect(trung.status).toBe(409);

    expect(await soDongKc(d.A.id)).toBe(2);
    // Chỗ loại trừ: tấm "không chỉnh" KHÔNG thành ảnh chọn (hạn mức/tiền đếm selection_items).
    expect(await soAnhChon(s.selectionId)).toBe(3);
    const tien = await layTienCanThu(createAdminClient(), d.A.id);
    expect(tien.tienTheoAnh).toBe(0);
    expect(tien.tongPhaiThu).toBe(0);
  });

  it("(sau 0092/0093) bộ đang vượt hạn mức: Phải thu đúng bằng ảnh chỉnh vượt, tấm không chỉnh không cộng", async (ctx) => {
    if (!coMigration) ctx.skip();
    phien(d.A);
    await thaTimThang(d.A, [6]); // 4 ảnh chỉnh / hạn mức 3 → vượt 1
    const tien = await layTienCanThu(createAdminClient(), d.A.id);
    expect(tien.anhVuotChuaThu).toBe(1);
    expect(tien.tienTheoAnh).toBe(GIA);
    expect(await soDongKc(d.A.id)).toBe(2);
  });

  it("(sau 0092/0093) thả tim một tấm 'không chỉnh' → tấm rời suất, thành ảnh chỉnh", async (ctx) => {
    if (!coMigration) ctx.skip();
    const s = phien(d.A);
    const kq = await patchSelection(
      s,
      { clientOpId: randomUUID(), ops: [{ photoId: d.A.anh[3]!.id, mark: "selected" }] } as unknown as Parameters<
        typeof patchSelection
      >[1],
      null,
      null,
    );
    expect(kq.error).toBeUndefined();
    const { rows } = await d.pg.query(`select count(*)::int n from anh_album_khong_chinh where photo_id = $1`, [d.A.anh[3]!.id]);
    expect(rows[0].n).toBe(0);
    expect(await soDongKc(d.A.id)).toBe(1);
  });

  it("(sau 0092/0093) bỏ tấm ra thì trả suất", async (ctx) => {
    if (!coMigration) ctx.skip();
    phien(d.A);
    const r = await boKc(req("DELETE", "/api/g/album-khong-chinh", { photoId: d.A.anh[4]!.id }));
    expect(r.status).toBe(200);
    expect(await soDongKc(d.A.id)).toBe(0);
  });

  it("(sau 0093) khoá anon đọc thẳng bảng → không ra dòng nào", async (ctx) => {
    if (!coMigration) ctx.skip();
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await anon.from("anh_album_khong_chinh").select("photo_id").eq("gallery_id", d.A.id);
    expect(data ?? []).toEqual([]);
  });
});
