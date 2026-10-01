/**
 * POST /api/admin/customers/dong-bo — "Đồng bộ ngay" khách hàng từ Lark.
 *
 * OWNER: DEV-BE. Task BB-337 mục 3.
 *
 * Khách vào app qua bảng Hậu Kỳ của Lark (mỗi dòng → khách + buổi chụp + bộ ảnh
 * nháp, `syncSingleRetouchRecord`). Không viết đường đồng bộ thứ hai: gọi ĐÚNG
 * `dongBoBoAnhTuLark` (BB-256) mà cron sáng 08:00 (`/api/cron/hau-ky`) đã chạy
 * mỗi ngày — nút này chỉ cho CSKH chạy lượt đó ngay, khỏi chờ sáng mai.
 *
 * CHỈ ĐỌC Lark (lấy token + đọc bảng), ghi vào DB của app. Khoá tư vấn 152111
 * dùng chung với hook và cron: đang có lượt khác thì nhường, không chạy chồng.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { dongBoBoAnhTuLark } from "@/lib/lark/dong-bo-bo-anh";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:write");

    const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN, SUPABASE_DB_URL } = process.env;
    if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN || !SUPABASE_DB_URL) {
      return fail("INTERNAL", "Máy chủ chưa cấu hình kết nối Lark — báo quản trị hệ thống.");
    }

    const client = new pg.Client({ connectionString: SUPABASE_DB_URL });
    await client.connect();
    try {
      const kq = await dongBoBoAnhTuLark({
        client,
        appId: LARK_APP_ID,
        appSecret: LARK_APP_SECRET,
        baseToken: LARK_BASE_APP_TOKEN,
        dbUrl: SUPABASE_DB_URL,
      });
      if (kq.nhuong) {
        return ok({ dangChay: true, docDuoc: 0, taoMoi: 0, daCo: 0, loi: 0 });
      }
      // BB-346 (luật BB-052): nút này ghi khách + buổi chụp + bộ ảnh nháp, nên
      // phải để lại dấu. Chỉ ghi SỐ ĐẾM — không tên, không SĐT (docs/12).
      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        actorLabel: staff.role,
        action: "customer.dong_bo_lark",
        entityType: "customer",
        metadata: {
          docDuoc: kq.fetched,
          taoMoi: kq.created,
          daCo: kq.updated,
          loi: kq.errors,
        },
      });
      return ok({
        dangChay: false,
        docDuoc: kq.fetched,
        taoMoi: kq.created,
        daCo: kq.updated,
        loi: kq.errors,
      });
    } finally {
      await client.end();
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
