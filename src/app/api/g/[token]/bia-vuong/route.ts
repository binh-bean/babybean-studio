/**
 * GET /api/g/<token>/bia-vuong?w=192|512|180 — icon màn hình chính riêng cho
 * từng link, cắt VUÔNG từ ảnh bìa của bộ ảnh.
 *
 * OWNER: Sonnet (BB-213). Chủ studio 24/09/2026: "hiển thị trên màn khách khi
 * gắn ra màn chính là ảnh bìa bộ hình."
 *
 * Quyền xem đến từ CHÍNH MÃ TRONG ĐƯỜNG DẪN (xem
 * src/lib/auth/xac-thuc-token-bo-anh.ts) — không phải cookie phiên, vì hệ
 * điều hành/trình duyệt gọi route này lúc "Thêm vào màn hình chính" mà không
 * chắc luôn kèm cookie. Sai mã / đã thu hồi / hết hạn đều trả 404 — không nói
 * lý do, giống hệt cách /api/auth/gallery từ chối các ca này.
 */
import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveFetch } from "@/lib/drive/client";
import { xacThucTokenBoAnh } from "@/lib/auth/xac-thuc-token-bo-anh";
import { khongGhiDemPhepThu } from "@/lib/kiem-thu";
import { kiemAnhTruocKhiGhiDem } from "@/lib/drive/kiem-tra-anh";

export const runtime = "nodejs";

const ICON_SIZES = [180, 192, 512] as const;
type IconSize = (typeof ICON_SIZES)[number];

function parseSize(value: string | null): IconSize | null {
  const n = Number(value ?? 192);
  return (ICON_SIZES as readonly number[]).includes(n) ? (n as IconSize) : null;
}

/** Logo Baby Bean (hạt đậu) đúng cỡ — dùng khi bộ ảnh chưa có bìa hoặc không cắt được bìa. */
const LOGO_THEO_CO: Record<IconSize, string> = {
  180: "/apple-touch-icon.png",
  192: "/icons/icon-192.png",
  512: "/icons/icon-512.png",
};

function veLogo(request: Request, size: IconSize): Response {
  return Response.redirect(new URL(LOGO_THEO_CO[size], request.url), 302);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { token } = await context.params;
    const size = parseSize(new URL(request.url).searchParams.get("w"));
    if (!size) return fail("INVALID_INPUT", "Cỡ biểu tượng không hợp lệ");

    const boAnh = await xacThucTokenBoAnh(token);
    if (!boAnh) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    // BB-324 — chưa chọn bìa: logo Baby Bean, không lấy một ảnh bất kỳ.
    if (!boAnh.coverDriveFileId || !boAnh.coverPhotoId) return veLogo(request, size);

    const supabase = createAdminClient();
    // Đệm theo GALLERY + ẢNH BÌA, không theo token: cấp lại link (mã mới) cho
    // cùng một bộ ảnh vẫn dùng chung icon đã cắt sẵn. BB-324 — có id ảnh bìa
    // trong đường dẫn: trước bản vá khoá chỉ là `icon/<gallery>/<cỡ>.jpg`, đổi
    // bìa ở màn thiết kế bìa xong icon VẪN là ảnh cũ mãi mãi.
    const cachePath = `icon/${boAnh.galleryId}/${boAnh.coverPhotoId}-${size}.jpg`;
    const storage = supabase.storage.from("thumbnails");

    const { data: cachedBlob } = await storage.download(cachePath);
    if (cachedBlob) {
      return new Response(cachedBlob, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          // "private": route phục vụ theo TOKEN của một nhà, không cho CDN/
          // proxy dùng chung bản đệm này cho mã link khác — dù đường dẫn khác
          // token vẫn tự đi qua xác thực riêng, cache trung gian không được
          // đoán hộ.
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const ctx = { requestId };
    let buffer: ArrayBuffer | null = null;

    // "-h<cỡ>-c" là tham số cắt vuông chính giữa có sẵn của Google (lh3
    // googleusercontent) — dùng luôn, không thêm thư viện xử lý ảnh nào (dự
    // án không có sharp, đúng luật BB-213).
    try {
      const res = await driveFetch(
        `https://lh3.googleusercontent.com/d/${boAnh.coverDriveFileId}=w${size}-h${size}-c`,
        {},
        ctx,
      );
      if (res.ok) buffer = await res.arrayBuffer();
    } catch {
      // rơi xuống logo bên dưới
    }

    // BB-324 — cắt vuông không được thì trả LOGO, không trả ảnh chưa cắt:
    // ảnh chữ nhật làm icon vuông bị hệ điều hành chèn viền/lệch tỉ lệ.
    if (!buffer) return veLogo(request, size);

    // BB-311 P0: hai chốt độc lập giống `/api/img`, trước khi ghi vào bộ đệm
    // DÙNG CHUNG (xem `src/lib/kiem-thu.ts`, `src/lib/drive/kiem-tra-anh.ts`).
    // Route này CŨNG ghi Storage (thư mục `icon/`), nên cũng phải qua hai
    // chốt — bỏ sót đúng chỗ này là đúng cách 42 ảnh thật từng bị mock phép
    // thử ghi đè (báo cáo vận hành vòng 4). Chỉ chặn GHI, vẫn trả icon bình
    // thường cho người gọi (kể cả phép thử).
    const boQuaGhiDem = khongGhiDemPhepThu();
    const kiemAnh = boQuaGhiDem ? null : kiemAnhTruocKhiGhiDem(buffer);
    if (!boQuaGhiDem && kiemAnh!.hopLe) {
      const upRes = await storage.upload(cachePath, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
        await supabase.storage.createBucket("thumbnails", { public: false });
        await storage.upload(cachePath, buffer, { contentType: "image/jpeg", upsert: true });
      }
    } else if (!boQuaGhiDem) {
      console.error(
        JSON.stringify({
          evt: "bia_vuong_cache_write_skipped",
          requestId,
          galleryId: boAnh.galleryId,
          size,
          lyDo: kiemAnh?.lyDo,
        }),
      );
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
