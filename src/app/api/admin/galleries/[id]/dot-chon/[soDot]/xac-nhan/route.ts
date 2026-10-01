/**
 * POST /api/admin/galleries/[id]/dot-chon/[soDot]/xac-nhan — CSKH XÁC NHẬN một
 * đợt mua thêm: ảnh của đợt đó khoá (chính thức), khách thấy "Studio đã xác nhận".
 *
 * OWNER: DEV-BE. Task BB-321. Cùng quyền với `/confirm` của đợt 1
 * (`galleries:write`). Không đẩy đợt lên Lark: CSKH tự cập nhật hợp đồng bên Lark
 * bằng tay (chủ studio 29/09/2026) — có thể sửa "Thành phần hợp đồng" ngay trong
 * app (BB-313), ví dụ nâng số ảnh Edit file từ 15 lên 16.
 *
 * Chỉ đi từ `cho_xac_nhan`. Bấm hai lần hoặc hai nhân viên cùng bấm: lượt sau
 * nhận CONFLICT, không ghi đè `confirmed_by` của người bấm trước.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { xacNhanDotMuaThem } from "@/lib/gallery/xac-nhan-danh-sach";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { layMotDot } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; soDot: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const { id: galleryId, soDot: soDotRaw } = await context.params;
    const soDot = Number(soDotRaw);
    if (!UUID_RE.test(galleryId) || !Number.isInteger(soDot) || soDot < 2) {
      return fail("INVALID_INPUT", "Mã bộ ảnh hoặc số đợt không hợp lệ");
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const dot = await layMotDot(admin, galleryId, soDot);
    if (!dot) return fail("NOT_FOUND", `Không có đợt ${soDot} của bộ ảnh này`);
    if (dot.trangThai !== "cho_xac_nhan") {
      return fail("CONFLICT", `Đợt ${soDot} không còn ở trạng thái chờ xác nhận`);
    }

    const bay = new Date().toISOString();
    // Phần thân dùng chung với route thu tiền (BB-349), xem xac-nhan-danh-sach.ts.
    const kq = await xacNhanDotMuaThem(admin, { galleryId, branchId: String(gallery.branch_id), staff, dot });
    if (!kq.ok) return fail(kq.code, kq.message);

    // Báo khách qua chuông + đẩy (không qua Lark — đó là kênh Studio→Studio).
    await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: `Studio đã xác nhận đợt ${soDot}`,
      noiDung: "Studio đã nhận đợt ảnh ba mẹ vừa chọn thêm.",
      loai: "dot_chon_xac_nhan",
    });

    return ok({ soDot, trangThai: "da_xac_nhan", confirmedAt: bay });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
