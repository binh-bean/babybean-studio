/**
 * POST /api/auth/quen-mat-khau — nhân viên báo quên mật khẩu (chưa đăng nhập).
 *
 * OWNER: SEC-ARCH. Task BB-327. Body `{ identifier }` (tên tài khoản hoặc email).
 * Ghi một yêu cầu vào `activity_logs` để admin thấy trong "Việc cần xử lý" và
 * đặt lại ở Nhân sự — xem src/lib/nhan-su/quen-mat-khau.ts.
 *
 * AN NINH:
 *   · LUÔN trả cùng một câu, cùng mã 200 — có tài khoản hay không, tài khoản
 *     bị tắt, gửi quá nhiều lần… đều vậy. Khác câu là cho người lạ một máy dò
 *     tên tài khoản.
 *   · Không đổi mật khẩu, không gửi link đặt lại: chỉ ghi yêu cầu. Người đặt
 *     lại là admin, qua đường đã có quyền `staff:manage`.
 *   · Trần mỗi giờ toàn hệ thống + giãn cách mỗi tài khoản: người lạ bấm liên
 *     tục không làm đầy danh sách của admin.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { toAuthEmail } from "@/lib/auth/username";
import {
  CAU_DA_GUI_QUEN_MAT_KHAU,
  GIAN_CACH_GUI_LAI_PHUT,
  HANH_DONG_QUEN_MAT_KHAU,
  TRAN_MOI_GIO,
} from "@/lib/nhan-su/quen-mat-khau";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  const traLoi = () => ok({ message: CAU_DA_GUI_QUEN_MAT_KHAU });

  try {
    const body = await readJsonBody(request);
    const identifier =
      body.ok && typeof (body.data as { identifier?: unknown })?.identifier === "string"
        ? ((body.data as { identifier: string }).identifier).trim()
        : "";
    if (identifier.length === 0 || identifier.length > 200) {
      return fail("INVALID_INPUT", "Nhập tên tài khoản hoặc email");
    }

    const admin = createAdminClient();

    const motGioTruoc = new Date(Date.now() - 3600_000).toISOString();
    const { count: soTrongGio } = await admin
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", HANH_DONG_QUEN_MAT_KHAU)
      .gte("created_at", motGioTruoc);
    if ((soTrongGio ?? 0) >= TRAN_MOI_GIO) return traLoi();

    const { data: nguoi } = await admin
      .from("staff_profiles")
      .select("id, is_active")
      .eq("email", toAuthEmail(identifier))
      .maybeSingle();
    if (!nguoi || nguoi.is_active === false) return traLoi();

    const moc = new Date(Date.now() - GIAN_CACH_GUI_LAI_PHUT * 60_000).toISOString();
    const { count: soGanDay } = await admin
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", HANH_DONG_QUEN_MAT_KHAU)
      .eq("entity_id", nguoi.id)
      .gte("created_at", moc);
    if ((soGanDay ?? 0) > 0) return traLoi();

    const { error } = await admin.from("activity_logs").insert({
      actor_type: "system",
      actor_label: "man-dang-nhap",
      action: HANH_DONG_QUEN_MAT_KHAU,
      entity_type: "staff_profile",
      entity_id: nguoi.id,
      // Không ghi IP/tên — nhật ký đọc được bởi nhiều vai (xem nhat-ky.ts).
      metadata: {},
    });
    if (error) console.error(JSON.stringify({ evt: "quen_mat_khau.ghi_hut", requestId, loi: error.message }));

    return traLoi();
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
