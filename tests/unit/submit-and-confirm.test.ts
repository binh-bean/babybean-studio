import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { POST as postSubmit } from "@/app/api/g/submit/route";
import { POST as postConfirmRetouch } from "@/app/api/admin/galleries/[id]/confirm/route";
import { GET as getGallery } from "@/app/api/g/gallery/route";
import { patchSelection } from "@/lib/selection/mutate";
import * as galleryAuth from "@/lib/auth/gallery-session";
import * as staffAuth from "@/lib/auth/staff";
import type { GallerySession } from "@/types/domain";

vi.mock("server-only", () => ({}));

describe("BB-114: Chốt đơn, báo studio, CSKH xác nhận (submit & confirm)", () => {
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
    prodServiceMakeup = randomUUID();

    const prods = [
      { id: prodPkgBaby01, name: "TEST Gói Baby 01", kind: "shoot_package", list_price: 1500000, is_active: true },
      { id: prodEditFile, name: "TEST Edit file", kind: "edited_photo", list_price: 50000, is_active: true },
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

  // Helper tạo album giả và session
  async function setupGalleryWithPhotos(options?: {
    withQuota?: boolean;
    quotaAmount?: number;
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
      title: "Test BB114 " + randomUUID().slice(0, 4),
      status: "in_review",
      photo_count: 20,
      included_quota: 20,
      extra_photo_price: 50000,
      allow_extra: true,
    });
    if (galErr) throw galErr;

    const { error: linkErr } = await supabase.from("share_links").insert({
      id: shareLinkId,
      gallery_id: galleryId,
      token_hash: randomUUID(),
      token_prefix: "114001",
      role: "owner",
    });
    if (linkErr) throw linkErr;

    const { error: selErr } = await supabase.from("selections").insert({
      id: selectionId,
      gallery_id: galleryId,
      share_link_id: shareLinkId,
      display_name: "Mẹ bé Test",
      is_primary: true,
    });
    if (selErr) throw selErr;

    // Thiết lập dòng hàng hợp đồng
    if (options?.withQuota) {
      const quota = options.quotaAmount ?? 15;
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
        quantity: quota,
        unit_price: null,
      });
    } else {
      // Album có dòng hàng nhưng KHÔNG CÓ dòng edited_photo -> quota chưa biết (NULL)
      await supabase.from("gallery_items").insert({
        id: randomUUID(),
        gallery_id: galleryId,
        product_id: prodServiceMakeup,
        parent_item_id: null,
        quantity: 1,
        unit_price: 300000,
      });
    }

    // Tạo một số ảnh mẫu
    const photoIds: string[] = [];
    const photosToInsert = [];
    for (let i = 1; i <= 20; i++) {
      const pid = randomUUID();
      photoIds.push(pid);
      photosToInsert.push({
        id: pid,
        gallery_id: galleryId,
        drive_file_id: "drive_" + randomUUID(),
        file_name: `IMG_${i}.jpg`,
        mime_type: "image/jpeg",
        status: "active",
      });
    }
    const { error: photoErr } = await supabase.from("photos").insert(photosToInsert);
    if (photoErr) throw photoErr;

    const session: GallerySession = {
      galleryId,
      shareLinkId,
      selectionId,
      role: "owner",
      exp: Math.floor(Date.now() / 1000) + 86400,
    };

    return { galleryId, shareLinkId, selectionId, session, photoIds };
  }

  it("Test 1: Chốt khi hạn mức chưa biết -> từ chối (QUOTA_UNKNOWN)", async () => {
    // Setup album với withQuota = false (không có dòng edited_photo)
    const { session } = await setupGalleryWithPhotos({ withQuota: false });

    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req = new Request("http://localhost:3000/api/g/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedByName: "Nguyễn Thị Mai",
        agreed: true,
      }),
    });

    const res = await postSubmit(req);
    expect(res.status).toBe(409); // hoặc 400

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("QUOTA_UNKNOWN");

    // Trạng thái album vẫn giữ nguyên, không bị khoá
    const { data: gal } = await supabase.from("galleries").select("status").eq("id", session.galleryId).single();
    expect(gal?.status).toBe("in_review");
  }, 15000);

  it("Test 2 & 3: Chốt album thành công -> Chốt hai lần hoặc sửa lựa chọn sau khi chốt bị GALLERY_LOCKED", async () => {
    // Setup album với hạn mức 15 ảnh
    const { session, photoIds, galleryId } = await setupGalleryWithPhotos({ withQuota: true, quotaAmount: 15 });

    // Khách chọn 18 ảnh (vượt 3 ảnh) - batch insert
    const selectionItems = [];
    for (let i = 0; i < 18; i++) {
      selectionItems.push({
        selection_id: session.selectionId,
        photo_id: photoIds[i]!,
        gallery_id: galleryId,
        mark: "selected",
      });
    }
    const { error: itemsErr } = await supabase.from("selection_items").insert(selectionItems);
    if (itemsErr) throw itemsErr;

    // --- LẦN 1: Chốt thành công ---
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req1 = new Request("http://localhost:3000/api/g/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedByName: "Nguyễn Thị Mai",
        agreed: true,
        generalNote: "Gia đình muốn chỉnh tone ấm áp ạ",
      }),
    });

    const res1 = await postSubmit(req1);
    expect(res1.status).toBe(200);

    const body1 = await res1.json();
    expect(body1.data).toBeDefined();
    expect(body1.data.selectedCount).toBe(18);
    expect(body1.data.includedQuota).toBe(15);
    expect(body1.data.extraCount).toBe(3);
    expect(body1.data.extraAmount).toBe(150000); // 3 * 50.000

    // Kiểm tra album đã chuyển sang 'submitted'
    const { data: galAfterSubmit } = await supabase.from("galleries").select("status, submitted_at, included_quota").eq("id", galleryId).single();
    expect(galAfterSubmit?.status).toBe("submitted");
    expect(galAfterSubmit?.submitted_at).not.toBeNull();
    expect(galAfterSubmit?.included_quota).toBe(15); // Snapshot hạn mức

    // Kiểm tra selection đã lưu snapshot
    const { data: selAfterSubmit } = await supabase.from("selections").select("*").eq("id", session.selectionId).single();
    expect(selAfterSubmit?.snapshot_selected_count).toBe(18);
    expect(selAfterSubmit?.snapshot_extra_count).toBe(3);
    expect(selAfterSubmit?.snapshot_extra_amount).toBe(150000);
    expect(selAfterSubmit?.submitted_by_name).toBe("Nguyễn Thị Mai");

    // --- LẦN 2: Chốt hai lần -> GALLERY_LOCKED ---
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);

    const req2 = new Request("http://localhost:3000/api/g/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedByName: "Nguyễn Thị Mai",
        agreed: true,
      }),
    });

    const res2 = await postSubmit(req2);
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error.code).toBe("GALLERY_LOCKED");

    // --- SỬA LỰA CHỌN SAU KHI CHỐT -> GALLERY_LOCKED ---
    const patchRes = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [{ photoId: photoIds[19]!, mark: "selected" }],
      },
      "127.0.0.1",
      "test-agent"
    );

    expect(patchRes.error).toBeDefined();
    expect(patchRes.error?.code).toBe("GALLERY_LOCKED");
  }, 15000);

  it("Test 4: Khách không được tự chuyển giai đoạn, CHỈ CSKH mới chuyển được sang in_retouch", async () => {
    const { galleryId } = await setupGalleryWithPhotos({ withQuota: true, quotaAmount: 15 });

    // Đặt album ở trạng thái đã chốt (submitted)
    await supabase.from("galleries").update({ status: "submitted" }).eq("id", galleryId);

    // 1. Khách hàng (không có staff session) cố gọi API CSKH -> UNAUTHENTICATED
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValueOnce(
      new staffAuth.AuthError("UNAUTHENTICATED")
    );

    const reqCustomer = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/confirm`, {
      method: "POST",
    });
    const resCustomer = await postConfirmRetouch(reqCustomer, { params: Promise.resolve({ id: galleryId }) });
    expect(resCustomer.status).toBe(401);

    // 2. Nhân viên không phải CSKH/Manager/Admin (ví dụ vai viewer hoặc photographer không được phân quyền chuyển) cố gọi -> FORBIDDEN
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: randomUUID(),
      role: "viewer",
      branchIds: [branchId],
    });

    const reqViewer = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/confirm`, {
      method: "POST",
    });
    const resViewer = await postConfirmRetouch(reqViewer, { params: Promise.resolve({ id: galleryId }) });
    expect(resViewer.status).toBe(403);

    // 3. CSKH xác nhận -> THÀNH CÔNG, album chuyển sang in_retouch
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: randomUUID(),
      role: "cs",
      branchIds: [branchId],
    });

    const reqCS = new Request(`http://localhost:3000/api/admin/galleries/${galleryId}/confirm`, {
      method: "POST",
    });
    const resCS = await postConfirmRetouch(reqCS, { params: Promise.resolve({ id: galleryId }) });
    expect(resCS.status).toBe(200);

    const { data: galRetouch } = await supabase.from("galleries").select("status").eq("id", galleryId).single();
    expect(galRetouch?.status).toBe("in_retouch");
  }, 15000);

  it("Test 5: Con số chụp lại lúc chốt KHÔNG đổi khi sau đó CSKH sửa dòng hàng", async () => {
    const { session, photoIds, galleryId } = await setupGalleryWithPhotos({ withQuota: true, quotaAmount: 15 });

    // Khách chọn 18 ảnh (thừa 3 ảnh so với hạn mức 15) - batch insert
    const selectionItems = [];
    for (let i = 0; i < 18; i++) {
      selectionItems.push({
        selection_id: session.selectionId,
        photo_id: photoIds[i]!,
        gallery_id: galleryId,
        mark: "selected",
      });
    }
    const { error: itemsErr } = await supabase.from("selection_items").insert(selectionItems);
    if (itemsErr) throw itemsErr;

    // Khách chốt
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const reqSubmit = new Request("http://localhost:3000/api/g/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmedByName: "Nguyễn Thị Mai",
        agreed: true,
      }),
    });
    const submitRes = await postSubmit(reqSubmit);
    expect(submitRes.status).toBe(200);

    // Sau khi chốt: CSKH sửa dòng hàng (thêm 10 ảnh Edit file, nâng tổng số lượng dòng hàng lên 25)
    await supabase.from("gallery_items").insert({
      id: randomUUID(),
      gallery_id: galleryId,
      product_id: prodEditFile,
      parent_item_id: null,
      quantity: 10,
      unit_price: 50000,
    });

    // Lúc này app.gallery_quota(galleryId) tính động ra 25 ảnh
    const { data: dynamicQuota } = await supabase.rpc("gallery_quota", { p_gallery_id: galleryId });
    expect(dynamicQuota).toBe(25);

    // Khách mở lại album xem GET /api/g/gallery
    vi.spyOn(galleryAuth, "requireGallerySession").mockResolvedValueOnce(session);
    const galRes = await getGallery();
    expect(galRes.status).toBe(200);

    const body = await galRes.json();
    const data = body.data;

    // Tất cả các con số nghiệp vụ hiển thị cho khách VẪN GIỮ NGUYÊN CON SỐ CHỤP LẠI:
    // Hạn mức lúc chốt: 15 (không bị đổi thành 25)
    expect(data.includedQuota).toBe(15);
    // Số ảnh đã chọn lúc chốt: 18
    expect(data.selection.selectedCount).toBe(18);
    // Số thừa lúc chốt: 3
    expect(data.selection.extraCount).toBe(3);
    // Tiền thừa lúc chốt: 150.000
    expect(data.selection.extraAmount).toBe(150000);
  }, 15000);
});
