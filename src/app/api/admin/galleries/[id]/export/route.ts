/**
 * GET /api/admin/galleries/:id/export — danh sách ảnh khách đã chọn.
 *
 * OWNER: DEV-BE. Task BB-067.
 *
 * ---------------------------------------------------------------------------
 * Quyền `galleries:export` đã có từ lâu, và nó không mở được gì
 * ---------------------------------------------------------------------------
 * Rà soát ngày 22/09/2026: quyền `galleries:export` ("Xuất danh sách ảnh") nằm
 * trong danh mục quyền và được cấp cho sáu vai; `docs/04` mục 4.1 mô tả đường
 * `GET /galleries/:id/export?format=lightroom`; `src/i18n` có sẵn cả một cụm
 * chữ — tiêu đề, ba định dạng, nút sao chép. **Nhưng không có route, không có
 * nút, không có gì.** Một cái quyền không mở ra cửa nào, và một màn hình chỉ
 * tồn tại trong tệp dịch.
 *
 * Người thật cần nó: thợ chỉnh ảnh làm việc theo TÊN FILE. Không có đường này
 * thì CSKH đọc tên từng tấm trên màn hình rồi gõ tay sang chỗ khác — và gõ nhầm
 * một ký tự là chỉnh nhầm ảnh.
 *
 * ---------------------------------------------------------------------------
 * Chỉ ảnh khách CHÍNH đã chọn — không lấy ảnh người thân gợi ý
 * ---------------------------------------------------------------------------
 * Một bộ ảnh có thể có nhiều lượt chọn: link của khách chính (`is_primary`) và
 * link của bà, của dì (vai `suggester`). Ảnh người thân đánh dấu nằm ở
 * `mark = 'suggested'` trong lượt chọn RIÊNG của họ.
 *
 * Xuất nhầm những tấm đó nghĩa là thợ chỉnh ảnh làm thừa hàng chục tấm không
 * ai đặt, và studio tính tiền những tấm khách không chọn. Nên ở đây khoá chặt
 * hai vế: đúng lượt chọn chính, và đúng `mark = 'selected'`.
 */

import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Bọc một ô CSV.
 *
 * Ghi chú của khách viết tự do: dấu phẩy, dấu nháy, xuống dòng đều có thể có.
 * Không bọc thì một dấu phẩy trong ghi chú đẩy cả dòng lệch cột, và người mở
 * bảng tính đọc sai ghi chú sang tấm ảnh bên cạnh.
 *
 * Dấu `=`, `+`, `-`, `@` đứng đầu ô bị Excel hiểu là CÔNG THỨC. Đó là đường
 * chèn mã quen thuộc (CSV injection): khách gõ `=HYPERLINK(...)` vào ghi chú
 * thì máy của nhân viên là nơi nó chạy. Thêm dấu nháy đơn ở đầu để Excel coi
 * là chữ.
 */
function oCsv(giaTri: string | null | undefined): string {
  const s = String(giaTri ?? "");
  const antoan = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${antoan.replace(/"/g, '""')}"`;
}

interface DongAnh {
  file_name: string;
  retouch_note: string | null;
  is_favorite: boolean | null;
  order_index: number | null;
  sort_index: number | null;
  subfolder: string | null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:export");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const dinhDang = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "txt";
    const admin = createAdminClient();

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, title, status")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(gallery.branch_id));

    const { data: luotChon } = await admin
      .from("selections")
      .select("id, general_note")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle();

    if (!luotChon) {
      return fail("INVALID_INPUT", "Bộ ảnh chưa có lượt chọn nào của khách chính");
    }

    const { data, error } = await admin
      .from("selection_items")
      .select("order_index, retouch_note, is_favorite, photos(file_name, sort_index, subfolder)")
      .eq("selection_id", luotChon.id)
      .eq("mark", "selected");
    if (error) throw error;

    /**
     * Sắp theo thứ tự ảnh trong thư mục, không theo thứ tự khách bấm.
     *
     * Thợ chỉnh ảnh mở thư mục Drive ra và đi từ trên xuống. Danh sách sắp
     * theo thứ tự bấm thì họ phải nhảy tới nhảy lui giữa 300 tấm.
     */
    const dong: DongAnh[] = (data ?? [])
      .map((d) => {
        const p = (d as { photos?: unknown }).photos as
          | { file_name?: string; sort_index?: number; subfolder?: string }
          | null;
        return {
          file_name: String(p?.file_name ?? ""),
          retouch_note: (d as { retouch_note?: string | null }).retouch_note ?? null,
          is_favorite: (d as { is_favorite?: boolean | null }).is_favorite ?? null,
          order_index: (d as { order_index?: number | null }).order_index ?? null,
          sort_index: p?.sort_index ?? null,
          subfolder: p?.subfolder ?? null,
        };
      })
      .filter((d) => d.file_name !== "")
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));

    const than =
      dinhDang === "csv"
        ? [
            ["ten_file", "thu_muc_con", "ghi_chu_chinh_sua", "yeu_thich"].join(","),
            ...dong.map((d) =>
              [
                oCsv(d.file_name),
                oCsv(d.subfolder),
                oCsv(d.retouch_note),
                oCsv(d.is_favorite ? "x" : ""),
              ].join(","),
            ),
            // Ghi chú chung của khách đi kèm, nếu có: nó là lời dặn cho CẢ bộ,
            // mất nó thì thợ chỉnh ảnh không biết gia đình muốn tông màu nào.
            ...(luotChon.general_note
              ? ["", oCsv("Ghi chú chung của khách") + "," + oCsv(luotChon.general_note)]
              : []),
          ].join("\r\n")
        : dong.map((d) => d.file_name).join("\r\n");

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(gallery.branch_id),
      action: "gallery.export",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { dinhDang, soAnh: dong.length },
    });

    /**
     * Tên tệp KHÔNG mang tên khách.
     *
     * Tệp này rơi vào thư mục Tải xuống của máy chung ở studio, và tên tệp thì
     * hiện ra ở mọi cửa sổ chọn file. Mã bộ ảnh là đủ để tra ngược.
     */
    const tenTep = `bo-anh-${galleryId.slice(0, 8)}.${dinhDang}`;

    return new Response(than, {
      status: 200,
      headers: {
        "Content-Type":
          dinhDang === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tenTep}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
