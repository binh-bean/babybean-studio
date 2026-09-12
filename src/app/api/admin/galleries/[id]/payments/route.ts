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
 * Không chặn, chỉ báo
 * ---------------------------------------------------------------------------
 * Thu thiếu hay thu thừa đều ghi được; câu trả lời kèm số còn thiếu để màn
 * hình hiện ra. Chặn ở đây thì CSKH gặp trường hợp thật — khách trả trước một
 * nửa, khách trả dư rồi bù vào buổi sau — sẽ đi ghi tay ra ngoài, và sổ trong
 * app thành sổ rỗng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_METHODS, isPaymentMethod } from "@/lib/payment-methods";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Trùng với `app.can_manage_customers()` trong chính sách RLS của 0024. */
const PAYMENT_ROLES = ["owner", "admin", "branch_manager", "cs"] as const;



const MAX_NOTE = 500;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requireRole(staff, PAYMENT_ROLES as unknown as Parameters<typeof requireRole>[1]);

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const body = (await request.json().catch(() => null)) as {
      amount?: unknown;
      method?: unknown;
      note?: unknown;
    } | null;

    const amount = Number(body?.amount);
    // Tiền là số nguyên đồng. Số lẻ nghĩa là ai đó nhập nhầm đơn vị, và một
    // dòng sổ sai đơn vị thì mọi báo cáo sau đó đều sai theo.
    if (!Number.isInteger(amount) || amount === 0) {
      return fail("INVALID_INPUT", "Số tiền phải là số nguyên và khác 0");
    }
    if (Math.abs(amount) > 1_000_000_000) {
      return fail("INVALID_INPUT", "Số tiền vượt ngưỡng hợp lý, kiểm tra lại giúp");
    }

    const method = typeof body?.method === "string" ? body.method.trim() : "";
    if (!isPaymentMethod(method)) {
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

    const { error: insErr } = await admin.from("gallery_payments").insert({
      gallery_id: galleryId,
      selection_id: selection?.id ?? null,
      amount,
      snapshot_extra_amount: selection?.snapshot_extra_amount ?? null,
      payment_method: method,
      confirmed_by: staff.staffId,
      note: note.length > 0 ? note : null,
    });
    if (insErr) throw insErr;

    // Đọc lại tổng từ cơ sở dữ liệu chứ không cộng dồn trong bộ nhớ: hai người
    // cùng ghi một lúc thì bản cộng dồn ra số sai.
    const { data: paidRows } = await admin
      .from("gallery_payments")
      .select("amount")
      .eq("gallery_id", galleryId);

    const paid = (paidRows ?? []).reduce((t, r) => t + Number(r.amount), 0);
    const due = Number(selection?.snapshot_extra_amount ?? 0);

    await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "gallery.payment_recorded",
      entity_type: "gallery",
      entity_id: galleryId,
      // KHÔNG ghi ghi chú vào nhật ký: ghi chú hay có mã giao dịch ngân hàng.
      metadata: { amount, method, paidAfter: paid },
    });

    return ok({
      paidAmount: paid,
      dueAmount: due,
      outstanding: due - paid,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền ghi nhận thanh toán");
    return failUnexpected(err, requestId);
  }
}
