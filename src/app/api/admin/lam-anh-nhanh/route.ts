/**
 * GET   /api/admin/lam-anh-nhanh — công tắc "Nhận làm ảnh nhanh" + các bộ ƯU TIÊN làm nhanh đang
 *                                  chờ (theo chi nhánh của nhân viên).
 * PATCH /api/admin/lam-anh-nhanh — bật/tắt công tắc { bat: boolean }.
 *
 * OWNER: DEV-BE. Task BB-399 vòng 3 (anh 08/10/2026: "quản trị có CÔNG TẮC tắt/mở khi cần thiết
 * nếu hậu kỳ đang quá tải; nếu khách chọn làm nhanh thì hiện ƯU TIÊN cho nhân viên").
 *
 * Quyền đổi: Admin / Quản lý — `settings:system` (owner, admin) HOẶC `settings:branch:write`
 * (branch_manager). CSKH chỉ có `settings:branch:read` → chỉ xem, không đổi (giống màn Cài đặt).
 * Mỗi lần đổi ghi `activity_logs` (ai, từ gì sang gì). Công tắc là CHUNG toàn hệ thống — cùng
 * dòng `settings` với ô "Nhận làm ảnh nhanh" ở Cài đặt.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { docCaiDatLamNhanh, ghiCongTacLamNhanh, layBoLamNhanhDangCho } from "@/lib/dich-vu/lam-anh-nhanh-server";
import { KHOA_BAT_LAM_NHANH, duocDoiCongTacLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh";

export const runtime = "nodejs";

type NhanVien = Awaited<ReturnType<typeof requireStaff>>;

const pham_vi = (staff: NhanVien): string[] | null =>
  staff.permissions.includes("system:superuser") || staff.role === "owner" || staff.role === "admin" ? null : staff.branchIds;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (!staff.permissions.includes("galleries:read")) return fail("FORBIDDEN", "Không có quyền xem bộ ảnh");
    const admin = createAdminClient();
    const [caiDat, dsCho] = await Promise.all([docCaiDatLamNhanh(admin, null), layBoLamNhanhDangCho(admin, pham_vi(staff))]);
    return ok({ bat: caiDat.bat, coTheDoi: duocDoiCongTacLamNhanh(staff.permissions), soNgayNhanh: caiDat.soNgayNhanh, dsCho });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN");
    return failUnexpected(err, requestId);
  }
}

const PatchSchema = z.object({ bat: z.boolean() });

export async function PATCH(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (!duocDoiCongTacLamNhanh(staff.permissions)) {
      return fail("FORBIDDEN", "Chỉ Admin hoặc Quản lý được bật/tắt nhận làm ảnh nhanh");
    }
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = PatchSchema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });

    const admin = createAdminClient();
    const cu = (await docCaiDatLamNhanh(admin, null)).bat;
    await ghiCongTacLamNhanh(admin, parsed.data.bat);
    const { error: loiNhatKy } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "settings.update",
      entity_type: "settings",
      metadata: { key: KHOA_BAT_LAM_NHANH, cu, moi: parsed.data.bat, tu: "cong_tac_nhanh" },
    });
    // Ghi nhật ký hụt thì kêu, không chặn: công tắc đã đổi thật.
    if (loiNhatKy) console.error("[BB-399] ghi nhật ký công tắc làm nhanh hụt:", loiNhatKy.message);
    return ok({ bat: parsed.data.bat });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN");
    return failUnexpected(err, requestId);
  }
}
