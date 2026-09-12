/**
 * Bật hoặc tắt mã PIN cho một link chia sẻ.
 *
 * OWNER: SEC-ARCH. Task BB-098.
 * Spec: docs/16 mục 3, docs/12-security.md mục 3
 *
 *   POST   bật PIN  — sinh mã mới, trả về ĐÚNG MỘT LẦN
 *   DELETE tắt PIN
 *
 * ---------------------------------------------------------------------------
 * Mặc định là TẮT, chủ studio chốt ngày 12.09.2026
 * ---------------------------------------------------------------------------
 * Khách mở link là xem được ngay, không phải gõ gì. CSKH bật PIN cho những ca
 * nhạy cảm. share_links.requires_pin đã mặc định false từ trước, route này chỉ
 * thêm đường bật/tắt.
 *
 * ---------------------------------------------------------------------------
 * Mã sinh NGẪU NHIÊN, tuyệt đối không lấy từ số điện thoại
 * ---------------------------------------------------------------------------
 * Bốn số cuối điện thoại là thứ người quen đoán ra ngay. PIN kiểu đó bảo vệ
 * ảnh trẻ em trước người lạ nhặt được link, nhưng KHÔNG bảo vệ trước người
 * quen — mà người quen mới là rủi ro thật. Khách nước ngoài cũng không có số
 * Việt Nam để lấy.
 *
 * Dùng randomInt của node:crypto chứ không dùng Math.random: Math.random
 * không phải nguồn ngẫu nhiên an toàn, và với 10.000 khả năng thì đoán được
 * hạt giống là đoán được mã.
 *
 * ---------------------------------------------------------------------------
 * Trả mã về ĐÚNG MỘT LẦN
 * ---------------------------------------------------------------------------
 * Chỉ lưu bản băm. CSKH đọc mã cho khách ngay lúc bật; mất thì bật lại để sinh
 * mã mới. Lưu mã dạng đọc được nghĩa là bất cứ ai đọc được bảng cũng mở được
 * mọi bộ ảnh — đúng thứ PIN sinh ra để chặn.
 *
 * KHÔNG log mã, kể cả khi gỡ lỗi. Không log token đầy đủ, sáu ký tự đầu thôi.
 */

import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, requireBranch } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** CSKH trở lên. Thợ ảnh và CTV thời vụ không đụng vào quyền xem của khách. */
const PIN_ROLES = ["owner", "admin", "branch_manager", "cs"] as const;

/** Bốn chữ số, 0000 tới 9999 đều hợp lệ — cắt bớt là thu hẹp không gian mã. */
function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/** Lấy link chia sẻ kèm kiểm quyền chi nhánh. Trả về null nếu không được phép. */
async function loadLink(linkId: string) {
  const staff = await requireStaff();
  requireRole(staff, PIN_ROLES as unknown as Parameters<typeof requireRole>[1]);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("share_links")
    .select("id, gallery_id, token_prefix, galleries(branch_id)")
    .eq("id", linkId)
    .maybeSingle();

  if (error || !data) return null;

  const branchId = (data.galleries as unknown as { branch_id: string }[])?.[0]?.branch_id
    ?? (data.galleries as unknown as { branch_id: string })?.branch_id;
  requireBranch(staff, branchId);

  return { admin, link: data };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const reqId = randomUUID();
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã link không hợp lệ");

    const loaded = await loadLink(id);
    if (!loaded) return fail("NOT_FOUND", "Không tìm thấy link chia sẻ");

    const pin = generatePin();

    const { error } = await loaded.admin
      .from("share_links")
      .update({
        requires_pin: true,
        pin_hash: await bcrypt.hash(pin, 10),
        // Bật lại PIN phải xoá sạch bộ đếm cũ. Không xoá thì link vừa bật đã
        // mang sẵn bốn lần gõ sai từ đời trước, và khách gõ nhầm một lần là
        // khoá — trong khi họ còn chưa từng gõ mã này bao giờ.
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", id);

    if (error) throw error;

    // Mã đi thẳng cho CSKH đang đứng trước màn hình, không qua log nào.
    return ok({ pin, message: "Đọc mã này cho khách ngay. Hệ thống không hiện lại lần thứ hai." });
  } catch (err) {
    return failUnexpected(err, reqId);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const reqId = randomUUID();
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã link không hợp lệ");

    const loaded = await loadLink(id);
    if (!loaded) return fail("NOT_FOUND", "Không tìm thấy link chia sẻ");

    const { error } = await loaded.admin
      .from("share_links")
      .update({
        requires_pin: false,
        // Xoá luôn bản băm. Để lại thì tắt rồi bật lại sẽ dùng mã cũ mà CSKH
        // tưởng là mã mới.
        pin_hash: null,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", id);

    if (error) throw error;

    return ok({ requiresPin: false });
  } catch (err) {
    return failUnexpected(err, reqId);
  }
}
