/**
 * Uniform API envelope. Every route handler returns through these helpers.
 *
 * OWNER: DEV-BE. Spec: docs/04-api-spec.md §2
 */

import { NextResponse } from "next/server";
import type { ApiError, ApiMeta, ErrorCode } from "@/types/domain";

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  PIN_REQUIRED: 401,
  PIN_INVALID: 401,
  PIN_LOCKED: 429,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  LINK_EXPIRED: 410,
  GALLERY_LOCKED: 409,
  QUOTA_EXCEEDED: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DRIVE_ACCESS_DENIED: 502,
  DRIVE_UNAVAILABLE: 502,
  INTERNAL: 500,
};

/** Customer-facing Vietnamese defaults. Override for anything more specific. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  INVALID_INPUT: "Dữ liệu không hợp lệ",
  UNAUTHENTICATED: "Vui lòng mở lại link album",
  PIN_REQUIRED: "Album này cần mã PIN",
  PIN_INVALID: "Mã PIN không đúng",
  PIN_LOCKED: "Bạn đã nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  NOT_FOUND: "Không tìm thấy nội dung",
  LINK_EXPIRED: "Link đã hết hạn hoặc đã được thu hồi",
  GALLERY_LOCKED: "Album đã được chốt, không thể thay đổi",
  QUOTA_EXCEEDED: "Đã vượt số ảnh tối đa cho phép",
  CONFLICT: "Thao tác bị trùng, vui lòng thử lại",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng chờ một lát",
  DRIVE_ACCESS_DENIED: "Thư mục Google Drive chưa được chia sẻ công khai",
  DRIVE_UNAVAILABLE: "Không kết nối được Google Drive, vui lòng thử lại",
  INTERNAL: "Có lỗi xảy ra, vui lòng thử lại",
};

export function ok<T>(data: T, meta?: ApiMeta): NextResponse {
  return NextResponse.json(
    meta ? { data, meta } : { data },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function fail(
  code: ErrorCode,
  message?: string,
  details?: Record<string, unknown>,
): NextResponse {
  const error: ApiError = { code, message: message ?? DEFAULT_MESSAGE[code] };
  if (details) error.details = details;
  return NextResponse.json({ error }, { status: HTTP_STATUS[code] });
}

/**
 * Last line of defence. Logs the real cause with a request id and returns an
 * opaque INTERNAL to the client — Postgres messages and stack traces must
 * never reach a customer's browser.
 */
export function failUnexpected(err: unknown, requestId: string): NextResponse {
  console.error(JSON.stringify({ evt: "unhandled_error", requestId, err: String(err) }));
  return fail("INTERNAL", undefined, { requestId });
}
