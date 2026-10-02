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

/**
 * BB-351 — chống ghi trùng (bấm đúp, mạng gửi lại). Hai lớp:
 *   1. `requestId` do form sinh, một mã cho mỗi lần ghi. Có cột `gallery_payments.ma_yeu_cau`
 *      (migration 0086, chỉ mục duy nhất) thì trùng mã = không ghi thêm. Chưa áp 0086 thì bỏ qua lớp này.
 *   2. Lưới đỡ CHỈ cho máy khách cũ (không gửi `requestId`) hoặc cơ sở dữ liệu chưa áp 0086: cùng
 *      người ghi, cùng bộ, cùng số tiền, cùng hình thức trong `CUA_SO_TRUNG_MS` = coi là bấm lặp.
 *      BB-363 (soát C vòng 11, d2): có `requestId` hợp lệ + cột 0086 thì `requestId` là khoá DUY
 *      NHẤT — hai phiếu khác nhau cùng số tiền, cùng người, trong 15 giây là HAI khoản thật, lưới
 *      đỡ cũ nuốt mất khoản sau trong im lặng.
 * Lần trùng trả 200 kèm `trung: true` và số tiền hiện tại — không báo lỗi cho một khoản đã vào sổ.
 */
const CUA_SO_TRUNG_MS = 15_000;
const MA_YEU_CAU_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Cột `ma_yeu_cau` chưa có (0086 chưa áp): PostgREST báo PGRST204 / Postgres 42703. */
function laLoiThieuCotMaYeuCau(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "PGRST204" || e.code === "42703" || /ma_yeu_cau/.test(e.message ?? "");
}

/** Số tiền trả về sau khi ghi (hoặc khi nhận ra lần gửi trùng) — MỘT công thức: `layTienCanThu`. */
async function soTienSauGhi(admin: ReturnType<typeof createAdminClient>, galleryId: string) {
  const t = await layTienCanThu(admin, galleryId);
  return {
    paidAmount: t.daGhiCo,
    // BB-351: "Phải thu" = tổng phải thu thật (vượt hạn mức qua mọi lần chốt + quy đổi + đợt mua
    // thêm), không còn là riêng `snapshot_extra_amount` của lượt chốt chính.
    dueAmount: t.tongPhaiThu,
    outstanding: t.conThieu,
    amountToCollect: t.tienCanThu,
    // BB-360 — phần sản phẩm thu qua Lark (không nằm trong các số trên).
    sanPhamQuaLark: t.tienSanPhamQuaLark,
  };
}

