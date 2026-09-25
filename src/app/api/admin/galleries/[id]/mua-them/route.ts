/**
 * GET /api/admin/galleries/[id]/mua-them — CSKH xem yêu cầu mua thêm khách gửi.
 *
 * OWNER: DEV-BE. Task BB-245.
 *
 * Chỉ ĐỌC. Đổi trạng thái (đã liên hệ, đã chốt, huỷ) nằm ở route con
 * `PATCH /api/admin/galleries/[id]/mua-them/[yeuCauId]` (BB-249).
 *
 * Không gate quyền riêng: cùng khuôn với GET `/api/admin/galleries/[id]/items`
 * (route anh em) — `requireStaff` + `requireBranch` là đủ, mọi nhân viên xem
 * được bộ ảnh của đúng chi nhánh mình thì xem được luôn khối này.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();

    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (galleryError || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const { data, error } = await admin
      .from("yeu_cau_mua_them")
      .select("id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at, products(name), photos(file_name)")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return ok({
      items: (data ?? []).map((d) => ({
        id: d.id,
        productId: d.product_id,
        productName: (d.products as unknown as { name: string } | null)?.name ?? null,
        photoId: d.photo_id,
        photoFileName: (d.photos as unknown as { file_name: string } | null)?.file_name ?? null,
        soLuong: d.so_luong,
        ghiChu: d.ghi_chu,
        trangThai: d.trang_thai,
        createdAt: d.created_at,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem yêu cầu mua thêm");
    return failUnexpected(err, requestId);
  }
}
