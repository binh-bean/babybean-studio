/**
 * POST /api/admin/galleries/[id]/delivered — CSKH đánh dấu đã giao ảnh in cho khách.
 *
 * OWNER: DEV-BE. Task BB-311 (P1).
 * Spec: docs/16-quy-trinh-dau-cuoi.md §~203 (vòng đời) và §~335 (sáu bước khách nhìn thấy).
 *
 * ---------------------------------------------------------------------------
 * Vì sao route này phải có
 * ---------------------------------------------------------------------------
 * Người đánh giá vận hành độc lập phát hiện: sau khi khách duyệt ảnh
 * (`approved`), KHÔNG có nơi nào trong mã nguồn từng đặt `status = 'delivered'`
 * — chỉ có phép thử tự đặt bằng SQL trực tiếp. Trang chi tiết bộ ảnh không còn
 * nút hành động nào sau `approved`, nên CSKH không có cách nào đánh dấu "đã
 * giao ảnh cho khách" bằng thao tác thật, và mốc "Đã giao tháng này" không bao
 * giờ đạt được.
 *
 * ---------------------------------------------------------------------------
 * Vì sao là nút THỦ CÔNG, không đọc theo Lark
 * ---------------------------------------------------------------------------
 * ADR-0004 chốt: `galleries.status` CỐ TÌNH không ánh xạ theo Lark (Lark có cột
 * "Đã Giao" riêng, nhưng App không đọc cột đó để tự đổi status) — App tự làm
 * chủ hoàn toàn `galleries.status` theo hành vi thao tác thật trong app. Đây
 * không phải trường hợp "Lark đã đặt trạng thái rồi", nên phải có một đường đi
 * THỦ CÔNG như route này.
 *
 * ---------------------------------------------------------------------------
 * "delivered" là một bước VẬT LÝ
 * ---------------------------------------------------------------------------
 * "delivered" nghĩa là ảnh IN đã giao tận tay khách — sau khi đã đi in, không
 * phải một bước số hoá. Route chỉ ghi lại việc đó đã xảy ra, không tự suy luận
 * từ trạng thái nào khác.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";

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
    // `deliveries:write` — "Cập nhật tiến độ giao ảnh" (đã có hiệu lực, xem
    // src/lib/auth/danh-muc-quyen.ts). Không dùng `galleries:write`: đó là
    // quyền sửa CẤU HÌNH album, không phải quyền cập nhật tiến độ giao hàng.
    requirePermission(staff, "deliveries:write");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as
      | { receivedBy?: string; note?: string }
      | null;
    const receivedBy = (body?.receivedBy ?? "").trim();
    const note = (body?.note ?? "").trim();
    if (note.length > MAX_NOTE) {
      return fail("INVALID_INPUT", `Ghi chú tối đa ${MAX_NOTE} ký tự`);
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // Chỉ đi từ 'approved'. "delivered" là bước VẬT LÝ sau khi đã đi in —
    // đánh dấu từ trạng thái khác nghĩa là ai đó nhầm bộ ảnh, hoặc đánh dấu
    // trước khi khách thực sự đã duyệt.
    if (gallery.status !== "approved") {
      return fail(
        "INVALID_INPUT",
        `Bộ ảnh đang ở "${gallery.status}", chỉ đánh dấu đã giao được khi khách đã duyệt (approved).`,
      );
    }

    const now = new Date().toISOString();

    // Cùng khuôn với retouch-done: bảng deliveries có sẵn một dòng theo
    // gallery_id (tạo từ bước CSKH chuyển file), cập nhật thay vì tạo trùng.
    const { data: existing } = await admin
      .from("deliveries")
      .select("id")
      .eq("gallery_id", galleryId)
      .maybeSingle();

    const deliveryFields = {
      status: "delivered" as const,
      delivered_at: now,
      received_by: receivedBy || null,
      note: note || null,
      updated_at: now,
    };

    if (existing) {
      const { error: delUpdErr } = await admin
        .from("deliveries")
        .update(deliveryFields)
        .eq("id", existing.id);
      if (delUpdErr) throw delUpdErr;
    } else {
      const { error: delInsErr } = await admin.from("deliveries").insert({
        gallery_id: galleryId,
        branch_id: gallery.branch_id,
        ...deliveryFields,
      });
      if (delInsErr) throw delInsErr;
    }

    const { error } = await admin
      .from("galleries")
      .update({ status: "delivered", updated_at: now })
      .eq("id", galleryId);
    if (error) throw error;

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.delivered",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { tuTrangThai: "approved", coNguoiNhan: Boolean(receivedBy) },
    });

    // Cùng luật với retouch-done (BB-246): báo khách SAU khi ghi DB xong, và
    // hàm này tự không bao giờ ném. `guiThongBaoBoAnh` chỉ gửi Web Push + ghi
    // hộp thư trong app — KHÔNG đụng Lark (xem src/lib/thong-bao/gui-day.ts),
    // nên không cần đi qua chốt `khongGuiRaLarkThat()` ở đây, giống hệt cách
    // retouch-done gọi cùng hàm này.
    await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: "Ảnh của bé đã được giao",
      noiDung: "Ảnh in đã giao tận tay gia đình. Cảm ơn ba mẹ đã tin tưởng BabyBean Studio.",
      loai: "anh_da_giao",
    });

    return ok({ status: "delivered", deliveredAt: now });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền đánh dấu đã giao ảnh");
    return failUnexpected(err, requestId);
  }
}
