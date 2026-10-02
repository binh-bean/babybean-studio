/**
 * POST /api/admin/galleries/[id]/reopen — mở lại cho khách chọn tiếp.
 *
 * BB-321 — ba thay đổi so với bản BB-122:
 *   1. Mở lại được cả ở `in_retouch` (trước đây chỉ `expired`/`submitted`, nên
 *      khi khách xin mở lại lúc đã sang hậu kỳ, CSKH chỉ có nút "Từ chối" — lỗi
 *      chủ studio báo 29/09/2026). Danh sách trạng thái nằm MỘT chỗ:
 *      `laTrangThaiMoLaiDuoc` (src/lib/gallery/dot-chon.ts), banner/form/menu
 *      quản trị dùng chung với route này.
 *   2. Nhận thêm `dot` (số đợt cần mở): đợt 1 = luồng cũ; đợt ≥ 2 = trả ảnh của
 *      đợt mua thêm đó về cho khách chọn lại, KHÔNG đụng trạng thái bộ ảnh (hậu
 *      kỳ của đợt 1 vẫn chạy). Không truyền thì lấy đợt khoá gần nhất.
 *   3. `delivered` KHÔNG mở lại: khách muốn thêm thì mua đợt mới.
 *
 * OWNER: PM. Task BB-122.
 * Spec: docs/16 mục 4b
 *
 * ---------------------------------------------------------------------------
 * Vì sao route này phải có
 * ---------------------------------------------------------------------------
 * Migration 0035 khoá bộ ảnh 'expired' khỏi việc đổi lựa chọn — đúng, nhưng
 * trước đó cái lỗ hổng ấy chính là đường thoát duy nhất: khách hết hạn vẫn bấm
 * tim được. Khoá mà không mở đường chính thức thì bộ ảnh quá hạn thành ngõ
 * cụt, và CSKH phải nhờ người sửa thẳng cơ sở dữ liệu.
 *
 * Hai cột `reopened_at` và `reopen_reason` có sẵn trong schema từ đầu mà chưa
 * ai ghi. Route này ghi chúng.
 *
 * ---------------------------------------------------------------------------
 * Mở lại được từ ba trạng thái (BB-321)
 * ---------------------------------------------------------------------------
 * 'expired' (hết hạn), 'submitted' (khách chốt nhưng CSKH chưa xác nhận) và
 * 'in_retouch'. Ở 'in_retouch' người chỉnh ảnh có thể đã làm theo danh sách cũ —
 * mở ra thì công đã bỏ vào những ảnh khách vừa bỏ chọn — nên MÀN HÌNH phải hiện
 * cảnh báo trước khi bấm; nhưng chặn hẳn là làm hỏng doanh thu: khách xin mở lại
 * mà CSKH không có nút nào để mở (lỗi chủ studio báo 29/09/2026). Từ
 * 'awaiting_approval' trở đi (đã chỉnh xong) không mở lại chọn ảnh: đi đường
 * yêu cầu sửa ảnh đã chỉnh, hoặc mua đợt mới.
 *
 * ---------------------------------------------------------------------------
 * Bắt buộc ghi lý do
 * ---------------------------------------------------------------------------
 * Mở lại là đảo ngược một quyết định của khách. Sáu tháng sau, câu hỏi "sao bộ
 * này mở lại" chỉ trả lời được nếu lúc đó có người viết vào.
 */

