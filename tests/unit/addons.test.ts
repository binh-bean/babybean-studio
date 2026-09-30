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
  let photoId: string;

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
    //
    // BB-309: tiền tố "Fixture " (không phải "TEST ") để scripts/cleanup-test-
    // galleries.mjs nhận diện và dọn được nếu lượt chạy này chết giữa chừng.
    //
    // `is_active: true` là BẮT BUỘC cho cả 4 dòng, không thể đặt false: route
    // `/api/g/addons` từ chối NGAY ở `!product.is_active` (dòng ~74 của
    // src/app/api/g/addons/route.ts) TRƯỚC KHI chạm tới ba luật giá mà chính
    // các ca thử này cần canh (Test 2, 2b, 3 dưới đây phải đi qua is_active
    // để thấy đúng lỗi 400 luật giá, không phải 404 "ngừng kinh doanh"). Rủi
    // ro còn lại: `prodReliableId` (250.000đ, đủ tin cậy) khớp đúng bộ lọc
    // catalogue của /api/g/gallery trong lúc phép thử này chạy — một khách
    // thật mở app đúng lúc có thể thấy sản phẩm "Fixture Gỗ tráng gương
    // 20x30" trong cửa hàng. Giảm bằng: afterAll dọn ngay khi hết bài, cộng
    // lưới đỡ theo tuổi ở `npm run db:cleanup` (dọn Fixture còn sót >6 giờ).
    // Cách hết hẳn rủi ro này là chạy bộ phép thử trên bb-test thay vì bb-dev
    // — việc đó nằm ngoài phạm vi BB-309 (xem lộ trình mở app, mục Q2).
    prodReliableId = randomUUID();
    prodLowSamplesId = randomUUID();
    prodLowConfidenceId = randomUUID();
    prodNullPriceId = randomUUID();

    const prods = [
      {
        id: prodReliableId,
        name: "Fixture Gỗ tráng gương 20x30",
        kind: "print",
        list_price: 250000,
        price_confidence: 0.95,
        price_samples: 10,
        is_active: true,
      },
      {
        id: prodLowSamplesId,
        // BB-288: phải là `kind: "print"` (một trong 3 nhóm đang bán), không
        // phải `shoot_package` — từ BB-288, `/api/g/addons` chặn
        // `shoot_package` NGAY ở luật nhóm (404 "ngoài danh mục"), trước khi
        // chạm tới luật giá (400) mà ca này muốn canh riêng.
        name: "Fixture Gỗ hiếm mẫu 25x35",
        kind: "print",
        material: "Gỗ",
        list_price: 1800000,
        // BB-335: 0 lần bán và KHÔNG phải giá nhập bên Lark (độ tin cậy < 1)
        // -> vi phạm luật 2 (cần >= 1 lần bán, hoặc Giá Bán Lark = tin cậy 1).
        price_confidence: 0.9,
        price_samples: 0,
        is_active: true,
      },
      {
        id: prodLowConfidenceId,
        name: "Fixture Khung kính đa giác",
        kind: "print",
        list_price: 150000,
        price_confidence: 0.5, // hai mức giá hoà nhau -> vi phạm luật 2 (BB-335: cần > 0.5)
        price_samples: 8,
        is_active: true,
      },
      {
        id: prodNullPriceId,
        name: "Fixture Khung tranh chưa định giá",
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

    /*
      Từ 22/09/2026 sản phẩm in phải GẮN VÀO một tấm ảnh ĐÃ CHỌN (migration
      0061). Fixture cũ không có tấm nào, nên mọi lượt mua đều bị từ chối —
      đúng luật mới, nhưng làm tệp này đỏ. Thêm một tấm và chọn sẵn nó.
    */
    const { data: anh, error: anhErr } = await supabase
      .from("photos")
      .insert({
        gallery_id: galleryId,
        drive_file_id: `bb105-old-${randomUUID()}`,
        file_name: "addon.jpg",
        mime_type: "image/jpeg",
        sort_index: 1,
        status: "active",
      })
      .select("id")
      .single();
    if (anhErr) throw anhErr;
    photoId = anh.id;

    const { error: itemErr } = await supabase.from("selection_items").insert({
      selection_id: selectionId,
      photo_id: photoId,
      gallery_id: galleryId,
      mark: "selected",
    });
    if (itemErr) throw itemErr;

    session = {
      // Link kiểu cũ gắn thẳng vào bộ ảnh nên không có khách nào kèm theo.
      customerId: "",
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
        photoId,
      }),
    });

    const res = await postAddon(req);
    // 200, không còn 201: đường này nay là ĐẶT SỐ LƯỢNG (upsert), không
    // phải "tạo mới mỗi lượt gọi" — xem migration 0059.
    expect(res.status).toBe(200);

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

  // Anh chốt 30/09 (sau BB-335): "kích thước kể cả chưa bán nhưng có giá cũng hiện"
  // → có giá là bán được, không còn ngưỡng số lần bán / độ tin cậy. Sản phẩm KHÔNG
  // có giá vẫn bị từ chối (Test 3). Hai ca dưới xoá dòng vừa tạo để Test 5 tính tổng đúng.
  for (const [ten, layId] of [
    ["Test 2: sản phẩm 0 lần bán nhưng có giá -> bán được", () => prodLowSamplesId],
    ["Test 2b: giá hoà (price_confidence = 0.5) nhưng có giá -> bán được", () => prodLowConfidenceId],
  ] as const) {
    it(ten, async () => {
      vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
      const res = await postAddon(
        new Request("http://localhost:3000/api/g/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: layId(), quantity: 1, photoId }),
        }),
      );
      expect(res.status).toBe(200);
      const { error } = await supabase
        .from("selection_addons")
        .delete()
        .eq("selection_id", selectionId)
        .eq("product_id", layId());
      expect(error).toBeNull();
    });
  }

  it("Test 3: Mua sản phẩm list_price null -> từ chối", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodNullPriceId,
        quantity: 1,
        photoId,
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

  it("Test 5: Quantity âm -> từ chối; quantity 0 -> BỎ MUA", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValue(session);

    /*
      Đổi so với bản BB-105 gốc: `quantity: 0` KHÔNG còn là dữ liệu sai, nó là
      "ba mẹ bỏ mua sản phẩm này". Trước đây không có đường nào bỏ mua — đường
      này chèn thẳng một dòng mỗi lượt gọi, nên bấm cộng ba lần là ba dòng và
      hoá đơn tính tiền ba lần. Xem migration 0059.

      Số âm thì vẫn là dữ liệu sai.
    */
    const reqZero = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodReliableId,
        quantity: 0,
        photoId,
      }),
    });
    const resZero = await postAddon(reqZero);
    expect(resZero.status).toBe(200);
    expect((await resZero.json()).data.totalAddonsAmount).toBe(0);

    // Quantity = -3
    const reqNegative = new Request("http://localhost:3000/api/g/addons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: prodReliableId,
        quantity: -3,
        photoId,
      }),
    });
    const resNegative = await postAddon(reqNegative);
    expect(resNegative.status).toBe(400);
    const bodyNegative = await resNegative.json();
    expect(bodyNegative.error.code).toBe("INVALID_INPUT");
  });

  it("Test 6: GET /api/g/gallery trả thêm khối addons đã mua của phiên", async () => {
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValue(session);

    // Dọn sạch rồi dựng lại đúng thứ cần đọc.
    //
    // Các ca trước để lại dòng mua thêm của riêng chúng, và ca này khẳng định
    // một con số tiền CỤ THỂ. Dựa vào thứ tự các ca là chỗ dễ vỡ nhất trong
    // một tệp phép thử — chỉ cần thêm một ca ở giữa là con số lệch.
    await supabase.from("selection_addons").delete().eq("selection_id", selectionId);

    await postAddon(
      new Request("http://localhost:3000/api/g/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: prodReliableId, quantity: 2, photoId }),
      }),
    );

    const res = await getGallery(new Request("http://localhost/api/g/gallery"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(body.data.addons).toBeDefined();
    /*
      350.000đ chứ không phải 250.000đ: ca 4 vừa đổi bảng giá lên 350.000, và ca
      này ĐẶT LẠI số lượng sau đó.

      Đây là chỗ hai luật gặp nhau, nên nói rõ:
        · Dòng đã mua mà ba mẹ KHÔNG đụng tới thì giữ nguyên giá cũ (ca 4).
        · Ba mẹ đổi số lượng là một lần đặt mua MỚI, chốt theo giá đang hiện
          trên màn hình lúc họ bấm — tức giá mới.
    */
    expect(body.data.addons.totalAmount).toBe(700000);
    expect(body.data.addons.items).toHaveLength(1);

    const item = body.data.addons.items[0];
    expect(item.productId).toBe(prodReliableId);
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(350000);
    expect(item.totalPrice).toBe(700000);
  });
});
