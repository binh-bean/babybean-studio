/**
 * GET /api/admin/goi-chup — danh sách gói chụp cho màn quản trị "Gói chụp".
 * PUT /api/admin/goi-chup — đặt / bỏ giá ảnh chọn thêm RIÊNG của một gói.
 *
 * OWNER: DEV-BE. Task BB-385 (BB-062 nâng P0).
 *
 * Ai làm gì:
 *   · Xem: `packages:read` (CSKH, photo, hậu kỳ, kế toán… đều có).
 *   · Sửa giá: `settings:system` (Admin / chủ studio) — giá ảnh thêm là tiền
 *     khách trả, áp cho mọi chi nhánh, cùng tầng với ô giá chung trong Cài đặt.
 *
 * Trường nào của ai (xem bàn giao BB-385):
 *   · Tên gói, giá gói, số ảnh chỉnh, sản phẩm đi kèm: LẤY TỪ LARK (danh mục +
 *     dòng hợp đồng). Không sửa ở app — lượt đồng bộ sau sẽ đè.
 *   · Giá ảnh chọn thêm riêng của gói: APP làm chủ (bảng `goi_chup_gia_anh_them`,
 *     migration 0100). Không đặt = dùng giá chung.
 *
 * PUT chỉ ghi `goi_chup_gia_anh_them` (+ nhật ký). KHÔNG ghi `galleries`: đổi
 * giá chỉ áp cho bộ ảnh tạo sau (xem gia-goi-chup.ts).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GIA_ANH_THEM_TOI_DA,
  giaAnhThemChoBoMoi,
  laLoiChuaApMigration,
  maGoiLark,
  tongHopGoiChup,
} from "@/lib/gallery/gia-goi-chup";
import { TIEN_TO_MA_GOI_LARK as TIEN_TO } from "@/lib/gallery/goi-chup-lark";
import {
  BANG_GIA_RIENG,
  docBangGiaRieng,
  docDuLieuManGoiChup,
  docGiaChung,
} from "@/lib/gallery/gia-goi-chup-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "packages:read");

    const admin = createAdminClient();
    const [duLieu, giaRieng, giaChungDaLuu] = await Promise.all([
      docDuLieuManGoiChup(admin),
      docBangGiaRieng(admin),
      docGiaChung(admin),
    ]);

    return ok({
      goi: tongHopGoiChup({ ...duLieu, bangGiaRieng: giaRieng.bang, giaChung: giaChungDaLuu }),
      /** Giá chung đang áp (đã rơi về 50.000 khi chưa có dòng Cài đặt). */
      giaChung: giaAnhThemChoBoMoi({ giaChung: giaChungDaLuu }),
      chuaApMigration: giaRieng.chuaApMigration,
      coTheSuaGia: staff.permissions.includes("settings:system"),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

const DatGiaSchema = z.object({
  tenGoi: z.string().trim().min(1).max(200),
  /** null = bỏ giá riêng, gói quay về giá chung. */
  gia: z.number().int().min(0).max(GIA_ANH_THEM_TOI_DA).nullable(),
});

export async function PUT(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "settings:system");

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = DatGiaSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Giá phải là số nguyên từ 0 đến 10.000.000 ₫", { issues: parsed.error.issues });
    }
    const { tenGoi, gia } = parsed.data;
    const maGoi = maGoiLark(tenGoi);
    if (maGoi.length <= TIEN_TO.length) return fail("INVALID_INPUT", "Tên gói không hợp lệ");

    const admin = createAdminClient();
    const { data: cu, error: loiDoc } = await admin
      .from(BANG_GIA_RIENG)
      .select("gia_anh_them")
      .eq("ma_goi", maGoi)
      .maybeSingle();
    if (loiDoc) {
      if (laLoiChuaApMigration(loiDoc)) {
        return fail("CONFLICT", "Chưa áp migration 0100 — chưa đặt được giá riêng theo gói. Đổi giá chung ở Cài đặt.");
      }
      throw loiDoc;
    }

    if (gia === null) {
      const { error } = await admin.from(BANG_GIA_RIENG).delete().eq("ma_goi", maGoi);
      if (error) throw error;
    } else {
      const { error } = await admin.from(BANG_GIA_RIENG).upsert(
        {
          ma_goi: maGoi,
          ten_goi: tenGoi,
          gia_anh_them: gia,
          cap_nhat_boi: staff.staffId,
          cap_nhat_luc: new Date().toISOString(),
        },
        { onConflict: "ma_goi" },
      );
      if (error) throw error;    }

    const truoc = (cu as { gia_anh_them?: unknown } | null)?.gia_anh_them ?? null;
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: null,
      action: "package.extra_photo_price",
      entity_type: "package",
      entity_id: null,
      metadata: { ma_goi: maGoi, ten_goi: tenGoi, truoc: truoc === null ? null : Number(truoc), sau: gia },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ maGoi, gia });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
