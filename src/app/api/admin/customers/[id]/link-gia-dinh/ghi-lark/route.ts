/**
 * POST /api/admin/customers/<id>/link-gia-dinh/ghi-lark — ghi LẠI link gia đình
 * đang sống lên cột "Link app" của MỌI dòng Hậu Kỳ của khách (vd. có bộ mới về
 * từ Lark). Quyền: `galleries:share` + đúng chi nhánh. Không tạo link mới.
 *
 * OWNER: DEV-BE. Task BB-334A. Hợp đồng: docs/29-link-gia-dinh.md §3.4.
 * Lark: qua `ghiLinkAppVeLark` — không ném, tự tắt khi chạy phép thử.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkGiaDinhSong, giaiMaLink, ghiLinkGiaDinhVeLark } from "@/lib/gia-dinh/link-gia-dinh";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");

    const admin = createAdminClient();
    const { data: khach, error } = await admin.from("customers").select("id, branch_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!khach) return fail("NOT_FOUND", "Không tìm thấy khách");
    requireBranch(staff, String(khach.branch_id));

    const song = await linkGiaDinhSong(admin, id);
    if (!song) return fail("NOT_FOUND", "Khách chưa có link gia đình");
    const ma = await giaiMaLink(admin, song);
    if (!ma) return fail("NOT_FOUND", "Không đọc lại được mã link — tạo link mới để ghi sang Lark.");

    const lark = await ghiLinkGiaDinhVeLark(admin, id, ma);

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "share_link.gia_dinh_ghi_lark",
      entity_type: "customer",
      entity_id: id,
      // SÁU ký tự đầu — không bao giờ cả mã (AGENTS §5).
      metadata: { shareLinkId: song.id, tokenPrefix: ma.slice(0, 6), tong: lark.tong, ghiDuoc: lark.ghiDuoc },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ lark });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền ghi link sang Lark");
    return failUnexpected(err, requestId);
  }
}
