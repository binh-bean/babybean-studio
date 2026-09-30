/**
 * POST /api/admin/galleries/[id]/nhac-khach — CSKH nhắc khách chọn ảnh.
 *
 * OWNER: DEV-BE. Task BB-327. Chủ studio 29/09/2026: bấm "Nhắc khách" mà khách
 * không nhận được gì — nút cũ chỉ chép một câu vào clipboard. Route này gửi
 * THẬT: một dòng vào chuông của khách + thông báo đẩy tới mọi máy khách đã
 * bật thông báo (`guiThongBaoBoAnh`), rồi trả về tin đã tới đâu để màn hình
 * hiện "Đã gửi nhắc lúc …".
 *
 * Không đi qua Lark (đó là kênh Studio→Studio, docs/21).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import {
  coTheNhac,
  GIAN_CACH_NHAC_GIAY,
  noiDungNhacKhach,
  noiDungNhacThanhToan,
  type LoaiNhacKhach,
} from "@/lib/gallery/nhac-khach-ngay";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // BB-331: body tuỳ chọn `{ loai: "thanh_toan" }` — nhắc khách thanh toán
    // phần ảnh vượt hạn mức (Việc cần xử lý). Không body = nhắc chọn ảnh như cũ.
    // Thân rỗng/hỏng → `ok: false` → giữ mặc định (BB-336: qua helper chung BB-223).
    let loai: LoaiNhacKhach = "chon_anh";
    const body = await readJsonBody<{ loai?: unknown } | null>(request);
    if (body.ok && body.data?.loai === "thanh_toan") loai = "thanh_toan";

    if (!coTheNhac(loai, String(gallery.status))) {
      const nhan = GALLERY_STATUS_LABEL[String(gallery.status)] ?? String(gallery.status);
      // BB-331: câu cũ ("Bộ ảnh đang ở … — không còn chờ khách chọn nên không
      // nhắc") dài, tràn khỏi dòng Việc hôm nay. Ngắn lại, đủ ý.
      return fail("CONFLICT", `Không nhắc: bộ ảnh đang “${nhan}”`);
    }

    // Chặn bấm đúp: lần nhắc gần nhất còn trong khoảng giãn cách thì không gửi lại.
    const { data: ganNhat } = await admin
      .from("activity_logs")
      .select("created_at")
      .eq("entity_type", "gallery")
      .eq("entity_id", galleryId)
      .eq("action", "gallery.nhac_khach")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ganNhat?.created_at) {
      const giay = (Date.now() - new Date(String(ganNhat.created_at)).getTime()) / 1000;
      if (giay < GIAN_CACH_NHAC_GIAY) {
        return fail("CONFLICT", "Vừa gửi nhắc xong — đợi một phút rồi hãy nhắc lại");
      }
    }

    const kq = await guiThongBaoBoAnh(
      admin,
      galleryId,
      loai === "thanh_toan" ? noiDungNhacThanhToan() : noiDungNhacKhach(),
    );
    if (!kq.daVaoChuong && kq.soMayNhanDay === 0) {
      return fail("INTERNAL", "Chưa gửi được lời nhắc, thử lại giúp");
    }

    const luc = new Date().toISOString();
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(gallery.branch_id),
      action: "gallery.nhac_khach",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { daVaoChuong: kq.daVaoChuong, soMayNhanDay: kq.soMayNhanDay, loai },
    });

    return ok({ luc, daVaoChuong: kq.daVaoChuong, soMayNhanDay: kq.soMayNhanDay });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
