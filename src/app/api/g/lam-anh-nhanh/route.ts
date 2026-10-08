/**
 * POST /api/g/lam-anh-nhanh — ba mẹ mua "Làm ảnh nhanh" SAU khi đã chốt danh sách (thẻ trên màn
 * cảm ơn / màn chờ), trước khi studio gửi ảnh chỉnh.
 *
 * OWNER: DEV-BE. Task BB-399 (anh chốt 08/10/2026: tiêu chuẩn 14 ngày, làm nhanh 5 ngày, giá
 * lấy từ Lark).
 *
 * Luật (xem `xetMuaSauChot` trong src/lib/dich-vu/lam-anh-nhanh.ts):
 *   · Chỉ người nhận link chính (owner) — tiền là của người đứng hợp đồng.
 *   · Bộ phải ĐÃ chốt đợt 1 (chưa chốt thì tích ô ở hộp chốt).
 *   · Không có sản phẩm đang bán → từ chối; đã mua → không bán lần hai; studio đã gửi ảnh chỉnh
 *     (qua `in_retouch`) → từ chối.
 *   · Giá đọc từ `products.list_price` lúc bấm, không nhận giá từ trình duyệt. Ghi một dòng
 *     `selection_addons` (đợt 1, không ảnh) — đi đúng luồng tiền sản phẩm + đối chiếu hoá đơn.
 *   · Báo CSKH qua Lark SAU khi ghi xong (`enqueueLarkNotification` không bao giờ ném và tự
 *     chặn khi đang chạy phép thử — không gửi Lark thật).
 */
import { vi } from "@/i18n";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueLarkNotification } from "@/lib/lark/notify";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { tinhHanTra, xetMuaSauChot, type LyDoKhongBan } from "@/lib/dich-vu/lam-anh-nhanh";
import { daMuaCuaBo, docCaiDatLamNhanh, ghiMuaLamNhanh, timSanPhamLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh-server";

export const runtime = "nodejs";

const CAU_LOI: Record<LyDoKhongBan, string> = {
  khong_co_san_pham: vi.gallery.lamNhanh.loiKhongCoSanPham,
  da_mua: vi.gallery.lamNhanh.loiDaMua,
  qua_giai_doan: vi.gallery.lamNhanh.loiQuaGiaiDoan,
  tam_dung: vi.gallery.lamNhanh.loiTamDung,
};

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    if (session.role !== "owner") return fail("FORBIDDEN", vi.gallery.lamNhanh.loiChiNguoiChinh);

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, title, status")
      .eq("id", session.galleryId)
      .single();
    if (gErr || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    const { data: sel, error: sErr } = await admin
      .from("selections")
      .select("id, submitted_at")
      .eq("id", session.selectionId)
      .maybeSingle();
    if (sErr) throw sErr;
    const chotLuc = (sel as { submitted_at?: string | null } | null)?.submitted_at ?? null;
    if (!chotLuc) {
      // Chưa chốt: ô làm nhanh nằm ở hộp chốt danh sách.
      return fail("CONFLICT", vi.gallery.lamNhanh.loiQuaGiaiDoan);
    }

    const caiDat = await docCaiDatLamNhanh(admin, (gallery.branch_id as string | null) ?? null);
    const [daMua, sanPham] = await Promise.all([
      daMuaCuaBo(admin, gallery.id as string, session.selectionId, caiDat.cacGhim),
      timSanPhamLamNhanh(admin, caiDat.ghim),
    ]);
    const xet = xetMuaSauChot({ coSanPham: !!sanPham, daMua: !!daMua, trangThaiBo: String(gallery.status), bat: caiDat.bat });
    if (!xet.ok) return fail("CONFLICT", CAU_LOI[xet.lyDo], { lyDo: xet.lyDo });

    const ghi = await ghiMuaLamNhanh(admin, { selectionId: session.selectionId, sanPham: sanPham!, dot: 1 });
    if (!ghi) return fail("CONFLICT", CAU_LOI.da_mua, { lyDo: "da_mua" });

    const muaLuc = new Date().toISOString();
    const han = tinhHanTra({
      chotLuc,
      lamNhanh: true,
      muaNhanhLuc: muaLuc,
      soNgayTieuChuan: caiDat.soNgayTieuChuan,
      soNgayNhanh: caiDat.soNgayNhanh,
    });

    await ghiNhatKy({
      actorType: "customer",
      actorId: session.selectionId,
      actorLabel: "Customer",
      branchId: (gallery.branch_id as string | null) ?? null,
      action: "addon.lam_anh_nhanh",
      entityType: "gallery",
      entityId: gallery.id as string,
      galleryId: gallery.id as string,
      metadata: { addonId: ghi.id, productId: sanPham!.id, unitPrice: ghi.donGia, soNgay: caiDat.soNgayNhanh },
    });

    await phatSuKienBoAnh({
      galleryId: gallery.id as string,
      branchId: (gallery.branch_id as string | null) ?? null,
      loai: LOAI_TUC_THI.khachMuaThem,
    });

    await enqueueLarkNotification({
      branchId: (gallery.branch_id as string | null) ?? null,
      event: "dich_vu.lam_nhanh",
      payload: {
        galleryId: gallery.id,
        galleryTitle: gallery.title,
        // Khoá tránh chữ "anh" — locBoAnh cắt theo tên khoá ("nhanh" cũng dính).
        lamGapNgay: caiDat.soNgayNhanh,
        donGia: ghi.donGia,
        hanTraDuKien: han.hanTra,
      },
    });

    return ok({ soNgay: caiDat.soNgayNhanh, gia: ghi.donGia, hanTra: han.hanTra });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
