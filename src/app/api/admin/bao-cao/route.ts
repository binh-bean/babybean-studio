/**
 * GET /api/admin/bao-cao — danh sách báo cáo mà nhân viên đang đăng nhập được xem.
 *
 * OWNER: DEV-BE. Task BB-260.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { baoCaoTheoQuyen } from "@/lib/bao-cao/dang-ky";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const danhSach = baoCaoTheoQuyen(staff.permissions).map((b) => ({
      ma: b.ma,
      ten: b.ten,
      moTa: b.moTa,
      nhom: b.nhom,
      quyen: b.quyen,
      boLoc: b.boLoc,
    }));
    return ok({ danhSach });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN");
    }
    return failUnexpected(err, requestId);
  }
}
