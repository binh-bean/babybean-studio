import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireRole, AuthError } from "@/lib/auth/staff";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";
import { driveFetch, DriveAccessDeniedError } from "@/lib/drive/client";
import { listImageFiles } from "@/lib/drive/list-files";
import { PreviewGallerySchema } from "./schema";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // Kiểm đăng nhập TRƯỚC khi đụng tới dữ liệu gửi lên.
    //
    // Trước đây thứ tự ngược lại, nên một người chưa đăng nhập gửi request rỗng
    // nhận về 400 kèm mô tả schema thay vì 401. Không rò dữ liệu khách hàng,
    // nhưng nó nói cho người lạ biết endpoint này có thật và cần những trường
    // gì — và máy chủ làm việc không công cho họ. Người lạ thì trả lời "anh là
    // ai" trước, mọi thứ khác sau.
    const staff = await requireStaff();
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = PreviewGallerySchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const { driveUrl } = parsed.data;

    let folderId: string;
    try {
      folderId = parseDriveFolderId(driveUrl);
    } catch (err) {
      if (err instanceof InvalidDriveLinkError) {
        return fail("INVALID_INPUT", err.message);
      }
      return fail("INVALID_INPUT", "Link Google Drive không hợp lệ");
    }

    const ctx = { requestId, folderId };

    // Fetch folder info
    let folderName = "";
    try {
      const res = await driveFetch(`/files/${folderId}`, {
        fields: "name",
        supportsAllDrives: "true",
      }, ctx);
      const folderData = await res.json();
      folderName = folderData.name || "Thư mục không tên";
    } catch (err) {
      if (err instanceof DriveAccessDeniedError) {
        return fail("DRIVE_ACCESS_DENIED", "Thư mục chưa được chia sẻ công khai", {
          howToFix: [
            "Mở thư mục trên Google Drive",
            "Nhấn Chia sẻ",
            "Chọn 'Bất kỳ ai có đường liên kết' — quyền Người xem"
          ]
        });
      }
      throw err;
    }

    // Fetch all image files
    const images = await listImageFiles(folderId, ctx);
    
    // Process results
    const fileCount = images.length;
    const subfolders = Array.from(new Set(images.map((img) => img.subfolder).filter((s): s is string => s !== null)));
    
    // Ảnh mẫu trả về dưới dạng data URI chứ không phải link lh3.
    //
    // CSP của ứng dụng là `img-src 'self' data: blob:` — trình duyệt sẽ chặn
    // thẳng một thẻ <img> trỏ sang googleusercontent.com, và người dùng chỉ
    // thấy sáu ô trống mà không có lỗi nào giải thích.
    //
    // Cách khác là thêm lh3 vào img-src, nhưng làm vậy thì trang của khách cũng
    // nạp được ảnh Drive trực tiếp, đi vòng qua proxy — mà proxy chính là chỗ
    // sẽ đóng dấu mờ (BB-066) và kiểm quyền. Nới CSP cho một màn hình quản trị
    // mà mở đường cho cả cổng khách hàng là cái giá quá đắt.
    //
    // Sáu ảnh nhỏ, bấm một lần khi tạo album. Nhét thẳng vào phản hồi là xong.
    const sample = await Promise.all(
      images.slice(0, 6).map(async (img) => {
        let thumbnailUrl: string | null = null;
        try {
          const res = await fetch(`https://lh3.googleusercontent.com/d/${img.id}=w400`, {
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
          });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            const mime = res.headers.get("content-type") ?? "image/jpeg";
            thumbnailUrl = `data:${mime};base64,${buf.toString("base64")}`;
          }
        } catch {
          // Một ảnh mẫu không tải được không đáng làm hỏng cả bước xem trước.
        }
        return { fileName: img.name, thumbnailUrl };
      }),
    );

    return NextResponse.json({
      data: {
        folderId,
        folderName,
        fileCount,
        subfolders,
        sample
      }
    });

  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message);
    }
    return failUnexpected(err, requestId);
  }
}
