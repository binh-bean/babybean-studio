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

import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { HINH_THUC_GIAM_GIA } from "@/lib/gallery/tien-phat-sinh";
import { layTienCanThuNhieuBo } from "@/lib/gallery/tien-can-thu-server";
import { layKhachGuiAnhChon } from "@/lib/gallery/khach-gui-anh-chon";
import { docNhaCuaCacBoKhongLoi } from "@/lib/gia-dinh/nha-cua-bo";

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

    // BB-351 (vòng 7, B mục 3) — MỘT khách chỉ là MỘT việc. Bộ đang nằm ở tab "Khách gửi ảnh
    // chọn" (chờ xác nhận danh sách / đợt mua thêm / nhờ chọn giúp / đặt chỉnh sửa) thì KHÔNG
    // hiện ở đây nữa: tab đó đã có đủ form thu tiền (cùng form BB-349) + xác nhận, nên CSKH xử
    // lý một chỗ. Xác nhận xong mà còn nợ thì bộ tự quay về tab này. Chọn cách lọc (thay vì
    // đếm "bộ khác nhau" ở huy hiệu) để số trên từng tab CỘNG LẠI đúng bằng huy hiệu menu.
    const pDangOKhachGui = layKhachGuiAnhChon(admin, branchIds).then((ds) => new Set(ds.map((d) => d.galleryId)));
    pDangOKhachGui.catch(() => {});

    // BB-333 — câu đếm "chưa biết hạn mức" không phụ thuộc gì vào danh sách
    // bên dưới: gửi đi NGAY, chạy song song với câu đọc view (trước đây nó đi
    // cuối cùng, sau năm câu khác). `.catch` rỗng chỉ để một lượt ném lỗi sớm
    // không để lại lời hứa mồ côi; lỗi thật vẫn được đọc ở chỗ `await` phía dưới.
    const pUnknown = Promise.resolve(
      admin.rpc("count_galleries_missing_quota", { p_branch_ids: branchIds }).single(),
    );
    pUnknown.catch(() => {});

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

    const dangOKhachGui = await pDangOKhachGui;
    const rowsTyped = ((rows ?? []) as unknown as Row[]).filter((r) => !dangOKhachGui.has(r.gallery_id));

    // BB-320 (Q-D2): CSKH phải biết GỌI AI để thu tiền — view chỉ có mã hợp đồng,
    // không có tên bé/khách. Tra thêm tên theo đúng các bộ ảnh vừa lấy (ba lượt
    // nhỏ theo id, không truy vấn nặng). Tra hỏng thì để trống — dòng vẫn hiện, chỉ thiếu tên.
    // BB-333 — ba lượt tra theo id bộ ảnh (tên khách/bé, tiền đã ghi có, số lúc
    // chốt) không phụ thuộc nhau: chạy SONG SONG thay vì nối đuôi. Nội dung mỗi
    // lượt giữ nguyên như trước.
    const idsBo = rowsTyped.map((r) => r.gallery_id);
    const [tenTheoBo, daThuTheoBo, tienTheoBo] = await Promise.all([
      // BB-320 (Q-D2): CSKH phải biết GỌI AI để thu tiền — view chỉ có mã hợp đồng,
      // không có tên bé/khách. Tra thêm tên theo đúng các bộ ảnh vừa lấy (ba lượt
      // nhỏ theo id, không truy vấn nặng). Tra hỏng thì để trống — dòng vẫn hiện, chỉ thiếu tên.
      (async () => {
        const tenTheoBo = new Map<string, { customerName: string | null; babyNickname: string | null; babyFullName: string | null; chatUrl: string | null }>();
        if (rowsTyped.length > 0) {
          const { data: boRows } = await admin
            .from("galleries")
            .select("id, customer_id, baby_id")
            .in("id", idsBo);
          const customerIds = [...new Set((boRows ?? []).map((b) => b.customer_id as string | null).filter((v): v is string => !!v))];
          const babyIds = [...new Set((boRows ?? []).map((b) => b.baby_id as string | null).filter((v): v is string => !!v))];
          const [{ data: khachRows }, { data: beRows }] = await Promise.all([
            customerIds.length > 0 ? admin.from("customers").select("id, full_name, facebook").in("id", customerIds) : Promise.resolve({ data: [] }),
            babyIds.length > 0 ? admin.from("babies").select("id, full_name, nickname").in("id", babyIds) : Promise.resolve({ data: [] }),
          ]);
          const khach = new Map((khachRows ?? []).map((k) => [String(k.id), String(k.full_name)]));
          // BB-331: link "Chat với khách" (Lark) — nút "Nhắn khách" trên dòng.
          const chat = new Map(
            (khachRows ?? []).map((k) => [String(k.id), linkChatKhach((k as { facebook?: unknown }).facebook)]),
          );
          const be = new Map(
            (beRows ?? []).map((b) => [String(b.id), { full: (b.full_name as string | null) ?? null, nick: (b.nickname as string | null) ?? null }]),
          );
          for (const b of boRows ?? []) {
            const beCuaBo = b.baby_id ? be.get(String(b.baby_id)) : undefined;
            tenTheoBo.set(String(b.id), {
              customerName: b.customer_id ? khach.get(String(b.customer_id)) ?? null : null,
              babyNickname: beCuaBo?.nick ?? null,
              babyFullName: beCuaBo?.full ?? null,
              chatUrl: b.customer_id ? chat.get(String(b.customer_id)) ?? null : null,
            });
          }
        }
        return tenTheoBo;
      })(),

      // BB-320: tiền ĐÃ GHI CÓ cho từng bộ (tiền thu + phần giảm giá) — báo cáo "chưa thu
      // tiền" phải trừ cả hai, nếu không bộ đã thu đủ vẫn nằm mãi trong danh sách đòi tiền.
      (async () => {
        const daThuTheoBo = new Map<string, { daThu: number; giamGia: number }>();
        if (rowsTyped.length > 0) {
          const { data: thuRows, error: thuErr } = await admin
            .from("gallery_payments")
            .select("gallery_id, amount, payment_method")
            .in("gallery_id", idsBo);
          if (thuErr) throw thuErr;
          for (const t of thuRows ?? []) {
            const cu = daThuTheoBo.get(String(t.gallery_id)) ?? { daThu: 0, giamGia: 0 };
            if (t.payment_method === HINH_THUC_GIAM_GIA) cu.giamGia += Number(t.amount);
            else cu.daThu += Number(t.amount);
            daThuTheoBo.set(String(t.gallery_id), cu);
          }
        }
        return daThuTheoBo;
      })(),

      // BB-351 — "còn phải thu" của từng bộ từ ĐÚNG hàm của màn chi tiết + route ghi thu
      // (`layTienCanThuNhieuBo`): phần vượt hạn mức (số lúc chốt mới nhất + hạn mức đã quy đổi,
      // BB-327/348) sau mọi khoản ghi có. Không còn công thức thứ hai trong báo cáo này.
      layTienCanThuNhieuBo(admin, idsBo),
    ]);

    const items = rowsTyped.map((r) => ({
      galleryId: r.gallery_id,
      customerName: tenTheoBo.get(r.gallery_id)?.customerName ?? null,
      babyNickname: tenTheoBo.get(r.gallery_id)?.babyNickname ?? null,
      babyFullName: tenTheoBo.get(r.gallery_id)?.babyFullName ?? null,
      chatUrl: tenTheoBo.get(r.gallery_id)?.chatUrl ?? null,
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
      // Số theo ảnh (view) trừ mọi khoản đã ghi có; giữ hai phần để màn hình nói rõ đã trừ gì.
      unbilledAmount: tienTheoBo.get(r.gallery_id)?.conThieuVuot ?? 0,
      daThu: daThuTheoBo.get(r.gallery_id)?.daThu ?? 0,
      giamGia: daThuTheoBo.get(r.gallery_id)?.giamGia ?? 0,
    }))
      // Thu đủ (hoặc giảm đủ) rồi thì không còn "chưa thu" — bỏ khỏi danh sách đòi tiền.
      .filter((i) => i.unbilledAmount > 0);

    // Đếm bộ ảnh CHƯA BIẾT hạn mức, cùng phạm vi chi nhánh.
    //
    // Không lấy từ v_over_quota_summary: view đó gộp trên MỌI chi nhánh mà
    // người gọi nhìn thấy, và khi đọc bằng khoá quản trị thì đó là tất cả. Một
    // con số tổng của toàn studio đặt cạnh danh sách của một chi nhánh là cách
    // chắc chắn để người đọc hiểu sai.
    // (Đã gửi từ đầu cùng câu đọc view — xem BB-333 ở trên.)
    const { data: unknownRows, error: unknownErr } = await pUnknown;

    if (unknownErr) throw unknownErr;

    const summary = {
      galleryCount: items.length,
      unbilledPhotoCount: items.reduce((n, i) => n + (i.unbilledCount ?? 0), 0),
      totalUnbilledAmount: items.reduce((n, i) => n + i.unbilledAmount, 0),
      missingQuotaCount: Number((unknownRows as { n: number } | null)?.n ?? 0),
    };

    // BB-394 — nhãn nhà (khách có ≥ 2 bộ); lỗi đọc thì bỏ nhãn, danh sách vẫn đủ.
    const nha = await docNhaCuaCacBoKhongLoi(admin, items.map((i) => i.galleryId));

    // BB-395 — bộ đã gán hoá đơn mà đối chiếu còn Thiếu / Thừa / chưa đủ điều kiện: hiện ở
    // CHÍNH tab này (không mở tab mới). Thừa không còn tiền nợ nên không nằm trong `items`.
    // Chưa áp 0102 (chưa có bảng) → danh sách rỗng, báo cáo vẫn chạy.
    const hoaDonCanXuLy: { galleryId: string; galleryTitle: string; maHoaDon: string; trangThai: string }[] = [];
    {
      const { data: hdRows, error: hdErr } = await admin
        .from("hoa_don_bo_anh")
        .select("gallery_id, ma_hoa_don, trang_thai, galleries!inner(title, branch_id)")
        .in("trang_thai", ["thua", "thieu", "hon_hop", "chua_du_dieu_kien"])
        .in("galleries.branch_id", branchIds)
        .limit(200);
      if (!hdErr) {
        for (const r of (hdRows ?? []) as unknown as { gallery_id: string; ma_hoa_don: string; trang_thai: string; galleries: { title: string } | null }[]) {
          hoaDonCanXuLy.push({ galleryId: r.gallery_id, galleryTitle: r.galleries?.title ?? "", maHoaDon: r.ma_hoa_don, trangThai: r.trang_thai });
        }
      }
    }
    return ok({ summary, items, nha, hoaDonCanXuLy });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}

function emptySummary() {
  return { galleryCount: 0, unbilledPhotoCount: 0, totalUnbilledAmount: 0, missingQuotaCount: 0 };
}
