/**
 * BB-334A — xác thực mã trong đường dẫn `/api/k/<mã>/…` cho manifest và icon.
 *
 * Như BB-213 (`xacThucTokenBoAnh`): hệ điều hành gọi manifest/icon lúc "Thêm
 * vào màn hình chính" mà không chắc kèm cookie, nên quyền đến từ CHÍNH MÃ.
 * Chỉ link `active` và chưa hết hạn. Trả `null` cho MỌI lý do không dùng được.
 *
 * Link gia đình: tên "Nhà bé …" (anh chốt Q7 ★), icon = bìa của bộ MỚI NHẤT có
 * bìa (còn active, có drive_file_id); không bộ nào có bìa → logo.
 * Link cũ theo bộ mở qua /k/: tên + bìa của ĐÚNG bộ đó (không thêm quyền).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";
import type { BiaCanCat } from "@/lib/gallery/bia-vuong-server";
import { traLinkTheoMa, linkDungDuoc } from "@/lib/gia-dinh/link-gia-dinh";
import { danhSachBoAnhGiaDinh, tenNhaTuDanhSach } from "@/lib/gia-dinh/bo-anh-gia-dinh";

export interface NhaTheoMa {
  tenNha: string;
  tenNgan: string;
  bia: BiaCanCat | null;
}

export async function xacThucMaNha(ma: string): Promise<NhaTheoMa | null> {
  const admin = createAdminClient();
  const link = await traLinkTheoMa(admin, ma);
  if (!linkDungDuoc(link)) return null;

  if (!link!.customer_id) {
    const bo = await xacThucTokenBoAnh(ma);
    if (!bo) return null;
    return {
      tenNha: bo.tenBe ? `${bo.tenNgan} · Baby Bean` : "Baby Bean Studio",
      tenNgan: bo.tenNgan,
      bia: { galleryId: bo.galleryId, coverPhotoId: bo.coverPhotoId, coverDriveFileId: bo.coverDriveFileId },
    };
  }

  const ds = await danhSachBoAnhGiaDinh(admin, link!.customer_id);
  const { tenNha, tenNgan } = tenNhaTuDanhSach(ds);

  // Bộ mới nhất trước (theo lúc tạo — "bộ mới" là bộ vừa về, kể cả chưa gắn ngày chụp).
  const theoMoi = [...ds].sort((a, b) => b._taoLuc.localeCompare(a._taoLuc));
  let bia: BiaCanCat | null = null;
  for (const bo of theoMoi) {
    if (!bo.anhBiaId) continue;
    const { data: anh } = await admin
      .from("photos")
      .select("id, drive_file_id")
      .eq("id", bo.anhBiaId)
      .eq("gallery_id", bo.id)
      .eq("status", "active")
      .maybeSingle();
    if (anh?.drive_file_id) {
      bia = { galleryId: bo.id, coverPhotoId: anh.id as string, coverDriveFileId: anh.drive_file_id as string };
      break;
    }
  }
  return { tenNha, tenNgan, bia };
}
