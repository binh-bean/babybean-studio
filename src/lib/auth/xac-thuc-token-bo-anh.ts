import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { bamMaLink } from "./bam-ma-link";

export interface BoAnhTheoToken {
  galleryId: string;
  /** Tên bé hiển thị lên biểu tượng/tiêu đề; null khi chưa gắn bé hoặc chưa có tên. */
  tenBe: string | null;
  /** drive_file_id của ảnh bìa; null khi bộ ảnh chưa có tấm nào (đang đồng bộ). */
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

  let tenBe: string | null = null;
  if (gallery.baby_id) {
    const { data: baby } = await admin
      .from("babies")
      .select("full_name, nickname")
      .eq("id", gallery.baby_id)
      .maybeSingle();
    tenBe = baby?.nickname || baby?.full_name || null;
  }

  // Ảnh bìa: cover_photo_id nếu còn active, không thì tấm đầu theo sort_index —
  // đúng luật đã dùng ở BiaBoAnh phía màn khách (BB-215 gán cover_photo_id).
  let coverDriveFileId: string | null = null;
  if (gallery.cover_photo_id) {
    const { data: anhBia } = await admin
      .from("photos")
      .select("drive_file_id")
      .eq("id", gallery.cover_photo_id)
      .eq("status", "active")
      .maybeSingle();
    coverDriveFileId = anhBia?.drive_file_id ?? null;
  }

  if (!coverDriveFileId) {
    const { data: anhDau } = await admin
      .from("photos")
      .select("drive_file_id")
      .eq("gallery_id", gallery.id)
      .eq("status", "active")
      .order("sort_index", { ascending: true })
      .limit(1)
      .maybeSingle();
    coverDriveFileId = anhDau?.drive_file_id ?? null;
  }

  return { galleryId: gallery.id, tenBe, coverDriveFileId };
}
