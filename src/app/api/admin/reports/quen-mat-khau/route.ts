/**
 * GET /api/admin/reports/quen-mat-khau — nhân viên đã báo quên mật khẩu mà
 * admin CHƯA đặt lại. Tab "Quên mật khẩu" ở /admin/viec-can-xu-ly.
 *
 * OWNER: DEV-BE. Task BB-327. Chỉ người có quyền `staff:manage` (người đặt lại
 * được mật khẩu ở Nhân sự) mới xem — vai khác nhận danh sách rỗng, không lỗi,
 * để huy hiệu menu của họ không cộng việc họ không làm được.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { toDisplayIdentifier } from "@/lib/auth/username";
import { HANH_DONG_QUEN_MAT_KHAU, locYeuCauChuaXuLy } from "@/lib/nhan-su/quen-mat-khau";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (!staff.permissions.includes("staff:manage")) return ok({ items: [], coQuyen: false });

    const admin = createAdminClient();
    const { data: yeuCauRows, error: e1 } = await admin
      .from("activity_logs")
      .select("entity_id, created_at")
      .eq("action", HANH_DONG_QUEN_MAT_KHAU)
      .order("created_at", { ascending: false })
      .limit(200);
    if (e1) throw e1;
    const yeuCau = (yeuCauRows ?? [])
      .filter((r) => r.entity_id)
      .map((r) => ({ staffId: String(r.entity_id), requestedAt: String(r.created_at) }));
    if (yeuCau.length === 0) return ok({ items: [], coQuyen: true });

    const ids = [...new Set(yeuCau.map((y) => y.staffId))];
    const [{ data: datLaiRows, error: e2 }, { data: nguoiRows, error: e3 }] = await Promise.all([
      admin
        .from("activity_logs")
        .select("entity_id, created_at")
        .eq("action", "staff.update")
        .eq("entity_type", "staff_profile")
        .eq("metadata->>passwordReset", "true")
        .in("entity_id", ids),
      admin.from("staff_profiles").select("id, full_name, email, is_active").in("id", ids),
    ]);
    if (e2) throw e2;
    if (e3) throw e3;

    const datLai = (datLaiRows ?? []).map((r) => ({ staffId: String(r.entity_id), resetAt: String(r.created_at) }));
    const nguoi = new Map((nguoiRows ?? []).map((n) => [String(n.id), n]));

    const items = locYeuCauChuaXuLy(yeuCau, datLai)
      .map((y) => {
        const n = nguoi.get(y.staffId);
        if (!n || n.is_active === false) return null;
        return {
          staffId: y.staffId,
          fullName: String(n.full_name),
          taiKhoan: toDisplayIdentifier(String(n.email)),
          requestedAt: y.requestedAt,
          lanThu: y.lanThu,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return ok({ items, coQuyen: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
