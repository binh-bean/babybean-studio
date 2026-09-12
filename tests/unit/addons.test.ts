import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { POST as postAddon } from "@/app/api/g/addons/route";
import { GET as getGallery } from "@/app/api/g/gallery/route";
import * as galleryAuth from "@/lib/auth/gallery-session";
import type { GallerySession } from "@/types/domain";

vi.mock("server-only", () => ({}));

describe("BB-105: API khách mua thêm sản phẩm (POST /api/g/addons)", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let branchId: string;
  let customerId: string;
  let galleryId: string;
  let shareLinkId: string;
  let selectionId: string;

  const createdProductIds: string[] = [];
  let prodReliableId: string;
  let prodLowSamplesId: string;
  let prodLowConfidenceId: string;
  let prodNullPriceId: string;

  let session: GallerySession;

  beforeAll(async () => {
    // 1. Lấy chi nhánh và khách hàng mẫu
    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh trong database");
    branchId = branch.id;

    const { data: customer } = await supabase.from("customers").select("id").limit(1).single();
    if (!customer) throw new Error("Cần ít nhất một khách hàng trong database");
    customerId = customer.id;

    // 2. Tạo sản phẩm giả
    prodReliableId = randomUUID();
    prodLowSamplesId = randomUUID();
    prodLowConfidenceId = randomUUID();
    prodNullPriceId = randomUUID();

    const prods = [
      {
        id: prodReliableId,
        name: "TEST Gỗ tráng gương 20x30",
        kind: "print",
        list_price: 250000,
        price_confidence: 0.95,
        price_samples: 10,
        is_active: true,
      },
      {
        id: prodLowSamplesId,
        name: "TEST Lookbook 03",
        kind: "shoot_package",
        list_price: 1800000,
        price_confidence: 1.0,
        price_samples: 1, // chỉ có 1 mẫu -> vi phạm luật 2 (cần >= 5)
        is_active: true,
      },
      {
        id: prodLowConfidenceId,
        name: "TEST Khung kính đa giác",
        kind: "print",
        list_price: 150000,
        price_confidence: 0.5, // vi phạm luật 2 (cần >= 0.8)
        price_samples: 8,
        is_active: true,
      },
      {
        id: prodNullPriceId,
        name: "TEST Khung tranh chưa định giá",
        kind: "print",
        list_price: null, // vi phạm luật 3 (list_price null)
        price_confidence: null,
        price_samples: 0,
        is_active: true,
      },
    ];

    for (const p of prods) {
      createdProductIds.push(p.id);
    }

    const { error: prodErr } = await supabase.from("products").insert(prods);
    if (prodErr) throw prodErr;

    // 3. Tạo album và phiên chọn
    galleryId = randomUUID();
    shareLinkId = randomUUID();
    selectionId = randomUUID();

    const { error: galErr } = await supabase.from("galleries").insert({
      id: galleryId,
      branch_id: branchId,
      customer_id: customerId,
      drive_folder_id: "test_fld_" + randomUUID().slice(0, 8),
      drive_folder_url: "https://drive.google.com/test",
      title: "Test BB105 Gallery " + randomUUID().slice(0, 4),
      status: "ready",
      photo_count: 30,
      included_quota: 20,
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
      display_name: "Test Customer BB105",
      is_primary: true,
    });
    if (selErr) throw selErr;

    session = {
      galleryId,
      shareLinkId,
      selectionId,
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
  });

  afterAll(async () => {
    // Dọn sạch dữ liệu test
    if (selectionId) {
      await supabase.from("selection_addons").delete().eq("selection_id", selectionId);
      await supabase.from("selections").delete().eq("id", selectionId);
    }
    if (shareLinkId) {
      await supabase.from("share_links").delete().eq("id", shareLinkId);
    }
    if (galleryId) {
      await supabase.from("galleries").delete().eq("id", galleryId);
    }
    if (createdProductIds.length > 0) {
      await supabase.from("products").delete().in("id", createdProductIds);
    }
  });

  it("Test 1: Mua sản phẩm đủ tin cậy -> tạo dòng, giá đúng bằng list_price", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodReliableId,
        quantity: 2,
      }),
    });

    const res = await postAddon(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.addon).toBeDefined();
    expect(body.data.addon.productId).toBe(prodReliableId);
    expect(body.data.addon.quantity).toBe(2);
    expect(body.data.addon.unitPrice).toBe(250000);
    expect(body.data.addon.totalPrice).toBe(500000);
    expect(body.data.totalAddonsAmount).toBe(500000);

    // Kiểm tra trực tiếp trong database
    const { data: dbAddon } = await supabase
      .from("selection_addons")
      .select("*")
      .eq("id", body.data.addon.id)
      .single();

    expect(dbAddon).toBeDefined();
    expect(Number(dbAddon.unit_price)).toBe(250000);
    expect(dbAddon.quantity).toBe(2);
  });

  it("Test 2: Mua sản phẩm 1 mẫu giá (price_samples = 1 < 5) -> từ chối, không tạo dòng", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodLowSamplesId,
        quantity: 1,
      }),
    });

    const res = await postAddon(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_INPUT");

    // Kiểm tra không có dòng nào được tạo cho sản phẩm này
    const { count } = await supabase
      .from("selection_addons")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", selectionId)
      .eq("product_id", prodLowSamplesId);

    expect(count).toBe(0);
  });

  it("Test 2b: Mua sản phẩm độ tin cậy thấp (price_confidence = 0.5 < 0.8) -> từ chối", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodLowConfidenceId,
        quantity: 1,
      }),
    });

    const res = await postAddon(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("Test 3: Mua sản phẩm list_price null -> từ chối", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodNullPriceId,
        quantity: 1,
      }),
    });

    const res = await postAddon(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("INVALID_INPUT");

    const { count } = await supabase
      .from("selection_addons")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", selectionId)
      .eq("product_id", prodNullPriceId);

    expect(count).toBe(0);
  });

  it("Test 4: Studio đổi giá sau khi mua -> dòng cũ giữ giá cũ", async () => {
    // 1. Studio cập nhật bảng giá của sản phẩm lên 350.000đ
    const { error: updateErr } = await supabase
      .from("products")
      .update({ list_price: 350000 })
      .eq("id", prodReliableId);
    expect(updateErr).toBeNull();

    // 2. Query lại dòng addon đã mua ở Test 1
    const { data: addons } = await supabase
      .from("selection_addons")
      .select("*")
      .eq("selection_id", selectionId)
      .eq("product_id", prodReliableId);

    expect(addons).toBeDefined();
    expect(addons!.length).toBeGreaterThan(0);
    // Đơn giá trong dòng selection_addons VẪN là 250.000đ, không đổi theo bảng giá
    expect(Number(addons![0]!.unit_price)).toBe(250000);
  });

  it("Test 5: Quantity 0 hoặc âm -> từ chối", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValue(session);

    // Quantity = 0
    const reqZero = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodReliableId,
        quantity: 0,
      }),
    });
    const resZero = await postAddon(reqZero);
    expect(resZero.status).toBe(400);
    const bodyZero = await resZero.json();
    expect(bodyZero.error.code).toBe("INVALID_INPUT");

    // Quantity = -3
    const reqNegative = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodReliableId,
        quantity: -3,
      }),
    });
    const resNegative = await postAddon(reqNegative);
    expect(resNegative.status).toBe(400);
    const bodyNegative = await resNegative.json();
    expect(bodyNegative.error.code).toBe("INVALID_INPUT");
  });

  it("Test 6: GET /api/g/gallery trả thêm khối addons đã mua của phiên", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const res = await getGallery();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.addons).toBeDefined();
    expect(body.data.addons.totalAmount).toBe(500000);
    expect(body.data.addons.items).toHaveLength(1);

    const item = body.data.addons.items[0];
    expect(item.productId).toBe(prodReliableId);
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(250000);
    expect(item.totalPrice).toBe(500000);
  });
});
