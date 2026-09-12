/**
 * GET /api/admin/galleries/[id]/items — Thành phần hợp đồng và hạn mức ảnh của album (phía quản trị).
 *
 * OWNER: DEV-BE. Task BB-102.
 * Hạn mức lấy từ app.gallery_quota(), cây hai tầng (dòng hợp đồng cha và thành phần con).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGalleryContractSummary } from "@/lib/selection/contract";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate staff
    const staff = await requireStaff();

    // 2. Validate gallery ID
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Gallery ID không hợp lệ");
    }

    const admin = createAdminClient();

    // 3. Check gallery existence and branch authorization
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    requireBranch(staff, gallery.branch_id);

    // 4. Retrieve 2-tier contract components and quota
    const summary = await getGalleryContractSummary(gallery.id, admin);

    // 5. Respond
    return ok({
      galleryId: gallery.id,
      quotaKnown: summary.quotaKnown,
      includedQuota: summary.includedQuota,
      totalValue: summary.totalValue,
      items: summary.items,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message);
    }
    return failUnexpected(err, requestId);
  }
}
