/**
 * POST /api/admin/galleries/[id]/sync — CSKH bấm đồng bộ ảnh MỘT bộ từ Drive.
 *
 * OWNER: DEV-INT, sửa bởi PM ở BB-126.
 * Spec: docs/06-drive-integration.md
 *
 * Route chạy qua `after()`: trả 202 ngay rồi làm tiếp ở nền, vì một thư mục
 * vài trăm ảnh mất lâu hơn thời gian chờ của trình duyệt.
 *
 * Toàn bộ logic đồng bộ nằm ở `@/lib/drive/sync-gallery`, dùng chung với
 * `scripts/sync-drive.ts` — 433 bộ ảnh thật thì không ai bấm 433 lần, nên phải
 * có đường chạy hàng loạt, và hai đường đó phải là MỘT đoạn mã.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { ghiNhatKy } from "@/lib/nhat-ky";
import {
  batDauDongBo,
  dongBoBoAnh,
  ghiLoiDongBo,
  GalleryNotFoundError,
} from "@/lib/drive/sync-gallery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { id: galleryId } = await context.params;
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");

    const supabase = await createServerClient();

    /**
     * Chi nhánh của bộ ảnh, lấy TRƯỚC khi đụng vào nó, vì hai việc:
     *
     *  1. **Cách ly chi nhánh.** Trước 22/09/2026 đường này chỉ hỏi quyền
     *     `galleries:write` rồi đồng bộ thẳng — không hỏi bộ ảnh thuộc chi
     *     nhánh nào. CSKH chi nhánh A đoán được một mã bộ ảnh của chi nhánh B
     *     là ghi đè được bảng `photos` của bộ đó. Mọi đường sửa bộ ảnh khác
     *     (`reopen`, `retouch-done`, `share-link`) đều đã hỏi `requireBranch`;
     *     riêng đường này sót.
     *  2. Dòng nhật ký phải mang `branch_id`, nếu không quản lý chi nhánh mở
     *     màn Nhật ký sẽ không thấy nó (bộ lọc chi nhánh của BB-196).
     */
    const { data: boAnh } = await supabase
      .from("galleries")
      .select("branch_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (!boAnh) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, String(boAnh.branch_id));

    let thongTin;
    try {
      thongTin = await batDauDongBo(supabase, galleryId);
    } catch (err) {
      if (err instanceof GalleryNotFoundError) return fail("NOT_FOUND", err.message);
      return failUnexpected(err, requestId);
    }

    // BB-052: ai bấm đồng bộ, lúc nào. Kết quả của lượt chạy nằm ở
    // `galleries.sync_error` và báo cáo "Bộ ảnh lỗi tải"; dòng này trả lời câu
    // còn lại — bộ ảnh tự nhiên đổi số ảnh là do ai.
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(boAnh.branch_id),
      action: "gallery.sync_requested",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { jobId: requestId, giaiDoanDau: thongTin.giaiDoanDau },
    });

    after(async () => {
      try {
        await dongBoBoAnh(supabase, galleryId, thongTin, requestId);
      } catch (err) {
        await ghiLoiDongBo(supabase, galleryId, thongTin.giaiDoanDau, err);
      }
    });

    return NextResponse.json(
      { data: { jobId: requestId, status: "syncing" } },
      { status: 202 },
    );
  } catch (err) {
    // BB-223: xem giải thích ở src/app/api/admin/galleries/route.ts —
    // err.message của AuthError mặc định là mã lỗi trần, không phải câu
    // tiếng Việt cho người dùng.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
