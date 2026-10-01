/**
 * GET /api/admin/tuc-thi — tên kênh "cập nhật tức thì" của các chi nhánh nhân
 * viên đang đăng nhập được gán (vai vượt chi nhánh: mọi chi nhánh).
 *
 * OWNER: DEV-BE. Task BB-342. Xem src/lib/supabase/tuc-thi.ts.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { kenhNhanVien } from "@/lib/supabase/tuc-thi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    return ok({ kenh: staff.branchIds.map((id) => kenhNhanVien(id)) });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
