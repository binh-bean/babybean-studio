/**
 * GET /api/admin/galleries/options — dữ liệu cho các hộp chọn của wizard tạo album.
 *
 * OWNER: DEV-BE. Task BB-022.
 *
 * Một lời gọi thay vì ba: wizard cần chi nhánh, gói chụp và thợ ảnh cùng lúc,
 * ngay khi mở. Ba request song song trên mạng 3G ở studio thì chậm hơn một.
 *
 * Chỉ trả về những gì người đang đăng nhập được thấy — nhân viên một chi nhánh
 * không nhìn thấy chi nhánh khác trong danh sách chọn.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { soNgayHanChot } from "@/lib/gallery/han-chot";
import { giaAnhChonThemMacDinh } from "@/lib/gallery/gia-anh-chon-them";

export const runtime = "nodejs";


export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:create");

    const admin = createAdminClient();

    const { data: branches } = await admin
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .in("id", staff.branchIds)
      .order("name");

    // Gói có branch_id null nghĩa là áp dụng cho mọi chi nhánh.
    const { data: packages } = await admin
      .from("packages")
      .select("id, name, branch_id, included_quota, extra_photo_price")
      .eq("is_active", true)
      .order("name");

    const { data: photographers } = await admin
      .from("staff_profiles")
      .select("id, full_name, role, staff_branches(branch_id)")
      .eq("is_active", true)
      .in("role", ["photographer", "cs", "owner", "admin", "branch_manager"])
      .order("full_name");

    return ok({
      /**
       * Hạn chốt mặc định lấy từ màn Cài đặt, không chôn cứng trong thuật sĩ.
       *
       * Trước 22/09/2026 thuật sĩ khởi tạo `useState(7)`, nên chủ studio đổi
       * "Hạn chốt mặc định" từ 7 sang 10 thì ô trong thuật sĩ vẫn hiện 7 —
       * một dòng cài đặt không điều khiển thứ gì.
       *
       * Trả về ở đây chứ không để thuật sĩ đọc thẳng `/api/admin/settings`:
       * đường đó đòi quyền `settings:system` (chủ studio và quản trị), còn
       * người tạo bộ ảnh thường là CSKH.
       */
      macDinhHanChotNgay: await soNgayHanChot(admin),
      /**
       * Giá một ảnh chọn thêm mặc định, cùng lý do và cùng cách với
       * `macDinhHanChotNgay` ở trên (BB-214c). Thuật sĩ vẫn ưu tiên giá của
       * gói đã chọn khi có (xem `create-gallery-wizard.tsx`), số này chỉ là
       * giá trị TRƯỚC khi chọn gói / khi gói không có giá riêng.
       */
      macDinhGiaAnhChonThem: await giaAnhChonThemMacDinh(admin),
      branches: branches ?? [],
      packages: (packages ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        branchId: p.branch_id,
        includedQuota: p.included_quota,
        extraPhotoPrice: Number(p.extra_photo_price),
      })),
      photographers: (photographers ?? [])
        .map((p) => ({
          id: p.id,
          name: p.full_name,
          branchIds: (p.staff_branches as { branch_id: string }[] | null)?.map(
            (b) => b.branch_id,
          ) ?? [],
        }))
        // Chỉ giữ người mà người đang đăng nhập được nhìn thấy.
        .filter(
          (p) => p.branchIds.length === 0 || p.branchIds.some((b) => staff.branchIds.includes(b)),
        ),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