import { vi } from "@/i18n";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { soNgayHanChot, hanChotTuHomNay } from "@/lib/gallery/han-chot";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { luaChonMoLai } from "@/lib/gallery/dot-chon";
import { layCacDot, traDotVeChoKhach } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const MAX_REASON = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Quyền RIÊNG, không phải galleries:write: bản cũ kiểm write nên mọi vai
    // sửa được album đều mở lại được, dù không ai cấp galleries:reopen cho họ
    // (0066). CSKH có quyền này theo quyết định của chủ studio 25/09/2026.
    requirePermission(staff, "galleries:reopen");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { reason?: string; dot?: unknown } | null;
    const reason = (body?.reason ?? "").trim();
    if (reason.length === 0) {
      return fail("INVALID_INPUT", "Ghi giúp lý do mở lại, để sau này còn tra được");
    }
    if (reason.length > MAX_REASON) {
      return fail("INVALID_INPUT", `Lý do tối đa ${MAX_REASON} ký tự`);
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status, due_at")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const cacDot = await layCacDot(admin, galleryId);
    const lua = luaChonMoLai(gallery.status, cacDot);
    if (!lua.duoc) return fail("INVALID_INPUT", lua.lyDoKhong ?? "Bộ ảnh này chưa mở lại được");

    const dotYeuCau =
      body?.dot === undefined || body?.dot === null ? lua.dotMacDinh : Number(body.dot);
    if (!Number.isInteger(dotYeuCau) || !lua.cacDot.some((d) => d.soDot === dotYeuCau)) {
      return fail("INVALID_INPUT", "Đợt cần mở lại không hợp lệ hoặc chưa được chốt");
    }

    // Đợt mua thêm (≥ 2): trả ảnh của đúng đợt đó về cho khách, giữ nguyên bộ ảnh.
    if (dotYeuCau >= 2) {
      const dot = cacDot.find((d) => d.soDot === dotYeuCau)!;
      await traDotVeChoKhach(admin, dot, {
        trangThai: "da_mo_lai",
        lyDo: reason,
        nhanVienId: staff.staffId,
      });
      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        branchId: gallery.branch_id,
        // CÙNG tên hành động với mở lại đợt 1: `layTrangThaiXinMoLai` (BB-312) coi
        // "yêu cầu xin mở lại" là ĐÃ XỬ LÝ khi thấy đúng dòng `gallery.reopen`.
        // Đặt tên riêng thì banner vẫn báo "đang chờ" sau khi CSKH đã mở đợt.
        action: "gallery.reopen",
        entityType: "gallery",
        entityId: galleryId,
        galleryId,
        metadata: { soDot: dotYeuCau, tuTrangThai: gallery.status, lyDo: reason },
      });
      await guiThongBaoBoAnh(admin, galleryId, {
        tieuDe: vi.gallery.loiBean.tbMoLaiDot.replace("{n}", String(dotYeuCau)),
        noiDung: vi.gallery.loiBean.tbMoLaiDotNoiDung,
        loai: "reopen_da_mo",
      });
      return ok({ status: gallery.status, soDot: dotYeuCau, reopenedAt: new Date().toISOString() });
    }

    const now = new Date().toISOString();

    /**
     * MỞ LẠI THÌ PHẢI DỜI HẠN, nếu không lượt cron hôm sau tự huỷ việc này.
     *
     * `expire_overdue_galleries()` quét đúng trạng thái 'in_review' với
     * `due_at < now()` rồi đẩy về 'expired'. Mở một bộ đã quá hạn mà để nguyên
     * `due_at` cũ nghĩa là: CSKH bấm Mở lại, báo khách "chị chọn tiếp giúp em",
     * rồi **18 giờ hôm đó bộ ảnh tự đóng lại**. Không ai được báo, và triệu
     * chứng chỉ hiện ra khi khách mở link ngày hôm sau.
     *
     * Hôm nay chưa ai vấp vì `due_at` rỗng ở mọi bộ ảnh — cùng gốc với việc
     * không đường nào ghi `sent_at` (xem `src/lib/gallery/han-chot.ts`). Sửa
     * chỗ ghi mốc mà không sửa chỗ này là tự dựng ra cái bẫy đó.
     *
     * Mở lại là đường CÓ CHỦ Ý và có ghi lý do, nên nó dời hạn kể cả khi
     * `due_at` còn hiệu lực: đó chính là điều CSKH muốn khi bấm nút.
     */
    const hanMoi = hanChotTuHomNay(await soNgayHanChot(admin, gallery.branch_id));

    const { error } = await admin
      .from("galleries")
      .update({
        status: "in_review",
        reopened_at: now,
        reopen_reason: reason,
        due_at: hanMoi,
        updated_at: now,
      })
      .eq("id", galleryId);
    if (error) throw error;

    /*
      BB-052. Chính ghi chú đầu tệp này nói: "Sáu tháng sau, câu hỏi 'sao bộ
      này mở lại' chỉ trả lời được nếu lúc đó có người viết vào" — nhưng lý do
      chỉ được ghi vào `galleries.reopen_reason`, mà cột đó bị lần mở lại SAU
      ghi đè. Nhật ký giữ được cả chuỗi.
    */
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.reopen",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { tuTrangThai: gallery.status, lyDo: reason, hanMoi, soDot: 1 },
    });

    // BB-312: báo khách qua chuông + đẩy — KHÔNG qua Lark (đó là kênh
    // Studio→Studio, xem docs/21). Không bao giờ ném (guiThongBaoBoAnh tự
    // nuốt lỗi), nên không cần try/catch riêng ở đây.
    await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: vi.gallery.loiBean.tbMoLaiBo,
      noiDung: vi.gallery.loiBean.tbMoLaiBoNoiDung,
      loai: "reopen_da_mo",
    });

    return ok({ status: "in_review", soDot: 1, reopenedAt: now, dueAt: hanMoi });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền mở lại bộ ảnh");
    return failUnexpected(err, requestId);
  }
}
