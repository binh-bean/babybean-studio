/**
 * GET /api/admin/can-xu-ly — "Cần xử lý trước khi gửi khách".
 *
 * Task BB-257. Spec: tasks/TASK-INDEX.md BB-257.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có đường này
 * ---------------------------------------------------------------------------
 * Studio sắp cho TẤT CẢ khách chọn ảnh qua app. Số liệu thật (26/09/2026): 73
 * bộ `sync_error` vì thư mục Drive chưa bật chia sẻ công khai, và 44 bộ
 * `draft` với `photo_count = 0`. Cả hai loại lỗi này khách mở link ra là thấy
 * trang trắng — nhưng trước BB-257, CSKH không có chỗ nào gom hai loại này lại
 * để sửa TRƯỚC khi gửi link, phải tự dò trong danh sách đầy đủ.
 *
 * ---------------------------------------------------------------------------
 * Vì sao dùng createAdminClient + lọc branch_id thủ công, không dùng RLS trần
 * ---------------------------------------------------------------------------
 * `galleries_select` (db/policies.sql) giới hạn thêm theo `editor_id =
 * auth.uid()` trừ khi có quyền `galleries:all_in_branch` — đúng cho màn xem
 * MỘT bộ ảnh của thợ ảnh/thợ chỉnh, nhưng khối này là màn CSKH cần thấy MỌI bộ
 * lỗi trong chi nhánh mình, không phải chỉ bộ mình là editor. Theo đúng cách
 * `GET /api/admin/galleries` đã làm: dùng client service-role rồi tự lọc
 * `branch_id` bằng `staff.branchIds`/`system:superuser`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không viết RPC mới
 * ---------------------------------------------------------------------------
 * Brief BB-257 cấm migration/DDL cho task này. Hai truy vấn ở đây đủ đơn giản
 * (lọc theo status/sync_error/photo_count) để chạy thẳng qua PostgREST, không
 * cần một hàm SQL riêng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { moTaLoi } from "@/lib/drive/sync-gallery";
import { DriveAccessDeniedError } from "@/lib/drive/client";
import { GetCanXuLyQuerySchema } from "./schema";

export const runtime = "nodejs";

/**
 * CTV thời vụ không vào khối này — cùng lý do với `GET
 * /api/admin/reports/loi-dong-bo` (BB-129): mỗi dòng kèm link mở thẳng thư
 * mục Drive gốc và nút gọi lại đồng bộ, không phải việc của người chỉnh ảnh
 * thời vụ. Xem docs/05-rbac.md §2.
 */
const BLOCKED_ROLES = ["photoshop_ctv"];

/**
 * Câu lỗi CHÍNH XÁC mà `ghiLoiDongBo` (src/lib/drive/sync-gallery.ts) ghi vào
 * `galleries.sync_error` khi thư mục Drive chưa bật chia sẻ công khai. Tính
 * từ `moTaLoi()` thay vì chép tay chuỗi, để hai bên không lệch nhau nếu câu
 * chữ đổi sau này.
 */
const LY_DO_CHUA_CHIA_SE = moTaLoi(new DriveAccessDeniedError());

interface HangGalleryTho {
  id: string;
  title: string;
  branch_id: string;
  drive_folder_url: string | null;
  sync_error: string | null;
  last_synced_at: string | null;
  branches: { name: string } | { name: string }[] | null;
}

function tenChiNhanh(raw: HangGalleryTho["branches"]): string {
  if (!raw) return "";
  if (Array.isArray(raw)) return raw[0]?.name ?? "";
  return raw.name ?? "";
}

function chuyenHang(raw: HangGalleryTho) {
  return {
    id: raw.id,
    title: raw.title,
    branchName: tenChiNhanh(raw.branches),
    driveFolderUrl: raw.drive_folder_url,
    syncError: raw.sync_error,
    lastSyncedAt: raw.last_synced_at,
  };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate ---------------------------------------------------
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được khối cần xử lý");
    }

    // 2. Parse & validate query params (hỏng thì 400, không rơi xuống 500) -
    const url = new URL(request.url);
    const rawParams: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) rawParams[key] = value;

    const parsed = GetCanXuLyQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const query = parsed.data;

    // 3. Chỉ hiện bộ thuộc chi nhánh nhân viên được xem ------------------
    let targetBranchIds: string[] | null;
    if (query.branchId) {
      requireBranch(staff, query.branchId);
      targetBranchIds = [query.branchId];
    } else if (staff.permissions.includes("system:superuser")) {
      targetBranchIds = null; // Toàn quyền xem mọi chi nhánh
    } else {
      targetBranchIds = staff.branchIds;
      // Không gán chi nhánh nào thì không thấy bộ ảnh nào — không phải lỗi.
      if (targetBranchIds.length === 0) {
        return ok({ driveChuaChiaSe: [], chuaCoAnh: [] });
      }
    }

    const admin = createAdminClient();
    const CAC_COT =
      "id, title, branch_id, drive_folder_url, sync_error, last_synced_at, branches(name)";

    // 4a. Thư mục Drive chưa chia sẻ công khai ---------------------------
    let qDrive = admin
      .from("galleries")
      .select(CAC_COT)
      .eq("status", "sync_error")
      .eq("sync_error", LY_DO_CHUA_CHIA_SE)
      .order("last_synced_at", { ascending: true, nullsFirst: true });
    if (targetBranchIds) qDrive = qDrive.in("branch_id", targetBranchIds);

    // 4b. Bộ ảnh chưa có tấm nào (không tính bộ đã lưu trữ) --------------
    //
    // Loại thêm `sync_error`: một bộ đang lỗi Drive cũng có `photo_count = 0`
    // (chưa kéo được tấm nào), nên nếu không loại thì nó rơi vào CẢ HAI nhóm —
    // CSKH mở link Drive lên sửa xong bấm "Kiểm lại" thì bộ biến mất khỏi
    // nhóm 4a nhưng vẫn nằm ở đây cho tới khi đồng bộ lại chạy xong, gây cảm
    // giác việc chưa xong dù đã làm. Số liệu thật 26/09/2026 (73 lỗi Drive +
    // 44 draft rỗng, không chồng nhau) cũng xác nhận hai nhóm này rời nhau.
    let qRong = admin
      .from("galleries")
      .select(CAC_COT)
      .eq("photo_count", 0)
      .neq("status", "archived")
      .neq("status", "sync_error")
      .order("created_at", { ascending: true });
    if (targetBranchIds) qRong = qRong.in("branch_id", targetBranchIds);

    const [resDrive, resRong] = await Promise.all([qDrive, qRong]);

    if (resDrive.error) return failUnexpected(resDrive.error, requestId);
    if (resRong.error) return failUnexpected(resRong.error, requestId);

    const driveChuaChiaSe = ((resDrive.data ?? []) as unknown as HangGalleryTho[]).map(chuyenHang);
    const chuaCoAnh = ((resRong.data ?? []) as unknown as HangGalleryTho[]).map(chuyenHang);

    // 5. Trả kết quả. KHÔNG có tên/SĐT khách trong hai truy vấn trên: cả hai
    // chỉ chọn cột của bảng `galleries` + tên chi nhánh, không join `customers`.
    return ok({ driveChuaChiaSe, chuaCoAnh });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
