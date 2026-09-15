import { randomUUID } from "node:crypto";
import { fail, failUnexpected } from "@/lib/api-response";
import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/types/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { driveFetch } from "@/lib/drive/client";

export const runtime = "nodejs";

function parseWidth(value: string | null): ThumbnailWidth | null {
  const n = Number(value ?? 800);
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(n) ? (n as ThumbnailWidth) : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ photoId: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { photoId } = await context.params;
    const width = parseWidth(new URL(request.url).searchParams.get("w"));
    if (!width) return fail("INVALID_INPUT", "Kích thước ảnh không hợp lệ");

    // Máy khách QUẢN TRỊ, không phải máy khách theo phiên Supabase.
    //
    // Khách hàng không có phiên Supabase — họ chỉ có cookie `bb_gs` do app
    // tự ký. Dùng createServerClient() thì câu truy vấn chạy dưới quyền ẩn
    // danh, RLS chặn sạch, và route trả "không tìm thấy ảnh" cho MỌI tấm.
    //
    // Đo thật ngày 14.09.2026: mở một bộ 1.235 ảnh đúng như khách thì cả
    // 1.235 yêu cầu ảnh đều trả 404. Nhân viên không thấy lỗi này vì họ CÓ
    // phiên Supabase — nên nó chỉ hỏng ở đúng phía khách.
    //
    // Đổi sang quyền quản trị thì RLS không còn che chắn, nên quyền xem phải
    // do CHÍNH ĐOẠN MÃ dưới đây quyết — xem khối xét quyền ngay sau.
    const supabase = createAdminClient();
    const { data: photo, error: photoErr } = await supabase
      .from("photos")
      // Phải gọi ĐÍCH DANH khoá ngoại photos_gallery_id_fkey.
      //
      // Giữa photos và galleries có HAI khoá ngoại: photos.gallery_id trỏ sang
      // galleries, và galleries.cover_photo_id trỏ ngược về photos. Viết
      // `galleries!inner(...)` trần thì PostgREST không biết chọn đường nào và
      // trả lỗi "more than one relationship was found" — câu truy vấn hỏng,
      // route rơi vào nhánh NOT_FOUND, và MỌI người đều nhận "không tìm thấy
      // ảnh", kể cả nhân viên.
      // Một chuỗi liền, không nối bằng dấu cộng: Supabase suy kiểu kết quả từ
      // CHÍNH chữ trong chuỗi này, nên chuỗi ghép làm mất kiểu và mọi trường
      // phía sau thành lỗi biên dịch.
      .select("drive_file_id, file_name, gallery_id, status, galleries!photos_gallery_id_fkey!inner(branch_id, customer_id)")
      .eq("id", photoId)
      .single();

    if (photoErr || !photo || photo.status === "missing" || photo.status === "hidden") {
      return fail("NOT_FOUND", "Không tìm thấy ảnh");
    }

    const gallery = (
      Array.isArray(photo.galleries) ? photo.galleries[0] : photo.galleries
    ) as unknown as { branch_id: string; customer_id: string | null } | undefined;

    try {
      const staff = await requireStaff();
      // Không có chi nhánh thì không ai qua được cửa nhân viên. Truyền chuỗi
      // rỗng cho `requireBranch` để nó từ chối, thay vì bỏ qua bước kiểm.
      requireBranch(staff, gallery?.branch_id ?? "");
    } catch (errNhanVien) {
      if (!(errNhanVien instanceof AuthError)) return failUnexpected(errNhanVien, requestId);

      // ---------------------------------------------------------------------
      // Khách xem ảnh của CHÍNH MÌNH
      // ---------------------------------------------------------------------
      // Chỗ này từng là `TODO(BB-030)` kèm dòng "tạm thời, nhân viên không
      // đăng nhập được thì chặn". Hậu quả không ai để ý suốt nhiều tháng: màn
      // khách nạp MỌI tấm ảnh qua đúng đường này (`/api/img/<id>?w=...`), nên
      // ba mẹ mở link ra sẽ thấy **không một tấm nào** — 403 toàn bộ.
      //
      // Không phép thử nào đỏ, không màn hình nào vỡ lúc dựng. Nó chỉ lộ ra
      // vào đúng giây phút gửi link đầu tiên cho khách thật.
      //
      // Luật: quyền xem một tấm ảnh đến từ COOKIE PHIÊN ĐÃ KÝ, không bao giờ
      // từ đường dẫn. Người gửi `photoId` không được quyết mình xem được gì.
      try {
        const session = await requireGallerySession();

        const laLinkTheoBoAnh = session.galleryId !== "";
        const duocXem = laLinkTheoBoAnh
          ? // Link gắn theo bộ ảnh: tấm ảnh phải thuộc đúng bộ đã ký trong phiên.
            session.galleryId === photo.gallery_id
          : // Link gắn theo khách (cổng khách, BB-130): phiên chưa trỏ vào bộ
            // nào, nên xét theo chủ sở hữu. `customer_id` rỗng hai đầu thì
            // KHÔNG được coi là khớp — bằng không một bộ ảnh mồ côi sẽ mở cho
            // bất kỳ phiên cổng khách nào.
            !!session.customerId && session.customerId === gallery?.customer_id;

        if (!duocXem) return fail("FORBIDDEN", "Không có quyền truy cập ảnh");
      } catch (errKhach) {
        if (errKhach instanceof GallerySessionError) {
          return fail("FORBIDDEN", "Không có quyền truy cập ảnh");
        }
        return failUnexpected(errKhach, requestId);
      }
    }

    const driveFileId = photo.drive_file_id;

    // BB-156: ?tai=1 thì trả kèm Content-Disposition để trình duyệt LƯU thay vì
    // mở xem. Cùng một đường ảnh, cùng một tầng xét quyền — không mở thêm cửa
    // nào cho người không có phiên.
    const taiVe = new URL(request.url).searchParams.get("tai") === "1";
    // Tên tệp phải sạch dấu nháy và xuống dòng, nếu không header hỏng.
    const tenTep = (photo.file_name ?? String.fromCharCode(97, 110, 104) + ".jpg")
      .split(String.fromCharCode(34))
      .join("")
      .split(String.fromCharCode(13))
      .join("")
      .split(String.fromCharCode(10))
      .join("");

    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    };
    if (taiVe) {
      // Hai dạng tên tệp: filename* mang UTF-8 cho tên tiếng Việt có dấu,
      // filename thường chỉ giữ ký tự ASCII để trình duyệt cũ còn hiểu.
      const chiAscii = Array.from(tenTep as string)
        .map((ch: string) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126 ? ch : "_"))
        .join("");
      headers["Content-Disposition"] =
        "attachment; filename=" +
        String.fromCharCode(34) + chiAscii + String.fromCharCode(34) +
        "; filename*=UTF-8" + String.fromCharCode(39, 39) + encodeURIComponent(tenTep);
    }

    // BB-161: tải về là ảnh GỐC trên Drive, không phải bản thu nhỏ.
    //
    // Đo trên một ảnh 5472x3648: w1600 ra 146 KB, còn gốc ra 3.535 KB. Ba mẹ tải
    // ảnh con về để giữ, không phải để xem lướt — đưa bản 146 KB là đưa một thứ
    // không in được.
    //
    // Và ảnh gốc KHÔNG được vào bộ nhớ đệm: 152.472 ảnh nhân 3,5 MB là khoảng
    // 660 GB. Bộ đệm sinh ra để chặn lượt gọi Google cho ảnh XEM, thứ được nhìn
    // đi nhìn lại; ảnh gốc thì mỗi khách tải đúng một lần.
    const cachePath = `${photoId}/${width}.jpg`;
    const storage = supabase.storage.from("thumbnails");

    // 1. Thử lấy ảnh từ bộ nhớ đệm (Storage)
    const { data: cachedBlob } = taiVe ? { data: null } : await storage.download(cachePath);
    if (cachedBlob) {
      return new Response(cachedBlob, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "image/jpeg", // thumbnail luôn là jpeg
        },
      });
    }

    const ctx = { requestId };
    let buffer: ArrayBuffer | null = null;
    let contentType = "image/jpeg";
    
    // 2. Chưa có trong đệm -> Try lh3 first
    // =s0 là ảnh gốc; =w<cỡ> là bản thu nhỏ.
    const lh3Url = taiVe
      ? `https://lh3.googleusercontent.com/d/${driveFileId}=s0`
      : `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`;
    try {
      const lh3Res = await driveFetch(lh3Url, {}, ctx);
      if (lh3Res.ok) {
        buffer = await lh3Res.arrayBuffer();
        contentType = lh3Res.headers.get("Content-Type") || "image/jpeg";
      }
    } catch {
      // fallback
    }

    // Try drive.google.com/thumbnail
    if (!buffer) {
      const driveUrl = `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w${width}`;
      try {
        const driveRes = await driveFetch(driveUrl, {}, ctx);
        if (driveRes.ok) {
          buffer = await driveRes.arrayBuffer();
          contentType = driveRes.headers.get("Content-Type") || "image/jpeg";
        }
      } catch {
        // failure
      }
    }

    if (buffer) {
      // 3. Ghi vào bộ nhớ đệm
      const upRes = taiVe
        ? { error: null }
        : await storage.upload(cachePath, buffer, {
        contentType,
        upsert: true,
      });

      // Bucket chưa tồn tại? Tạo private bucket rồi ghi lại
      if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
        await supabase.storage.createBucket("thumbnails", { public: false });
        await storage.upload(cachePath, buffer, {
          contentType,
          upsert: true,
        });
      }

      return new Response(buffer, {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": contentType,
        },
      });
    }

    return fail("DRIVE_UNAVAILABLE", "Không tải được ảnh từ Drive");
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
