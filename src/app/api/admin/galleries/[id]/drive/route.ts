/**
 * PATCH /api/admin/galleries/[id]/drive — đổi THƯ MỤC ẢNH GỐC của một bộ ảnh.
 *
 * OWNER: DEV-BE. Task BB-149.
 * Spec: docs/briefs/BB-149-sua-link-thu-muc-goc.md, docs/06-drive-integration.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao đường này tồn tại
 * ---------------------------------------------------------------------------
 * Trước BB-149, thư mục ảnh gốc chỉ đặt được ở hai chỗ: wizard tạo bộ ảnh mới,
 * và lệnh đồng bộ từ Lark. Sau đó KHÔNG có đường nào sửa. Ngày 15.09.2026 bb-dev
 * có 77 bộ ở `sync_error` — nếu nguyên nhân là link sai thì nhân viên chỉ bấm
 * được "đồng bộ lại" đúng cái link sai đó, mãi mãi.
 *
 * Đường này CHỈ đổi link. Kéo ảnh về là việc của POST .../sync, màn hình gọi
 * tiếp — tách ra vì đổi link là việc tức thì, còn kéo vài trăm ảnh thì lâu hơn
 * thời gian chờ của trình duyệt.
 *
 * ---------------------------------------------------------------------------
 * Vì sao chặn khi khách đã chốt
 * ---------------------------------------------------------------------------
 * Khách chốt xong nghĩa là danh sách ảnh họ chọn đã trỏ vào những tấm ảnh CỤ
 * THỂ trong thư mục cũ. Đổi nguồn lúc đó là làm lựa chọn của họ trỏ vào hư
 * không, mà không ai thấy gì báo. Cần đổi thật thì mở lại bộ ảnh trước
 * (`/reopen`), tức là có người chịu trách nhiệm cho việc đó.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";

export const runtime = "nodejs";

/**
 * Gỡ lớp vỏ Facebook bọc quanh địa chỉ.
 *
 * Nhân viên hay sao link từ Lark hoặc từ tin nhắn, mà Facebook bọc mọi địa chỉ
 * thành l.facebook.com/l.php?u=<địa chỉ đã mã hoá>. parseDriveFolderId từ chối
 * vì tên miền không phải google.com — đúng luật của nó, nên gỡ vỏ ở đây thay vì
 * sửa tệp của DEV-INT.
 */
function boVoFacebook(dia: string): string {
  try {
    const u = new URL(dia.trim());
    if (/(^|.)facebook.com$/.test(u.hostname)) {
      const trong = u.searchParams.get("u");
      if (trong) return decodeURIComponent(trong);
    }
  } catch {
    // Không phải địa chỉ hợp lệ thì để parseDriveFolderId báo lỗi, đừng đoán.
  }
  return dia;
}

const Body = z.object({
  driveUrl: z.string().trim().min(1).max(2000),
});

/** Trạng thái mà đổi nguồn ảnh là phá thứ khách đã làm xong. */
const DA_CHOT = ["submitted", "in_retouch", "awaiting_approval", "delivered"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { id: galleryId } = await context.params;

    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Thiếu địa chỉ thư mục Drive.");
    }

    const staff = await requireStaff();
    // Cùng bộ vai với đường đồng bộ: ai bấm đồng bộ lại được thì cũng phải sửa
    // được link, nếu không nhân viên gặp link sai lại không có đường đi tiếp.
    // Kế toán, thợ chỉnh ảnh và cộng tác viên photoshop KHÔNG đổi nguồn ảnh của
    // khách.
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);

    const admin = await createAdminClient();

    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, status, title, drive_folder_id, drive_folder_url")
      .eq("id", galleryId)
      .maybeSingle();

    if (gErr) return failUnexpected(gErr, requestId);
    if (!gallery) return fail("NOT_FOUND", "Không có bộ ảnh nào mang mã này.");

    requireBranch(staff, gallery.branch_id);

    if (DA_CHOT.includes(gallery.status)) {
      return fail(
        "CONFLICT",
        "Bộ ảnh này khách đã chốt. Đổi thư mục ảnh lúc này làm những ảnh khách " +
          "đã chọn trỏ vào hư không. Mở lại bộ ảnh trước rồi hãy đổi.",
      );
    }

    let folderId: string;
    try {
      folderId = parseDriveFolderId(boVoFacebook(parsed.data.driveUrl));
    } catch (err) {
      if (err instanceof InvalidDriveLinkError) {
        return fail(
          "INVALID_INPUT",
          "Không đọc được mã thư mục từ địa chỉ này. Mở thư mục ảnh trên Google " +
            "Drive rồi sao nguyên địa chỉ trên thanh trình duyệt.",
        );
      }
      return failUnexpected(err, requestId);
    }

    // Mã thư mục trùng bộ khác thì chặn TẠI ĐÂY, kèm mã hợp đồng của bộ kia.
    // uq_galleries_drive_folder cũng chặn, nhưng nhân viên đọc lỗi khoá trùng
    // của Postgres thì không hiểu phải làm gì.
    const { data: trung } = await admin
      .from("galleries")
      .select("id, title")
      .eq("drive_folder_id", folderId)
      .neq("id", galleryId)
      .neq("status", "archived")
      .maybeSingle();

    if (trung) {
      return fail(
        "CONFLICT",
        `Thư mục này đang là nguồn ảnh của bộ "${trung.title}". Một thư mục chỉ ` +
          "thuộc về một bộ ảnh — kiểm lại xem có nhầm nhà không.",
      );
    }

    const cuId = gallery.drive_folder_id;
    const cuUrl = gallery.drive_folder_url;

    if (cuId === folderId) {
      // Không phải lỗi: nhân viên dán lại đúng link đang có. Trả về như cũ để
      // màn hình khỏi hiện báo lỗi cho một thao tác vô hại.
      return ok({ driveFolderId: cuId, driveFolderUrl: cuUrl, doiGi: false });
    }

    const urlMoi = parsed.data.driveUrl;

    const { error: upErr } = await admin
      .from("galleries")
      .update({ drive_folder_id: folderId, drive_folder_url: urlMoi })
      .eq("id", galleryId);

    // Supabase không ném lỗi khi ghi hỏng. Không đọc `error` ở đây thì nhân viên
    // thấy "đã lưu" trong khi cơ sở dữ liệu không đổi gì.
    if (upErr) return failUnexpected(upErr, requestId);

    const { error: logErr } = await admin.from("activity_logs").insert({
      branch_id: gallery.branch_id,
      actor_type: "staff",
      actor_id: staff.staffId,
      action: "gallery.drive_folder.change",
      entity_type: "gallery",
      entity_id: galleryId,
      metadata: { tu: cuId, sang: folderId, tuUrl: cuUrl, sangUrl: urlMoi },
    });
    // Ghi nhật ký hỏng thì KHÔNG nuốt: đây là thao tác đổi nguồn ảnh của một
    // khách, mất dấu vết là mất đường truy khi có chuyện.
    if (logErr) return failUnexpected(logErr, requestId);

    return ok({ driveFolderId: folderId, driveFolderUrl: urlMoi, doiGi: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
