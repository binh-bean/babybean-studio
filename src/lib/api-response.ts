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
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  LINK_EXPIRED: 410,
  SESSION_MISMATCH: 409,
  GALLERY_LOCKED: 409,
  QUOTA_EXCEEDED: 409,
  QUOTA_UNKNOWN: 409,
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
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
  NOT_FOUND: "Không tìm thấy nội dung",
  LINK_EXPIRED: "Link đã hết hạn hoặc đã được thu hồi",
  SESSION_MISMATCH: "Phiên đang mở thuộc về một link khác",
  GALLERY_LOCKED: "Album đã được chốt, không thể thay đổi",
  QUOTA_EXCEEDED: "Đã vượt số ảnh tối đa cho phép",
  QUOTA_UNKNOWN: "Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH",
  CONFLICT: "Thao tác bị trùng, vui lòng thử lại",
  RATE_LIMITED: "Bạn thao tác quá nhanh, vui lòng chờ một lát",
  DRIVE_ACCESS_DENIED: "Thư mục Google Drive chưa được chia sẻ công khai",
  DRIVE_UNAVAILABLE: "Không kết nối được Google Drive, vui lòng thử lại",
  INTERNAL: "Có lỗi xảy ra, vui lòng thử lại",
};

/**
 * Đọc thân JSON của yêu cầu mà không để lộ SyntaxError ra ngoài route handler.
 *
 * VÌ SAO: `await request.json()` trần ném `SyntaxError` khi thân rỗng hoặc
 * bị cắt giữa chừng (yêu cầu đứt kết nối). Không route nào bắt riêng lỗi đó,
 * nên nó rơi xuống `catch` ngoài cùng và biến thành 500 INTERNAL thay vì 400
 * INVALID_INPUT — thấy thật ở `PATCH /api/g/selection` ngày 24/09/2026.
 *
 * Chỉ phân biệt thành công/hỏng ở tầng cú pháp JSON. Việc thân có đúng HÌNH
 * DẠNG mong đợi hay không (object, mảng, có trường bắt buộc...) vẫn là việc
 * của Zod schema gọi sau — vì vậy JSON hợp lệ nhưng không phải object (vd
 * chuỗi, số, mảng, `null`) vẫn được coi là "đọc thành công", để schema tự
 * quyết định đúng/sai hình dạng và trả `INVALID_INPUT` với `issues` chi tiết.
 */
export type JsonBodyResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false };

export async function readJsonBody<T = unknown>(
  request: Request,
): Promise<JsonBodyResult<T>> {
  try {
    const data = (await request.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

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
  let errDetails;
  if (err instanceof Error) {
    errDetails = { ...err, message: err.message, stack: err.stack };
  } else if (typeof err === "object" && err !== null) {
    errDetails = { ...err };
  } else {
    errDetails = String(err);
  }
  
  console.error(JSON.stringify({ evt: "unhandled_error", requestId, err: errDetails }));
  return fail("INTERNAL", undefined, { requestId });
}
