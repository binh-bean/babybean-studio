import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as postPlacement, DELETE as deletePlacement } from "@/app/api/g/placements/route";
import { GET as getGallery } from "@/app/api/g/gallery/route";
import { CreateGallerySchema } from "@/app/api/admin/galleries/schema";
import * as galleryAuth from "@/lib/auth/gallery-session";
import type { GallerySession } from "@/types/domain";

vi.mock("server-only", () => ({}));

interface PlacementItem {
  selectionItemId: string;
  photoId: string;
  galleryItemId: string;
}

describe("BB-113: Đặt ảnh vào sản phẩm in & BB-108: Gỡ công tắc watermark", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let branchId: string;
  let customerId: string;

  const createdProductIds: string[] = [];
  const createdGalleryIds: string[] = [];

  let prodPkgBaby01: string;
  let prodEditFile: string;
  let prodAlbumPrint: string;
  let prodWoodPrint: string;
  let prodServiceMakeup: string;

  beforeAll(async () => {
    // 1. Lấy chi nhánh và khách hàng mẫu
    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh trong database");
    branchId = branch.id;

    const { data: customer } = await supabase.from("customers").select("id").limit(1).single();
    if (!customer) throw new Error("Cần ít nhất một khách hàng trong database");
    customerId = customer.id;

    // 2. Tạo sản phẩm mẫu
    prodPkgBaby01 = randomUUID();
    prodEditFile = randomUUID();
    prodAlbumPrint = randomUUID();
    prodWoodPrint = randomUUID();
    prodServiceMakeup = randomUUID();

    const prods = [
      { id: prodPkgBaby01, name: "TEST Gói Baby 01", kind: "shoot_package", list_price: 1500000, is_active: true },
      { id: prodEditFile, name: "TEST Edit file", kind: "edited_photo", list_price: 50000, is_active: true },
      { id: prodAlbumPrint, name: "TEST Album (Ultra HD) 20x20", kind: "print", material: "Photobook", size: "20x20", list_price: 800000, is_active: true },
      { id: prodWoodPrint, name: "TEST Ảnh gỗ 15x21", kind: "print", material: "Gỗ", size: "15x21", list_price: 150000, is_active: true },
      { id: prodServiceMakeup, name: "TEST Dịch vụ Makeup", kind: "service", list_price: 300000, is_active: true },
    ];

    for (const p of prods) createdProductIds.push(p.id);
    const { error: prodErr } = await supabase.from("products").insert(prods);
    if (prodErr) throw prodErr;
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    if (createdGalleryIds.length > 0) {
      await supabase.from("galleries").delete().in("id", createdGalleryIds);
    }
    if (createdProductIds.length > 0) {
      await supabase.from("products").delete().in("id", createdProductIds);
    }
  });

  // Helper tạo bộ ảnh kèm ảnh và các dòng hợp đồng
  async function setupGallery(options?: {
    withAlbumPrint?: boolean;
    withWoodPrint?: boolean;
    withMakeup?: boolean;
    photoCount?: number;
  }) {
    const galleryId = randomUUID();
    const shareLinkId = randomUUID();
    const selectionId = randomUUID();
    createdGalleryIds.push(galleryId);

    const { error: galErr } = await supabase.from("galleries").insert({
      id: galleryId,
      branch_id: branchId,
      customer_id: customerId,
      drive_folder_id: "test_folder_" + randomUUID().slice(0, 8),
      drive_folder_url: "https://drive.google.com/test",
      title: "Test BB113 " + randomUUID().slice(0, 4),
      status: "in_review",
      photo_count: options?.photoCount ?? 10,
      included_quota: 15,
      extra_photo_price: 50000,
      allow_extra: true,
    });
    if (galErr) throw galErr;

    const { error: linkErr } = await supabase.from("share_links").insert({
      id: shareLinkId,
      gallery_id: galleryId,
      token_hash: randomUUID(),
      token_prefix: "113001",
      role: "owner",
    });
    if (linkErr) throw linkErr;

    const { error: selErr } = await supabase.from("selections").insert({
      id: selectionId,
      gallery_id: galleryId,
      share_link_id: shareLinkId,
      display_name: "Mẹ bé Test BB113",
      is_primary: true,
    });
    if (selErr) throw selErr;

    // Gói chụp và hạn mức 15 ảnh edit file
    const parentItemId = randomUUID();
    await supabase.from("gallery_items").insert({
      id: parentItemId,
      gallery_id: galleryId,
      product_id: prodPkgBaby01,
      parent_item_id: null,
      quantity: 1,
      unit_price: 1500000,
    });

    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: parentItemId,
      quantity: 15,
      unit_price: null,
    });

    let albumItemId: string | undefined;
    let woodItemId: string | undefined;
    let makeupItemId: string | undefined;

    if (options?.withAlbumPrint) {
      albumItemId = randomUUID();
      await supabase.from("gallery_items").insert({
        id: albumItemId,
        gallery_id: galleryId,
        product_id: prodAlbumPrint,
        parent_item_id: parentItemId,
        quantity: 1,
        unit_price: null,
      });
    }

    if (options?.withWoodPrint) {
      woodItemId = randomUUID();
      await supabase.from("gallery_items").insert({
        id: woodItemId,
        gallery_id: galleryId,
        product_id: prodWoodPrint,
        parent_item_id: null,
        quantity: 1,
        unit_price: 150000,
      });
    }

    if (options?.withMakeup) {
      makeupItemId = randomUUID();
      await supabase.from("gallery_items").insert({
        id: makeupItemId,
        gallery_id: galleryId,
        product_id: prodServiceMakeup,
        parent_item_id: parentItemId,
        quantity: 1,
        unit_price: null,
      });
    }

    // Tạo các ảnh mẫu (batch insert)
    const count = options?.photoCount ?? 10;
    const photoIds: string[] = [];
    const photosToInsert = [];
    for (let i = 1; i <= count; i++) {
      const pid = randomUUID();
      photoIds.push(pid);
      photosToInsert.push({
        id: pid,
        gallery_id: galleryId,
        drive_file_id: "drive_" + randomUUID(),
        file_name: `BB113_${i}.jpg`,
        mime_type: "image/jpeg",
        status: "active",
      });
    }
    const { error: photoErr } = await supabase.from("photos").insert(photosToInsert);
    if (photoErr) throw photoErr;

    const session: GallerySession = {
      // Link kiểu cũ gắn thẳng vào bộ ảnh nên không có khách nào kèm theo.
      customerId: "",
      galleryId,
      shareLinkId,
      selectionId,
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 86400,
    };

    return {
      galleryId,
      shareLinkId,
      selectionId,
      session,
      photoIds,
      albumItemId,
      woodItemId,
      makeupItemId,
    };
  }

  it("Test 1: Đặt ảnh vào sản phẩm hợp đồng KHÔNG có -> từ chối", async () => {
    // Bộ ảnh này KHÔNG có sản phẩm in (không mua Album, không mua Ảnh gỗ)
    const { session, photoIds } = await setupGallery({ withAlbumPrint: false });

    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    // Thử đặt ảnh vào một galleryItemId không hề tồn tại trong bộ ảnh
    const fakeGalleryItemId = randomUUID();
    const req = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: fakeGalleryItemId,
        photoId: photoIds[0],
      }),
    });

    const res = await postPlacement(req as unknown as NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");

    // Thử đặt vào sản phẩm có trong hợp đồng nhưng không phải sản phẩm in (ví dụ Dịch vụ Makeup)
    const { session: session2, photoIds: photoIds2, makeupItemId } = await setupGallery({ withMakeup: true });
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session2);

    const reqMakeup = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: makeupItemId,
        photoId: photoIds2[0],
      }),
    });

    const resMakeup = await postPlacement(reqMakeup as unknown as NextRequest);
    expect(resMakeup.status).toBe(400);
    const bodyMakeup = await resMakeup.json();
    expect(bodyMakeup.error.code).toBe("INVALID_INPUT");
  }, 15000);

  it("Test 2: Đặt một ảnh vào hai sản phẩm in -> cả hai cùng tồn tại (Luật 3)", async () => {
    // Bộ ảnh có cả Album 20x20 và Ảnh gỗ 15x21
    const { session, photoIds, albumItemId, woodItemId } = await setupGallery({
      withAlbumPrint: true,
      withWoodPrint: true,
    });

    const targetPhotoId = photoIds[0]!;

    // 1. Đặt ảnh vào Album
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const req1 = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: albumItemId,
        photoId: targetPhotoId,
      }),
    });
    const res1 = await postPlacement(req1 as unknown as NextRequest);
    expect(res1.status).toBe(200);

    // 2. Đặt CÙNG ảnh đó vào Ảnh gỗ
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const req2 = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: woodItemId,
        photoId: targetPhotoId,
      }),
    });
    const res2 = await postPlacement(req2 as unknown as NextRequest);
    expect(res2.status).toBe(200);

    // 3. Mở rộng GET /api/g/gallery trả danh sách ảnh đã đặt
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const galRes = await getGallery(new Request("http://localhost/api/g/gallery"));
    expect(galRes.status).toBe(200);

    const galBody = await galRes.json();
    expect(galBody.data.placements).toBeDefined();

    // Cả hai cùng tồn tại trong danh sách placements
    const placements = galBody.data.placements as PlacementItem[];
    expect(placements.length).toBe(2);

    const itemIds = placements.map((p: PlacementItem) => p.galleryItemId);
    expect(itemIds).toContain(albumItemId);
    expect(itemIds).toContain(woodItemId);

    const photoInPlacements = placements.every((p: PlacementItem) => p.photoId === targetPhotoId);
    expect(photoInPlacements).toBe(true);
  }, 15000);

  it("Test 3: Đặt ảnh rồi kiểm hạn mức -> KHÔNG đổi (Luật 2)", async () => {
    // Khách có hạn mức 15 ảnh. Khách chọn 5 ảnh trước.
    const { session, photoIds, albumItemId, galleryId } = await setupGallery({
      withAlbumPrint: true,
      photoCount: 10,
    });

    // Chọn 5 ảnh
    const itemsToInsert = [];
    for (let i = 0; i < 5; i++) {
      itemsToInsert.push({
        selection_id: session.selectionId,
        photo_id: photoIds[i]!,
        gallery_id: galleryId,
        mark: "selected",
      });
    }
    await supabase.from("selection_items").insert(itemsToInsert);

    // Kiểm tra trước khi đặt ảnh vào sản phẩm in
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const beforeRes = await getGallery(new Request("http://localhost/api/g/gallery"));
    const beforeData = (await beforeRes.json()).data;
    expect(beforeData.includedQuota).toBe(15);
    expect(beforeData.selection.selectedCount).toBe(5);
    expect(beforeData.selection.extraCount).toBe(0);

    // Khách đặt 1 ảnh trong 5 ảnh đó vào Album in
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const req = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: albumItemId,
        photoId: photoIds[0],
      }),
    });
    const res = await postPlacement(req as unknown as NextRequest);
    expect(res.status).toBe(200);

    // Kiểm tra lại sau khi đặt: Hạn mức và số lượng chọn KHÔNG ĐỔI!
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const afterRes = await getGallery(new Request("http://localhost/api/g/gallery"));
    const afterData = (await afterRes.json()).data;

    expect(afterData.includedQuota).toBe(15);
    expect(afterData.selection.selectedCount).toBe(5);
    expect(afterData.selection.extraCount).toBe(0);
    expect(afterData.selection.extraAmount).toBe(0);
  }, 15000);

  it("Test 4: Đặt ảnh của bộ ảnh khác -> từ chối", async () => {
    // Tạo bộ ảnh A (có Album) và bộ ảnh B
    const { session: sessionA, albumItemId: albumA } = await setupGallery({ withAlbumPrint: true });
    const { photoIds: photosB } = await setupGallery({ withAlbumPrint: false });

    // Khách dùng phiên bộ ảnh A, nhưng gửi photoId thuộc bộ ảnh B
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(sessionA);
    const req = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: albumA,
        photoId: photosB[0], // Ảnh của bộ ảnh B
      }),
    });

    const res = await postPlacement(req as unknown as NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Ảnh không thuộc bộ ảnh này");
  }, 15000);

  it("Test 5: Gỡ ảnh khỏi sản phẩm in (DELETE /api/g/placements)", async () => {
    const { session, photoIds, albumItemId } = await setupGallery({ withAlbumPrint: true });

    // 1. Đặt ảnh
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const reqAdd = new Request("http://localhost:3000/api/g/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: albumItemId,
        photoId: photoIds[0],
      }),
    });
    await postPlacement(reqAdd as unknown as NextRequest);

    // 2. Gỡ ảnh
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const reqDel = new Request("http://localhost:3000/api/g/placements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        galleryItemId: albumItemId,
        photoId: photoIds[0],
      }),
    });
    const resDel = await deletePlacement(reqDel as unknown as NextRequest);
    expect(resDel.status).toBe(200);

    // 3. Kiểm tra danh sách placements rỗng
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const galRes = await getGallery(new Request("http://localhost/api/g/gallery"));
    const galBody = await galRes.json();
    expect(galBody.data.placements.length).toBe(0);
  }, 15000);

  it("Test 6: BB-108 - Gỡ công tắc watermark khỏi API và schema", async () => {
    const { session } = await setupGallery();

    // 1. GET /api/g/gallery không còn trường watermark trong options
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const galRes = await getGallery(new Request("http://localhost/api/g/gallery"));
    const galBody = await galRes.json();

    expect(galBody.data.options).toBeDefined();
    expect("watermark" in galBody.data.options).toBe(false);
    expect(galBody.data.options.watermark).toBeUndefined();

    // 2. Schema nhập liệu CreateGallerySchema: options strip trường watermark và không có watermark mặc định
    const parseResult = CreateGallerySchema.safeParse({
      branchId: randomUUID(),
      customerId: randomUUID(),
      packageId: randomUUID(),
      title: "Test Gallery",
      driveUrl: "https://drive.google.com/drive/folders/test",
      options: {
        watermark: true,
      },
    });

    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect("watermark" in parseResult.data.options).toBe(false);
      expect((parseResult.data.options as Record<string, unknown>).watermark).toBeUndefined();
    }
  }, 15000);
});
