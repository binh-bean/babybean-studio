/**
 * GET /api/admin/reports/bo-anh-rong — BB-381. Hai tab của "Việc cần xử lý" đọc chung route này:
 *   · `goiChuaCoAnh` — "Bộ có gói chụp nhưng chưa có ảnh" (kèm lý do + hướng dẫn 1 dòng);
 *   · `donHauKy`     — "Đơn hậu kỳ mua thêm" (hoá đơn không có dịch vụ chụp, theo dõi tới khi giao).
 * CHỈ ĐỌC. Không gửi Lark, không gửi khách. Luật ở src/lib/gallery/bo-anh-rong.ts.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { layBoAnhRong } from "@/lib/gallery/bo-anh-rong";
import { docNhaCuaCacBoKhongLoi } from "@/lib/gia-dinh/nha-cua-bo";
import { layLinkChatTheoBo } from "@/lib/lien-lac/link-chat-khach-server";

export const runtime = "nodejs";

const BLOCKED_ROLES = ["photoshop_ctv"];

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) return fail("FORBIDDEN", "Vai trò này không xem được danh sách này");
    const branchIds = staff.permissions.includes("system:superuser") ? null : staff.branchIds;
    const admin = createAdminClient();
    const kq = await layBoAnhRong(admin, branchIds);
    // BB-394 — nhãn nhà cho cả hai tab (gói chưa có ảnh + đơn hậu kỳ), một lần đọc.
    const nha = await docNhaCuaCacBoKhongLoi(admin, [...kq.goiChuaCoAnh, ...kq.donHauKy].map((d) => d.galleryId));
    // BB-404 — link chat riêng của khách theo bộ (một truy vấn) cho icon "Nhắn khách" trên từng dòng.
    const chatTheoBo = await layLinkChatTheoBo(admin, [...kq.goiChuaCoAnh, ...kq.donHauKy].map((d) => d.galleryId));
    return ok({ ...kq, nha, chatTheoBo });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
