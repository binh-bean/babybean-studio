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

export const runtime = "nodejs";

const ICON_SIZES = [180, 192, 512] as const;
type IconSize = (typeof ICON_SIZES)[number];

function parseSize(value: string | null): IconSize | null {
  const n = Number(value ?? 192);
  return (ICON_SIZES as readonly number[]).includes(n) ? (n as IconSize) : null;
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
    if (!boAnh || !boAnh.coverDriveFileId) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    const supabase = createAdminClient();
    // Đệm theo GALLERY, không theo token: cấp lại link (mã mới) cho cùng một
    // bộ ảnh thì vẫn dùng chung một icon đã cắt sẵn, không cắt lại từ đầu.
    const cachePath = `icon/${boAnh.galleryId}/${size}.jpg`;
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
      // thử tiếp bản không cắt bên dưới
    }

    // Cắt vuông không có kết quả (ví dụ file quá lớn/định dạng lạ) thì thà
    // trả ảnh CHƯA cắt còn hơn không có icon nào — màn hình chính lệch tỉ lệ
    // đỡ tệ hơn không cài được app.
    if (!buffer) {
      try {
        const res = await driveFetch(
          `https://lh3.googleusercontent.com/d/${boAnh.coverDriveFileId}=w${size}`,
          {},
          ctx,
        );
        if (res.ok) buffer = await res.arrayBuffer();
      } catch {
        // hết cách, rơi xuống DRIVE_UNAVAILABLE bên dưới
      }
    }

    if (!buffer) return fail("DRIVE_UNAVAILABLE", "Không tải được ảnh bìa");

    const upRes = await storage.upload(cachePath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
      await supabase.storage.createBucket("thumbnails", { public: false });
      await storage.upload(cachePath, buffer, { contentType: "image/jpeg", upsert: true });
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
