/**
 * PATCH /api/admin/galleries/[id]/mua-them/[yeuCauId] — CSKH đổi trạng thái
 * một yêu cầu mua thêm (gọi khách, chốt, huỷ).
 *
 * OWNER: DEV-BE. Task BB-249.
 * Tiếp nối BB-245 (`db/migrations/0072-yeu-cau-mua-them.sql`) — lượt đó chỉ
 * dựng bảng và route GET liệt kê, chưa có đường đổi trạng thái.
 *
 * ---------------------------------------------------------------------------
 * Chuyển hợp lệ — một chiều, không lùi
 * ---------------------------------------------------------------------------
 *   moi        → da_lien_he | huy
 *   da_lien_he → da_chot    | huy
 *   da_chot, huy là trạng thái cuối — đổi tiếp trả 409 CONFLICT.
 *
 * ---------------------------------------------------------------------------
 * Chống đua bằng UPDATE có điều kiện, không đọc-rồi-ghi
 * ---------------------------------------------------------------------------
 * Hai CSKH cùng mở một bộ ảnh, cùng bấm nút cho cùng một dòng gần như cùng
 * lúc: đọc trạng thái trước rồi ghi sau sẽ có một lượt đè lên lượt kia mà
 * không ai biết. `update ... where trang_thai = <cũ>` nhờ Postgres tự làm
 * trọng tài — lượt thua trả về 0 dòng, route trả 409 để CSKH tải lại xem
 * đồng nghiệp vừa đổi gì, không âm thầm ghi đè.
 *
 * ---------------------------------------------------------------------------
 * Ghi chú CSKH đi vào activity_logs.metadata, KHÔNG thêm cột
 * ---------------------------------------------------------------------------
 * Không cần migration cho việc này: bảng `yeu_cau_mua_them` không có cột ghi
 * chú nội bộ, và cột `ghi_chu` sẵn có là ghi chú của KHÁCH lúc gửi yêu cầu —
 * không phải chỗ để CSKH viết đè. Ghi chú CSKH nằm trong dòng nhật ký
 * (`mua_them.doi_trang_thai`), đọc lại qua `activity_logs`, và không bao giờ
 * lộ ra route khách `/api/g/mua-them` vì route đó không đọc bảng nhật ký.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_GHI_CHU = 500;

const Body = z.object({
  trangThai: z.enum(["da_lien_he", "da_chot", "huy"]),
  ghiChuCskh: z.string().trim().max(MAX_GHI_CHU).optional(),
});

/** Chuyển hợp lệ: trạng thái cũ → tập trạng thái được phép đổi tới. */
/** Chữ cho người đọc — không để mã trần ("da_chot") lọt ra câu báo lỗi (Opus soát). */
const TEN_TRANG_THAI: Record<string, string> = {
  moi: "Mới gửi",
  da_lien_he: "Đã gọi khách",
  da_chot: "Đã chốt",
  huy: "Đã huỷ",
};

const CHUYEN_HOP_LE: Record<string, string[]> = {
  moi: ["da_lien_he", "huy"],
  da_lien_he: ["da_chot", "huy"],
  da_chot: [],
  huy: [],
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; yeuCauId: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Cùng quyền với GET (BB-245) và với sửa các trường khác của bộ ảnh:
    // CSKH, quản lý chi nhánh, owner/admin. Kế toán, thợ chụp/chỉnh ảnh,
    // cộng tác viên photoshop KHÔNG có "galleries:write" nên không đổi được.
    requirePermission(staff, "galleries:write");

    const { id: galleryId, yeuCauId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }
    if (!yeuCauId || !UUID_REGEX.test(yeuCauId)) {
      return fail("INVALID_INPUT", "Mã yêu cầu không hợp lệ");
    }

    const jsonBody = await readJsonBody(request);
    const parsed = jsonBody.ok ? Body.safeParse(jsonBody.data) : null;
    if (!parsed || !parsed.success) {
      return fail("INVALID_INPUT", "Dữ liệu đổi trạng thái không hợp lệ");
    }
    const { trangThai: trangThaiMoi, ghiChuCskh } = parsed.data;

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (galleryError) return failUnexpected(galleryError, requestId);
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const { data: dong, error: dongError } = await admin
      .from("yeu_cau_mua_them")
      .select("id, trang_thai")
      .eq("id", yeuCauId)
      .eq("gallery_id", galleryId)
      .maybeSingle();

    if (dongError) return failUnexpected(dongError, requestId);
    if (!dong) return fail("NOT_FOUND", "Không tìm thấy yêu cầu này trong bộ ảnh");

    const trangThaiCu = dong.trang_thai as string;
    const dichHopLe = CHUYEN_HOP_LE[trangThaiCu] ?? [];
    if (!dichHopLe.includes(trangThaiMoi)) {
      return fail(
        "CONFLICT",
        trangThaiCu === "da_chot" || trangThaiCu === "huy"
          ? "Yêu cầu này đã ở trạng thái cuối, không đổi thêm được"
          : `Không thể chuyển từ "${TEN_TRANG_THAI[trangThaiCu] ?? trangThaiCu}" sang "${TEN_TRANG_THAI[trangThaiMoi]}"`,
      );
    }

    // Chống đua: chỉ ghi khi trạng thái vẫn đúng cái vừa đọc. Thua thì trả 0
    // dòng — không phải lỗi hệ thống, mà là đồng nghiệp vừa đổi trước.
    const { data: capNhat, error: updateError } = await admin
      .from("yeu_cau_mua_them")
      .update({ trang_thai: trangThaiMoi })
      .eq("id", yeuCauId)
      .eq("trang_thai", trangThaiCu)
      .select("id, trang_thai")
      .maybeSingle();

    if (updateError) return failUnexpected(updateError, requestId);
    if (!capNhat) {
      return fail(
        "CONFLICT",
        "Trạng thái vừa bị người khác đổi, vui lòng tải lại trang",
      );
    }

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "mua_them.doi_trang_thai",
      entityType: "yeu_cau_mua_them",
      entityId: yeuCauId,
      galleryId,
      metadata: {
        tuTrangThai: trangThaiCu,
        denTrangThai: trangThaiMoi,
        ghiChuCskh: ghiChuCskh || null,
      },
    });

    return ok({ id: yeuCauId, trangThai: trangThaiMoi });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(
        err.code,
        err.code === "FORBIDDEN" ? "Không có quyền đổi trạng thái yêu cầu này" : undefined,
      );
    }
    return failUnexpected(err, requestId);
  }
}
