import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (staff.branchIds.length === 0) {
      return ok({
        stats: {
          waitingForSelection: 0,
          dueSoon: 0,
          overdue: 0,
          waitingForRetouch: 0,
          deliveredThisMonth: 0,
          totalGalleries: 0,
        },
        actionRequired: [],
        chartData: [],
      });
    }

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");
    
    let branchIds = staff.branchIds;
    if (branchFilter) {
      if (!staff.branchIds.includes(branchFilter)) {
        return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");
      }
      branchIds = [branchFilter];
    }

    const admin = createAdminClient();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    /**
     * Tám truy vấn dưới đây đều trả `{ data, count, error }`. Bản đầu bỏ qua
     * `error` cả tám chỗ, và hậu quả không phải là một trang lỗi — mà là một
     * bảng điều khiển hiện **số 0** trông y như thật. Chủ studio đọc "0 album
     * quá hạn" rồi yên tâm, trong khi câu hỏi kia chưa từng chạy được.
     *
     * Phép thử quét mã của BB-190 không bắt được chỗ này: nó soát đường GHI,
     * còn đây là đường ĐỌC. Nên chốt phải nằm ngay trong mã.
     *
     * Đọc hụt thì ném: thà một trang báo lỗi còn hơn một con số bịa.
     */
    const ketQua = await Promise.all([
      admin
        .from("v_gallery_progress")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds)
        .in("status", ["ready", "in_review"]),
      admin
        .from("v_gallery_progress")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds)
        .eq("urgency", "due_soon"),
      admin
        .from("v_gallery_progress")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds)
        .eq("urgency", "overdue"),
      admin
        .from("v_gallery_progress")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds)
        .eq("status", "submitted"),
      admin
        .from("galleries")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds)
        .eq("status", "delivered")
        .gte("updated_at", startOfMonth.toISOString()),
      admin
        .from("galleries")
        .select("*", { count: "exact", head: true })
        .in("branch_id", branchIds),
    ]);

    for (const [i, r] of ketQua.entries()) {
      if (r.error) throw new Error(`Truy vấn thẻ số ${i + 1} hỏng: ${r.error.message}`);
    }

    const [
      { count: waitingForSelection },
      { count: dueSoon },
      { count: overdue },
      { count: waitingForRetouch },
      { count: deliveredThisMonth },
      { count: totalGalleries },
    ] = ketQua;

    const { data: actionRequired, error: loiCanXuLy } = await admin
      .from("v_gallery_progress")
      .select("id, title, customer_name, branch_name, status, due_at, selected_count, included_quota, urgency")
      .in("branch_id", branchIds)
      .or("urgency.eq.due_soon,urgency.eq.overdue,status.eq.submitted")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(10);
    if (loiCanXuLy) throw new Error(`Bảng "Cần xử lý ngay" hỏng: ${loiCanXuLy.message}`);

    const startOfChart = new Date();
    startOfChart.setDate(startOfChart.getDate() - 13);
    startOfChart.setHours(0, 0, 0, 0);

    const { data: chartRaw, error: loiBieuDo } = await admin
      .from("galleries")
      .select("created_at")
      .in("branch_id", branchIds)
      .gte("created_at", startOfChart.toISOString());
    if (loiBieuDo) throw new Error(`Biểu đồ 14 ngày hỏng: ${loiBieuDo.message}`);

    const chartDataMap: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(startOfChart);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0] as string;
      chartDataMap[dateStr] = 0;
    }

    if (chartRaw) {
      for (const row of chartRaw) {
        if (!row.created_at) continue;
        const dateStr = String(row.created_at).split("T")[0] as string;
        if (dateStr && chartDataMap[dateStr] !== undefined) {
          chartDataMap[dateStr]++;
        }
      }
    }

    const chartData = Object.entries(chartDataMap).map(([date, count]) => ({
      date,
      count,
    })).sort((a, b) => a.date.localeCompare(b.date));

    return ok({
      stats: {
        waitingForSelection: waitingForSelection || 0,
        dueSoon: dueSoon || 0,
        overdue: overdue || 0,
        waitingForRetouch: waitingForRetouch || 0,
        deliveredThisMonth: deliveredThisMonth || 0,
        totalGalleries: totalGalleries || 0,
      },
      actionRequired: actionRequired || [],
      chartData,
    });
  } catch (error: unknown) {
    console.error("Dashboard API error:", error);
    return failUnexpected(error, requestId);
  }
}
