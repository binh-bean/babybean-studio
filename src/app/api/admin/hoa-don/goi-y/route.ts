/**
 * POST /api/admin/hoa-don/goi-y — BB-395: gán hoá đơn từ CẤP KHÁCH. Thân `{ ma }`.
 *
 * Đọc hoá đơn từ nguồn, tìm khách app có cùng khoá khách, liệt kê các bộ ảnh của khách đó
 * (trong chi nhánh nhân viên thấy được) kèm phát sinh đang chờ, GỢI Ý bộ khớp nhất (link Hậu
 * Kỳ → số file/sản phẩm). KHÔNG gán gì: nhân viên bấm chọn bộ rồi màn gọi
 * `POST /api/admin/galleries/[id]/hoa-don { ma }` (route đó kiểm khách lần nữa).
 * POST (không GET) để mã hoá đơn không nằm trên địa chỉ.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { chonNguonHoaDon, chuanHoaMaHoaDon } from "@/lib/hoa-don/nguon-hoa-don";
import { nguonHoaDonLarkTuMoiTruong } from "@/lib/hoa-don/nguon-hoa-don-lark";
import { CAU_CHUA_AP_0102, goiYBoTheoHoaDon, laLoiChuaCoBang } from "@/lib/hoa-don/xac-nhan-hoa-don-server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const json = await readJsonBody(request);
    const than = json.ok ? (json.data as { ma?: unknown; customerId?: unknown } | null) : null;
    const ma = chuanHoaMaHoaDon(than?.ma);
    if (!ma) return fail("INVALID_INPUT", "Mã hoá đơn phải có dạng HD_YYYYMMDD#NN (vd HD_20260910#5071)");
    // Vòng 2 — gọi từ trang khách hàng: chỉ xét khách đó (route vẫn lọc theo chi nhánh nhân viên).
    const customerId =
      typeof than?.customerId === "string" && /^[0-9a-f-]{36}$/i.test(than.customerId) ? than.customerId : null;
    const admin = createAdminClient();
    const kq = await goiYBoTheoHoaDon(admin, {
      nguon: chonNguonHoaDon(nguonHoaDonLarkTuMoiTruong),
      ma,
      branchIds: staff.permissions.includes("system:superuser") ? null : staff.branchIds,
      customerId,
    });
    if (!kq.ok) return fail("INVALID_INPUT", kq.message);
    return ok(kq);
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền gán hoá đơn");
    if (laLoiChuaCoBang(err as { code?: string })) return fail("CONFLICT", CAU_CHUA_AP_0102);
    return failUnexpected(err, requestId);
  }
}
