/**
 * PUT /api/admin/galleries/[id]/ten-be — CSKH điền tên bé cho bộ ảnh chưa có (BB-379).
 *
 * Gắn/tạo `babies` của khách rồi gắn `galleries.baby_id` (xem lib/gallery/ten-be-bo-anh.ts).
 * Bộ đã có tên bé thì 409 — sửa tên bé có sẵn ở hồ sơ khách, không ở đây.
 * Thứ tự: xác thực → quyền → chi nhánh → kiểm đầu vào → ghi → nhật ký.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requireMotTrongCacQuyen, requireBranch, AuthError } from "@/lib/auth/staff";
import { CAC_QUYEN_SUA_THONG_TIN } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { datTenBeChoBoAnh } from "@/lib/gallery/ten-be-bo-anh";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TenBeSchema = z.object({
  fullName: z.string().trim().min(1, "Tên bé không được để trống").max(120, "Tên bé tối đa 120 ký tự"),
  nickname: z.string().trim().max(60, "Tên gọi ở nhà tối đa 60 ký tự").nullable().optional(),
});

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    // BB-383b: tên bé là thông tin bộ — `galleries:edit_info` HOẶC `galleries:write`.
    requireMotTrongCacQuyen(staff, CAC_QUYEN_SUA_THONG_TIN);

    const { id } = await context.params;
    if (!id || !UUID_REGEX.test(id)) return fail("INVALID_INPUT", "Gallery ID không hợp lệ");

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = TenBeSchema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", parsed.error.issues[0]?.message, { issues: parsed.error.issues });

    const admin = createAdminClient();
    const { data: g } = await admin.from("galleries").select("id, branch_id").eq("id", id).maybeSingle();
    if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(g.branch_id));

    const kq = await datTenBeChoBoAnh(admin, { galleryId: id, ...parsed.data });
    if (!kq.ok) return fail(kq.code, kq.message);

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(g.branch_id),
      action: "gallery.set_baby",
      entityType: "gallery",
      entityId: id,
      galleryId: id,
      // Không ghi tên bé vào nhật ký (dữ liệu định danh trẻ em) — chỉ mã.
      metadata: { babyId: kq.babyId, taoMoi: kq.taoMoi },
    });
    return ok({ babyId: kq.babyId, taoMoi: kq.taoMoi });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
