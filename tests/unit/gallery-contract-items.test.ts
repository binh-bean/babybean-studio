import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { GET as getAdminItems } from "@/app/api/admin/galleries/[id]/items/route";
import * as staffAuth from "@/lib/auth/staff";

vi.mock("server-only", () => ({}));

describe("BB-102: Thành phần hợp đồng và hạn mức ảnh (gallery_items & products)", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let branchId: string;
  let customerId: string;
  const createdGalleryIds: string[] = [];
  const createdProductIds: string[] = [];

  // IDs sản phẩm giả
  let prodPkgBaby02: string;
  let prodPkgBaby01: string;
  let prodPkgFam: string;
  let prodEditFile: string;
  let prodMakeup: string;
  let prodWoodFrame: string;

  beforeAll(async () => {
    // 1. Lấy chi nhánh và khách hàng mẫu
    const { data: branch } = await supabase.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh trong database");
    branchId = branch.id;

    const { data: customer } = await supabase.from("customers").select("id").limit(1).single();
    if (!customer) throw new Error("Cần ít nhất một khách hàng trong database");
    customerId = customer.id;

    // 2. Tạo sản phẩm giả cho test
    prodPkgBaby02 = randomUUID();
    prodPkgBaby01 = randomUUID();
    prodPkgFam = randomUUID();
    prodEditFile = randomUUID();
    prodMakeup = randomUUID();
    prodWoodFrame = randomUUID();

    const prods = [
      { id: prodPkgBaby02, name: "TEST Baby 02", kind: "shoot_package", list_price: 2000000 },
      { id: prodPkgBaby01, name: "TEST Baby 01", kind: "shoot_package", list_price: 1500000 },
      { id: prodPkgFam, name: "TEST Family Classic", kind: "shoot_package", list_price: 3000000 },
      { id: prodEditFile, name: "TEST Edit file", kind: "edited_photo", list_price: 50000 },
      { id: prodMakeup, name: "TEST Makeup", kind: "service", list_price: 300000 },
      { id: prodWoodFrame, name: "TEST Gỗ 15x21", kind: "print", material: "Gỗ", size: "15x21", list_price: 150000 },
    ];

    for (const p of prods) {
      createdProductIds.push(p.id);
    }

    const { error: prodErr } = await supabase.from("products").insert(prods);
    if (prodErr) throw prodErr;
  });

  afterAll(async () => {
    // Dọn sạch dữ liệu test
    if (createdGalleryIds.length > 0) {
      await supabase.from("galleries").delete().in("id", createdGalleryIds);
    }
    if (createdProductIds.length > 0) {
      await supabase.from("products").delete().in("id", createdProductIds);
    }
  });

  // Helper tạo album giả
  async function createTestGallery(): Promise<string> {
    const galleryId = randomUUID();
    createdGalleryIds.push(galleryId);

    const { error } = await supabase.from("galleries").insert({
      id: galleryId,
      branch_id: branchId,
      customer_id: customerId,
      drive_folder_id: "test_fld_" + randomUUID().slice(0, 8),
      drive_folder_url: "https://drive.google.com/test",
      title: "Test BB102 Album " + randomUUID().slice(0, 4),
      status: "ready",
      photo_count: 50,
      included_quota: 20, // default fallback trong schema
      extra_photo_price: 50000,
      allow_extra: true,
    });
    if (error) throw error;
    return galleryId;
  }

  it("Test 1: Album 1 gói + 3 thành phần -> đúng cây 2 tầng, đúng hạn mức", async () => {
    const galleryId = await createTestGallery();

    // Dòng cha: Gói Baby 02, giá 2.000.000đ
    const parentItemId = randomUUID();
    const { error: parentErr } = await supabase.from("gallery_items").insert({
      id: parentItemId,
      gallery_id: galleryId,
      product_id: prodPkgBaby02,
      parent_item_id: null,
      quantity: 1,
      unit_price: 2000000,
      lark_contract_code: "HD_20260911#001",
    });
    if (parentErr) throw parentErr;

    // 3 dòng con: Edit file x20, Makeup x1, Gỗ 15x21 x1 (không mang giá)
    const { error: childErr } = await supabase.from("gallery_items").insert([
      {
        id: randomUUID(),
        gallery_id: galleryId,
        product_id: prodEditFile,
        parent_item_id: parentItemId,
        quantity: 20,
        unit_price: null,
        lark_contract_code: "HD_20260911#001",
      },
      {
        id: randomUUID(),
        gallery_id: galleryId,
        product_id: prodMakeup,
        parent_item_id: parentItemId,
        quantity: 1,
        unit_price: null,
        lark_contract_code: "HD_20260911#001",
      },
      {
        id: randomUUID(),
        gallery_id: galleryId,
        product_id: prodWoodFrame,
        parent_item_id: parentItemId,
        quantity: 1,
        unit_price: null,
        lark_contract_code: "HD_20260911#001",
      },
    ]);
    if (childErr) throw childErr;

    // Kiểm tra trực tiếp qua hàm getGalleryContractSummary
    const summary = await getGalleryContractSummary(galleryId, supabase);

    expect(summary.quotaKnown).toBe(true);
    expect(summary.includedQuota).toBe(20);
    expect(summary.totalValue).toBe(2000000);
    expect(summary.items).toHaveLength(1);

    const parent = summary.items[0]!;
    expect(parent).toBeDefined();
    expect(parent.productId).toBe(prodPkgBaby02);
    expect(parent.name).toBe("TEST Baby 02");
    expect(parent.quantity).toBe(1);
    expect(parent.unitPrice).toBe(2000000);
    expect(parent.totalPrice).toBe(2000000);
    expect(parent.components).toHaveLength(3);

    // Thành phần con
    const compKinds = parent.components.map((c) => c.kind);
    expect(compKinds).toContain("edited_photo");
    expect(compKinds).toContain("service");
    expect(compKinds).toContain("print");

    const editFileComp = parent.components.find((c) => c.kind === "edited_photo")!;
    expect(editFileComp).toBeDefined();
    expect(editFileComp.quantity).toBe(20);
  });

  it("Test 2: Album gom 2 hợp đồng -> cộng phẳng hạn mức cả hai", async () => {
    const galleryId = await createTestGallery();

    // Hợp đồng 1: Baby 01 (15 ảnh) - 1.500.000đ
    const parent1 = randomUUID();
    await supabase.from("gallery_items").insert({
      id: parent1,
      gallery_id: galleryId,
      product_id: prodPkgBaby01,
      parent_item_id: null,
      quantity: 1,
      unit_price: 1500000,
      lark_contract_code: "HD_20260911#002A",
    });
    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: parent1,
      quantity: 15,
      unit_price: null,
      lark_contract_code: "HD_20260911#002A",
    });

    // Hợp đồng 2: Baby 02 (20 ảnh) - 2.000.000đ
    const parent2 = randomUUID();
    await supabase.from("gallery_items").insert({
      id: parent2,
      gallery_id: galleryId,
      product_id: prodPkgBaby02,
      parent_item_id: null,
      quantity: 1,
      unit_price: 2000000,
      lark_contract_code: "HD_20260911#002B",
    });
    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: parent2,
      quantity: 20,
      unit_price: null,
      lark_contract_code: "HD_20260911#002B",
    });

    const summary = await getGalleryContractSummary(galleryId, supabase);

    // Hạn mức cộng phẳng: 15 + 20 = 35
    expect(summary.quotaKnown).toBe(true);
    expect(summary.includedQuota).toBe(35);
    expect(summary.totalValue).toBe(3500000);
    expect(summary.items).toHaveLength(2);
  });

  it("Test 3: Album KHÔNG CÓ dòng edited_photo -> quotaKnown: false, KHÔNG trả về 0 hay 20", async () => {
    const galleryId = await createTestGallery();

    // Album có dòng hàng hợp đồng nhưng chỉ mua dịch vụ Makeup, không có dòng Edit file
    const parentId = randomUUID();
    await supabase.from("gallery_items").insert({
      id: parentId,
      gallery_id: galleryId,
      product_id: prodMakeup,
      parent_item_id: null,
      quantity: 1,
      unit_price: 300000,
      lark_contract_code: "HD_20260911#003",
    });

    const summary = await getGalleryContractSummary(galleryId, supabase);

    // Rất quan trọng: quotaKnown phải là false, includedQuota phải là null
    expect(summary.quotaKnown).toBe(false);
    expect(summary.includedQuota).toBeNull();
    expect(summary.includedQuota).not.toBe(0);
    expect(summary.includedQuota).not.toBe(20);
    expect(summary.totalValue).toBe(300000);
    expect(summary.items).toHaveLength(1);
  });

  it("Test 4: Album có mua thêm Edit file lúc ký -> hạn mức = trong gói + mua thêm", async () => {
    const galleryId = await createTestGallery();

    // Dòng 1: Gói Baby 02 (trong gói có 20 ảnh Edit file)
    const pkgParentId = randomUUID();
    await supabase.from("gallery_items").insert({
      id: pkgParentId,
      gallery_id: galleryId,
      product_id: prodPkgBaby02,
      parent_item_id: null,
      quantity: 1,
      unit_price: 2000000,
      lark_contract_code: "HD_20260911#004",
    });
    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: pkgParentId,
      quantity: 20,
      unit_price: null,
      lark_contract_code: "HD_20260911#004",
    });

    // Dòng 2: Mua thêm 5 Edit file (dòng cha ở tầng giữa, có giá 250.000đ = 5 x 50.000đ)
    const extraParentId = randomUUID();
    await supabase.from("gallery_items").insert({
      id: extraParentId,
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: null,
      quantity: 5,
      unit_price: 50000,
      lark_contract_code: "HD_20260911#004",
    });

    const summary = await getGalleryContractSummary(galleryId, supabase);

    // Hạn mức = 20 (trong gói) + 5 (mua thêm) = 25
    expect(summary.quotaKnown).toBe(true);
    expect(summary.includedQuota).toBe(25);
    // Tổng tiền = 2.000.000 + 250.000 = 2.250.000đ
    expect(summary.totalValue).toBe(2250000);

    // 2 dòng cha: 1 gói và 1 dòng mua thêm
    expect(summary.items).toHaveLength(2);
    const extraItem = summary.items.find((i) => i.id === extraParentId)!;
    expect(extraItem.productId).toBe(prodEditFile);
    expect(extraItem.quantity).toBe(5);
    expect(extraItem.unitPrice).toBe(50000);
    expect(extraItem.totalPrice).toBe(250000);
    expect(extraItem.components).toHaveLength(0);
  });

  it("Test 5: GET /api/admin/galleries/[id]/items trả về đúng hợp đồng cho nhân viên", async () => {
    const galleryId = await createTestGallery();

    const parentId = randomUUID();
    await supabase.from("gallery_items").insert({
      id: parentId,
      gallery_id: galleryId,
      product_id: prodPkgBaby01,
      parent_item_id: null,
      quantity: 1,
      unit_price: 1500000,
      lark_contract_code: "HD_20260911#ADMIN",
    });
    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: parentId,
      quantity: 15,
      unit_price: null,
      lark_contract_code: "HD_20260911#ADMIN",
    });

    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: randomUUID(),
      role: "owner",
      branchIds: [branchId],
    });

    const req = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/items`);
    const res = await getAdminItems(req, { params: Promise.resolve({ id: galleryId }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.galleryId).toBe(galleryId);
    expect(body.data.quotaKnown).toBe(true);
    expect(body.data.includedQuota).toBe(15);
    expect(body.data.totalValue).toBe(1500000);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]!.components).toHaveLength(1);
  });
});
