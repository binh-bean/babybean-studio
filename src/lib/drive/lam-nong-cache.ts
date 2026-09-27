/**
 * Làm nóng bộ đệm ảnh (Storage) cho một bộ ảnh, theo lô nhỏ.
 *
 * OWNER: DEV-INT. Task BB-286.
 * Dùng chung bởi hai nơi gọi: (1) `POST /api/admin/galleries/[id]/share-link`
 * khi CSKH tạo link cho khách (BB-127), (2) nút "Làm nóng ảnh" ở màn chi tiết
 * bộ ảnh quản trị (`POST /api/admin/galleries/[id]/lam-nong-anh`).
 *
 * ---------------------------------------------------------------------------
 * Vì sao chia LÔ nhỏ — GIẢ ĐỊNH HẠ TẦNG: gói MIỄN PHÍ
 * ---------------------------------------------------------------------------
 * GIẢ ĐỊNH HẠ TẦNG (đính chính 27/09/2026): app chạy trên **Vercel Hobby** và
 * **Supabase Free** — KHÔNG phải Pro. Hobby giới hạn thời gian một lần gọi
 * hàm (`maxDuration` tối đa 60 giây trên Hobby, mặc định 10 giây), chỉ cho 2
 * cron/ngày, và băng thông/số lần gọi hàm có hạn. Một bộ 1.235 ảnh, mỗi ảnh
 * một lượt gọi Drive + một lượt ghi Storage, không thể xong trong một lần
 * gọi hàm — nên `lamNongMotLo` xử lý ĐÚNG MỘT LÔ nhỏ (mặc định 40 ảnh, xem
 * `KICH_THUOC_LO_LAM_NONG`) rồi trả về con trỏ (`conTroTiep`, cùng kiểu
 * `sort_index` như các đường phân trang khác trong dự án — xem
 * `/api/admin/galleries/[id]/photos`); phía gọi (route hoặc trình duyệt) TỰ
 * LẶP LẠI tới khi `conAnhChuaXuLy` là false. Xem `lamNongAnh()` trong
 * `gallery-detail.tsx` — trình duyệt gọi lặp route `lam-nong-anh` theo đúng
 * mẫu này.
 *
 * Con trỏ còn một lợi ích thứ hai, không liên quan tới Hobby: tự phục hồi khi
 * Drive báo lỗi quota giữa chừng — dừng đúng chỗ, gọi lại chỉ làm nốt phần
 * còn thiếu, không làm lại từ đầu.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không cần bảng mới để đo tiến độ
 * ---------------------------------------------------------------------------
 * Ảnh đã nong nằm sẵn trong bảng Storage dưới đường dẫn `<photoId>/<w>.jpg`
 * (cùng quy ước với `/api/img`). Lô nào cũng đọc thẳng Storage để biết ảnh đã
 * có chưa (`daCoTrongDem`) rồi mới quyết định có gọi Drive không — bỏ qua tấm
 * đã có, không nong lại. Tiến độ tổng ("đã nóng N/M") suy ra từ `conTroTiep`
 * (đã xử lý AN TOÀN tới sort_index nào) so với `photo_count` sẵn có trên
 * `galleries` — không cần đếm lại toàn bộ Storage mỗi lần.
 *
 * ---------------------------------------------------------------------------
 * Tôn trọng quota Drive
 * ---------------------------------------------------------------------------
 * `driveFetch()` đã tự lo backoff/retry cho TỪNG lượt gọi (xem
 * `src/lib/drive/client.ts`). Lớp này thêm hai lớp nữa:
 *   - Giới hạn SONG SONG trong một lô (`SO_SONG_SONG_TOI_DA_LAM_NONG`), không
 *     bắn hết cả lô cùng lúc.
 *   - Gặp `DriveUnavailableError` (nghĩa là `driveFetch` đã thử hết
 *     `MAX_ATTEMPTS` mà vẫn hỏng — dấu hiệu quota cạn hoặc Drive sập) thì
 *     DỪNG NGAY, không khởi động thêm lượt gọi Drive nào trong lô này. Ảnh
 *     gặp lỗi quota không được coi là "đã xử lý" — lượt gọi kế tiếp thử lại
 *     đúng ảnh đó.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveFetch, DriveUnavailableError, DriveAccessDeniedError } from "@/lib/drive/client";

/** Cỡ ảnh được làm nóng — khớp cỡ lưới ảnh khách xem đầu tiên (BB-137). */
export const CO_ANH_LAM_NONG = 800;

/**
 * Số ảnh xử lý mỗi lượt gọi. Nhỏ CỐ Ý — gói Hobby giới hạn thời gian hàm
 * (`maxDuration` tối đa 60s ở các route gọi hàm này). 40 ảnh × (một lượt
 * Drive + một lượt ghi Storage, có backoff khi 429/5xx) vẫn có thể chạm 60s
 * nếu Drive chậm; con số này ưu tiên AN TOÀN hơn tốc độ — xem đầu tệp.
 */
export const KICH_THUOC_LO_LAM_NONG = 40;

/** Số lượt gọi Drive chạy song song trong một lô. */
export const SO_SONG_SONG_TOI_DA_LAM_NONG = 4;

type AnhCanNong = { id: string; drive_file_id: string; sort_index: number };

interface KetQuaMotAnh {
  ketQua: "da_co_san" | "moi_nong" | "loi";
  loiQuota: boolean;
}

async function daCoTrongDem(
  client: SupabaseClient,
  photoId: string,
  width: number,
): Promise<boolean> {
  try {
    const { data } = await client.storage.from("thumbnails").list(photoId, {
      limit: 1,
      search: `${width}.jpg`,
    });
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Đọc đệm hỏng thì cứ coi như chưa có — tốn thêm một lượt gọi Drive thừa,
    // không hại gì hơn.
    return false;
  }
}

