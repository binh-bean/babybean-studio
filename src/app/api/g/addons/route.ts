/**
 * POST /api/g/addons — Khách bấm mua thêm sản phẩm trong lúc chọn ảnh.
 *
 * OWNER: DEV-BE. Task BB-105.
 *
 * Ba luật về tiền:
 * 1. Đơn giá CHỐT lúc bấm mua, chép từ products.list_price vào selection_addons.unit_price.
 * 2. CHỈ bán khi products.price_confidence >= 0.8 VÀ price_samples >= 5.
 * 3. list_price null thì KHÔNG bán.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAddonSchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate customer session
    const session = await requireGallerySession();

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người xem không có quyền mua thêm sản phẩm");
    }

    // 2. Parse & validate JSON input
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateAddonSchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    // 3. Check gallery lock status
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    if (
      gallery.status === "submitted" ||
      gallery.status === "in_retouch" ||
      gallery.status === "delivered" ||
      gallery.status === "archived" ||
      gallery.status === "expired"
    ) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã chốt hoặc đã khoá, không thể mua thêm");
    }

    // 4. Verify product & price rules
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id, name, kind, material, size, list_price, price_confidence, price_samples, is_active")
      .eq("id", input.productId)
      .single();

    if (productError || !product || !product.is_active) {
      return fail("NOT_FOUND", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh");
    }

    // Luật 3: list_price null thì KHÔNG bán
    if (product.list_price === null || product.list_price === undefined) {
      return fail("INVALID_INPUT", "Sản phẩm chưa có đơn giá niêm yết, vui lòng liên hệ CSKH");
    }

    // Luật 2: CHỈ bán khi price_confidence >= 0.8 VÀ price_samples >= 5
    const confidence = product.price_confidence !== null ? Number(product.price_confidence) : 0;
    const samples = product.price_samples ?? 0;

    if (confidence < 0.8 || samples < 5) {
      return fail(
        "INVALID_INPUT",
        "Sản phẩm chưa đủ độ tin cậy về giá, CSKH sẽ báo giá trực tiếp"
      );
    }

    // Luật 1: Đơn giá chốt tại thời điểm mua, lấy từ products.list_price
    const unitPrice = Number(product.list_price);

    // 5. Insert selection_addons
    const { data: addon, error: insertError } = await admin
      .from("selection_addons")
      .insert({
        selection_id: session.selectionId,
        product_id: product.id,
        quantity: input.quantity,
        unit_price: unitPrice,
      })
      .select("id, selection_id, product_id, quantity, unit_price, created_at")
      .single();

    if (insertError || !addon) {
      throw insertError || new Error("Không thể tạo dòng mua thêm sản phẩm");
    }

    // 6. Calculate total addons amount for the current selection session
    const { data: allAddons, error: sumError } = await admin
      .from("selection_addons")
      .select("quantity, unit_price")
      .eq("selection_id", session.selectionId);

    if (sumError) {
      throw sumError;
    }

    const totalAddonsAmount = (allAddons || []).reduce(
      (sum, item) => sum + Number(item.unit_price) * item.quantity,
      0
    );

    // 7. Log activity
    await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: "addon.create",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        addonId: addon.id,
        productId: product.id,
        productName: product.name,
        quantity: addon.quantity,
        unitPrice,
        totalPrice: unitPrice * addon.quantity,
      },
    });

    return NextResponse.json(
      {
        data: {
          addon: {
            id: addon.id,
            selectionId: addon.selection_id,
            productId: addon.product_id,
            productName: product.name,
            material: product.material,
            size: product.size,
            quantity: addon.quantity,
            unitPrice,
            totalPrice: unitPrice * addon.quantity,
            createdAt: addon.created_at,
          },
          totalAddonsAmount,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
