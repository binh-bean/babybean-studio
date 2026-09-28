import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import { thangNay, thangTruoc, chenhLechPhanTram, nNgayGanDay, kyTruocCungDoDai, dinhDangNgayVN, ngayVN } from "@/lib/bao-cao/ky";
import { locBoAnhThat } from "@/lib/bao-cao/loc-chung";
import { qua60NgayFileGoc, laKhoaTheoLark } from "@/lib/lark/trang-thai-hau-ky";
import {
  TRANG_THAI_DANG_HOAT_DONG,
  TRANG_THAI_DA_CHOT,
  tinhTyLeChot,
  type TienDoChiNhanh,
} from "@/lib/utils/bang-dieu-khien";
import {
  tinhTongTienMuaThem,
  tinhSoDonMuaThem,
  tinhSoGiaDinhMuaThem,
  tinhCoCauMuaThem,
  tinhTheoNgayMuaThem,
  tinhTheoChiNhanhMuaThem,
  type DongMuaThem,
} from "@/lib/utils/mua-them-7-ngay";
import { anhBiaTheoBo } from "@/lib/selection/anh-bia";

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
        viecHomNay: [],
        muaThem7Ngay: {
          tongTien: 0,
          chenhLechPhanTram: null,
          soDon: 0,
          soGiaDinh: 0,
          theoNgay: [],
          coCau: [],
          tu: null,
          den: null,
        },
        theoChiNhanhMuaThem: [],
        chartData: [],
      });
    }

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");
    /**
     * BB-303 — `?full=1` phân biệt hai người gọi cùng route này:
     *   - Sidebar (`admin-layout-shell.tsx`) gọi ở MỌI trang quản trị, mỗi
     *     lượt chuyển trang, chỉ để lấy `stats.dueSoon`/`overdue` cho huy
     *     hiệu — không cần "Việc hôm nay" hay "Mua thêm 7 ngày".
     *   - Trang Bảng điều khiển (`dashboard.tsx`) gọi VỚI `full=1` vì nó thật
     *     sự vẽ hai khối đó.
     * Không tách hẳn route: hai khối MỚI này đọc thêm `selections`,
     * `selection_addons`, `babies`, `packages`, `customers` — đo được thêm
     * ~2-4s mỗi lượt gọi (bb-dev, tests/e2e/bb-280-quan-tri.spec.ts đo bằng
     * đồng hồ thật). Route này chạy trên MỌI trang quản trị qua sidebar, nên
     * trả phần thừa cho lượt gọi không cần là làm chậm TOÀN BỘ khu quản trị,
     * không chỉ mỗi trang Bảng điều khiển.
     */
    const canDayDu = url.searchParams.get("full") === "1";

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
    /*
      BB-285 — "Chờ khách chọn" phải NÓI CÙNG MỘT SỰ THẬT với Lark.

      Trước đây đếm thẳng qua `v_gallery_progress` (view không có cột Lark).
      Số đo 27/09/2026: 183 bộ app còn `ready`/`in_review` mà Lark đã ≥ "Đã
      chọn hình", và 178/251 bộ ở Lark "Đã gửi file gốc" đã quá 60 ngày (đóng
      theo quy định, docs/21) — cả hai loại đều KHÔNG còn là "chờ khách chọn"
      thật, nhưng thẻ này vẫn cộng chúng vào.

      Không sửa `v_gallery_progress` (đổi view là đổi hợp đồng chung, cần
      migration — brief BB-285 cấm). Thay vào đó: đọc thẳng bảng `galleries`
      kèm `lark_trang_thai`/`lark_trang_thai_tu`, rồi lọc bằng ĐÚNG hai hàm
      dùng chung với màn khách (`laKhoaTheoLark`, `qua60NgayFileGoc` ở
      `trang-thai-hau-ky.ts`) — một công thức, không tính lại kiểu khác ở đây.

      Đổi từ `count: exact, head: true` sang tải cả dòng: quy mô hiện tại
      (~500 bộ) không đáng ngại; tải hết rồi lọc trong TypeScript rẻ hơn một
      hàm SQL mới (cũng là DDL, cũng bị cấm ở brief này).
    */
    let truyVanChoChon = admin
      .from("galleries")
      .select("id, lark_trang_thai, lark_trang_thai_tu")
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
      choChonRows,
      { count: dueSoon },
      { count: overdue },
      { count: waitingForRetouch },
      { count: deliveredThisMonth },
      { count: totalGalleries },
      { count: deliveredKyTruoc },
    ] = ketQua;

    // BB-285 — lọc bằng ĐÚNG công thức màn khách dùng: Lark ≥ "Đã chọn hình"
    // hoặc quá 60 ngày ở "Đã gửi file gốc" thì KHÔNG còn là "chờ khách chọn".
    const homNay = new Date();
    const waitingForSelection = (
      (choChonRows.data ?? []) as { lark_trang_thai: string | null; lark_trang_thai_tu: string | null }[]
    ).filter((g) => {
      if (laKhoaTheoLark(g.lark_trang_thai)) return false;
      if (qua60NgayFileGoc(g.lark_trang_thai, g.lark_trang_thai_tu ? new Date(g.lark_trang_thai_tu) : null, homNay)) {
        return false;
      }
      return true;
    }).length;

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
      .limit(20);
    truyVanCanXuLy = locBoAnhThat(truyVanCanXuLy);
    const { data: actionRequired, error: loiCanXuLy } = await truyVanCanXuLy;
    if (loiCanXuLy) throw new Error(`Bảng "Cần xử lý ngay" hỏng: ${loiCanXuLy.message}`);

    // BB-303 — mặc định RỖNG (khớp lượt gọi không mang `full=1`, xem chú
    // thích ở khai báo `canDayDu`); chỉ tính đủ khi `canDayDu`.
    type ViecHomNayRow = {
      id: unknown;
      title: unknown;
      customerName: unknown;
      branchName: unknown;
      status: unknown;
      dueAt: unknown;
      selectedCount: unknown;
      includedQuota: unknown;
      urgency: unknown;
      babyName: string | null;
      packageName: string | null;
      customerPhone: string | null;
      coverPhotoId: string | null;
      sentAt: string | null;
    };
    let viecHomNay: ViecHomNayRow[] = [];
    let muaThem7Ngay = {
      tongTien: 0,
      chenhLechPhanTram: null as number | null,
      soDon: 0,
      soGiaDinh: 0,
      theoNgay: [] as { ngay: string; tong: number }[],
      coCau: [] as ReturnType<typeof tinhCoCauMuaThem>,
      tu: null as string | null,
      den: null as string | null,
    };
    let theoChiNhanhMuaThem: ReturnType<typeof tinhTheoChiNhanhMuaThem> = [];

    if (canDayDu) {
    /**
     * BB-303 (bản vẽ BB-301, admin duyệt 28/09/2026) — "Việc hôm nay": CÙNG
     * DÒNG dữ liệu với `actionRequired` ở trên (v_gallery_progress không có
     * baby/package/cover), thêm bốn trường hiển thị (tên bé, tên gói/"loại
     * buổi", SĐT khách, ảnh bìa) bằng các truy vấn bổ sung trên chính
     * `galleries` — không sửa view (đổi hợp đồng chung cần migration, brief
     * BB-303 cấm).
     */
    const idsViecHomNay = (actionRequired ?? []).map((r) => String(r.id));
    const chiTietBoSung = new Map<
      string,
      { babyName: string | null; packageName: string | null; customerPhone: string | null; coverPhotoId: string | null; sentAt: string | null }
    >();
    if (idsViecHomNay.length > 0) {
      const { data: rows, error: loiBoSung } = await admin
        .from("galleries")
        .select("id, cover_photo_id, sent_at, customer_id, baby_id, package_id")
        .in("id", idsViecHomNay);
      if (loiBoSung) throw new Error(`Chi tiết "Việc hôm nay" hỏng: ${loiBoSung.message}`);

      const babyIds = [...new Set((rows ?? []).map((r) => r.baby_id).filter((v): v is string => !!v))];
      const packageIds = [...new Set((rows ?? []).map((r) => r.package_id).filter((v): v is string => !!v))];
      const customerIds = [...new Set((rows ?? []).map((r) => r.customer_id).filter((v): v is string => !!v))];

      const [babyRows, packageRows, customerRows] = await Promise.all([
        babyIds.length
          ? admin.from("babies").select("id, nickname, full_name").in("id", babyIds)
          : Promise.resolve({ data: [] as { id: string; nickname: string | null; full_name: string }[] }),
        packageIds.length
          ? admin.from("packages").select("id, name").in("id", packageIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        customerIds.length
          ? admin.from("customers").select("id, phone").in("id", customerIds)
          : Promise.resolve({ data: [] as { id: string; phone: string | null }[] }),
      ]);
      const tenBe = new Map((babyRows.data ?? []).map((b) => [String(b.id), b.nickname || b.full_name]));
      const tenGoi = new Map((packageRows.data ?? []).map((p) => [String(p.id), String(p.name)]));
      const sdt = new Map((customerRows.data ?? []).map((c) => [String(c.id), c.phone as string | null]));

      const anhBia = await anhBiaTheoBo(
        admin,
        (rows ?? []).map((r) => ({ id: String(r.id), coverPhotoId: (r.cover_photo_id as string | null) ?? null })),
      );

      for (const r of rows ?? []) {
        const id = String(r.id);
        chiTietBoSung.set(id, {
          babyName: r.baby_id ? tenBe.get(String(r.baby_id)) ?? null : null,
          packageName: r.package_id ? tenGoi.get(String(r.package_id)) ?? null : null,
          customerPhone: r.customer_id ? sdt.get(String(r.customer_id)) ?? null : null,
          coverPhotoId: anhBia.get(id) ?? null,
          sentAt: (r.sent_at as string | null) ?? null,
        });
      }
    }
    viecHomNay = (actionRequired ?? []).map((r) => {
      const bs = chiTietBoSung.get(String(r.id));
      return {
        id: r.id,
        title: r.title,
        customerName: r.customer_name,
        branchName: r.branch_name,
        status: r.status,
        dueAt: r.due_at,
        selectedCount: r.selected_count,
        includedQuota: r.included_quota,
        urgency: r.urgency,
        babyName: bs?.babyName ?? null,
        packageName: bs?.packageName ?? null,
        customerPhone: bs?.customerPhone ?? null,
        coverPhotoId: bs?.coverPhotoId ?? null,
        sentAt: bs?.sentAt ?? null,
      };
    });

    /**
     * BB-303 — "Mua thêm · 7 ngày qua" + "Theo chi nhánh": CÙNG ĐỊNH NGHĨA
     * "tiền mua thêm" với báo cáo "Doanh thu phát sinh"
     * (src/lib/bao-cao/cac-bao-cao/doanh-thu-phat-sinh.ts) — tổng
     * quantity*unit_price của `selection_addons` gắn với lượt CHỌN CHÍNH
     * (`is_primary`) đã CHỐT (`submitted_at` khớp kỳ). Tải 14 ngày gần nhất
     * (đủ cho kỳ 7 ngày này + kỳ 7 ngày trước để so sánh %), lọc chi
     * nhánh/Fixture/lưu trữ TRONG JS — giống cách báo cáo kia đã làm (tránh
     * lọc theo cột của bảng LỒNG NHAU qua PostgREST, xem ghi chú ở
     * items/route.ts về rủi ro cú pháp `!inner` lồng nhau).
     */
    const ky7NgayNay = nNgayGanDay(now, 7);
    const ky7NgayTruoc = kyTruocCungDoDai(ky7NgayNay);

    interface HangChotGanDay {
      selectionId: string;
      branchId: string;
      customerId: string;
      ngayVN: string;
      trongKyNay: boolean;
    }

    const { data: chotRaw, error: loiChot } = await admin
      .from("selections")
      .select("id, submitted_at, galleries!inner(id, branch_id, customer_id, title, status)")
      .eq("is_primary", true)
      .gte("submitted_at", ky7NgayTruoc.tu.toISOString())
      .lt("submitted_at", ky7NgayNay.den.toISOString());
    if (loiChot) throw new Error(`Truy vấn lượt chốt gần đây hỏng: ${loiChot.message}`);

    type RawChotRow = {
      id: string;
      submitted_at: string | null;
      galleries: { id: string; branch_id: string; customer_id: string; title: string; status: string } | { id: string; branch_id: string; customer_id: string; title: string; status: string }[] | null;
    };
    const branchIdSet = new Set(branchIds);
    const chotGanDay: HangChotGanDay[] = [];
    for (const raw of (chotRaw ?? []) as RawChotRow[]) {
      const g = Array.isArray(raw.galleries) ? raw.galleries[0] : raw.galleries;
      if (!g) continue;
      if (g.status === "archived") continue;
      if (g.title.toLowerCase().startsWith("fixture")) continue;
      if (!branchIdSet.has(g.branch_id)) continue;
      if (!raw.submitted_at) continue;
      chotGanDay.push({
        selectionId: raw.id,
        branchId: g.branch_id,
        customerId: g.customer_id,
        ngayVN: dinhDangNgayVN(new Date(raw.submitted_at)),
        trongKyNay: new Date(raw.submitted_at).getTime() >= ky7NgayNay.tu.getTime(),
      });
    }

    const selectionIdsGanDay = chotGanDay.map((c) => c.selectionId);
    const { data: addonRaw, error: loiAddon } = selectionIdsGanDay.length
      ? await admin
          .from("selection_addons")
          .select("selection_id, quantity, unit_price, products(kind, material)")
          .in("selection_id", selectionIdsGanDay)
      : { data: [] as unknown[], error: null };
    if (loiAddon) throw new Error(`Truy vấn mua thêm gần đây hỏng: ${loiAddon.message}`);

    type RawAddonRow = {
      selection_id: string;
      quantity: number;
      unit_price: number;
      products: { kind: string | null; material: string | null } | { kind: string | null; material: string | null }[] | null;
    };
    const chotById = new Map(chotGanDay.map((c) => [c.selectionId, c]));
    const tenChiNhanhMap = new Map(tenChiNhanh.map((b: { id: string; name: string }) => [b.id, b.name]));

    const dongMuaThemNay: DongMuaThem[] = [];
    const dongMuaThemTruoc: DongMuaThem[] = [];
    for (const raw of (addonRaw ?? []) as RawAddonRow[]) {
      const c = chotById.get(raw.selection_id);
      if (!c) continue;
      const sp = Array.isArray(raw.products) ? raw.products[0] : raw.products;
      const dong: DongMuaThem = {
        ngay: c.ngayVN,
        branchId: c.branchId,
        branchName: tenChiNhanhMap.get(c.branchId) ?? "—",
        selectionId: c.selectionId,
        customerId: c.customerId,
        kind: sp?.kind ?? null,
        material: sp?.material ?? null,
        quantity: raw.quantity,
        unitPrice: Number(raw.unit_price),
      };
      (c.trongKyNay ? dongMuaThemNay : dongMuaThemTruoc).push(dong);
    }

    const tongTienMuaThemNay = tinhTongTienMuaThem(dongMuaThemNay);
    const tongTienMuaThemTruoc = tinhTongTienMuaThem(dongMuaThemTruoc);
    const cacNgayTrongKy: string[] = [];
    for (let i = 0; i < 7; i++) cacNgayTrongKy.push(dinhDangNgayVN(ngayVN(ky7NgayNay.tu, i)));

    muaThem7Ngay = {
      tongTien: tongTienMuaThemNay,
      chenhLechPhanTram: chenhLechPhanTram(tongTienMuaThemNay, tongTienMuaThemTruoc),
      soDon: tinhSoDonMuaThem(dongMuaThemNay),
      soGiaDinh: tinhSoGiaDinhMuaThem(dongMuaThemNay),
      theoNgay: tinhTheoNgayMuaThem(dongMuaThemNay, cacNgayTrongKy),
      coCau: tinhCoCauMuaThem(dongMuaThemNay),
      tu: dinhDangNgayVN(ky7NgayNay.tu),
      // `ky7NgayNay.den` là NỬA ĐÊM ĐẦU ngày kế tiếp (nửa khoảng [tu, den)) —
      // lùi lại 1 ngày để hiện đúng NGÀY CUỐI cùng thuộc kỳ ("hôm nay").
      den: dinhDangNgayVN(ngayVN(ky7NgayNay.den, -1)),
    };
    theoChiNhanhMuaThem = tinhTheoChiNhanhMuaThem(dongMuaThemNay);
    } // if (canDayDu)

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
      // BB-303 (bản vẽ BB-301) — dữ liệu mới cho Bảng điều khiển:
      viecHomNay,
      muaThem7Ngay,
      theoChiNhanhMuaThem,
      chartData,
    });
  } catch (error: unknown) {
    console.error("Dashboard API error:", error);
    return failUnexpected(error, requestId);
  }
}
