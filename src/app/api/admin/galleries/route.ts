/**
 * POST /api/admin/galleries — tạo gallery + share_link.
 *
 * OWNER: DEV-BE. Task BB-023.
 * Spec: docs/04-api-spec.md §4.1, docs/05-rbac.md §5
 *
 * Order of operations: parse -> authenticate -> authorize -> mutate -> log -> respond.
 */

import { randomUUID, randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected } from "@/lib/api-response";
import {
  requireStaff,
  requireRole,
  requireBranch,
  AuthError,
} from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";
import { CreateGallerySchema } from "./schema";

export const runtime = "nodejs";

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateBase62Token(length = 22): string {
  const bytes = randomBytes(length);
  let token = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    token += BASE62_CHARS[byte % 62];
  }
  return token;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Parse & validate Zod input ----------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateGallerySchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    // Validate and parse Google Drive folder link
    let driveFolderId: string;
    try {
      driveFolderId = parseDriveFolderId(input.driveUrl);
    } catch (err) {
      if (err instanceof InvalidDriveLinkError) {
        return fail("INVALID_INPUT", err.message);
      }
      return fail("INVALID_INPUT", "Link Google Drive không hợp lệ");
    }

    // 2. Authenticate ------------------------------------------------------
    const staff = await requireStaff();

    // 3. Authorize: cs+ and must belong to branch ---------------------------
    requireRole(staff, ["owner", "admin", "branch_manager", "cs"]);
    requireBranch(staff, input.branchId);

    // 4. Mutate & Log (in a single database transaction) -------------------
    // Generate 22-character Base62 token. Only store sha256 hash in database.
    const token = generateBase62Token(22);
    const tokenPrefix = token.substring(0, 6);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const requirePin = input.options.requirePin !== false;
    const pin = requirePin ? input.options.pin || null : null;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;

    const supabase = await createServerClient();

    const { data: result, error: rpcError } = await supabase.rpc("create_gallery_bundle", {
      p_branch_id: input.branchId,
      p_customer_id: input.customerId || null,
      p_new_customer: input.newCustomer || null,
      p_baby_id: input.babyId || null,
      p_new_baby: input.newBaby || null,
      p_package_id: input.packageId,
      p_photographer_id: input.photographerId || null,
      p_shoot_date: input.shootDate || null,
      p_title: input.title,
      p_drive_folder_id: driveFolderId,
      p_drive_folder_url: input.driveUrl,
      p_drive_folder_name: null,
      p_included_quota: input.includedQuota ?? null,
      p_extra_photo_price: input.extraPhotoPrice ?? null,
      p_max_selection: input.maxSelection ?? null,
      p_due_at: input.dueAt ?? null,
      p_welcome_message: input.welcomeMessage || null,
      p_watermark_enabled: input.options.watermark,
      p_download_enabled: input.options.download,
      p_notes_enabled: input.options.notes,
      p_invite_enabled: input.options.invite,
      p_token_hash: tokenHash,
      p_token_prefix: tokenPrefix,
      p_requires_pin: requirePin,
      p_pin: pin,
      p_staff_id: staff.staffId,
      p_actor_label: staff.role,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (rpcError) {
      // Handle unique violation (e.g. drive folder already linked to active gallery)
      if (rpcError.code === "23505") {
        return fail(
          "CONFLICT",
          "Thư mục Google Drive này đã được gắn với một album khác đang hoạt động",
        );
      }
      if (rpcError.message.includes("CUSTOMER_NOT_FOUND")) {
        return fail("NOT_FOUND", "Khách hàng không tồn tại hoặc không thuộc chi nhánh này");
      }
      if (rpcError.message.includes("PACKAGE_NOT_FOUND")) {
        return fail("NOT_FOUND", "Gói chụp không tồn tại");
      }
      if (rpcError.message.includes("chk_max_selection")) {
        return fail("INVALID_INPUT", "maxSelection không được nhỏ hơn số lượng ảnh miễn phí");
      }
      return failUnexpected(rpcError, requestId);
    }

    // No fallback on purpose. This used to guess "https://chon-anh.babybean.vn",
    // a domain the studio does not own and nobody has registered — so a missing
    // variable would mint share links pointing into thin air, and whoever
    // registered that domain later would start receiving gallery tokens from
    // parents clicking them. A base URL we cannot know is a configuration
    // error, and it should stop the request loudly rather than be invented.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!appUrl) {
      console.error(JSON.stringify({ evt: "missing_app_url", requestId }));
      return fail("INTERNAL", "Thiếu cấu hình địa chỉ trang web, chưa tạo được link chia sẻ");
    }
    const shareUrl = `${appUrl.replace(/\/$/, "")}/g/${token}`;

    const pinHint = requirePin
      ? input.options.pin
        ? input.options.pin
        : "4 số cuối SĐT"
      : null;

    // 5. Respond -----------------------------------------------------------
    return NextResponse.json(
      {
        data: {
          galleryId: (result as { gallery_id: string }).gallery_id,
          shareUrl,
          pinHint,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.message);
    }
    return failUnexpected(err, requestId);
  }
}
