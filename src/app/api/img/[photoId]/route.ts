import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import { THUMBNAIL_WIDTHS, type ThumbnailWidth } from "@/types/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { driveFetch } from "@/lib/drive/client";
import { khongGhiDemPhepThu } from "@/lib/kiem-thu";
import { kiemAnhTruocKhiGhiDem } from "@/lib/drive/kiem-tra-anh";
import { nenDieuHuongLh3 } from "@/lib/drive/quyet-dinh-lh3";

export const runtime = "nodejs";
// BB-286: ghi bộ đệm chạy nền (after()) tính vào cùng thời lượng hàm như
// phần phản hồi. GIẢ ĐỊNH HẠ TẦNG: gói Hobby — 60 giây là mức TỐI ĐA Hobby
// cho phép (mặc định chỉ 10s), đặt kịch trần vì một lượt kéo Drive + ghi
// Storage cho MỘT tấm ảnh hiếm khi cần tới, nhưng vẫn có thể chậm khi Drive
// đang bị giới hạn tốc độ và `driveFetch` đang lùi (backoff).
export const maxDuration = 60;

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
      // `cover_photo_id` thêm vào BB-311 mục A: cần biết tấm này có phải ảnh
      // bìa BỘ ẢNH không, để quyết định có đệm Storage cho nó không (xem
      // `laAnhBia` bên dưới) — KHÔNG được đệm mọi ảnh w≥1600, vì màn xem lớn
      // (`photo-lightbox.tsx`) xin đúng hai cỡ 1600/2048 cho MỌI tấm khách mở
      // xem, không riêng ảnh bìa.
      .select(
        "drive_file_id, file_name, gallery_id, status, galleries!photos_gallery_id_fkey!inner(branch_id, customer_id, cover_photo_id)",
      )
      .eq("id", photoId)
      .single();

    if (photoErr || !photo || photo.status === "missing" || photo.status === "hidden") {
      return fail("NOT_FOUND", "Không tìm thấy ảnh");
    }

    const gallery = (
      Array.isArray(photo.galleries) ? photo.galleries[0] : photo.galleries
    ) as unknown as { branch_id: string; customer_id: string | null; cover_photo_id: string | null } | undefined;

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
    // BB-314 fallback: ?qua=1 ép route BỎ QUA điều hướng 302 bên dưới và đi
    // qua chính ĐƯỜNG NÀY (Vercel làm trung gian) như trước bản vá. Chỉ trình
    // duyệt tự thêm cờ này, đúng MỘT LẦN, khi ảnh redirect thẳng tới lh3 lỗi
    // (`onError` của thẻ <img> lưới/xem lớn) — xem `luoi-anh.tsx`,
    // `photo-lightbox.tsx`.
    const quaProxy = new URL(request.url).searchParams.get("qua") === "1";

    // BB-314: cỡ NHỎ (w<=800 — lưới và ảnh thu nhỏ, không phải ?tai=1 tải
    // gốc) điều hướng 302 THẲNG sang lh3.googleusercontent.com, không đi qua
    // hàm Vercel nữa.
    //
    // Vì sao: mỗi tấm lưới trước đây tốn một lượt gọi hàm Vercel + toàn bộ
    // byte ảnh đi qua hàm đó rồi mới tới trình duyệt. Báo cáo vận hành vòng 4
    // đo 17 MB ảnh/lượt khách mở bộ, LCP 13–15s trên mạng 4G — gói Hobby cạn
    // hạn mức truyền tải hàm rất nhanh. Chuyển thẳng sang lh3 thì Google phục
    // vụ byte ảnh trực tiếp cho trình duyệt, hàm Vercel chỉ còn việc xét
    // quyền rồi trả một điều hướng nhẹ.
    //
    // Xét quyền đã chạy XONG ở trên (khối staff/gallery-session) TRƯỚC khi
    // tới đây — không có đường tắt nào bỏ qua nó. `driveFileId` xuất hiện
    // trong URL ảnh: anh (chủ studio) đã chấp nhận điều đó, các thư mục Drive
    // vốn đã chia sẻ công khai (xem brief BB-314).
    //
    // `Cache-Control: private, max-age=3600` trên CHÍNH ĐIỀU HƯỚNG (không
    // phải ảnh) — không đặt public, vì mỗi lượt phải chạy lại xét quyền phía
    // trên; max-age ngắn để trình duyệt không giữ điều hướng cũ quá lâu nếu
    // quyền xem đổi (bộ ảnh khoá, link hết hạn).
    //
    // width>=1600 (bìa, BB-311) và tải ảnh gốc (`taiVe`) giữ NGUYÊN đường cũ
    // — không redirect — vì:
    //   1. Ảnh bìa còn cần đọc/ghi bộ đệm Storage (đoạn `laAnhBia` bên dưới).
    //   2. Tải gốc dùng `=s0`, một lượt/khách, không đáng đổi.
    if (nenDieuHuongLh3(width, taiVe, quaProxy)) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

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
    //
    // BB-311 mục A (28/09/2026, admin): "Không đệm ảnh nhỏ; ảnh bìa cũng rất
    // cần sắc nét". Trước bản vá này MỌI cỡ (200/400/800/1600/2048) đều qua
    // Storage — đúng nguyên nhân Storage 1GB/egress 5GB của gói miễn phí gần
    // vỡ (báo cáo vận hành vòng 4 §5: bộ đệm ảnh không bao giờ xoá, ~36 bộ nữa
    // là đầy 1GB). Từ nay CHỈ ảnh BÌA (w ≥ 1600 — đúng hai cỡ dùng cho ảnh bìa
    // bộ ảnh/album, xem `bia-bo-anh.tsx`) mới đọc/ghi Storage. Ảnh lưới/xem
    // nhỏ (200/400/800 — luôn LUÔN kéo thẳng từ Google, không đệm, không bao
    // giờ chạm Storage) đổi lại đổi thời lượng hàm/egress Vercel lấy chỗ cho
    // Storage/egress Supabase — đánh đổi có chủ ý của admin.
    // BB-311 sửa lỗi trong lúc dựng: "ảnh bìa" KHÔNG đơn thuần là "cỡ ≥
    // 1600" — màn xem lớn (`photo-lightbox.tsx`) xin đúng 1600/2048 cho MỌI
    // tấm khách bấm mở, không riêng ảnh bìa. Nếu chỉ xét theo cỡ, MỌI lượt
    // xem lớn của MỌI ảnh sẽ bị ghi đệm 463-794 KB/tấm — tệ hơn hẳn trước bản
    // vá (trước đây không giới hạn cỡ nào được đệm, nhưng ít nhất ảnh xem lớn
    // qua đường ?tai=1 vốn đã KHÔNG đệm). Phải xét ĐÚNG ảnh: bìa BỘ ẢNH
    // (`galleries.cover_photo_id`) hoặc bìa ALBUM (bảng `album_covers`,
    // `POST /api/g/album-cover`).
    const laAnhBiaBoAnh = width >= 1600 && !taiVe && gallery?.cover_photo_id === photoId;
    let laAnhBiaAlbum = false;
    if (width >= 1600 && !taiVe && !laAnhBiaBoAnh) {
      // `album_covers` không có cột `photo_id` thẳng — bìa gắn qua
      // `selection_item_id` (xem db/migrations/0075-bia-album.sql, cố ý:
      // một tấm ảnh có thể được thả tim ở nhiều lượt chọn khác nhau). Hai
      // bước tường minh (KHÔNG dùng filter lồng qua quan hệ — không có tiền
      // lệ nào trong dự án dùng `.eq("quan_he.cot", ...)`, tránh phụ thuộc
      // vào cú pháp PostgREST chưa từng kiểm chứng ở đây):
      //   1. Tìm mọi `selection_items.id` của đúng tấm ảnh này.
      //   2. Tấm này là bìa album nếu CÓ dòng `album_covers` trỏ tới MỘT
      //      trong các id đó.
      const { data: selItems } = await supabase
        .from("selection_items")
        .select("id")
        .eq("photo_id", photoId);
      const selItemIds = (selItems ?? []).map((r: { id: string }) => r.id);
      if (selItemIds.length > 0) {
        const { data: biaAlbum } = await supabase
          .from("album_covers")
          .select("id")
          .in("selection_item_id", selItemIds)
          .limit(1)
          .maybeSingle();
        laAnhBiaAlbum = !!biaAlbum;
      }
    }
    const laAnhBia = laAnhBiaBoAnh || laAnhBiaAlbum;
    const cachePathJpg = `${photoId}/${width}.jpg`;
    const cachePathWebp = `${photoId}/${width}.webp`;
    const storage = supabase.storage.from("thumbnails");

    // 1. Ảnh BÌA: thử lấy từ bộ nhớ đệm (Storage). Thử `.webp` trước (ghi mới
    // từ bản vá này, nếu Google chịu content-negotiate), rồi `.jpg` (ảnh bìa
    // đã đệm TRƯỚC bản vá, hoặc Google không trả webp). Dùng ĐÚNG
    // `Content-Type` Storage lưu theo đối tượng (Blob.type) khi trả lại —
    // KHÔNG hardcode "image/jpeg" như trước (giờ có thể là webp).
    if (laAnhBia) {
      const webpRes = await storage.download(cachePathWebp);
      if (webpRes.data) {
        return new Response(webpRes.data, {
          status: 200,
          headers: { ...headers, "Content-Type": webpRes.data.type || "image/webp" },
        });
      }
      const jpgRes = await storage.download(cachePathJpg);
      if (jpgRes.data) {
        return new Response(jpgRes.data, {
          status: 200,
          headers: { ...headers, "Content-Type": jpgRes.data.type || "image/jpeg" },
        });
      }
    }

    const ctx = { requestId };
    let buffer: ArrayBuffer | null = null;
    let contentType = "image/jpeg";

    // Ảnh bìa: xin Google trả WebP qua content negotiation (Accept header) —
    // "cố gắng tốt nhất", KHÔNG đảm bảo. Không có thư viện chuyển đổi ảnh
    // trong dependencies (không sharp/squoosh) nên KHÔNG tự ép định dạng ở
    // đây; nếu Google không trả webp, `contentType` dưới đây vẫn là những gì
    // Google thật sự trả (thường jpeg) và route vẫn hoạt động đúng, chỉ không
    // đạt được lợi ích byte nhỏ hơn của webp.
    const headerTheoBia = laAnhBia ? { Accept: "image/webp,image/*" } : undefined;

    // 2. Chưa có trong đệm (hoặc không phải ảnh bìa) -> Try lh3 first
    // =s0 là ảnh gốc; =w<cỡ> là bản thu nhỏ.
    const lh3Url = taiVe
      ? `https://lh3.googleusercontent.com/d/${driveFileId}=s0`
      : `https://lh3.googleusercontent.com/d/${driveFileId}=w${width}`;
    try {
      const lh3Res = await driveFetch(lh3Url, {}, ctx, headerTheoBia);
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
        const driveRes = await driveFetch(driveUrl, {}, ctx, headerTheoBia);
        if (driveRes.ok) {
          buffer = await driveRes.arrayBuffer();
          contentType = driveRes.headers.get("Content-Type") || "image/jpeg";
        }
      } catch {
        // failure
      }
    }

    if (buffer) {
      // 3. Ghi vào bộ nhớ đệm — CHẠY NỀN, không chặn phản hồi (BB-286).
      //
      // Trước đây route `await storage.upload(...)` TRƯỚC KHI trả ảnh: khách
      // mở một bộ mới toanh (chưa có gì trong đệm) phải đợi cả lượt kéo Drive
      // LẪN lượt ghi Storage mới thấy ảnh — đúng lúc lần đầu mở link, đúng lúc
      // quan trọng nhất (xem §4.2 báo cáo vận hành 27/09/2026).
      //
      // `after()` (Next 15, ổn định) chạy đúng đoạn ghi đệm SAU KHI phản hồi
      // đã rời máy chủ. Ảnh gốc (`taiVe`) không qua đây — đã chặn ở bước đọc
      // đệm phía trên, ảnh gốc không bao giờ được ghi vào đệm (660 GB nếu ghi
      // hết, xem chú thích §BB-161 bên trên).
      // BB-311 P0: hai chốt độc lập trước khi ghi vào bộ đệm DÙNG CHUNG.
      //
      // 1. `khongGhiDemPhepThu()` — đang chạy phép thử (đơn vị hoặc trình
      //    duyệt) thì KHÔNG ghi, dù Drive (thật hoặc mock) có trả gì đi nữa.
      //    Ảnh vẫn được TRẢ VỀ bình thường cho phép thử — chỉ chặn đường ghi.
      // 2. `kiemAnhTruocKhiGhiDem()` — nội dung nhỏ bất thường (<1KB) hoặc
      //    không đọc được thành PNG/JPEG/WebP hợp lệ >16px thì cũng không ghi
      //    (Drive trả trang lỗi, hoặc mock nào đó lọt qua chốt 1).
      //
      // Cả hai chỉ chặn GHI ĐỆM — không chặn phản hồi cho người gọi.
      const boQuaGhiDem = khongGhiDemPhepThu();
      const kiemAnh = boQuaGhiDem ? null : kiemAnhTruocKhiGhiDem(buffer);
      if (boQuaGhiDem || (kiemAnh && !kiemAnh.hopLe)) {
        if (!boQuaGhiDem) {
          console.error(
            JSON.stringify({
              evt: "img_cache_write_skipped",
              requestId,
              photoId,
              width,
              lyDo: kiemAnh?.lyDo,
              byteLength: buffer.byteLength,
            }),
          );
        }
      } else if (laAnhBia) {
        const bufferGhiDem = buffer;
        const contentTypeGhiDem = contentType;
        // Đuôi tệp theo ĐÚNG content-type Google thật sự trả (webp nếu content
        // negotiation ở trên thành công, ngược lại jpg) — không tự ép đổi.
        const cachePath = contentTypeGhiDem.includes("webp") ? cachePathWebp : cachePathJpg;
        const ghiVaoDem = async () => {
          try {
            const upRes = await storage.upload(cachePath, bufferGhiDem, {
              contentType: contentTypeGhiDem,
              upsert: true,
            });

            // Bucket chưa tồn tại? Tạo private bucket rồi ghi lại.
            if (upRes.error && (upRes.error as { code?: string }).code === "NoSuchBucket") {
              await supabase.storage.createBucket("thumbnails", { public: false });
              const retry = await storage.upload(cachePath, bufferGhiDem, {
                contentType: contentTypeGhiDem,
                upsert: true,
              });
              if (retry.error) throw retry.error;
            } else if (upRes.error) {
              throw upRes.error;
            }
          } catch (err) {
            // Lỗi ghi đệm CHỈ log — khách đã nhận ảnh rồi, không có phản hồi
            // nào để làm hỏng nữa. Lượt xem kế tiếp sẽ lại kéo Drive, chậm
            // như hôm nay chứ không mất ảnh.
            console.error(
              JSON.stringify({
                evt: "img_cache_write_failed",
                requestId,
                photoId,
                width,
                loi: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        };

        try {
          // `after()` chỉ chạy được TRONG một yêu cầu thật của Next.js — nơi
          // có ngữ cảnh yêu cầu (request scope) để hoãn việc tới. Gọi thẳng
          // route handler NGOÀI ngữ cảnh đó (ví dụ phép thử gọi trực tiếp
          // hàm GET, không qua máy chủ Next.js) làm nó NÉM lỗi ngay tại đây —
          // xem https://nextjs.org/docs/messages/next-dynamic-api-wrong-context.
          after(ghiVaoDem);
        } catch {
          // Không có ngữ cảnh để hoãn tới thì không hoãn được — ghi luôn,
          // đồng bộ, như hành vi TRƯỚC BB-286. Chỉ ảnh hưởng lúc gọi route
          // handler trực tiếp (phép thử); trên máy chủ Next.js thật, nhánh
          // `after()` ở trên luôn chạy.
          await ghiVaoDem();
        }
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
