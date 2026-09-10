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

    const staff = await requireStaff();
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);

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
    
    const sample = images.slice(0, 6).map((img) => ({
      driveFileId: img.id,
      fileName: img.name,
      thumbnailUrl: `https://lh3.googleusercontent.com/d/${img.id}=w400`
    }));

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
