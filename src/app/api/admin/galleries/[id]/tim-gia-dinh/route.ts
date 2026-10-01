/**
 * GET /api/admin/galleries/[id]/tim-gia-dinh — CSKH xem các tấm gia đình (link
 * "Mời gia đình") đã thả tim. `?xuat=1` tải danh sách tên tệp (.txt, mỗi dòng
 * một tên) để gửi thợ chỉnh sửa / dán vào Lark bằng tay.
 *
 * OWNER: DEV-BE. Task BB-345. Bảng `tim_gia_dinh` (migration 0083).
 *
 * Cùng khuôn quyền với GET `/api/admin/galleries/[id]/mua-them`:
 * `requireStaff` + `requireBranch` — xem được bộ ảnh của chi nhánh mình thì
 * xem được khối này. Chưa áp 0083 → `chuaApMigration: true`, không 500.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { demTimGiaDinh } from "@/lib/gallery/tim-gia-dinh-server";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, title")
      .eq("id", galleryId)
      .maybeSingle();
    if (gErr || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id as string);

    const { theoAnh, chuaApMigration } = await demTimGiaDinh(admin, galleryId);
    const ids = Array.from(theoAnh.keys());

    const tenTep = new Map<string, { fileName: string; sortIndex: number }>();
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await admin
        .from("photos")
        .select("id, file_name, sort_index")
        .eq("gallery_id", galleryId)
        .in("id", ids.slice(i, i + 150));
      if (error) throw error;
      for (const p of (data ?? []) as { id: string; file_name: string; sort_index: number | null }[]) {
        tenTep.set(p.id, { fileName: p.file_name, sortIndex: p.sort_index ?? 0 });
      }
    }

    const anh = ids
      .filter((id) => tenTep.has(id))
      .map((id) => ({ photoId: id, fileName: tenTep.get(id)!.fileName, soNguoi: theoAnh.get(id) ?? 0, _s: tenTep.get(id)!.sortIndex }))
      .sort((a, b) => a._s - b._s || a.fileName.localeCompare(b.fileName))
      .map(({ _s, ...r }) => r);

    if (new URL(request.url).searchParams.get("xuat") === "1") {
      const ten = `tim-gia-dinh-${galleryId.slice(0, 8)}.txt`;
      return new Response(anh.map((a) => a.fileName).join("\r\n") + (anh.length ? "\r\n" : ""), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${ten}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return ok({ soAnh: anh.length, anh, chuaApMigration });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem tim của gia đình");
    return failUnexpected(err, requestId);
  }
}
