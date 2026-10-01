/**
 * BB-288 — canh ĐƯỜNG GHI: `/api/g/addons` và `/api/g/mua-them` phải từ chối
 * mua canvas, dù canvas vẫn `is_active = true` và giá đủ tin cậy.
 *
 * Trước bản vá: cả hai route chỉ kiểm `nhomSanPham(...) !== null`
 * (`nhom-san-pham.ts`), mà canvas rơi vào nhóm `anh_in` (khác `null`) qua
 * nhánh `kind === "print"` — nên canvas lọt qua. `/api/g/addons` thậm chí
 * không kiểm nhóm chút nào trước bản vá.
 *
 * Test dựng đúng một sản phẩm canvas giả (`Fixture BB-288 …`, tên rõ ràng là
 * giả theo AGENTS.md §6), đủ điều kiện giá (BB-105: có `list_price`,
 * `price_confidence >= 0.8`, `price_samples >= 5`) để chỉ còn ĐÚNG MỘT lý do
 * có thể chặn: luật nhóm bán hàng của BB-288.
 *
 * Thước đo (AGENTS.md §5a): đã tự hoàn nguyên hai đoạn gọi
 * `sanPhamBanChoKhach()` trong `addons/route.ts` và `mua-them/route.ts` —
 * cả hai test dưới đây đỏ (canvas mua được / gửi yêu cầu được) đúng như dự
 * kiến, rồi vá lại xanh.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { POST as postAddon } from "@/app/api/g/addons/route";
import { POST as postMuaThem } from "@/app/api/g/mua-them/route";
import * as galleryAuth from "@/lib/auth/gallery-session";
import type { GallerySession } from "@/types/domain";

vi.mock("server-only", () => ({}));

describe("BB-288: canvas không nằm trong danh mục bán cho khách (route ghi)", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let branchId: string;
  let customerId: string;
  let canvasProductId: string;

  /**
   * Hai bộ ảnh RIÊNG, không dùng chung: `/api/g/addons` chỉ mở khi bộ ảnh
   * CHƯA khoá (`isGalleryLocked`), còn nhánh ba mẹ của `/api/g/mua-them` chỉ
   * mở khi bộ ảnh ĐÃ `approved` (`duocMoiMuaLanHai`) — hai trạng thái đối
   * lập, không dựng chung một bộ ảnh được.
   */
  let addonsGalleryId: string;
  let addonsShareLinkId: string;
  let addonsSelectionId: string;
  let addonsPhotoId: string;
  let addonsSession: GallerySession;

  let muaThemGalleryId: string;
  let muaThemShareLinkId: string;
  let muaThemSelectionId: string;
  let muaThemPhotoId: string;
  let muaThemSession: GallerySession;

  beforeAll(async () => {
    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh trong database");
    branchId = branch.id;

    const { data: customer } = await supabase.from("customers").select("id").limit(1).single();
    if (!customer) throw new Error("Cần ít nhất một khách hàng trong database");
    customerId = customer.id;

    canvasProductId = randomUUID();
    const { error: prodErr } = await supabase.from("products").insert({
      id: canvasProductId,
      // Tên rõ ràng là dữ liệu giả (AGENTS.md §6). BB-339: "Cavas/Kim tuyến"
      // trên Lark nay là ảnh in Kim Tuyến ĐANG BÁN (bảng giá anh gửi 01/10) —
      // phép thử này canh canvas THẬT, nên dùng chất liệu "Canvas".
      name: "Fixture BB-288 Canvas 40x60",
      kind: "print",
      material: "Canvas",
      size: "40x60",
      list_price: 850000,
      price_confidence: 1.0,
      price_samples: 10,
      is_active: true,
    });
    if (prodErr) throw prodErr;

    const dungBoAnh = async (status: string) => {
      const galleryId = randomUUID();
      const shareLinkId = randomUUID();
      const selectionId = randomUUID();

      const { error: galErr } = await supabase.from("galleries").insert({
        id: galleryId,
        branch_id: branchId,
        customer_id: customerId,
        drive_folder_id: "test_fld_" + randomUUID().slice(0, 8),
        drive_folder_url: "https://drive.google.com/test",
        title: "Fixture BB-288 Gallery " + randomUUID().slice(0, 4),
        status,
        photo_count: 10,
        included_quota: 10,
        extra_photo_price: 50000,
        allow_extra: true,
      });
      if (galErr) throw galErr;

      const { error: linkErr } = await supabase.from("share_links").insert({
        id: shareLinkId,
        gallery_id: galleryId,
        token_hash: randomUUID(),
        token_prefix: "123456",
        role: "owner",
      });
      if (linkErr) throw linkErr;

      const { error: selErr } = await supabase.from("selections").insert({
        id: selectionId,
        gallery_id: galleryId,
        share_link_id: shareLinkId,
        display_name: "Fixture BB-288 Customer",
        is_primary: true,
      });
      if (selErr) throw selErr;

      const { data: anh, error: anhErr } = await supabase
        .from("photos")
        .insert({
          gallery_id: galleryId,
          drive_file_id: `bb288-${randomUUID()}`,
          file_name: "fixture-bb288.jpg",
          mime_type: "image/jpeg",
          sort_index: 1,
          status: "active",
        })
        .select("id")
        .single();
      if (anhErr) throw anhErr;
      const photoId = anh.id as string;

      const { error: itemErr } = await supabase.from("selection_items").insert({
        selection_id: selectionId,
        photo_id: photoId,
        gallery_id: galleryId,
        mark: "selected",
      });
      if (itemErr) throw itemErr;

      const session: GallerySession = {
        customerId: "",
        galleryId,
        shareLinkId,
        selectionId,
        role: "owner",
        exp: Math.floor(Date.now() / 1000) + 86400,
      };

      return { galleryId, shareLinkId, selectionId, photoId, session };
    };

    // "ready" = chưa khoá, đúng điều kiện mở của /api/g/addons.
    const boAnhAddons = await dungBoAnh("ready");
    addonsGalleryId = boAnhAddons.galleryId;
    addonsShareLinkId = boAnhAddons.shareLinkId;
    addonsSelectionId = boAnhAddons.selectionId;
    addonsPhotoId = boAnhAddons.photoId;
    addonsSession = boAnhAddons.session;

    // "approved" + 0 vòng sửa = đúng điều kiện mở "mời mua lần hai" của ba mẹ.
    const boAnhMuaThem = await dungBoAnh("approved");
    muaThemGalleryId = boAnhMuaThem.galleryId;
    muaThemShareLinkId = boAnhMuaThem.shareLinkId;
    muaThemSelectionId = boAnhMuaThem.selectionId;
    muaThemPhotoId = boAnhMuaThem.photoId;
    muaThemSession = boAnhMuaThem.session;
  });

  afterAll(async () => {
    for (const selectionId of [addonsSelectionId, muaThemSelectionId]) {
      await supabase.from("selection_addons").delete().eq("selection_id", selectionId);
      await supabase.from("selections").delete().eq("id", selectionId);
    }
    for (const shareLinkId of [addonsShareLinkId, muaThemShareLinkId]) {
      await supabase.from("share_links").delete().eq("id", shareLinkId);
    }
    for (const galleryId of [addonsGalleryId, muaThemGalleryId]) {
      await supabase.from("galleries").delete().eq("id", galleryId);
    }
    await supabase.from("yeu_cau_mua_them").delete().eq("product_id", canvasProductId);
    if (canvasProductId) await supabase.from("products").delete().eq("id", canvasProductId);
  });

  it("POST /api/g/addons với sản phẩm canvas -> từ chối, không tạo dòng mua thêm", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(addonsSession);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: canvasProductId, quantity: 1, photoId: addonsPhotoId }),
    });

    const res = await postAddon(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");

    const { count } = await supabase
      .from("selection_addons")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", addonsSelectionId)
      .eq("product_id", canvasProductId);
    expect(count).toBe(0);
  });

  it("POST /api/g/mua-them với sản phẩm canvas -> từ chối, không ghi yêu cầu", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(muaThemSession);

    const req = new Request("http://localhost:3000/api/g/mua-them", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ productId: canvasProductId, photoId: muaThemPhotoId, soLuong: 1 }],
      }),
    });

    const res = await postMuaThem(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_INPUT");
  });
});
