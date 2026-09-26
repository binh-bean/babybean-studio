/**
 * GET /api/admin/galleries/[id]/mua-them — CSKH xem yêu cầu mua thêm khách gửi.
 *
 * OWNER: DEV-BE. Task BB-245.
 *
 * Chỉ ĐỌC. Đổi trạng thái (đã liên hệ, đã chốt, huỷ) nằm ở route con
 * `PATCH /api/admin/galleries/[id]/mua-them/[yeuCauId]` (BB-249).
 *
 * Không gate quyền riêng: cùng khuôn với GET `/api/admin/galleries/[id]/items`
 * (route anh em) — `requireStaff` + `requireBranch` là đủ, mọi nhân viên xem
 * được bộ ảnh của đúng chi nhánh mình thì xem được luôn khối này.
 *
 * BB-254 — thêm tên/SĐT/nhãn link của NGƯỜI GỬI khi yêu cầu tới từ ông bà
 * (link vai 'viewer'), để CSKH gọi đúng người thay vì gọi nhầm ba mẹ. SĐT ở
 * đây KHÔNG che — CSKH cần số thật để gọi lại (khác thẻ Lark, nơi
 * `cheSoDienThoai` che giữa vì nhóm chat rộng hơn phòng CSKH).
 *
 * Cột `ten_nguoi_mua`/`sdt_nguoi_mua`/`share_link_id` nằm trong migration
 * 0073 — có thể CHƯA áp trên môi trường này. Thử SELECT kèm ba cột trước, rớt
 * về bản không có nếu PostgREST báo lỗi thiếu cột (PGRST204/42703), cùng cách
 * phòng thủ route `/api/g/mua-them` đang dùng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();

    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (galleryError || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    const CAC_COT_DAY_DU =
      "id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at, products(name), photos(file_name), " +
      "ten_nguoi_mua, sdt_nguoi_mua, share_links(label)";
    const CAC_COT_CU =
      "id, product_id, photo_id, so_luong, ghi_chu, trang_thai, created_at, products(name), photos(file_name)";

    const dayDu = await admin
      .from("yeu_cau_mua_them")
      .select(CAC_COT_DAY_DU)
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: false });

    // Migration 0073 (ten_nguoi_mua/sdt_nguoi_mua/share_link_id) có thể chưa
    // áp. RỚT VỀ BẤT KỲ LỖI NÀO ở câu SELECT đầy đủ — không lọc theo mã lỗi
    // cụ thể: PostgREST trả mã khác nhau tuỳ đây là cột thiếu (PGRST204/42703)
    // hay QUAN HỆ embed thiếu vì FK `share_link_id` chưa tồn tại (PGRST200).
    // Đoán thiếu một mã là còn để lọt những mã khác — thử lại bằng câu SELECT
    // CŨ (không có ba cột BB-254) là an toàn hơn, và nếu câu đó CŨNG lỗi thì
    // `error` vẫn được `throw` như cũ ở dưới.
    const { data, error }: { data: unknown[] | null; error: { message: string } | null } = dayDu.error
      ? await admin
          .from("yeu_cau_mua_them")
          .select(CAC_COT_CU)
          .eq("gallery_id", galleryId)
          .order("created_at", { ascending: false })
      : dayDu;

    if (error) throw error;

    return ok({
      items: (data ?? []).map((d) => {
        const anyD = d as unknown as {
          id: string;
          product_id: string;
          photo_id: string | null;
          so_luong: number;
          ghi_chu: string | null;
          trang_thai: string;
          created_at: string;
          products: { name: string } | null;
          photos: { file_name: string } | null;
          ten_nguoi_mua?: string | null;
          sdt_nguoi_mua?: string | null;
          share_links?: { label: string | null } | null;
        };
        return {
          id: anyD.id,
          productId: anyD.product_id,
          productName: anyD.products?.name ?? null,
          photoId: anyD.photo_id,
          photoFileName: anyD.photos?.file_name ?? null,
          soLuong: anyD.so_luong,
          ghiChu: anyD.ghi_chu,
          trangThai: anyD.trang_thai,
          createdAt: anyD.created_at,
          // BB-254 — chỉ có khi yêu cầu tới từ link ông bà/người thân.
          nguoiMuaTen: anyD.ten_nguoi_mua ?? null,
          nguoiMuaSdt: anyD.sdt_nguoi_mua ?? null,
          nguoiMuaNhanLink: anyD.share_links?.label ?? null,
        };
      }),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem yêu cầu mua thêm");
    return failUnexpected(err, requestId);
  }
}
