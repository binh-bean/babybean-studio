/**
 * POST /api/admin/galleries/[id]/gan-lark — BB-325: gắn một bộ ảnh CHƯA có
 * dòng Hậu Kỳ (17 bộ tạo tay trước BB-325) vào đúng dòng Hậu Kỳ bên Lark, để
 * Link app của bộ đó "biết đi về đâu".
 *
 * Nhận `larkHaukyRecordId` (đã tra bằng /api/admin/galleries/tra-lark), MÁY
 * CHỦ đọc lại dòng đó từ Lark rồi mới ghi. Chỉ ghi vào app (galleries), KHÔNG
 * ghi gì sang Lark. Dòng đã thuộc bộ khác → từ chối, nói rõ bộ nào.
 */
import { keoDongHopDongTuLark } from "@/lib/lark/dong-hop-dong";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { docDongHauKy, LoiTraLark } from "@/lib/lark/tra-hau-ky";
import { boAnhTheoDongLark } from "@/lib/gallery/bo-anh-da-co";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";
// BB-331: kéo dòng hợp đồng từ Lark ngay sau khi gắn (3–9 giây, đo 30/09).
export const maxDuration = 30;

const Schema = z.object({ larkHaukyRecordId: z.string().trim().min(1) });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const { id } = await ctx.params;

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    const parsed = Schema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", "Chưa chọn dòng Hậu Kỳ bên Lark");

    const admin = createAdminClient();
    const { data: gal } = await admin
      .from("galleries")
      .select("id, branch_id, lark_hauky_record_id, lark_contract_codes")
      .eq("id", id)
      .maybeSingle();
    if (!gal) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(gal.branch_id));
    if (gal.lark_hauky_record_id) {
      return fail("CONFLICT", "Bộ ảnh này đã gắn dòng Hậu Kỳ bên Lark rồi.");
    }

    let dong;
    try {
      dong = await docDongHauKy(parsed.data.larkHaukyRecordId);
    } catch (err) {
      if (err instanceof LoiTraLark) return fail("INTERNAL", err.thongDiep);
      throw err;
    }
    if (!dong || !dong.maHoaDon) return fail("NOT_FOUND", "Không đọc được dòng Hậu Kỳ này bên Lark.");

    const daCo = await boAnhTheoDongLark(admin, dong.recordId);
    if (daCo && daCo.id !== id) {
      return fail("CONFLICT", `Dòng Hậu Kỳ ${dong.maHoaDon} đã thuộc bộ ảnh "${daCo.tieuDe}".`, { boAnhDaCo: daCo });
    }

    // Giữ các mã hợp đồng đã có (bộ gom nhiều hợp đồng, 0028); mã của dòng này đứng đầu.
    const cu = ((gal.lark_contract_codes as string[] | null) ?? []).filter((m) => m !== dong.maHoaDon);
    const { error } = await admin
      .from("galleries")
      .update({
        lark_hauky_record_id: dong.recordId,
        lark_contract_code: dong.maHoaDon,
        lark_contract_codes: [dong.maHoaDon, ...cu],
      })
      .eq("id", id)
      .is("lark_hauky_record_id", null);
    if (error) throw error;

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      actorLabel: staff.role,
      branchId: String(gal.branch_id),
      action: "gallery.lark_link",
      entityType: "gallery",
      entityId: id,
      galleryId: id,
      metadata: { larkHaukyRecordId: dong.recordId, maHoaDon: dong.maHoaDon },
    });

    // BB-331: gắn xong là kéo luôn dòng hợp đồng + hạn mức từ hóa đơn Lark —
    // trước đây phải nhập tay ("Chưa có dòng hàng nào"). Hỏng thì KHÔNG làm
    // hỏng việc gắn: báo lại để màn hình mời bấm "Kéo dòng hợp đồng từ Lark".
    let dongHopDong: { soDongGhi: number; maKhongThay: string[]; sanPhamChuaCo: string[] } | { loi: string };
    try {
      const kq = await keoDongHopDongTuLark(admin, id);
      dongHopDong = { soDongGhi: kq.soDongGhi, maKhongThay: kq.maKhongThay, sanPhamChuaCo: kq.sanPhamChuaCo };
    } catch (err) {
      console.error(JSON.stringify({ evt: "gan_lark_keo_dong_loi", requestId, galleryId: id, loi: String((err as Error)?.message ?? err) }));
      dongHopDong = { loi: "Chưa kéo được dòng hợp đồng từ Lark" };
    }

    return ok({ recordId: dong.recordId, maHoaDon: dong.maHoaDon, linkLark: dong.linkLark, dongHopDong });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
