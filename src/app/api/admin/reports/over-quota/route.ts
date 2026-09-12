/**
 * GET /api/admin/reports/over-quota — bộ ảnh đã chọn vượt hạn mức mà chưa thu tiền.
 *
 * OWNER: DEV-BE. Task BB-120.
 * Spec: docs/15 mục 6.3, db/migrations/0022
 *
 * ---------------------------------------------------------------------------
 * Vì sao API này tự lọc chi nhánh thay vì dựa vào RLS
 * ---------------------------------------------------------------------------
 * v_over_quota_unbilled khai security_invoker, nên RLS áp theo NGƯỜI GỌI. Đọc
 * bằng khoá quản trị (service_role) thì RLS bị bỏ qua hoàn toàn và view trả về
 * MỌI chi nhánh — quản lý chi nhánh Pasteur sẽ thấy khoản nợ của Tân Bình.
 *
 * requireStaff() đã trả sẵn branchIds: chủ và quản trị nhận đủ mọi chi nhánh,
 * nhân viên thường chỉ nhận chi nhánh được gán. Lọc theo đó là đúng cho mọi
 * vai, và không phải viết hai nhánh.
 *
 * ---------------------------------------------------------------------------
 * Ba con số phải đọc cùng nhau
 * ---------------------------------------------------------------------------
 * Số tiền chưa thu là SÀN, không phải trần. Hai lý do, cả hai đều phải hiện
 * lên màn hình chứ không giấu trong tài liệu:
 *
 *   - Bộ ảnh CHƯA BIẾT hạn mức không vào báo cáo. Chưa đủ dữ liệu để kết luận
 *     thì không kết luận — nhưng phải đếm riêng, nếu không người đọc tưởng
 *     những bộ đó không nợ gì.
 *   - Bộ ảnh khách chưa chọn xong thì chưa tính.
 *
 * Con số này dùng để ĐÒI TIỀN KHÁCH. Chỉ cần một khách phản bác đúng một lần
 * là không ai dám dùng bảng này nữa, nên thà thiếu còn hơn thừa.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** CTV thời vụ không thấy tiền. Xem 0012. */
const BLOCKED_ROLES = ["photoshop_ctv"];

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được báo cáo tiền");
    }
    if (staff.branchIds.length === 0) {
      return ok({ summary: emptySummary(), items: [] });
    }

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");
    const branchIds = branchFilter
      ? staff.branchIds.filter((b) => b === branchFilter)
      : staff.branchIds;

    if (branchIds.length === 0) {
      return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");
    }

    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from("v_over_quota_unbilled")
      .select(
        "gallery_id, gallery_title, branch_id, branch_name, lark_contract_code, " +
          "shoot_date, quota, selected_count, over_count, addon_count, " +
          "unbilled_count, extra_photo_price, unbilled_amount",
      )
      .in("branch_id", branchIds)
      .order("unbilled_amount", { ascending: false })
      .limit(500);

    if (error) throw error;

    // Ép kiểu vì bộ kiểu sinh từ Supabase chỉ biết BẢNG, không biết VIEW —
    // v_over_quota_unbilled có thật trong database nhưng trình biên dịch không
    // thấy. Khai kiểu ngay đây để chỗ đọc bên dưới vẫn được kiểm.
    type Row = {
      gallery_id: string; gallery_title: string; branch_id: string;
      branch_name: string; lark_contract_code: string | null;
      shoot_date: string | null; quota: number | null; selected_count: number;
      over_count: number; addon_count: number; unbilled_count: number;
      extra_photo_price: string | number | null;
      unbilled_amount: string | number | null;
    };

    const items = ((rows ?? []) as unknown as Row[]).map((r) => ({
      galleryId: r.gallery_id,
      galleryTitle: r.gallery_title,
      branchName: r.branch_name,
      contractCode: r.lark_contract_code,
      shootDate: r.shoot_date,
      quota: r.quota,
      selectedCount: r.selected_count,
      overCount: r.over_count,
      addonCount: r.addon_count,
      unbilledCount: r.unbilled_count,
      extraPhotoPrice: Number(r.extra_photo_price ?? 0),
      unbilledAmount: Number(r.unbilled_amount ?? 0),
    }));

    // Đếm bộ ảnh CHƯA BIẾT hạn mức, cùng phạm vi chi nhánh.
    //
    // Không lấy từ v_over_quota_summary: view đó gộp trên MỌI chi nhánh mà
    // người gọi nhìn thấy, và khi đọc bằng khoá quản trị thì đó là tất cả. Một
    // con số tổng của toàn studio đặt cạnh danh sách của một chi nhánh là cách
    // chắc chắn để người đọc hiểu sai.
    const { data: unknownRows, error: unknownErr } = await admin
      .rpc("count_galleries_missing_quota", { p_branch_ids: branchIds })
      .single();

    if (unknownErr) throw unknownErr;

    const summary = {
      albumCount: items.length,
      unbilledPhotoCount: items.reduce((n, i) => n + (i.unbilledCount ?? 0), 0),
      totalUnbilledAmount: items.reduce((n, i) => n + i.unbilledAmount, 0),
      missingQuotaCount: Number((unknownRows as { n: number } | null)?.n ?? 0),
    };

    return ok({ summary, items });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}

function emptySummary() {
  return { albumCount: 0, unbilledPhotoCount: 0, totalUnbilledAmount: 0, missingQuotaCount: 0 };
}
