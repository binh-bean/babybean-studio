/**
 * POST /api/admin/galleries/[id]/payments — CSKH ghi nhận đã thu tiền phát sinh.
 *
 * OWNER: PM. Task BB-123.
 * Spec: docs/16 mục 4 — việc số 6 trong danh sách "chỗ chưa có"
 *
 * Bảng `gallery_payments` có từ migration 0024 (BB-115) nhưng chưa route nào
 * ghi vào: CSKH thu tiền xong không có chỗ đánh dấu, nên câu hỏi "bộ này khách
 * trả chưa" chỉ trả lời được bằng cách hỏi nhau.
 *
 * ---------------------------------------------------------------------------
 * App CHỈ GHI NHẬN, không xử lý thanh toán
 * ---------------------------------------------------------------------------
 * Tiền thu ngoài app — chuyển khoản, tiền mặt, quẹt thẻ. Route này chỉ đánh
 * dấu là đã thu. Không nối cổng thanh toán, không tự động chuyển giai đoạn.
 *
 * ---------------------------------------------------------------------------
 * Ghi thêm dòng, KHÔNG sửa đè
 * ---------------------------------------------------------------------------
 * Bảng là append-only. Thu nhầm thì ghi một dòng âm kèm lý do, không sửa dòng
 * cũ. Sổ tiền mà sửa được thì không còn là sổ. Vì thế ở đây chỉ có POST —
 * không có PATCH, không có DELETE, kể cả khi số vừa ghi sai rõ ràng.
 *
 * ---------------------------------------------------------------------------
 * Số tiền gắn với con số khách đã NHÌN THẤY lúc chốt
 * ---------------------------------------------------------------------------
 * `snapshot_extra_amount` chép từ lúc khách bấm chốt, không tính lại theo
 * trạng thái hiện tại. CSKH đổi hạn mức sau đó thì con số phát sinh đổi theo,
 * nhưng khách đã trả theo số cũ — và biên nhận phải khớp cái khách nhìn thấy.
 *
 * ---------------------------------------------------------------------------
 * Giảm giá % (BB-320)
 * ---------------------------------------------------------------------------
 * Body có thể mang `discountPercent` (0 < % ≤ 100). Máy chủ TỰ TÍNH phần giảm
 * trên số CÒN THIẾU hiện tại (phải thu − đã ghi có) bằng `tinhGiamGia` — không
 * tin số tiền giảm do trình duyệt gửi lên. Phần giảm là MỘT DÒNG RIÊNG trong sổ
 * (`payment_method = 'giam_gia'`, số dương = ghi có cho khách), kèm người ghi và
 * lý do (bắt buộc), nên số còn thiếu về đúng 0 khi khách trả nốt phần sau giảm.
 * Dòng giảm giá KHÔNG phải tiền thu: báo cáo doanh thu loại nó ra khỏi "Đã thu",
 * nhưng vẫn cộng vào phần đã ghi có khi tính "Còn phải thu".
 * Dòng giảm và dòng thu (nếu có) ghi trong MỘT câu insert — hoặc cả hai, hoặc không.
 *
 * ---------------------------------------------------------------------------
 * Không chặn, chỉ báo
 * ---------------------------------------------------------------------------
 * Thu thiếu hay thu thừa đều ghi được; câu trả lời kèm số còn thiếu để màn
 * hình hiện ra. Chặn ở đây thì CSKH gặp trường hợp thật — khách trả trước một
 * nửa, khách trả dư rồi bù vào buổi sau — sẽ đi ghi tay ra ngoài, và sổ trong
 * app thành sổ rỗng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_METHODS, isPaymentMethod } from "@/lib/payment-methods";
import { HINH_THUC_GIAM_GIA, tinhGiamGia, CAU_CHUA_PHAT_SINH_TIEN } from "@/lib/gallery/tien-phat-sinh";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import { dongBoHanMucTheoThanhToan } from "@/lib/gallery/han-muc-thanh-toan";
import {
  CAU_KHACH_DANG_SUA,
  baoKhachSauThanhToan,
  chotThayKhachTheoDanhSachHienTai,
  layKhoaKhiThu,
  xacNhanDot1,
  xacNhanDotMuaThem,
} from "@/lib/gallery/xac-nhan-danh-sach";
import { layMotDot } from "@/lib/gallery/dot-chon-server";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;




const MAX_NOTE = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as {
      amount?: unknown;
      method?: unknown;
      note?: unknown;
      discountPercent?: unknown;
      khoaBoAnh?: unknown;
      chacChan?: unknown;
    } | null;

    // BB-320: có giảm giá khi `discountPercent` là số khác 0/rỗng.
    const coGiamGia =
      body?.discountPercent !== undefined && body.discountPercent !== null && body.discountPercent !== "" && Number(body.discountPercent) !== 0;
    const phanTramGiam = coGiamGia ? Number(body?.discountPercent) : 0;
    if (coGiamGia && !(Number.isFinite(phanTramGiam) && phanTramGiam > 0 && phanTramGiam <= 100)) {
      return fail("INVALID_INPUT", "Phần trăm giảm giá phải lớn hơn 0 và không quá 100");
    }

    // Có giảm giá thì được để trống số tiền thu (chỉ ghi phần giảm); không giảm thì như cũ.
    const amountTho = body?.amount === undefined || body.amount === null || body.amount === "" ? 0 : Number(body.amount);
    const amount = coGiamGia && amountTho === 0 ? 0 : amountTho;
    // Tiền là số nguyên đồng. Số lẻ nghĩa là ai đó nhập nhầm đơn vị, và một
    // dòng sổ sai đơn vị thì mọi báo cáo sau đó đều sai theo.
    if (!Number.isInteger(amount) || (amount === 0 && !coGiamGia)) {
      return fail("INVALID_INPUT", "Số tiền phải là số nguyên và khác 0");
    }
    if (Math.abs(amount) > 1_000_000_000) {
      return fail("INVALID_INPUT", "Số tiền vượt ngưỡng hợp lý, kiểm tra lại giúp");
    }

    const method = typeof body?.method === "string" ? body.method.trim() : "";
    if (amount !== 0 && !isPaymentMethod(method)) {
      const ten = PAYMENT_METHODS.map((m) => m.value).join(", ");
      return fail("INVALID_INPUT", `Hình thức thu phải là một trong: ${ten}`);
    }

    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_NOTE) {
      return fail("INVALID_INPUT", `Ghi chú tối đa ${MAX_NOTE} ký tự`);
    }
    // Dòng âm là dòng đính chính. Không có lý do thì sáu tháng sau không ai
    // biết vì sao sổ bị trừ.
    if (amount < 0 && note.length === 0) {
      return fail("INVALID_INPUT", "Dòng trừ tiền phải ghi lý do");
    }
    // Giảm giá cũng là một khoản làm giảm số phải thu — không lý do thì không ai biết vì sao.
    if (coGiamGia && note.length === 0) {
      return fail("INVALID_INPUT", "Giảm giá phải ghi lý do");
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // Con số khách đã nhìn thấy lúc bấm chốt. Lấy từ lượt chọn chính.
    const { data: selection } = await admin
      .from("selections")
      .select("id, snapshot_extra_amount")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle();

    // BB-344 — luật chủ studio "nếu không phát sinh thì khối không nhấn được": số CÒN PHẢI THU
    // (cùng hàm với màn chi tiết: vượt hạn mức + đợt mua thêm đã xác nhận − đã ghi có) bằng 0
    // thì không nhận dòng thu tiền hay giảm giá. Dòng TRỪ (đính chính ghi nhầm) vẫn được —
    // sổ append-only chỉ sửa sai bằng dòng âm, chặn nó là khoá luôn đường đính chính.
    const tienCanThu = await layTienCanThu(admin, galleryId);
    if (tienCanThu.tienCanThu <= 0 && (amount > 0 || coGiamGia)) {
      return fail("INVALID_INPUT", CAU_CHUA_PHAT_SINH_TIEN);
    }

    // BB-349 — thu tiền kèm "xác nhận danh sách và khoá bộ ảnh" (anh chốt 01/10/2026).
    // `khoaBoAnh`: CSKH tick ô "Đồng thời xác nhận…". `chacChan`: CSKH tick "Tôi chắc chắn
    // muốn xác nhận". Máy chủ tự kiểm, không tin giao diện:
    //   · khoá thì luôn phải có `chacChan`;
    //   · khách đang sửa lại (đã mở lại, chưa gửi lại) thì MỌI dòng thu/giảm phải có
    //     `chacChan` — số tiền có thể đổi khi khách gửi lại. Dòng trừ (đính chính) không chặn.
    const muonKhoa = body?.khoaBoAnh === true;
    const chacChan = body?.chacChan === true;
    const khoa = await layKhoaKhiThu(admin, galleryId);
    if (muonKhoa && !khoa.coTheKhoa) {
      return fail("INVALID_INPUT", "Bộ ảnh không có danh sách nào đang chờ xác nhận để khoá");
    }
    if ((muonKhoa || (khoa.dangMoLai && (amount > 0 || coGiamGia))) && !chacChan) {
      return fail(
        "INVALID_INPUT",
        khoa.dangMoLai
          ? `${CAU_KHACH_DANG_SUA} Tick "Tôi chắc chắn muốn xác nhận" để tiếp tục.`
          : 'Tick "Tôi chắc chắn muốn xác nhận" để tiếp tục.',
      );
    }

    // BB-320: số còn thiếu HIỆN TẠI (phải thu − mọi khoản đã ghi có) — nền để tính phần giảm.
    let soTienGiam = 0;
    if (coGiamGia) {
      const kq = tinhGiamGia(tienCanThu.tienCanThu, phanTramGiam);
      if (!kq) return fail("INVALID_INPUT", "Không còn khoản nào để giảm giá");
      if (kq.soTienGiam <= 0) {
        return fail("INVALID_INPUT", "Phần giảm quá nhỏ (dưới làm tròn nghìn đồng), tăng phần trăm giúp");
      }
      soTienGiam = kq.soTienGiam;
    }

    const dongGhi: Record<string, unknown>[] = [];
    const chung = {
      gallery_id: galleryId,
      selection_id: selection?.id ?? null,
      snapshot_extra_amount: selection?.snapshot_extra_amount ?? null,
      confirmed_by: staff.staffId,
    };
    if (coGiamGia) {
      dongGhi.push({
        ...chung,
        amount: soTienGiam,
        payment_method: HINH_THUC_GIAM_GIA,
        note: `Giảm ${phanTramGiam}% — ${note}`.slice(0, MAX_NOTE + 40),
      });
    }
    if (amount !== 0) {
      dongGhi.push({ ...chung, amount, payment_method: method, note: note.length > 0 ? note : null });
    }
    // MỘT câu insert cho cả dòng giảm và dòng thu: hoặc cả hai vào sổ, hoặc không dòng nào.
    const { data: dongDaGhi, error: insErr } = await admin.from("gallery_payments").insert(dongGhi).select("id");
    if (insErr) throw insErr;

    // BB-349 — khoá cùng lúc ghi thu, bằng ĐÚNG luồng xác nhận cũ (xac-nhan-danh-sach.ts).
    // Sổ đã ghi ở trên; khoá hỏng (vd người khác vừa xác nhận) thì vẫn trả 200 kèm lý do —
    // tiền đã vào sổ, không được báo "thất bại" cho một khoản đã ghi.
    let daKhoa = false;
    let loiKhoa: string | null = null;
    if (muonKhoa && khoa.soDot !== null) {
      if (khoa.soDot === 1) {
        // Khách đang sửa dở: chốt thay theo danh sách khách ĐANG chọn (lý do ở hàm).
        if (khoa.dangMoLai) await chotThayKhachTheoDanhSachHienTai(admin, { galleryId, staffLabel: "CSKH (xác nhận khi thu tiền)" });
        const kq = await xacNhanDot1(admin, { galleryId, branchId: gallery.branch_id, staff });
        daKhoa = kq.ok;
        if (!kq.ok) loiKhoa = kq.message;
      } else {
        const dot = await layMotDot(admin, galleryId, khoa.soDot);
        const kq = dot
          ? await xacNhanDotMuaThem(admin, { galleryId, branchId: gallery.branch_id, staff, dot })
          : ({ ok: false, message: `Không có đợt ${khoa.soDot}` } as const);
        daKhoa = kq.ok;
        if (!kq.ok) loiKhoa = kq.message;
      }
    }

    // BB-348 — trả đủ N ảnh vượt thì hạn mức tự tăng N (dòng "Edit file × N" nguồn thanh
    // toán); dòng đính chính âm thì hạn mức giảm về. Sổ tiền đã ghi xong ở trên: bước này
    // hỏng thì KHÔNG làm hỏng việc ghi thu — báo lỗi ra log, lần ghi sổ sau tự đồng bộ lại
    // (hàm tính theo MỤC TIÊU, không cộng dồn).
    const idDongSo = String((dongDaGhi ?? []).at(-1)?.id ?? "");
    let hanMuc: { truoc: number; sau: number; boQua?: string } | null = null;
    try {
      hanMuc = await dongBoHanMucTheoThanhToan(admin, {
        galleryId,
        paymentId: idDongSo,
        staffId: staff.staffId,
        branchId: gallery.branch_id,
      });
    } catch (e) {
      console.error(JSON.stringify({ evt: "han_muc_theo_thanh_toan.loi", requestId, loi: e instanceof Error ? e.message : String(e) }));
    }

    // Đọc lại tổng từ cơ sở dữ liệu chứ không cộng dồn trong bộ nhớ: hai người
    // cùng ghi một lúc thì bản cộng dồn ra số sai.
    const { data: paidRows } = await admin
      .from("gallery_payments")
      .select("amount")
      .eq("gallery_id", galleryId);

    const paid = (paidRows ?? []).reduce((t, r) => t + Number(r.amount), 0);
    const due = Number(selection?.snapshot_extra_amount ?? 0);

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "gallery.payment_recorded",
      entity_type: "gallery",
      entity_id: galleryId,
      // KHÔNG ghi ghi chú vào nhật ký: ghi chú hay có mã giao dịch ngân hàng.
      metadata: {
        amount,
        method: amount !== 0 ? method : null,
        paidAfter: paid,
        ...(coGiamGia ? { discountPercent: phanTramGiam, discountAmount: soTienGiam } : {}),
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    // BB-342: khách thấy số đã thanh toán ngay, không F5.
    await phatSuKienBoAnh({ galleryId, branchId: gallery.branch_id, loai: LOAI_TUC_THI.studioThanhToan });

    // BB-349: báo ba mẹ (chuông + đẩy) — chỉ khi thật sự có tiền/giảm giá vào, không báo dòng đính chính.
    const thongBao = amount > 0 || coGiamGia ? await baoKhachSauThanhToan(admin, galleryId, daKhoa) : null;

    return ok({
      paidAmount: paid,
      dueAmount: due,
      // BB-320: phần giảm giá vừa ghi (0 nếu lần này không giảm).
      discountAmount: soTienGiam,
      outstanding: due - paid,
      // BB-348: số ảnh hạn mức tăng (âm = giảm) do lần ghi sổ này; null = không đồng bộ được.
      quotaChange: hanMuc ? hanMuc.sau - hanMuc.truoc : null,
      quotaSkipped: hanMuc?.boQua ?? null,
      // BB-349
      daKhoa,
      loiKhoa,
      thongBao,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền ghi nhận thanh toán");
    return failUnexpected(err, requestId);
  }
}
