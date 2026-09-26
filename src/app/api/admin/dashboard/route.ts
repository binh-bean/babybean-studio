import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import { thangNay, thangTruoc, chenhLechPhanTram } from "@/lib/bao-cao/ky";
import { locBoAnhThat } from "@/lib/bao-cao/loc-chung";
import {
  TRANG_THAI_DANG_HOAT_DONG,
  TRANG_THAI_DA_CHOT,
  tinhTyLeChot,
  type TienDoChiNhanh,
} from "@/lib/utils/bang-dieu-khien";

export const runtime = "nodejs";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

/** Đếm số dòng `galleries` theo từng chi nhánh, khớp `statuses`, loại Fixture/archived. */
async function demGalleryTheoChiNhanh(
  admin: SupabaseAdminClient,
  branchIds: string[],
  statuses: readonly string[],
): Promise<Map<string, number>> {
  let q = admin.from("galleries").select("branch_id").in("branch_id", branchIds).in("status", statuses);
  q = locBoAnhThat(q);
  const { data, error } = await q;
  if (error) throw new Error(`Đếm bộ ảnh theo chi nhánh hỏng: ${error.message}`);
  const m = new Map<string, number>();
  for (const row of (data ?? []) as { branch_id: string }[]) {
    m.set(row.branch_id, (m.get(row.branch_id) ?? 0) + 1);
  }
  return m;
}

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
        soSanhKy: {},
        tienDoChiNhanh: [],
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

    const now = new Date();

    // BB-270: kỳ so sánh cho các thẻ "trong kỳ" — giờ VN, dùng khung của
    // `src/lib/bao-cao/ky.ts` (BB-260) thay vì Date cục bộ của máy chủ.
    // "Đã giao tháng này" là số THEO THÁNG LỊCH (đúng như nhãn của nó), nên kỳ
    // trước tự nhiên nhất để so là "tháng trước" theo lịch — không phải "30
    // ngày liền trước" (độ dài kỳ hiện tại đang chạy dở, cùng-độ-dài sẽ lệch
    // khỏi ranh giới tháng và đọc sai ý "tháng này").
    const kyDeliveredHienTai = thangNay(now);
    const kyDeliveredTruoc = thangTruoc(now);

    /**
     * Các truy vấn dưới đây đều trả `{ data, count, error }`. Bản đầu bỏ qua
     * `error` cả tám chỗ, và hậu quả không phải là một trang lỗi — mà là một
     * bảng điều khiển hiện **số 0** trông y như thật. Chủ studio đọc "0 album
     * quá hạn" rồi yên tâm, trong khi câu hỏi kia chưa từng chạy được.
     *
     * Phép thử quét mã của BB-190 không bắt được chỗ này: nó soát đường GHI,
     * còn đây là đường ĐỌC. Nên chốt phải nằm ngay trong mã.
     *
     * Đọc hụt thì ném: thà một trang báo lỗi còn hơn một con số bịa.
     *
     * BB-270: mọi truy vấn đếm ở đây đều đi qua `locBoAnhThat()` — loại bộ ảnh
     * Fixture và đã lưu trữ khỏi MỌI con số, kể cả những thẻ đã có từ BB-060.
     */
    let truyVanChoChon = admin
      .from("v_gallery_progress")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .in("status", ["ready", "in_review"]);
    truyVanChoChon = locBoAnhThat(truyVanChoChon);

    let truyVanSapHetHan = admin
      .from("v_gallery_progress")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("urgency", "due_soon");
    truyVanSapHetHan = locBoAnhThat(truyVanSapHetHan);

    let truyVanQuaHan = admin
      .from("v_gallery_progress")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("urgency", "overdue");
    truyVanQuaHan = locBoAnhThat(truyVanQuaHan);

    let truyVanChoRetouch = admin
      .from("v_gallery_progress")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("status", "submitted");
    truyVanChoRetouch = locBoAnhThat(truyVanChoRetouch);

    let truyVanDaGiaoThang = admin
      .from("galleries")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("status", "delivered")
      .gte("updated_at", kyDeliveredHienTai.tu.toISOString());
    truyVanDaGiaoThang = locBoAnhThat(truyVanDaGiaoThang);

    let truyVanTongSo = admin
      .from("galleries")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds);
    truyVanTongSo = locBoAnhThat(truyVanTongSo);

    // BB-270: "Đã giao" kỳ trước (tháng trước theo lịch, giờ VN) — dùng để
    // tính chip % chênh lệch của thẻ "Đã giao tháng này".
    let truyVanDaGiaoKyTruoc = admin
      .from("galleries")
      .select("*", { count: "exact", head: true })
      .in("branch_id", branchIds)
      .eq("status", "delivered")
      .gte("updated_at", kyDeliveredTruoc.tu.toISOString())
      .lt("updated_at", kyDeliveredTruoc.den.toISOString());
    truyVanDaGiaoKyTruoc = locBoAnhThat(truyVanDaGiaoKyTruoc);

    const ketQua = await Promise.all([
      truyVanChoChon,
      truyVanSapHetHan,
      truyVanQuaHan,
      truyVanChoRetouch,
      truyVanDaGiaoThang,
      truyVanTongSo,
      truyVanDaGiaoKyTruoc,
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
      { count: deliveredKyTruoc },
    ] = ketQua;

    // BB-270: tiến độ theo chi nhánh — chỉ những chi nhánh nhân viên này được
    // xem (`branchIds` đã áp `staff.branchIds`/`system:superuser` ở trên).
    // Định nghĩa "đang hoạt động"/"đã chốt": xem chú thích ở
    // `src/lib/utils/bang-dieu-khien.ts`.
    const [tenChiNhanh, dangHoatDongMap, daChotMap] = await Promise.all([
      (async () => {
        const { data, error } = await admin.from("branches").select("id, name").in("id", branchIds);
        if (error) throw new Error(`Tên chi nhánh hỏng: ${error.message}`);
        return data ?? [];
      })(),
      demGalleryTheoChiNhanh(admin, branchIds, TRANG_THAI_DANG_HOAT_DONG),
      demGalleryTheoChiNhanh(admin, branchIds, TRANG_THAI_DA_CHOT),
    ]);

    const tienDoChiNhanh: TienDoChiNhanh[] = tenChiNhanh
      .map((b: { id: string; name: string }) => {
        const dang = dangHoatDongMap.get(b.id) ?? 0;
        const chot = daChotMap.get(b.id) ?? 0;
        return {
          branchId: b.id,
          branchName: b.name,
          dangHoatDong: dang,
          daChot: chot,
          tyLeChot: tinhTyLeChot(dang, chot),
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName, "vi"));

    let truyVanCanXuLy = admin
      .from("v_gallery_progress")
      .select("id, title, customer_name, branch_name, status, due_at, selected_count, included_quota, urgency")
      .in("branch_id", branchIds)
      .or("urgency.eq.due_soon,urgency.eq.overdue,status.eq.submitted")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(10);
    truyVanCanXuLy = locBoAnhThat(truyVanCanXuLy);
    const { data: actionRequired, error: loiCanXuLy } = await truyVanCanXuLy;
    if (loiCanXuLy) throw new Error(`Bảng "Cần xử lý ngay" hỏng: ${loiCanXuLy.message}`);

    const startOfChart = new Date();
    startOfChart.setDate(startOfChart.getDate() - 13);
    startOfChart.setHours(0, 0, 0, 0);

    let truyVanBieuDo = admin
      .from("galleries")
      .select("created_at")
      .in("branch_id", branchIds)
      .gte("created_at", startOfChart.toISOString());
    truyVanBieuDo = locBoAnhThat(truyVanBieuDo);
    const { data: chartRaw, error: loiBieuDo } = await truyVanBieuDo;
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
      // BB-270: chỉ thẻ "trong kỳ" mới có mục ở đây — thẻ số dồn hiện tại
      // (waitingForSelection, dueSoon, overdue, waitingForRetouch,
      // totalGalleries) không có kỳ trước để so nên không xuất hiện; giao
      // diện đọc "không có mục = không hiện chip".
      soSanhKy: {
        deliveredThisMonth: {
          kyTruoc: deliveredKyTruoc || 0,
          chenhLechPhanTram: chenhLechPhanTram(deliveredThisMonth || 0, deliveredKyTruoc || 0),
        },
      },
      tienDoChiNhanh,
      actionRequired: actionRequired || [],
      chartData,
    });
  } catch (error: unknown) {
    console.error("Dashboard API error:", error);
    return failUnexpected(error, requestId);
  }
}
