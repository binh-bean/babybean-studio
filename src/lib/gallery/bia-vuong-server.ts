/**
 * Icon màn hình chính cắt VUÔNG từ ảnh bìa — phần dùng chung của
 * `GET /api/g/<token>/bia-vuong` (BB-213, theo bộ) và `GET /api/k/<mã>/bia-vuong`
 * (BB-334A, theo nhà: bìa của bộ mới nhất có bìa).
 *
 * Tách nguyên văn từ route BB-213 ở BB-334A: luật không đổi — chưa có bìa hoặc
 * cắt không được thì trả LOGO (BB-324); hai chốt BB-311 trước khi ghi bộ đệm
 * dùng chung; `Cache-Control: private` vì phục vụ theo mã của một nhà.
 * Quyền xem là việc của route gọi (xác thực mã trong đường dẫn TRƯỚC khi gọi).
 */
import "server-only";
import { fail } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveFetch } from "@/lib/drive/client";
import { khongGhiDemPhepThu } from "@/lib/kiem-thu";
import { kiemAnhTruocKhiGhiDem } from "@/lib/drive/kiem-tra-anh";

export const ICON_SIZES = [180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];

export function parseSize(value: string | null): IconSize | null {
  const n = Number(value ?? 192);
  return (ICON_SIZES as readonly number[]).includes(n) ? (n as IconSize) : null;
}

/** Logo Baby Bean (hạt đậu) đúng cỡ — dùng khi chưa có bìa hoặc không cắt được bìa. */
const LOGO_THEO_CO: Record<IconSize, string> = {
  180: "/apple-touch-icon.png",
  192: "/icons/icon-192.png",
  512: "/icons/icon-512.png",
};

export function veLogo(request: Request, size: IconSize): Response {
  return Response.redirect(new URL(LOGO_THEO_CO[size], request.url), 302);
}

export interface BiaCanCat {
  galleryId: string;
  coverPhotoId: string | null;
  coverDriveFileId: string | null;
}

export async function phucVuBiaVuong(
  request: Request,
  bia: BiaCanCat,
  size: IconSize,
  requestId: string,
): Promise<Response> {
  // BB-324 — chưa chọn bìa: logo Baby Bean, không lấy một ảnh bất kỳ.
  if (!bia.coverDriveFileId || !bia.coverPhotoId) return veLogo(request, size);

  const supabase = createAdminClient();
  // Đệm theo GALLERY + ẢNH BÌA, không theo token: cấp lại link (mã mới) cho
  // cùng một bộ ảnh vẫn dùng chung icon đã cắt sẵn; đổi bìa thì khoá đổi theo.
  const cachePath = `icon/${bia.galleryId}/${bia.coverPhotoId}-${size}.jpg`;
  const storage = supabase.storage.from("thumbnails");

  const { data: cachedBlob } = await storage.download(cachePath);
  if (cachedBlob) {
    return new Response(cachedBlob, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        // "private": phục vụ theo MÃ của một nhà — CDN/proxy không được dùng
        // chung bản đệm này cho mã link khác.
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  let buffer: ArrayBuffer | null = null;
  // "-h<cỡ>-c" là tham số cắt vuông chính giữa có sẵn của Google (lh3) — dự án
  // không có sharp (luật BB-213).
  try {
    const res = await driveFetch(
      `https://lh3.googleusercontent.com/d/${bia.coverDriveFileId}=w${size}-h${size}-c`,
      {},
      { requestId },
    );
    if (res.ok) buffer = await res.arrayBuffer();
  } catch {
    // rơi xuống logo bên dưới
  }

  // BB-324 — cắt vuông không được thì trả LOGO, không trả ảnh chưa cắt.
  if (!buffer) return veLogo(request, size);

  // BB-311 P0: hai chốt độc lập trước khi ghi vào bộ đệm DÙNG CHUNG
  // (`src/lib/kiem-thu.ts`, `src/lib/drive/kiem-tra-anh.ts`). Chỉ chặn GHI.
  const boQuaGhiDem = khongGhiDemPhepThu();
  const kiemAnh = boQuaGhiDem ? null : kiemAnhTruocKhiGhiDem(buffer);
  if (!boQuaGhiDem && kiemAnh!.hopLe) {
    const upRes = await storage.upload(cachePath, buffer, { contentType: "image/jpeg", upsert: true });
    if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
      await supabase.storage.createBucket("thumbnails", { public: false });
      await storage.upload(cachePath, buffer, { contentType: "image/jpeg", upsert: true });
    }
  } else if (!boQuaGhiDem) {
    console.error(
      JSON.stringify({
        evt: "bia_vuong_cache_write_skipped",
        requestId,
        galleryId: bia.galleryId,
        size,
        lyDo: kiemAnh?.lyDo,
      }),
    );
  }

  return new Response(buffer, {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}

/** Cỡ không hợp lệ — cùng câu trả lời với route BB-213. */
export const coKhongHopLe = () => fail("INVALID_INPUT", "Cỡ biểu tượng không hợp lệ");
