/**
 * POST /api/admin/galleries/kiem-tra-lai-loi — BB-326 mục 5.
 *
 * Body `{ galleryId }`: kiểm lại MỘT bộ lỗi, trả kết quả ngay (nút "Kiểm tra
 * lại" ở chi tiết bộ ảnh và ở từng dòng báo cáo lỗi tải).
 * Body rỗng: kiểm lại mọi bộ đang lỗi trong chi nhánh của người bấm (nút
 * "Kiểm tra lại tất cả lỗi"), tuần tự, có trần số bộ và mốc hết giờ.
 *
 * Logic nằm ở `@/lib/drive/kiem-tra-lai-loi` — cron hậu kỳ gọi cùng hàm.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { kiemTraLaiMotBo, kiemTraLaiCacBoLoi } from "@/lib/drive/kiem-tra-lai-loi";
import { GalleryNotFoundError } from "@/lib/drive/sync-gallery";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Trần một lượt bấm: 76 bộ lỗi thật (29/09) vừa trong một lượt. */
const GIOI_HAN_MOT_LUOT = 100;
/** Chừa ~15s trước trần 60s của Vercel cho phần đếm lại và trả lời. */
const NGAN_SACH_MS = 45_000;

const Body = z.object({ galleryId: z.string().uuid().optional() }).strict();

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const raw = await readJsonBody(request);
    const parsed = Body.safeParse(raw.ok ? (raw.data ?? {}) : {});
    if (!parsed.success) return fail("INVALID_INPUT", "Dữ liệu không hợp lệ");

    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const admin = createAdminClient();

    const { galleryId } = parsed.data;
    if (galleryId) {
      const { data: g } = await admin
        .from("galleries")
        .select("branch_id")
        .eq("id", galleryId)
        .maybeSingle();
      if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
      requireBranch(staff, String(g.branch_id));

      const kq = await kiemTraLaiMotBo(admin, galleryId, requestId);
      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        branchId: String(g.branch_id),
        action: "gallery.sync_requested",
        entityType: "gallery",
        entityId: galleryId,
        galleryId,
        metadata: { jobId: requestId, kiemTraLai: true, hetLoi: kq.hetLoi, loi: kq.loi ?? null },
      });
      return ok(kq);
    }

    const laSieuQuyen = staff.permissions.includes("system:superuser");
    if (!laSieuQuyen && staff.branchIds.length === 0) {
      return ok({ loiTruoc: 0, daKiem: 0, hetLoi: 0, vanLoi: 0, loiSau: 0, conChuaKiem: false });
    }
    const kq = await kiemTraLaiCacBoLoi(admin, {
      branchIds: laSieuQuyen ? null : staff.branchIds,
      gioiHan: GIOI_HAN_MOT_LUOT,
      hetGioLuc: Date.now() + NGAN_SACH_MS,
      requestId,
    });
    console.info(JSON.stringify({ evt: "kiem_tra_lai_loi.xong", requestId, ...kq }));
    return ok(kq);
  } catch (err) {
    if (err instanceof GalleryNotFoundError) return fail("NOT_FOUND", err.message);
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
