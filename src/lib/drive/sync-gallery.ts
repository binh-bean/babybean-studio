/**
 * Đồng bộ ảnh của MỘT bộ ảnh từ Drive xuống cơ sở dữ liệu.
 *
 * OWNER: PM. Task BB-126.
 * Spec: docs/06-drive-integration.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao logic nằm ở đây chứ không trong route
 * ---------------------------------------------------------------------------
 * Route `POST /api/admin/galleries/[id]/sync` chạy qua `after()` — bắn đi rồi
 * quên, hợp cho CSKH bấm một bộ. Nhưng 433 bộ ảnh thật thì không ai bấm 433
 * lần, nên phải có đường chạy hàng loạt.
 *
 * `scripts/sync-drive.ts` từ đầu đã ghi: *"dùng chung mã dịch vụ với route —
 * đừng chép lại logic ở đây"*. Tuần này dự án vừa trả giá cho sáu bản chép tay
 * của một danh sách trạng thái, trong đó hai bản là lỗ hổng thật. Nên logic
 * chuyển hẳn vào đây; route và script cùng gọi một hàm.
 *
 * ---------------------------------------------------------------------------
 * Ba luật giữ nguyên từ bản trong route
 * ---------------------------------------------------------------------------
 * 1. Ảnh CSKH đã ẩn thì đồng bộ lại vẫn ẩn. Hiện lại một tấm nhân viên đã cố ý
 *    giấu là đưa cho khách xem đúng tấm studio không muốn khách xem.
 * 2. Ảnh biến mất khỏi Drive KHÔNG bị xoá, chỉ đánh dấu `missing`. Khách có
 *    thể đã chọn tấm đó rồi; xoá dòng là mất luôn lựa chọn của khách.
 * 3. Chỉ đổi trạng thái bộ ảnh khi nó còn ở giai đoạn đầu. Đồng bộ lại một bộ
 *    khách đang chọn mà đẩy nó về `ready` là xoá mất chỗ đang đứng.
 *
 * ---------------------------------------------------------------------------
 * Luật thứ tư, thêm ngày 14.09.2026
 * ---------------------------------------------------------------------------
 * KHÔNG đánh dấu "sẵn sàng gửi khách" khi thư mục không có tấm ảnh nào.
 *
 * Đây là lớp chặn thứ hai. Lớp thứ nhất là `assertFolderReadable`: một thư mục
 * không đọc được thì lệnh liệt kê của Drive trả 200 kèm danh sách RỖNG, không
 * trả lỗi. Ba bộ đầu tiên chạy thử rơi đúng vào đó và bị đánh dấu `ready` với
 * 0 ảnh.
 *
 * Lớp thứ nhất bịt đúng nguyên nhân đã biết. Lớp này bịt cả hình dạng của hậu
 * quả: dù vì lý do gì mà không có ảnh nào, bộ ảnh cũng không được phép sang
 * trạng thái gửi khách được. Khách mở link thấy trang trắng rồi gọi điện hỏi
 * studio làm mất ảnh của con mình — cái giá của một lỗi im lặng ở đây cao hơn
 * hẳn một mẻ đồng bộ phải chạy lại.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listImageFiles } from "./list-files";
import { DriveAccessDeniedError, DriveUnavailableError } from "./client";

/** Trạng thái mà đồng bộ được phép đổi. Ngoài danh sách này thì giữ nguyên. */
const GIAI_DOAN_DAU = ["draft", "syncing", "sync_error"];

const CHUNK = 500;

export interface SyncResult {
  galleryId: string;
  photoCount: number;
  them: number;
  capNhat: number;
  mat: number;
}

export class EmptyFolderError extends Error {
  readonly code = "EMPTY_FOLDER" as const;
  constructor() {
    super("Thư mục không có tấm ảnh nào — kiểm tra link và quyền chia sẻ");
    this.name = "EmptyFolderError";
  }
}

export class GalleryNotFoundError extends Error {
  readonly code = "NOT_FOUND" as const;
  constructor(galleryId: string) {
    super(`Không tìm thấy bộ ảnh ${galleryId}`);
    this.name = "GalleryNotFoundError";
  }
}

/** Câu tiếng Việt cho nhân viên đọc, từ lỗi kỹ thuật. */
export function moTaLoi(err: unknown): string {
  if (err instanceof DriveAccessDeniedError) return "Thư mục chưa được chia sẻ công khai";
  if (err instanceof EmptyFolderError) return "Thư mục không có tấm ảnh nào";
  if (err instanceof DriveUnavailableError) return "Drive không khả dụng";
  if (err instanceof Error) return err.message;
  return "Lỗi đồng bộ";
}

/**
 * Đánh dấu bộ ảnh đang đồng bộ. Gọi TRƯỚC khi chạy, để màn hình thấy ngay.
 * Trả về true nếu bộ này đang ở giai đoạn đầu (được phép đổi trạng thái).
 */
