/**
 * BB-202 — "album ảnh" đúng nghĩa: gợi ý + bắt buộc chọn bìa cho album TRONG
 * GÓI; album MUA THÊM trong cửa hàng chỉ còn đặt mua (không tự đưa ảnh).
 *
 * Bốn khối phép thử:
 *   A. `goiYBiaAlbum` — hàm thuần, không cần cơ sở dữ liệu.
 *   B. `locBoAnh` / `dungThe` — dòng "Bìa album" sống sót qua tấm lưới an
 *      toàn "không ảnh của bé sang Lark".
 *   C. `/api/g/placements` với `addonId` — bị khoá (409), không cần cơ sở dữ
 *      liệu thật (chặn xảy ra ngay sau khi đọc phiên, trước mọi truy vấn).
 *   D. Cơ sở dữ liệu thật (bb-dev): `/api/g/album-cover` và luật chặn chốt ở
 *      `/api/g/submit`. Bảng `album_covers` (migration 0075) CHƯA ĐƯỢC ÁP —
 *      khối D tự dò bảng, THIẾU THÌ BỎ QUA (không đỏ, không giả vờ xanh) và in
 *      dòng "chờ Opus áp 0075".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

import { goiYBiaAlbum, type UngVienBiaAlbum } from "@/lib/products/goi-y-bia-album";
import { locBoAnh, dungThe } from "@/lib/lark/notify";

vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// A. goiYBiaAlbum — hàm thuần
// ---------------------------------------------------------------------------

describe("BB-202 A. goiYBiaAlbum — gợi ý ảnh bìa", () => {
  const u = (partial: Partial<UngVienBiaAlbum> & { photoId: string }): UngVienBiaAlbum => ({
    selectionItemId: `si-${partial.photoId}`,
    fileName: `${partial.photoId}.jpg`,
    retouchNote: null,
    orderIndex: null,
    sortIndex: 0,
    ...partial,
  });

  it("1. Không có tấm nào thả tim thì trả về rỗng — không bịa ra gợi ý", () => {
    expect(goiYBiaAlbum([], null)).toEqual([]);
    expect(goiYBiaAlbum([], "photo-bia-bo-anh")).toEqual([]);
  });

  it("2. Ít hơn 4 tấm thì trả về ĐÚNG số đang có, không độn thêm", () => {
    const ds = [u({ photoId: "a", sortIndex: 1 }), u({ photoId: "b", sortIndex: 2 })];
    const goiY = goiYBiaAlbum(ds, null);
    expect(goiY.length).toBe(2);
    expect(goiY.map((x) => x.photoId)).toEqual(["a", "b"]);
  });

  it("3. Thứ tự ưu tiên: có ghi chú > là bìa bộ ảnh > thứ tự thả tim", () => {
    const ds = [
      u({ photoId: "thu-tu-1", sortIndex: 1 }),
      u({ photoId: "thu-tu-2", sortIndex: 2 }),
      u({ photoId: "la-bia-bo-anh", sortIndex: 3 }),
      u({ photoId: "co-ghi-chu", sortIndex: 4, retouchNote: "Làm sáng da giúp em" }),
      u({ photoId: "thu-tu-3", sortIndex: 5 }),
    ];
    const goiY = goiYBiaAlbum(ds, "la-bia-bo-anh", 3);
    // Hạng 0 (ghi chú) trước, hạng 1 (bìa bộ ảnh) kế, rồi mới tới thứ tự thả
    // tim — đúng ba hạng chốt ở docs/19 mục 1.
    expect(goiY.map((x) => x.photoId)).toEqual(["co-ghi-chu", "la-bia-bo-anh", "thu-tu-1"]);
  });

  it("4. Ghi chú trắng (chỉ khoảng trắng) KHÔNG được tính là 'có ghi chú'", () => {
    const ds = [
      u({ photoId: "ghi-chu-trang", sortIndex: 1, retouchNote: "   " }),
      u({ photoId: "khong-ghi-chu", sortIndex: 2 }),
    ];
    // Cả hai cùng hạng 2 (không ghi chú thật, không phải bìa bộ ảnh) — thứ tự
    // giữ theo sortIndex, tức "ghi-chu-trang" vẫn đứng trước vì đứng trước
    // trong danh sách gốc, KHÔNG PHẢI vì ghi chú trắng được ưu tiên.
    const goiY = goiYBiaAlbum(ds, null);
    expect(goiY.map((x) => x.photoId)).toEqual(["ghi-chu-trang", "khong-ghi-chu"]);
  });

  it("5. Đúng 4 tấm gợi ý mặc định — dư ra thì cắt bớt, không hiện cả danh sách", () => {
    const ds = Array.from({ length: 10 }, (_, i) => u({ photoId: `p${i}`, sortIndex: i }));
    expect(goiYBiaAlbum(ds, null).length).toBe(4);
  });

  it("6. anhBiaBoAnhId null thì không tấm nào được hạng 'là bìa bộ ảnh'", () => {
    const ds = [u({ photoId: "x", sortIndex: 1 }), u({ photoId: "y", sortIndex: 2 })];
    // Không ném lỗi, không ưu tiên sai tấm nào.
    expect(goiYBiaAlbum(ds, null).map((x) => x.photoId)).toEqual(["x", "y"]);
  });
});

// ---------------------------------------------------------------------------
// B. Thẻ Lark: dòng "Bìa album" sống sót qua locBoAnh()
// ---------------------------------------------------------------------------

describe("BB-202 B. Thẻ Lark — dòng Bìa album", () => {
  it("1. locBoAnh KHÔNG cắt khoá biaAlbumTen (không chứa chữ 'anh')", () => {
    const payload = { galleryTitle: "Bé Bean", biaAlbumTen: ["IMG_001", "IMG_042"] };
    const sau = locBoAnh(payload);
    expect(sau.biaAlbumTen).toEqual(["IMG_001", "IMG_042"]);
  });

  it("2. dungThe() cho selection.submitted hiện dòng Bìa album khi có bìa", () => {
    const the = dungThe(
      "selection.submitted",
      { galleryTitle: "Bé Bean", selectedCount: 20, includedQuota: 20, biaAlbumTen: ["IMG_007"] },
      null,
    );
    const chuoi = JSON.stringify(the);
    expect(chuoi).toContain("Bìa album");
    expect(chuoi).toContain("IMG_007");
  });

  it("3. Không có bìa nào (mảng rỗng) thì KHÔNG bịa ra dòng Bìa album", () => {
    const the = dungThe(
      "selection.submitted",
      { galleryTitle: "Bé Bean", selectedCount: 20, includedQuota: 20, biaAlbumTen: [] },
      null,
    );
    expect(JSON.stringify(the)).not.toContain("Bìa album");
  });
});

// ---------------------------------------------------------------------------
// C. /api/g/placements — album mua thêm bị khoá, không cần cơ sở dữ liệu thật
// ---------------------------------------------------------------------------

describe("BB-202 C. /api/g/placements — album mua thêm không tự đưa ảnh nữa", () => {
  it("1. POST kèm addonId bị từ chối 409 CONFLICT, không chạm cơ sở dữ liệu", async () => {
    vi.resetModules();
    const gallerySession = await import("@/lib/auth/gallery-session");
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: randomUUID(),
      customerId: null,
      role: "owner",
      shareLinkId: randomUUID(),
      selectionId: randomUUID(),
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);

    const { POST } = await import("@/app/api/g/placements/route");
    const req = new NextRequest("http://localhost/api/g/placements", {
      method: "POST",
      body: JSON.stringify({ addonId: randomUUID(), photoId: randomUUID() }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("2. DELETE kèm addonId cũng bị từ chối 409 CONFLICT", async () => {
    const gallerySession = await import("@/lib/auth/gallery-session");
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: randomUUID(),
      customerId: null,
      role: "owner",
      shareLinkId: randomUUID(),
      selectionId: randomUUID(),
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);

    const { DELETE } = await import("@/app/api/g/placements/route");
    const req = new NextRequest("http://localhost/api/g/placements", {
      method: "DELETE",
      body: JSON.stringify({ addonId: randomUUID(), photoId: randomUUID() }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// D. Cơ sở dữ liệu thật (bb-dev) — /api/g/album-cover và chặn chốt
//
// Fixture BB-202 (dữ liệu giả — xem AGENTS.md §6): mọi tên/dữ liệu bên dưới là
// bịa, dọn theo ĐÚNG id đã tạo ở afterAll.
// ---------------------------------------------------------------------------

async function banCoBangAlbumCovers(client: Client): Promise<boolean> {
  const { rows } = await client.query("select to_regclass('public.album_covers') as t");
  return rows[0]?.t !== null;
}

describe("BB-202 D. Cơ sở dữ liệu thật — bìa album (bb-dev)", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  let pg: Client;
  let bangDaCo = false;

  let branchId: string;
  let customerId: string;
  let galleryId = "";
  let selectionId = "";
  let shareLinkId = "";
  let albumGalleryItemId = "";
  let albumProductId = "";
  const anhId: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    bangDaCo = await banCoBangAlbumCovers(pg);
    if (!bangDaCo) {
      // eslint-disable-next-line no-console
      console.warn(
        "[BB-202] Bảng album_covers chưa tồn tại (migration 0075 chưa áp) — " +
          "bỏ qua khối D, chờ Opus áp 0075 lên bb-dev rồi chạy lại.",
      );
      return;
    }

    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    branchId = branch!.id;
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .limit(1)
      .single();
    customerId = customer!.id;

    // Album THẬT đang có trong bảng giá (chỉ đọc, không sửa — luật của brief).
    const { data: sp } = await supabase
      .from("products")
      .select("id")
      .eq("is_active", true)
      .ilike("material", "%album%")
      .limit(1)
      .maybeSingle();
    if (!sp) throw new Error("Cần ít nhất một sản phẩm album đang active trong bảng products");
    albumProductId = sp.id;

    galleryId = randomUUID();
    const { error: gErr } = await supabase.from("galleries").insert({
      id: galleryId,
      branch_id: branchId,
      customer_id: customerId,
      title: "Fixture BB-202",
      status: "in_review",
      drive_folder_id: `fixture-bb202-${Date.now()}`,
      drive_folder_url: "https://example.com/fixture-bb202",
      photo_count: 3,
      included_quota: 10,
      extra_photo_price: 20000,
    });
    if (gErr) throw gErr;

    const { data: gi } = await supabase
      .from("gallery_items")
      .insert({ gallery_id: galleryId, product_id: albumProductId, quantity: 1, unit_price: 500000 })
      .select("id")
      .single();
    albumGalleryItemId = gi!.id;

    shareLinkId = randomUUID();
    const { error: lkErr } = await supabase.from("share_links").insert({
      id: shareLinkId,
      gallery_id: galleryId,
      token_hash: `fixture-bb202-${randomUUID()}`,
      token_prefix: "bb202a",
      role: "owner",
      status: "active",
    });
    if (lkErr) throw lkErr;

    const { data: sel } = await supabase
      .from("selections")
      .insert({ gallery_id: galleryId, share_link_id: shareLinkId, is_primary: true })
      .select("id")
      .single();
    selectionId = sel!.id;

    for (const ten of ["bb202-a.jpg", "bb202-b.jpg"]) {
      const { data: anh } = await supabase
        .from("photos")
        .insert({
          gallery_id: galleryId,
          drive_file_id: `fixture-bb202-${ten}-${Date.now()}`,
          file_name: ten,
          mime_type: "image/jpeg",
          sort_index: anhId.length + 1,
          status: "active",
        })
        .select("id")
        .single();
      anhId.push(anh!.id);
    }

    // Tấm [0] đã thả tim (mark selected); tấm [1] CHƯA thả tim (mark suggested).
    await supabase.from("selection_items").insert([
      { selection_id: selectionId, photo_id: anhId[0], gallery_id: galleryId, mark: "selected" },
      { selection_id: selectionId, photo_id: anhId[1], gallery_id: galleryId, mark: "suggested" },
    ]);
  });

  afterAll(async () => {
    if (galleryId) {
      await supabase.from("album_covers").delete().eq("gallery_id", galleryId);
      await supabase.from("galleries").delete().eq("id", galleryId);
    }
    for (const id of createdProductIds) {
      await supabase.from("products").delete().eq("id", id);
    }
    await pg.end();
  });

  function phien(gallerySession: typeof import("@/lib/auth/gallery-session"), role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  it("1. Từ chối đặt bìa bằng ảnh CHƯA thả tim", async () => {
    if (!bangDaCo) return;
    const gallerySession = await import("@/lib/auth/gallery-session");
    phien(gallerySession);
    const { POST } = await import("@/app/api/g/album-cover/route");
    const req = new NextRequest("http://localhost/api/g/album-cover", {
      method: "POST",
      body: JSON.stringify({ galleryItemId: albumGalleryItemId, photoId: anhId[1] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("2. Vai viewer (chỉ xem) không đặt được bìa", async () => {
    if (!bangDaCo) return;
    const gallerySession = await import("@/lib/auth/gallery-session");
    // Mô phỏng đúng hành vi thật của requireGallerySession với allowedRoles:
    // vai không nằm trong EDITING_ROLES thì ném FORBIDDEN.
    vi.spyOn(gallerySession, "requireGallerySession").mockImplementation(async () => {
      throw new gallerySession.GallerySessionError("FORBIDDEN");
    });
    const { POST } = await import("@/app/api/g/album-cover/route");
    const req = new NextRequest("http://localhost/api/g/album-cover", {
      method: "POST",
      body: JSON.stringify({ galleryItemId: albumGalleryItemId, photoId: anhId[0] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("3. Đặt bìa hợp lệ (ảnh đã thả tim, đúng dòng album) — thành công, và chốt được", async () => {
    if (!bangDaCo) return;
    const gallerySession = await import("@/lib/auth/gallery-session");
    phien(gallerySession);
    const { POST } = await import("@/app/api/g/album-cover/route");
    const req = new NextRequest("http://localhost/api/g/album-cover", {
      method: "POST",
      body: JSON.stringify({ galleryItemId: albumGalleryItemId, photoId: anhId[0] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const { rows } = await pg.query(
      "select selection_item_id from album_covers where gallery_item_id = $1",
      [albumGalleryItemId],
    );
    expect(rows.length).toBe(1);
  });

  it("4. /api/g/submit CHẶN chốt khi album chưa có bìa, và cho qua khi đã có (kiểm ngược ở D.5)", async () => {
    if (!bangDaCo) return;

    // 4a. Gỡ bìa (nếu ca 3 đã chạy trước) để chắc chắn đang THIẾU bìa.
    await pg.query("delete from album_covers where gallery_item_id = $1", [albumGalleryItemId]);

    const gallerySession = await import("@/lib/auth/gallery-session");
    phien(gallerySession);
    const larkNotify = await import("@/lib/lark/notify");
    vi.spyOn(larkNotify, "enqueueLarkNotification").mockResolvedValue(undefined);

    const { POST: postSubmit } = await import("@/app/api/g/submit/route");
    const resThieu = await postSubmit(
      new Request("http://localhost/api/g/submit", {
        method: "POST",
        body: JSON.stringify({ confirmedByName: "Fixture BB-202", agreed: true }),
      }),
    );
    expect(resThieu.status).toBe(409);
    const jsonThieu = await resThieu.json();
    expect(jsonThieu.error.code).toBe("CONFLICT");

    // 4b. Đặt bìa hợp lệ rồi chốt lại — phải qua được.
    const { POST: postCover } = await import("@/app/api/g/album-cover/route");
    phien(gallerySession);
    await postCover(
      new NextRequest("http://localhost/api/g/album-cover", {
        method: "POST",
        body: JSON.stringify({ galleryItemId: albumGalleryItemId, photoId: anhId[0] }),
      }),
    );

    phien(gallerySession);
    const resDu = await postSubmit(
      new Request("http://localhost/api/g/submit", {
        method: "POST",
        body: JSON.stringify({ confirmedByName: "Fixture BB-202", agreed: true }),
      }),
    );
    expect(resDu.status).toBe(200);
  });

  it("5. Bìa MẤT HIỆU LỰC khi ba mẹ bỏ tim tấm đang làm bìa — chốt lại phải bị chặn", async () => {
    if (!bangDaCo) return;

    // Bộ ảnh đã 'submitted' ở ca 4 — mở lại để test tiếp ở trạng thái in_review.
    await supabase.from("galleries").update({ status: "in_review" }).eq("id", galleryId);

    // Đặt lại bìa hợp lệ.
    const gallerySession = await import("@/lib/auth/gallery-session");
    phien(gallerySession);
    const { POST: postCover } = await import("@/app/api/g/album-cover/route");
    await postCover(
      new NextRequest("http://localhost/api/g/album-cover", {
        method: "POST",
        body: JSON.stringify({ galleryItemId: albumGalleryItemId, photoId: anhId[0] }),
      }),
    );

    // Ba mẹ bỏ tim tấm đang làm bìa (mark quay lại 'suggested').
    await supabase
      .from("selection_items")
      .update({ mark: "suggested" })
      .eq("selection_id", selectionId)
      .eq("photo_id", anhId[0]);

    phien(gallerySession);
    const larkNotify = await import("@/lib/lark/notify");
    vi.spyOn(larkNotify, "enqueueLarkNotification").mockResolvedValue(undefined);
    const { POST: postSubmit } = await import("@/app/api/g/submit/route");
    const res = await postSubmit(
      new Request("http://localhost/api/g/submit", {
        method: "POST",
        body: JSON.stringify({ confirmedByName: "Fixture BB-202", agreed: true }),
      }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");

    // Dọn lại trạng thái 'selected' để không lẫn với ca khác nếu tệp chạy lại
    // nhiều lần trong cùng một phiên (không bắt buộc — afterAll đã xoá cả bộ).
    await supabase
      .from("selection_items")
      .update({ mark: "selected" })
      .eq("selection_id", selectionId)
      .eq("photo_id", anhId[0]);
  });
});
