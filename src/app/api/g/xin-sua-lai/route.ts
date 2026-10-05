/**
 * POST /api/g/xin-sua-lai — ba mẹ xin mở lại bộ ảnh đã khoá.
 *
 * OWNER: DEV-BE. Chủ studio 22/09/2026:
 *
 *     "Khách chọn ảnh xong nhấn chốt, lát sau muốn sửa lại thì cần có nút yêu
 *      cầu sửa lại. Nếu phía nhân sự chưa chốt [thì tự sửa được], hoặc nếu
 *      nhân sự đã chốt thì cần yêu cầu nhân sự mở lại để sửa, nếu còn đủ điều
 *      kiện sửa."
 *
 * ---------------------------------------------------------------------------
 * Đường này CHỈ dành cho lúc đã khoá
 * ---------------------------------------------------------------------------
 * Từ migration 0060, bộ ảnh chỉ khoá khi CSKH đã xác nhận và chuyển cho thợ
 * chỉnh ảnh. Trước mốc đó ba mẹ sửa thẳng được, không cần xin ai.
 *
 * Nên nếu bộ ảnh CHƯA khoá mà vẫn gọi đường này, ta trả về một câu nói rõ điều
 * đó thay vì gửi một yêu cầu vô nghĩa cho CSKH — họ sẽ mất công gọi lại để nói
 * "chị cứ sửa thoải mái".
 *
 * ---------------------------------------------------------------------------
 * Không tự mở, mà BÁO cho người quyết
 * ---------------------------------------------------------------------------
 * Lúc này công của thợ chỉnh ảnh đã đổ vào danh sách cũ. Mở lại là quyết định
 * có hậu quả, và người biết đủ để quyết là CSKH — họ nhìn được đã chỉnh tới
 * đâu, đã in chưa. App chỉ mang lời của ba mẹ tới đúng chỗ, kèm lý do.
 */

import { vi } from "@/i18n";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { khoaChonCuaKhach } from "@/lib/gallery/khoa-chon-khach";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { enqueueLarkNotification } from "@/lib/lark/notify";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";

export const runtime = "nodejs";

const MAX_LY_DO = 500;
/** BB-276: mỗi bộ ảnh tối đa chừng này lần xin sửa lại trong 1 giờ. */
const MAX_XIN_MOI_GIO = 3;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);

    // Cùng luật với nút Chốt: quyết định cuối là của người đứng tên hợp đồng.
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ ba mẹ đứng tên mới xin sửa lại được");
    }

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as { lyDo?: string; soDot?: unknown } | null;
    const lyDo = (body?.lyDo ?? "").trim();
    if (lyDo.length === 0) {
      return fail("INVALID_INPUT", vi.gallery.loiBean.ghiMuonSuaGi);
    }
    if (lyDo.length > MAX_LY_DO) {
      return fail("INVALID_INPUT", `Lời nhắn tối đa ${MAX_LY_DO} ký tự`);
    }

    // BB-321 — khách nói rõ muốn đổi ĐỢT nào (1 = ảnh trong gói, ≥ 2 = đợt mua
    // thêm). Tuỳ chọn: không gửi thì CSKH chọn đợt khi mở lại.
    const soDot =
      typeof body?.soDot === "number" && Number.isInteger(body.soDot) && body.soDot >= 1 && body.soDot <= 999
        ? body.soDot
        : null;

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, title, status, lark_trang_thai, lark_trang_thai_tu, reopened_at")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    // BB-338 — CÙNG luật khoá với màn khách (`/api/g/gallery` → `khoaChonTheoLark`):
    // trạng thái app + mã Lark còn hiệu lực + luật 60 ngày. Trước đây chỉ xét
    // `status`, nên bộ app còn `in_review`/`submitted` mà Lark đã "Đã chọn
    // hình" bị màn khách khoá (hiện nút "Yêu cầu sửa lại") nhưng route này lại
    // trả "vẫn đang mở" — ba mẹ kẹt giữa hai câu trái nhau.
    if (!khoaChonCuaKhach(gallery).khoa) {
      return fail(
        "INVALID_INPUT",
        "Bộ ảnh vẫn đang mở — ba mẹ sửa trực tiếp được, không cần xin ạ.",
      );
    }

    // BB-276: mỗi lần gửi là một tin vào nhóm Lark của chi nhánh. Không trần
    // thì một phiên bấm lặp (hoặc kịch bản) làm ngập nhóm CSKH. Đếm trên chính
    // nhật ký vừa ghi — không cần bảng mới.
    const { count: daGuiGanDay, error: demLoi } = await admin
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", gallery.id)
      .eq("action", "gallery.reopen_requested")
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if (demLoi) throw demLoi;
    if ((daGuiGanDay ?? 0) >= MAX_XIN_MOI_GIO) {
      return fail(
        "RATE_LIMITED",
        "Bean đã nhận yêu cầu của ba mẹ rồi ạ, Bean sẽ liên hệ lại sớm nhé ạ.",
      );
    }

    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khách",
      branchId: String(gallery.branch_id),
      action: "gallery.reopen_requested",
      entityType: "gallery",
      entityId: String(gallery.id),
      galleryId: String(gallery.id),
      metadata: { lyDo, trangThaiLucXin: gallery.status, ...(soDot !== null ? { soDot } : {}) },
    });

    // Báo vào nhóm Lark của chi nhánh. Không có nhóm thì dòng nhật ký ở trên
    // vẫn còn, và màn Nhật ký thao tác là chỗ CSKH đọc được.
    // BB-342: yêu cầu mở lại hiện ngay ở màn nhân viên.
    await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachXinMoLai });

    await enqueueLarkNotification({
      branchId: String(gallery.branch_id),
      event: "gallery.reopen_requested",
      payload: {
        galleryId: String(gallery.id),
        galleryTitle: String(gallery.title),
        trangThai: GALLERY_STATUS_LABEL[gallery.status] ?? gallery.status,
        lyDo: soDot !== null && soDot >= 2 ? `[Đợt ${soDot}] ${lyDo}` : lyDo,
      },
    });

    return ok({
      daGui: true,
      // Câu này hiện thẳng cho ba mẹ: nói rõ chuyện gì xảy ra tiếp theo, thay
      // vì một chữ "đã gửi" rồi im lặng.
      loiNhan: "Bean đã nhận yêu cầu và sẽ liên hệ lại với ba mẹ sớm nhất ạ.",
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
