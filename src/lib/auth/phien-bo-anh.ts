/**
 * BB-334A — Phiên khách + BỘ ẢNH CỦA LƯỢT GỌI NÀY.
 *
 * OWNER: SEC-ARCH. Hợp đồng cho đội B/C: docs/29-link-gia-dinh.md.
 *
 * ---------------------------------------------------------------------------
 * Lỗi đang vá: hai tab, một cookie
 * ---------------------------------------------------------------------------
 * Cookie phiên `bb_gs` chỉ chở MỘT `galleryId`. Với link gia đình (BB-130),
 * mở bộ 1 ở tab A rồi bộ 2 ở tab B thì tab B ký lại cookie sang bộ 2 — và cú
 * bấm "Chốt" ở tab A (đang hiện bộ 1) đi vào bộ 2 của tab B, vì máy chủ chỉ
 * đọc cookie.
 *
 * Cách vá: mỗi lượt gọi `/api/g/*` NÓI RÕ mình đang ở bộ nào — tiêu đề
 * `x-bb-bo: <galleryId>` (hoặc `?bo=<galleryId>` cho chỗ không đặt được tiêu đề
 * như EventSource/thẻ ảnh). Cookie chỉ còn chứng minh "đây là link X của khách Y".
 * Máy chủ KHÔNG tin con số đó, mà kiểm:
 *
 *   | Link của phiên        | Có `x-bb-bo`                                       | Không có         |
 *   |-----------------------|----------------------------------------------------|------------------|
 *   | theo bộ (kiểu cũ)     | phải BẰNG đúng bộ của link, khác → FORBIDDEN        | bộ của cookie    |
 *   | gia đình (customerId) | bộ phải thuộc ĐÚNG khách đó + đang hiện cho khách;  | bộ của cookie    |
 *   |                       | lượt chọn tra theo cặp (link, bộ), không từ cookie  | (rỗng với /k/…)  |
 *
 * Link cũ KHÔNG được thêm quyền nào: nó chỉ được nêu lại chính bộ của nó.
 * Phiên mở bằng `/api/k/[ma]` có `galleryId` RỖNG — không có gì để rơi về, nên
 * trên đường `/k/<mã>/<n>` thiếu tiêu đề là lỗi chứ không đoán bộ.
 *
 * Link đã thu hồi: `requireGallerySession()` → `assertShareLinkUsable()` chặn
 * TRƯỚC khi tới đây (LINK_EXPIRED), cho cả hai loại link.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GallerySession, ShareRole } from "@/types/domain";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { layHoacTaoLuotChon } from "@/lib/selection/luot-chon-theo-link";

/** Tiêu đề mang id bộ ảnh của lượt gọi. */
export const TIEU_DE_BO_ANH = "x-bb-bo";
/** Tham số địa chỉ thay thế (chỗ không đặt được tiêu đề). */
export const THAM_SO_BO_ANH = "bo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trạng thái bộ ảnh KHÔNG hiện cho gia đình — cùng luật `/api/g/buoi-chup`:
 * `draft` (chưa đồng bộ xong) và `archived` (cất kho). `expired` VẪN hiện (0010).
 */
export const TRANG_THAI_AN_VOI_GIA_DINH = ["draft", "archived"] as const;

/** Id bộ ảnh lượt gọi nêu ra (tiêu đề trước, rồi `?bo=`). Không có → null. */
export function boAnhYeuCau(req?: Pick<Request, "headers" | "url"> | null): string | null {
  if (!req) return null;
  const tieuDe = req.headers?.get?.(TIEU_DE_BO_ANH)?.trim();
  if (tieuDe) return tieuDe;
  try {
    const q = new URL(req.url).searchParams.get(THAM_SO_BO_ANH)?.trim();
    return q || null;
  } catch {
    return null;
  }
}

/**
 * Bộ ảnh `galleryId` có thuộc khách `customerId` và đang hiện cho gia đình không.
 * Một câu, ba điều kiện đi CÙNG NHAU (id + khách + đang hiện) — thiếu điều kiện
 * khách là mọi nhà đọc được bộ của mọi nhà khác.
 */
export async function boAnhCuaKhach(
  admin: SupabaseClient,
  customerId: string,
  galleryId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("galleries")
    .select("id")
    .eq("id", galleryId)
    .eq("customer_id", customerId)
    .gt("photo_count", 0)
    .not("status", "in", `(${TRANG_THAI_AN_VOI_GIA_DINH.join(",")})`)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/**
 * Chốt bộ ảnh của lượt gọi cho một phiên ĐÃ xác thực (xem bảng ở đầu tệp).
 * Trả về phiên cùng hình dạng `GallerySession` — các route giữ nguyên cách đọc
 * `session.galleryId` / `session.selectionId`.
 */
export async function chotBoAnhChoPhien(
  session: GallerySession,
  boYeuCau: string | null,
): Promise<GallerySession> {
  if (!boYeuCau) return session;
  if (!UUID_RE.test(boYeuCau)) throw new GallerySessionError("FORBIDDEN");

  // Link theo bộ (kiểu cũ): chỉ được nêu lại ĐÚNG bộ của mình.
  if (!session.customerId) {
    if (boYeuCau !== session.galleryId) throw new GallerySessionError("FORBIDDEN");
    return session;
  }

  // Link gia đình: bộ phải thuộc đúng khách của link.
  const admin = createAdminClient();
  if (!(await boAnhCuaKhach(admin, session.customerId, boYeuCau))) {
    throw new GallerySessionError("FORBIDDEN");
  }

  const selectionId = await layHoacTaoLuotChon(admin, {
    shareLinkId: session.shareLinkId,
    galleryId: boYeuCau,
    laKhachChinh: session.role === "owner",
    laLinkGiaDinh: true,
  });

  return { ...session, galleryId: boYeuCau, selectionId };
}

/**
 * `requireGallerySession()` + chốt bộ ảnh của lượt gọi. MỌI route `/api/g/*`
 * đọc dữ liệu theo bộ ảnh dùng hàm này thay cho `requireGallerySession()`.
 */
export async function requirePhienBoAnh(
  req: Pick<Request, "headers" | "url"> | null | undefined,
  allowedRoles?: readonly ShareRole[],
  tuyChon: {
    /**
     * Route làm việc theo KHÁCH, không cần bộ ảnh (mời người thân theo nhà, tên
     * kênh tức thì khi chưa mở bộ nào). Mặc định: CẦN bộ ảnh.
     */
    khongCanBoAnh?: boolean;
  } = {},
): Promise<GallerySession> {
  const session = await requireGallerySession(allowedRoles);
  const kq = await chotBoAnhChoPhien(session, boAnhYeuCau(req));
  // Phiên gia đình mở bằng /api/k/<mã> có bộ RỖNG: thiếu `x-bb-bo` thì từ chối
  // rõ ràng (403) thay vì để câu `.eq("id", "")` ném lỗi uuid thành 500.
  if (!kq.galleryId && !tuyChon.khongCanBoAnh) throw new GallerySessionError("FORBIDDEN");
  return kq;
}
