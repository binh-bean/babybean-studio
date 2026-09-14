/**
 * GET /api/admin/reports/loi-dong-bo — bộ ảnh kéo từ Drive về không thành công.
 *
 * OWNER: DEV-BE theo ma trận sở hữu. Tệp này do DEV-FE viết mới ở BB-129 vì
 * brief giao cả đường dữ liệu kèm màn hình; PM cần chốt lại chủ sở hữu trước
 * khi có người sửa tiếp. Tệp mới nên không đè lên việc của ai.
 * Spec: docs/briefs/BB-129-man-hinh-loi-dong-bo.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao API này tự lọc chi nhánh thay vì dựa vào RLS
 * ---------------------------------------------------------------------------
 * Đọc bằng khoá quản trị (service_role) thì RLS bị bỏ qua HOÀN TOÀN, nên câu
 * truy vấn trả về mọi chi nhánh nếu không ai chặn. Ở báo cáo này hậu quả không
 * chỉ là thấy nhầm: mỗi dòng kèm một nút gọi thẳng sang đường đồng bộ, nên
 * quản lý chi nhánh này sẽ BẤM được vào bộ ảnh của chi nhánh kia.
 *
 * requireStaff() đã trả sẵn branchIds — chủ và quản trị nhận đủ mọi chi nhánh,
 * nhân viên thường chỉ nhận chi nhánh được gán — nên lọc theo đó là đúng cho
 * mọi vai và không phải viết hai nhánh.
 *
 * ---------------------------------------------------------------------------
 * Vì sao gom theo lý do chứ không trả danh sách phẳng
 * ---------------------------------------------------------------------------
 * Mẻ đồng bộ ngày 14.09.2026 hỏng 77 bộ, và cả 77 bộ hỏng vì CÙNG một lý do.
 * Một vấn đề lặp 77 lần là một việc phải làm; 77 vấn đề khác nhau là 77 việc
 * phải làm. Danh sách phẳng không phân biệt được hai chuyện đó, và người đọc
 * phải tự đếm mới biết mình đang ở tình huống nào.
 *
 * Gom ở phía máy chủ chứ không ở trình duyệt, vì phần tóm tắt (bao nhiêu lý do
 * khác nhau) phải đúng kể cả khi danh sách bị chặn trần bên dưới.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";

export const runtime = "nodejs";

/**
 * CTV thời vụ không vào màn này.
 *
 * Không phải vì lỗi đồng bộ là chuyện bí mật, mà vì màn này kèm nút gọi đồng
 * bộ và link mở thẳng thư mục gốc trên Drive — người chỉnh ảnh thời vụ không
 * có việc gì ở hai chỗ đó. Xem docs/05-rbac.md §2.
 */
const BLOCKED_ROLES = ["photoshop_ctv"];

/**
 * Trần số dòng trả về.
 *
 * Mẻ hỏng lớn nhất từng thấy là 77 bộ; đặt trần 500 để một mẻ hỏng gấp sáu lần
 * vẫn hiện đủ, mà một sự cố toàn hệ thống thì không kéo cả bảng galleries về
 * trình duyệt. Phần tóm tắt đếm riêng nên vẫn nói đúng số thật khi chạm trần.
 */
const MAX_ROWS = 500;

interface LoiItem {
  galleryId: string;
  galleryTitle: string;
  contractCode: string | null;
  branchId: string;
  branchName: string;
  driveFolderUrl: string;
  lastSyncedAt: string | null;
  status: string;
  statusLabel: string;
}

interface NhomLoi {
  reason: string;
  count: number;
  items: LoiItem[];
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được báo cáo lỗi đồng bộ");
    }

    // Nhân viên chưa được gán chi nhánh nào thì không có gì để xem. Trả bảng
    // rỗng thay vì lỗi: chưa gán chi nhánh là việc còn thiếu của quản trị, đó
    // không phải lỗi của người đang đứng trước màn hình.
    if (staff.branchIds.length === 0) {
      return ok({ summary: { galleryCount: 0, reasonCount: 0, truncated: false }, groups: [] });
    }

    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from("galleries")
      .select(
        "id, title, status, lark_contract_codes, branch_id, drive_folder_url, " +
          "last_synced_at, sync_error, branch:branches(name)",
      )
      .not("sync_error", "is", null)
      .in("branch_id", staff.branchIds)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    type Row = {
      id: string;
      title: string;
      status: string;
      // MẢNG, không phải một chuỗi: 0028 cho một thư mục ảnh gom nhiều hợp
      // đồng (cùng nhà, chụp cùng buổi, hai gói khác nhau). Hôm nay chưa bộ
      // gộp nào nằm trong nhóm lỗi, nên dùng cột số ít vẫn "chạy" — nhưng
      // ngày nó lỗi thì CSKH chỉ thấy một trong hai mã và dán nhầm sang Lark.
      lark_contract_codes: string[] | null;
      branch_id: string;
      drive_folder_url: string;
      last_synced_at: string | null;
      sync_error: string | null;
      // Supabase suy ra quan hệ một-nhiều thành mảng ở vài phiên bản bộ kiểu,
      // nên nhận cả hai dạng rồi tự gỡ — chứ không ép kiểu cho qua trình biên
      // dịch rồi để `undefined` rơi xuống màn hình thành chữ "undefined".
      branch: { name: string } | { name: string }[] | null;
    };

    const nhom = new Map<string, LoiItem[]>();

    for (const r of (rows ?? []) as unknown as Row[]) {
      // sync_error đã lọc `is not null` bên trên; nhánh này chỉ để trình biên
      // dịch yên tâm, và để một dòng dữ liệu lạ không làm hỏng cả báo cáo.
      const reason = r.sync_error?.trim() || "Không rõ lý do";
      const branch = Array.isArray(r.branch) ? r.branch[0] : r.branch;

      const item: LoiItem = {
        galleryId: r.id,
        galleryTitle: r.title,
        contractCode: r.lark_contract_codes?.length ? r.lark_contract_codes.join(" + ") : null,
        branchId: r.branch_id,
        branchName: branch?.name ?? "—",
        driveFolderUrl: r.drive_folder_url,
        lastSyncedAt: r.last_synced_at,
        status: r.status,
        // Nhãn tiếng Việt lấy từ nguồn chung `@/lib/gallery-status`. Dự án đã
        // mất nhiều công vì sáu bản chép tay của danh sách trạng thái này.
        statusLabel: GALLERY_STATUS_LABEL[r.status] ?? r.status,
      };

      nhom.set(reason, [...(nhom.get(reason) ?? []), item]);
    }

    // Lý do nào hỏng nhiều bộ nhất thì đứng trước: sửa quyền một thư mục cha
    // thường gỡ được cả nhóm, nên nhóm to là việc đáng làm trước.
    const groups: NhomLoi[] = [...nhom.entries()]
      .map(([reason, items]) => ({ reason, count: items.length, items }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "vi"));

    const galleryCount = groups.reduce((n, g) => n + g.count, 0);

    return ok({
      summary: {
        galleryCount,
        reasonCount: groups.length,
        // Chạm trần thì màn hình phải nói ra, chứ không lặng lẽ hiện thiếu —
        // người đọc đang dùng con số này để biết còn bao nhiêu việc.
        truncated: galleryCount >= MAX_ROWS,
      },
      groups,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code, err.message);
    return failUnexpected(err, requestId);
  }
}
