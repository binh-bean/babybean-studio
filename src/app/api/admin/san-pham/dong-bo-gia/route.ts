/**
 * POST /api/admin/san-pham/dong-bo-gia — nút "Đồng bộ giá ngay" ở màn Cài đặt.
 *
 * OWNER: DEV-BE. Task BB-343.
 *
 * Đọc bảng "Sản phẩm" bên Lark rồi cập nhật giá / trạng thái / tên / vật liệu /
 * kích thước vào `products`. MỘT CHIỀU, không ghi ngược Lark, không xoá sản
 * phẩm. Logic nằm ở `src/lib/lark/dong-bo-gia-san-pham.ts` (cron hau-ky dùng
 * chung). Hai chốt an toàn (Lark lỗi / đọc dưới 80%) nằm ở đó: vi phạm là không
 * ghi gì và đường này trả lỗi.
 *
 * Quyền: `settings:system` (vai Admin). Tối đa 1 lần / phút — kể cả lần hỏng,
 * vì lần hỏng cũng đã gọi Lark.
 *
 * Mỗi lượt (kể cả lượt hỏng) để lại một dòng nhật ký `san_pham.dong_bo_gia` kèm
 * danh sách "tên: giá cũ → giá mới". Không có dữ liệu khách hàng trong đó.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { ghiNhatKy } from "@/lib/nhat-ky";
import {
  GIAN_CACH_NUT_MS,
  HANH_DONG_NHAT_KY,
  KHOA_DONG_BO_GIA,
  KHOA_MOC_BAM_NUT,
  docBangSanPhamTuLark,
  dongBoGiaSanPham,
  khoPg,
  metadataNhatKy,
} from "@/lib/lark/dong-bo-gia-san-pham";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  let client: pg.Client | null = null;
  try {
    const staff = await requireStaff();
    requirePermission(staff, "settings:system");

    const { SUPABASE_DB_URL } = process.env;
    if (!SUPABASE_DB_URL) return fail("INTERNAL", "Thiếu cấu hình cơ sở dữ liệu");

    client = new pg.Client({ connectionString: SUPABASE_DB_URL });
    await client.connect();
    const kho = khoPg(client);

    // 1 lần / phút. Đọc mốc rồi ghi mốc mới NGAY (trước khi gọi Lark).
    const moc = await kho.docCaiDat(KHOA_MOC_BAM_NUT);
    const lanTruoc = typeof moc?.luc === "string" ? Date.parse(moc.luc) : NaN;
    const conLaiMs = Number.isFinite(lanTruoc) ? GIAN_CACH_NUT_MS - (Date.now() - lanTruoc) : 0;
    if (conLaiMs > 0) {
      return fail("RATE_LIMITED", `Vừa đồng bộ xong, anh đợi ${Math.ceil(conLaiMs / 1000)} giây rồi bấm lại.`, {
        conLaiGiay: Math.ceil(conLaiMs / 1000),
      });
    }
    await kho.ghiCaiDat(KHOA_MOC_BAM_NUT, { luc: new Date().toISOString() });

    // Không chạy chồng với cron hoặc một lần bấm khác.
    const { rows } = await client.query("select pg_try_advisory_lock($1) as ok", [KHOA_DONG_BO_GIA]);
    if (!rows[0]?.ok) return fail("CONFLICT", "Một lượt đồng bộ giá khác đang chạy, đợi một chút rồi xem kết quả.");

    try {
      const ketQua = await dongBoGiaSanPham({
        kho,
        docLark: () => docBangSanPhamTuLark({
            LARK_APP_ID: process.env.LARK_APP_ID,
            LARK_APP_SECRET: process.env.LARK_APP_SECRET,
            LARK_BASE_APP_TOKEN: process.env.LARK_BASE_APP_TOKEN,
          }),
        ghi: true,
        nguon: "nut",
      });

      await ghiNhatKy({
        actorType: "staff",
        actorId: staff.staffId,
        actorLabel: staff.roleName ?? staff.role,
        action: HANH_DONG_NHAT_KY,
        entityType: "products",
        metadata: metadataNhatKy(ketQua),
      });

      if (!ketQua.ok) {
        return fail("INTERNAL", `Chưa đồng bộ được giá: ${ketQua.loi?.thongBao ?? "lỗi không rõ"}`, {
          ma: ketQua.loi?.ma,
        });
      }
      return ok({
        luc: new Date().toISOString(),
        soDocTuLark: ketQua.soDocTuLark,
        soGiaDoi: ketQua.soGiaDoi,
        soBat: ketQua.soBat,
        soTat: ketQua.soTat,
        chuaCoTrongApp: ketQua.chuaCoTrongApp,
      });
    } finally {
      await client.query("select pg_advisory_unlock($1)", [KHOA_DONG_BO_GIA]).catch(() => {});
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  } finally {
    await client?.end().catch(() => {});
  }
}
