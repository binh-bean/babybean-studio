/**
 * PATCH /api/admin/galleries/[id]/bia — ảnh bìa và chữ trên bìa của một bộ.
 *
 * OWNER: DEV-BE. Task BB-215.
 * Spec: lời chủ studio 24/09/2026 — CSKH chọn ảnh bìa, và đoạn chữ trên bìa
 * (tiêu đề + lời) cũng phải đổi được theo từng bộ.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đây là một đường riêng, không nhét vào PATCH nào có sẵn
 * ---------------------------------------------------------------------------
 * Không có đường PATCH chung cho `galleries` — mỗi cụm trường có đường riêng
 * theo đúng việc nó phục vụ (`/drive` đổi nguồn ảnh, `/items` đổi dòng hàng).
 * Bìa là một cụm việc của riêng nó: CSKH mở một khối "Bìa bộ ảnh", chọn ảnh và
 * viết chữ, bấm Lưu một lần cho cả ba trường.
 *
 * ---------------------------------------------------------------------------
 * Vì sao kiểm ảnh bìa PHẢI thuộc đúng bộ này
 * ---------------------------------------------------------------------------
 * `cover_photo_id` không có khoá ngoại chặn theo `gallery_id` — chỉ chặn theo
 * `photos.id` tồn tại (xem db/schema.sql). Không kiểm ở đây thì một CSKH gõ
 * nhầm (hoặc client bị sửa tay) đặt được ảnh của NHÀ KHÁC làm bìa hiện lên
 * trước mặt một gia đình đang mở link — lộ ảnh con nhà này sang bìa nhà kia.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const Body = z
  .object({
    coverPhotoId: z.string().regex(UUID_REGEX).nullable().optional(),
    coverHeadline: z.string().trim().max(120).nullable().optional(),
    welcomeMessage: z.string().trim().max(400).nullable().optional(),
  })
  .refine(
    (b) => b.coverPhotoId !== undefined || b.coverHeadline !== undefined || b.welcomeMessage !== undefined,
    { message: "Không có gì để lưu" },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const body = await readJsonBody(request);
    const parsed = body.ok ? Body.safeParse(body.data) : null;
    if (!parsed || !parsed.success) {
      return fail("INVALID_INPUT", "Dữ liệu bìa không hợp lệ");
    }

    const staff = await requireStaff();
    // Cùng bộ vai với sửa các trường khác của bộ ảnh (drive, items): kế toán,
    // thợ chỉnh ảnh, cộng tác viên photoshop KHÔNG đổi bìa gửi khách.
    requirePermission(staff, "galleries:write");

    const admin = createAdminClient();

    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, cover_photo_id, cover_headline, welcome_message")
      .eq("id", galleryId)
      .maybeSingle();

    if (gErr) return failUnexpected(gErr, requestId);
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    requireBranch(staff, gallery.branch_id);

    const { coverPhotoId, coverHeadline, welcomeMessage } = parsed.data;

    if (coverPhotoId !== undefined && coverPhotoId !== null) {
      const { data: photo, error: photoErr } = await admin
        .from("photos")
        .select("id, gallery_id")
        .eq("id", coverPhotoId)
        .maybeSingle();

      if (photoErr) return failUnexpected(photoErr, requestId);
      if (!photo || photo.gallery_id !== galleryId) {
        return fail("INVALID_INPUT", "Ảnh này không thuộc bộ ảnh đang sửa");
      }
    }

    const capNhat: Record<string, unknown> = {};
    if (coverPhotoId !== undefined) capNhat.cover_photo_id = coverPhotoId;
    if (coverHeadline !== undefined) capNhat.cover_headline = coverHeadline || null;
    if (welcomeMessage !== undefined) capNhat.welcome_message = welcomeMessage || null;

    const { error: upErr } = await admin.from("galleries").update(capNhat).eq("id", galleryId);
    if (upErr) return failUnexpected(upErr, requestId);

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.cover.change",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: {
        tu: {
          coverPhotoId: gallery.cover_photo_id,
          coverHeadline: gallery.cover_headline,
          welcomeMessage: gallery.welcome_message,
        },
        sang: capNhat,
      },
    });

    return ok({
      coverPhotoId: coverPhotoId !== undefined ? coverPhotoId : gallery.cover_photo_id,
      coverHeadline: coverHeadline !== undefined ? (coverHeadline || null) : gallery.cover_headline,
      welcomeMessage: welcomeMessage !== undefined ? (welcomeMessage || null) : gallery.welcome_message,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