export async function batDauDongBo(
  db: SupabaseClient,
  galleryId: string,
): Promise<{ driveFolderId: string; coverPhotoId: string | null; giaiDoanDau: boolean }> {
  const { data: gallery } = await db
    .from("galleries")
    .select("drive_folder_id, cover_photo_id, status")
    .eq("id", galleryId)
    .maybeSingle();

  if (!gallery) throw new GalleryNotFoundError(galleryId);

  const giaiDoanDau = GIAI_DOAN_DAU.includes(gallery.status);
  const capNhat: Record<string, unknown> = { sync_error: null };
  if (giaiDoanDau) capNhat.status = "syncing";

  const { error } = await db.from("galleries").update(capNhat).eq("id", galleryId);
  if (error) throw error;

  return {
    driveFolderId: gallery.drive_folder_id,
    coverPhotoId: gallery.cover_photo_id,
    giaiDoanDau,
  };
}

/** Ghi lỗi lên bộ ảnh để nhân viên nhìn thấy, thay vì chỉ nằm trong nhật ký. */
export async function ghiLoiDongBo(
  db: SupabaseClient,
  galleryId: string,
  giaiDoanDau: boolean,
  err: unknown,
): Promise<void> {
  const capNhat: Record<string, unknown> = { sync_error: moTaLoi(err) };
  if (giaiDoanDau) capNhat.status = "sync_error";
  await db.from("galleries").update(capNhat).eq("id", galleryId);
}

/**
 * Chạy đồng bộ. Ném lỗi ra ngoài để chỗ gọi quyết định ghi lỗi thế nào —
 * route ghi rồi trả 202, script ghi rồi đi tiếp sang bộ sau.
 */
export async function dongBoBoAnh(
  db: SupabaseClient,
  galleryId: string,
  thongTin: { driveFolderId: string; coverPhotoId: string | null; giaiDoanDau: boolean },
  requestId: string,
): Promise<SyncResult> {
  const ctx = { requestId, folderId: thongTin.driveFolderId };
  const images = await listImageFiles(thongTin.driveFolderId, ctx);

  // Luật 4. Ném TRƯỚC khi ghi gì vào cơ sở dữ liệu: một bộ đang ở 'draft' thì
  // cứ để nguyên 'draft' còn hơn đẩy sang 'sync_error' rồi lại phải phân biệt
  // hai loại "chưa chạy" khi chạy lại cả mẻ.
  if (images.length === 0 && thongTin.giaiDoanDau) {
    throw new EmptyFolderError();
  }

  const { data: existing } = await db
    .from("photos")
    .select("id, drive_file_id, status")
    .eq("gallery_id", galleryId);

  const dangCo = new Map((existing ?? []).map((p) => [p.drive_file_id, p]));

  const them: Record<string, unknown>[] = [];
  const capNhat: Record<string, unknown>[] = [];
  const conTrenDrive = new Set<string>();

  images.forEach((img, i) => {
    conTrenDrive.add(img.id);
    const cu = dangCo.get(img.id);

    const dong = {
      gallery_id: galleryId,
      drive_file_id: img.id,
      file_name: img.name,
      mime_type: img.mimeType,
      size_bytes: img.size,
      width: img.width,
      height: img.height,
      taken_at: img.takenAt,
      subfolder: img.subfolder,
      sort_index: i + 1,
      // Luật 1: ảnh CSKH đã ẩn thì vẫn ẩn.
      status: cu && cu.status === "hidden" ? "hidden" : "active",
      drive_modified_at: img.modifiedAt,
    };

    if (cu) capNhat.push({ id: cu.id, ...dong });
    else them.push(dong);
  });

  // Luật 2: biến mất khỏi Drive thì đánh dấu, không xoá.
  const mat: string[] = [];
  for (const [driveId, p] of dangCo.entries()) {
    if (!conTrenDrive.has(driveId) && p.status !== "missing") mat.push(p.id);
  }

  for (let i = 0; i < them.length; i += CHUNK) {
    const { error } = await db.from("photos").insert(them.slice(i, i + CHUNK));
    if (error) throw error;
  }
  for (let i = 0; i < capNhat.length; i += CHUNK) {
    const { error } = await db
      .from("photos")
      .upsert(capNhat.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw error;
  }
  for (let i = 0; i < mat.length; i += CHUNK) {
    const { error } = await db
      .from("photos")
      .update({ status: "missing" })
      .in("id", mat.slice(i, i + CHUNK));
    if (error) throw error;
  }

  const ketThuc: Record<string, unknown> = {
    photo_count: conTrenDrive.size,
    last_synced_at: new Date().toISOString(),
  };
  // Luật 3: chỉ đổi trạng thái khi còn ở giai đoạn đầu.
  if (thongTin.giaiDoanDau) ketThuc.status = "ready";

  await db.from("galleries").update(ketThuc).eq("id", galleryId);

  const anhDau = images[0];
  if (!thongTin.coverPhotoId && anhDau) {
    const { data: photo } = await db
      .from("photos")
      .select("id")
      .eq("gallery_id", galleryId)
      .eq("drive_file_id", anhDau.id)
      .maybeSingle();
    if (photo) {
      await db.from("galleries").update({ cover_photo_id: photo.id }).eq("id", galleryId);
    }
  }

  return {
    galleryId,
    photoCount: conTrenDrive.size,
    them: them.length,
    capNhat: capNhat.length,
    mat: mat.length,
  };
}