async function nongMotAnh(
  client: SupabaseClient,
  photo: AnhCanNong,
  width: number,
  requestId: string,
): Promise<KetQuaMotAnh> {
  if (await daCoTrongDem(client, photo.id, width)) {
    return { ketQua: "da_co_san", loiQuota: false };
  }

  const url = `https://lh3.googleusercontent.com/d/${photo.drive_file_id}=w${width}`;

  try {
    const res = await driveFetch(url, {}, { requestId });
    if (!res.ok) return { ketQua: "loi", loiQuota: false };

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("Content-Type") || "image/jpeg";
    const cachePath = `${photo.id}/${width}.jpg`;
    const storage = client.storage.from("thumbnails");

    const upRes = await storage.upload(cachePath, buffer, { contentType, upsert: true });
    if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
      await client.storage.createBucket("thumbnails", { public: false });
      const retry = await storage.upload(cachePath, buffer, { contentType, upsert: true });
      if (retry.error) return { ketQua: "loi", loiQuota: false };
    } else if (upRes.error) {
      console.error(
        JSON.stringify({ evt: "lam_nong.ghi_dem_that_bai", requestId, photoId: photo.id, loi: upRes.error.message }),
      );
      return { ketQua: "loi", loiQuota: false };
    }

    return { ketQua: "moi_nong", loiQuota: false };
  } catch (err) {
    const loiQuota = err instanceof DriveUnavailableError;
    if (!(err instanceof DriveAccessDeniedError) && !loiQuota) {
      console.error(
        JSON.stringify({ evt: "lam_nong.drive_that_bai", requestId, photoId: photo.id, loi: String(err) }),
      );
    }
    return { ketQua: "loi", loiQuota };
  }
}

export interface KetQuaLamNongMotLo {
  /** sort_index của ảnh cuối cùng đã xử lý AN TOÀN — dùng làm con trỏ cho lượt gọi kế tiếp. */
  conTroTiep: number;
  soDaXuLyLoNay: number;
  soDaCoSanLoNay: number;
  soMoiNongLoNay: number;
  soLoiLoNay: number;
  /** true = còn ảnh chưa xử lý, gọi lại với `sauSortIndex = conTroTiep`. */
  conAnhChuaXuLy: boolean;
  /** Lô này dừng sớm vì Drive báo lỗi liên tục (quota cạn / mất kết nối). */
  dungVìQuota: boolean;
  tongSoAnh: number;
}

/**
 * Chạy đúng MỘT LÔ. Gọi lặp lại (route hoặc trình duyệt tự lặp) tới khi
 * `conAnhChuaXuLy` là false.
 */
export async function lamNongMotLo(
  client: SupabaseClient,
  galleryId: string,
  sauSortIndex: number,
  requestId: string,
  width: number = CO_ANH_LAM_NONG,
  kichThuocLo: number = KICH_THUOC_LO_LAM_NONG,
): Promise<KetQuaLamNongMotLo> {
  const { data: gallery } = await client
    .from("galleries")
    .select("photo_count")
    .eq("id", galleryId)
    .maybeSingle();
  const tongSoAnh = (gallery as { photo_count?: number } | null)?.photo_count ?? 0;

  const { data: photos } = await client
    .from("photos")
    .select("id, drive_file_id, sort_index")
    .eq("gallery_id", galleryId)
    .eq("status", "active")
    .gt("sort_index", sauSortIndex)
    .order("sort_index", { ascending: true })
    .limit(kichThuocLo + 1);

  const rows = (photos ?? []) as AnhCanNong[];
  const coTiepTheo = rows.length > kichThuocLo;
  const lo = coTiepTheo ? rows.slice(0, kichThuocLo) : rows;

  if (lo.length === 0) {
    return {
      conTroTiep: sauSortIndex,
      soDaXuLyLoNay: 0,
      soDaCoSanLoNay: 0,
      soMoiNongLoNay: 0,
      soLoiLoNay: 0,
      conAnhChuaXuLy: false,
      dungVìQuota: false,
      tongSoAnh,
    };
  }

  let conTroTiep = sauSortIndex;
  let soDaCoSan = 0;
  let soMoiNong = 0;
  let soLoi = 0;
  let dungVìQuota = false;
  let idx = 0;

  while (idx < lo.length && !dungVìQuota) {
    const nhom = lo.slice(idx, idx + SO_SONG_SONG_TOI_DA_LAM_NONG);
    const ketQuaNhom = await Promise.all(
      nhom.map(async (anh) => ({ anh, kq: await nongMotAnh(client, anh, width, requestId) })),
    );

    for (const { anh, kq } of ketQuaNhom) {
      if (kq.ketQua === "loi" && kq.loiQuota) {
        dungVìQuota = true;
        break; // Không đếm ảnh này là đã xử lý — thử lại ở lượt sau.
      }
      if (kq.ketQua === "da_co_san") soDaCoSan++;
      else if (kq.ketQua === "moi_nong") soMoiNong++;
      else soLoi++;
      conTroTiep = anh.sort_index;
    }

    idx += nhom.length;
  }

  const soDaXuLy = soDaCoSan + soMoiNong + soLoi;

  return {
    conTroTiep,
    soDaXuLyLoNay: soDaXuLy,
    soDaCoSanLoNay: soDaCoSan,
    soMoiNongLoNay: soMoiNong,
    soLoiLoNay: soLoi,
    conAnhChuaXuLy: coTiepTheo || idx < lo.length,
    dungVìQuota,
    tongSoAnh,
  };
}
