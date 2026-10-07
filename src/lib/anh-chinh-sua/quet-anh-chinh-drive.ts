/**
 * BB-392 mục 2 — phần chạm Drive / cơ sở dữ liệu thật của lượt quét ảnh chỉnh
 * (cron hậu kỳ 08:00). Luật chọn bộ + vòng lặp ở `quet-anh-chinh.ts` (thuần,
 * có phép thử); tệp này chỉ là hai hàm "thật" truyền vào đó.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveFetch } from "@/lib/drive/client";
import { batDauDongBo, dongBoBoAnh, ghiLoiDongBo } from "@/lib/drive/sync-gallery";
import { laThuMucChinhSua } from "./nhan-dien";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * MỘT lệnh Drive: liệt kê thư mục con trực tiếp (chỉ thư mục, không ảnh) của
 * thư mục bộ ảnh, xem có cái nào là "ảnh chỉnh sửa". Cùng độ sâu với
 * `listImageFiles` (thư mục bộ + một tầng con).
 */
export async function coThuMucChinhSuaTrenDrive(driveFolderId: string, requestId: string): Promise<boolean> {
  const res = await driveFetch(
    "/files",
    {
      q: `'${driveFolderId}' in parents and trashed = false and mimeType = '${FOLDER_MIME}'`,
      fields: "files(id,name)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    },
    { requestId, folderId: driveFolderId },
  );
  const body = (await res.json()) as { files?: { name?: string }[] };
  return (body.files ?? []).some((f) => laThuMucChinhSua(f.name));
}

/**
 * Kéo ảnh về bằng ĐÚNG đường của nút "Đồng bộ ảnh" (route /sync): đánh dấu,
 * đồng bộ, lỗi thì ghi lên bộ cho nhân viên thấy. Bộ đang ở giai đoạn chỉnh
 * nên trạng thái bộ KHÔNG đổi (luật 3 của sync-gallery.ts); ảnh chỉnh chờ CSKH
 * bấm "Gửi khách duyệt".
 */
export async function keoAnhChinhVeApp(
  db: SupabaseClient,
  galleryId: string,
  requestId: string,
): Promise<{ photoCount: number }> {
  const thongTin = await batDauDongBo(db, galleryId);
  try {
    const r = await dongBoBoAnh(db, galleryId, thongTin, requestId);
    return { photoCount: r.photoCount };
  } catch (err) {
    await ghiLoiDongBo(db, galleryId, thongTin.giaiDoanDau, err);
    throw err;
  }
}
