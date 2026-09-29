import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bamMaLink } from "./bam-ma-link";
import { tenNganManHinhChinh, tinhTenBiaTuDuLieu } from "@/lib/utils/dinh-dang";

export interface BoAnhTheoToken {
  galleryId: string;
  /**
   * Tên bé theo `tinhTenBiaTuDuLieu` ("Bé Xoài" / họ tên đầy đủ); null khi
   * chưa gắn bé hoặc chưa có tên.
   */
  tenBe: string | null;
  /**
   * BB-324 — tên ngắn dưới biểu tượng màn hình chính (`tenNganManHinhChinh`):
   * "Bé Xoài", "Bé Bảo An", hoặc "Baby Bean" khi không có tên bé.
   */
  tenNgan: string;
  /** id ảnh bìa ĐÃ CHỌN (`galleries.cover_photo_id`, còn active); null khi chưa có. */
  coverPhotoId: string | null;
  /** drive_file_id của ảnh bìa đã chọn; null khi chưa có bìa → dùng logo Baby Bean. */
  coverDriveFileId: string | null;
}

/**
 * Xác thực mã link 22 ký tự lấy TRỰC TIẾP TỪ ĐƯỜNG DẪN (không qua cookie
 * phiên) và trả về đúng những gì cần để dựng icon/manifest riêng theo bộ ảnh.
 *
 * Dùng cho BB-213: manifest và icon màn hình chính của `/g/<token>` được
 * trình duyệt/hệ điều hành gọi thẳng (không chắc luôn kèm cookie), nên quyền
 * xem phải tự đứng được bằng chính mã trong đường dẫn — giống hệt luật ở
 * `/api/auth/gallery` (BB-183): CHỈ link `status = active` VÀ chưa hết hạn.
 *
 * Trả `null` cho MỌI lý do không dùng được (sai mã / đã thu hồi / hết hạn /
 * link kiểu cổng khách chưa gắn bộ ảnh nào) — cố tình không phân biệt ra
 * ngoài, đúng luật "sai mã / đã thu hồi / hết hạn thì 404, không tiết lộ gì"
 * của BB-213. Nơi gọi hàm này (route icon/manifest, generateMetadata) tự
 * quyết định 404 hay dùng giá trị mặc định.
 */
export async function xacThucTokenBoAnh(token: string): Promise<BoAnhTheoToken | null> {
  if (!token) return null;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from("share_links")
    .select("gallery_id, status, expires_at")
    .eq("token_hash", await bamMaLink(token))
    .maybeSingle();

  const dungDuoc =
    !!link &&
    !!link.gallery_id &&
    link.status === "active" &&
    (!link.expires_at || new Date(link.expires_at) > new Date());

  if (!dungDuoc || !link?.gallery_id) return null;

  const { data: gallery } = await admin
    .from("galleries")
    .select("id, baby_id, cover_photo_id")
    .eq("id", link.gallery_id)
    .maybeSingle();

  if (!gallery) return null;

  let bietDanh: string | null = null;
  let hoTen: string | null = null;
  if (gallery.baby_id) {
    const { data: baby } = await admin
      .from("babies")
      .select("full_name, nickname")
      .eq("id", gallery.baby_id)
      .maybeSingle();
    bietDanh = (baby?.nickname as string | null) ?? null;
    hoTen = (baby?.full_name as string | null) ?? null;
  }
  const tenBe = tinhTenBiaTuDuLieu(bietDanh, hoTen) || null;
  const tenNgan = tenNganManHinhChinh(bietDanh, hoTen);

  // BB-324 — ảnh bìa là ĐÚNG tấm đã chọn (`cover_photo_id`, do màn thiết kế
  // bìa hoặc lần đồng bộ đầu gán) và còn active. Trước bản vá, thiếu bìa thì
  // lấy "tấm đầu theo sort_index" — biểu tượng màn hình chính ra một ảnh bất
  // kỳ. Nay thiếu bìa thì trả null để nơi gọi dùng logo Baby Bean.
  let coverPhotoId: string | null = null;
  let coverDriveFileId: string | null = null;
  if (gallery.cover_photo_id) {
    const { data: anhBia } = await admin
      .from("photos")
      .select("id, drive_file_id")
      .eq("id", gallery.cover_photo_id)
      .eq("gallery_id", gallery.id)
      .eq("status", "active")
      .maybeSingle();
    if (anhBia?.drive_file_id) {
      coverPhotoId = anhBia.id as string;
      coverDriveFileId = anhBia.drive_file_id as string;
    }
  }

  return { galleryId: gallery.id, tenBe, tenNgan, coverPhotoId, coverDriveFileId };
}