/**
 * GET — BB-351: số tiền + trạng thái khoá của MỘT bộ cho form thu tiền ở tab "Ảnh vượt hạn mức"
 * (nhẹ hơn nhiều so với GET /items). Cùng `layTienCanThu` + `layKhoaKhiThu` với màn chi tiết.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    const admin = createAdminClient();
    const { data: gallery } = await admin.from("galleries").select("id, branch_id").eq("id", galleryId).maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);
    const [tien, khoaKhiThu] = await Promise.all([soTienSauGhi(admin, galleryId), layKhoaKhiThu(admin, galleryId)]);
    return ok({ ...tien, khoaKhiThu });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem thanh toán");
    return failUnexpected(err, requestId);
  }
}

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
      requestId?: unknown;
    } | null;
    // BB-351 — khoá chống ghi trùng do form gửi (xem CUA_SO_TRUNG_MS).
    const maYeuCau =
      typeof body?.requestId === "string" && MA_YEU_CAU_RE.test(body.requestId) ? body.requestId : null;

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

    // BB-351 — lần gửi trùng: trả số hiện tại, không ghi thêm, không chạy lại khoá/thông báo.
    let coCotMaYeuCau = false;
    if (maYeuCau) {
      const { data: daCo, error: eMa } = await admin
        .from("gallery_payments")
        .select("id")
        .eq("gallery_id", galleryId)
        .eq("ma_yeu_cau", maYeuCau)
        .limit(1);
      if (!eMa) {
        coCotMaYeuCau = true;
        if ((daCo ?? []).length > 0) return ok({ ...(await soTienSauGhi(admin, galleryId)), discountAmount: 0, trung: true, daKhoa: false, loiKhoa: null, quotaChange: 0, quotaSkipped: null, thongBao: null });
      } else if (!laLoiThieuCotMaYeuCau(eMa)) {
        throw eMa;
      }
    }
    // BB-363: lưới đỡ 15 giây chỉ khi KHÔNG có khoá requestId dùng được (xem CUA_SO_TRUNG_MS).
    const dungRequestId = Boolean(maYeuCau) && coCotMaYeuCau;
    if (!dungRequestId && (amount !== 0 || coGiamGia)) {
      const tu = new Date(Date.now() - CUA_SO_TRUNG_MS).toISOString();
      const { data: ganDay, error: eGan } = await admin
        .from("gallery_payments")
        .select("amount, payment_method")
        .eq("gallery_id", galleryId)
        .eq("confirmed_by", staff.staffId)
        .gte("created_at", tu);
      if (eGan) throw eGan;
      const lap = (ganDay ?? []).some((r) =>
        amount !== 0
          ? Number(r.amount) === amount && r.payment_method === method
          : r.payment_method === HINH_THUC_GIAM_GIA,
      );
      if (lap) {
        return ok({ ...(await soTienSauGhi(admin, galleryId)), discountAmount: 0, trung: true, daKhoa: false, loiKhoa: null, quotaChange: 0, quotaSkipped: null, thongBao: null });
      }
    }

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

    // BB-363 (soát C vòng 11, P1-3 mặt kia; BB-348): tiền sản phẩm KHÔNG thu qua app (cờ tắt,
    // hoặc giỏ chốt trước mốc bật cờ) mà CSKH vẫn ghi vào sổ app thì sổ không phân biệt được với
    // tiền ảnh — nó trừ vào phần vượt hạn mức và kéo hạn mức tăng cho những ảnh khách CHƯA trả.
    // Chặn phần vượt: dòng thu (+ phần giảm) không được lớn hơn số còn phải thu, nên tổng ghi có
    // không bao giờ vượt tiền ảnh thật → hạn mức chỉ tăng đúng số ảnh đã trả. Dòng trừ (đính
    // chính) không chặn. Cờ bật và mọi giỏ đều thu qua app thì giữ luật cũ (thu dư ghi được).
    const sanPhamDeuQuaApp = tienCanThu.thuSanPhamQuaApp && tienCanThu.tienSanPhamQuaLark === 0;
    if (!sanPhamDeuQuaApp && amount > 0 && amount + soTienGiam > tienCanThu.tienCanThu) {
      return fail(
        "INVALID_INPUT",
        `Số thu lớn hơn phần còn phải thu (${Math.max(0, tienCanThu.tienCanThu - soTienGiam).toLocaleString("vi-VN")} ₫). ` +
          "Tiền sản phẩm mua thêm (ảnh in / khung / album) đang thu qua Lark — không ghi vào sổ này.",
      );
    }

    const dongGhi: Record<string, unknown>[] = [];
    const chung = {
      gallery_id: galleryId,
      selection_id: selection?.id ?? null,
      snapshot_extra_amount: selection?.snapshot_extra_amount ?? null,
      confirmed_by: staff.staffId,
      // BB-351 — chỉ một dòng mang mã (dòng tiền, hoặc dòng giảm khi không có dòng tiền): chỉ mục
      // duy nhất (gallery_id, ma_yeu_cau) của 0086 không cho dòng thứ hai cùng mã.
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
    if (coCotMaYeuCau && maYeuCau && dongGhi.length > 0) {
      // Mọi dòng cùng một câu insert cùng mang khoá (cột không unique một mình; chỉ mục là
      // (gallery_id, ma_yeu_cau, payment_method)) — xem 0086.
      for (const d of dongGhi) d.ma_yeu_cau = maYeuCau;
    }
    // MỘT câu insert cho cả dòng giảm và dòng thu: hoặc cả hai vào sổ, hoặc không dòng nào.
    const { data: dongDaGhi, error: insErr } = await admin.from("gallery_payments").insert(dongGhi).select("id");
    if (insErr && insErr.code === "23505" && coCotMaYeuCau) {
      // Hai lần bấm chạy song song, lần kia vừa ghi trước: không ghi thêm.
      return ok({ ...(await soTienSauGhi(admin, galleryId)), discountAmount: 0, trung: true, daKhoa: false, loiKhoa: null, quotaChange: 0, quotaSkipped: null, thongBao: null });
    }
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

    // Đọc lại từ cơ sở dữ liệu chứ không cộng dồn trong bộ nhớ: hai người cùng ghi một lúc
    // thì bản cộng dồn ra số sai. BB-351: cùng `layTienCanThu` với màn chi tiết + form gợi ý.
    const sauGhi = await soTienSauGhi(admin, galleryId);
    const paid = sauGhi.paidAmount;

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
      ...sauGhi,
      // BB-320: phần giảm giá vừa ghi (0 nếu lần này không giảm).
      discountAmount: soTienGiam,
      trung: false,
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
