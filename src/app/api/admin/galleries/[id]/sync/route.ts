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
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
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
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);

    const supabase = await createServerClient();

    let thongTin;
    try {
      thongTin = await batDauDongBo(supabase, galleryId);
    } catch (err) {
      if (err instanceof GalleryNotFoundError) return fail("NOT_FOUND", err.message);
      return failUnexpected(err, requestId);
    }

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
    if (err instanceof AuthError) return fail(err.code, err.message);
    return failUnexpected(err, requestId);
  }
}
