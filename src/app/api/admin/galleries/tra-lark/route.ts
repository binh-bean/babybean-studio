/**
 * POST /api/admin/galleries/tra-lark — BB-325: tra dòng Hậu Kỳ bên Lark theo
 * mã hóa đơn + số điện thoại khách, để thuật sĩ tạo bộ ảnh điền sẵn thông tin
 * THẬT (tên mẹ, tên bé, SĐT, mã hóa đơn, gói chụp, ngày chụp, link dòng Lark).
 *
 * CHỈ ĐỌC Lark. Không thấy dòng khớp → 404 kèm lý do, thuật sĩ chặn tạo.
 * Dòng đã có bộ ảnh trong app → trả kèm `boAnhDaCo` để thuật sĩ cho mở bộ đó
 * thay vì tạo bộ thứ hai.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { traHauKy, LoiTraLark, duoiSoDienThoai } from "@/lib/lark/tra-hau-ky";
import { boAnhTheoDongLark } from "@/lib/gallery/bo-anh-da-co";
import { goiYTuDongLark } from "@/lib/lark/goi-y-tao-bo";

export const runtime = "nodejs";

const Schema = z.object({
  maHoaDon: z.string().trim().min(3, "Nhập mã hóa đơn / hợp đồng (dạng HD_YYYYMMDD#NN)"),
  soDienThoai: z.string().trim().min(1, "Nhập số điện thoại khách"),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    const parsed = Schema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, { issues: parsed.error.issues });
    }
    const { maHoaDon, soDienThoai } = parsed.data;
    if (!duoiSoDienThoai(soDienThoai)) {
      return fail("INVALID_INPUT", "Số điện thoại chưa đủ chữ số.");
    }

    let dong;
    try {
      dong = await traHauKy(maHoaDon, soDienThoai);
    } catch (err) {
      if (err instanceof LoiTraLark) return fail("INTERNAL", err.thongDiep);
      throw err;
    }
    if (dong.length === 0) {
      return fail(
        "NOT_FOUND",
        `Không tìm thấy dòng Hậu Kỳ nào bên Lark có mã ${maHoaDon.trim()} và số điện thoại này. Kiểm lại mã hóa đơn / số điện thoại, hoặc tạo dòng Hậu Kỳ bên Lark trước.`,
      );
    }

    const admin = createAdminClient();
    // BB-369 — gợi ý chi nhánh + người chụp từ chính dòng Lark (thuật sĩ tự điền).
    // Chỉ trong các chi nhánh người đang đăng nhập được thấy — cùng luật /options.
    const [{ data: branches }, { data: nhanSu }] = await Promise.all([
      admin.from("branches").select("id, code, name").eq("is_active", true).in("id", staff.branchIds),
      admin
        .from("staff_profiles")
        .select("id, full_name, staff_branches(branch_id)")
        .eq("is_active", true)
        .in("role", ["photographer", "cs", "owner", "admin", "branch_manager"]),
    ]);
    const nguoiChup = (nhanSu ?? [])
      .map((p) => ({
        id: p.id as string,
        name: (p.full_name as string) ?? "",
        branchIds: ((p.staff_branches as { branch_id: string }[] | null) ?? []).map((b) => b.branch_id),
      }))
      .filter((p) => p.branchIds.length === 0 || p.branchIds.some((b) => staff.branchIds.includes(b)));
    const ketQua = await Promise.all(
      dong.map(async (d) => ({
        ...d,
        boAnhDaCo: await boAnhTheoDongLark(admin, d.recordId),
        goiY: goiYTuDongLark(d, branches ?? [], nguoiChup),
      })),
    );
    return ok({ dong: ketQua });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
