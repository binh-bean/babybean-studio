/**
 * Ảnh bìa nhỏ đầu hàng cho các bảng/danh sách quản trị — BB-303 (bản vẽ
 * BB-301, admin duyệt 28/09/2026, XONG.md mục 3):
 *
 *   "Ảnh bìa nhỏ đầu hàng: LUÔN hiện (bìa khách chọn → chưa có thì tấm đầu,
 *   qua bộ đệm ảnh)."
 *
 * OWNER: DEV-BE (`src/lib/selection/**`).
 *
 * Dùng ở danh sách Bộ ảnh (`gallery-list.tsx`) và khối "Việc hôm nay" của
 * Bảng điều khiển (`dashboard.tsx`) — MỘT hàm duy nhất, để hai nơi không tự
 * suy ra hai luật "tấm đầu" khác nhau.
 *
 * Nhận `admin` (service-role client) làm THAM SỐ, không tự gọi
 * `createAdminClient()` — client đó chỉ được KHỞI TẠO trong `src/app/api/**`
 * (xem cảnh báo đầu `src/lib/supabase/admin.ts`); hàm ở đây chỉ mượn client đã
 * có sẵn của route gọi nó, giống cách `getGalleryContractSummary()`
 * (`src/lib/selection/contract.ts`) đã làm.
 *
 * Vì sao KHÔNG một câu truy vấn `IN (...)` duy nhất cho "tấm đầu mỗi bộ":
 * Supabase/PostgREST không có `DISTINCT ON`. Tải hết mọi ảnh active của một lô
 * bộ ảnh lớn (một bộ có thể hơn 1.000 ảnh, xem ghi chú ở `/api/img`) chỉ để
 * lấy đúng MỘT tấm mỗi bộ là phí — mỗi bộ một câu `limit(1)` theo
 * `idx_photos_gallery_sort` (đã có sẵn, xem db/schema.sql) rẻ hơn nhiều, và
 * chạy song song bằng `Promise.all`.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface BoAnhCanTimBia {
  id: string;
  coverPhotoId: string | null;
}

/** `Map<galleryId, photoId | null>` — `null` = bộ chưa có ảnh nào (chưa đồng bộ), màn hình tự vẽ ô màu trơn thay vì gọi `/api/img` với id rỗng. */
export async function anhBiaTheoBo(
  admin: AdminClient,
  danhSach: BoAnhCanTimBia[],
): Promise<Map<string, string | null>> {
  const ket = new Map<string, string | null>();
  const canTimTamDau: string[] = [];

  for (const g of danhSach) {
    if (g.coverPhotoId) {
      ket.set(g.id, g.coverPhotoId);
    } else {
      canTimTamDau.push(g.id);
    }
  }
  if (canTimTamDau.length === 0) return ket;

  const ketQua = await Promise.all(
    canTimTamDau.map(async (galleryId) => {
      const { data, error } = await admin
        .from("photos")
        .select("id")
        .eq("gallery_id", galleryId)
        .eq("status", "active")
        .order("sort_index", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        // Lỗi đọc bìa của MỘT bộ không được kéo sập cả danh sách — coi như
        // chưa có ảnh, ô bìa vẽ trơn.
        console.error(
          JSON.stringify({ evt: "anh_bia_theo_bo_failed", galleryId, loi: error.message }),
        );
        return { galleryId, photoId: null as string | null };
      }
      return { galleryId, photoId: (data?.id as string | undefined) ?? null };
    }),
  );

  for (const { galleryId, photoId } of ketQua) ket.set(galleryId, photoId);
  return ket;
}
