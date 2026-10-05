/**
 * GET  /api/g/tim-gia-dinh — tim của gia đình.
 *   · Người được mời (viewer): tim CỦA CHÍNH LINK NÀY (`cuaToi`).
 *   · Ba mẹ (owner/co_editor/suggester): tim của MỌI link mời trong bộ ảnh,
 *     gom theo tấm (`giaDinh: [{ photoId, soNguoi }]`) — để ba mẹ cân nhắc
 *     thêm vào gói hoặc mua thêm. KHÔNG đổi danh sách trong gói của ba mẹ.
 * POST /api/g/tim-gia-dinh — viewer thả/bỏ tim: `{ them?: uuid[], bo?: uuid[] }`.
 *   Lần đầu màn khách gửi `them` = toàn bộ tim cũ trong trình duyệt (BB-338),
 *   sau đó máy chủ là nguồn thật, trình duyệt chỉ là bộ nhớ đệm.
 *
 * OWNER: DEV-BE. Task BB-345. Bảng `tim_gia_dinh` (migration 0083).
 *
 * An ninh:
 *   · Bộ ảnh và link LẤY TỪ PHIÊN đã ký (`requireGallerySession`), không bao
 *     giờ từ thân yêu cầu. Đọc khoá theo `share_link_id` + `gallery_id` của
 *     phiên — link của bộ ảnh A không đọc được tim của bộ ảnh B.
 *   · Mọi `photoId` gửi lên phải thuộc ĐÚNG bộ ảnh của phiên, nếu không 404 —
 *     kiểm TRƯỚC khi chạm bảng tim (nên còn canh được cả khi chưa áp 0083).
 *   · Ba mẹ POST → 403: tim của ba mẹ là `selection_items` (/api/g/selection).
 *
 * Chưa áp 0083: GET trả rỗng + `chuaApMigration: true`; POST trả 200
 * `{ chuaApMigration: true }` — màn khách giữ tim ở trình duyệt như BB-338.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { dangMoChoKhachXem } from "@/lib/gallery/mo-cho-khach-xem";
import { TOI_DA_ANH_CHINH_SUA } from "@/lib/gallery/tim-gia-dinh";
import { docTimCuaLink, demTimGiaDinh, laChuaAp0083 } from "@/lib/gallery/tim-gia-dinh-server";

export const runtime = "nodejs";

const DsAnh = z.array(z.string().uuid()).max(TOI_DA_ANH_CHINH_SUA);
const Body = z
  .object({ them: DsAnh.optional(), bo: DsAnh.optional() })
  .refine((b) => (b.them?.length ?? 0) + (b.bo?.length ?? 0) > 0, { message: "Thiếu ảnh" })
  .refine((b) => (b.them?.length ?? 0) + (b.bo?.length ?? 0) <= TOI_DA_ANH_CHINH_SUA, { message: "Quá nhiều ảnh" });

/** Đếm số id thuộc đúng bộ ảnh — chia lô 150 id để địa chỉ PostgREST không quá dài. */
async function demAnhThuocBo(
  admin: ReturnType<typeof createAdminClient>,
  galleryId: string,
  ids: string[],
): Promise<number> {
  let dem = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const lo = ids.slice(i, i + 150);
    const { data, error } = await admin.from("photos").select("id").eq("gallery_id", galleryId).in("id", lo);
    if (error) throw error;
    dem += (data ?? []).length;
  }
  return dem;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    const admin = createAdminClient();

    if (session.role === "viewer") {
      const { ids, chuaApMigration } = await docTimCuaLink(admin, session.shareLinkId, session.galleryId);
      return ok({ vai: "viewer", cuaToi: ids, chuaApMigration });
    }

    const { theoAnh, chuaApMigration } = await demTimGiaDinh(admin, session.galleryId);
    return ok({
      vai: "ba_me",
      giaDinh: Array.from(theoAnh, ([photoId, soNguoi]) => ({ photoId, soNguoi })),
      chuaApMigration,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    if (session.role !== "viewer") {
      return fail("FORBIDDEN", "Ba mẹ thả tim ở danh sách chọn ảnh của mình ạ");
    }

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    const parsed = Body.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });

    const them = Array.from(new Set(parsed.data.them ?? []));
    const bo = Array.from(new Set(parsed.data.bo ?? [])).filter((id) => !them.includes(id));
    const admin = createAdminClient();

    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    if (!dangMoChoKhachXem(gallery.status as string)) {
      return fail("CONFLICT", "Bộ ảnh này không còn mở cho gia đình ạ");
    }

    // Ảnh phải thuộc ĐÚNG bộ ảnh của phiên — kiểm trước khi chạm bảng tim.
    const tatCa = [...them, ...bo];
    if ((await demAnhThuocBo(admin, session.galleryId, tatCa)) !== tatCa.length) {
      return fail("NOT_FOUND", "Không tìm thấy tấm ảnh này trong bộ ảnh");
    }

    if (them.length > 0) {
      const { error } = await admin.from("tim_gia_dinh").upsert(
        them.map((photoId) => ({
          gallery_id: session.galleryId,
          share_link_id: session.shareLinkId,
          photo_id: photoId,
        })),
        { onConflict: "share_link_id,photo_id", ignoreDuplicates: true },
      );
      if (error) {
        if (laChuaAp0083(error)) return ok({ cuaToi: null, chuaApMigration: true });
        throw error;
      }
    }
    if (bo.length > 0) {
      const { error } = await admin
        .from("tim_gia_dinh")
        .delete()
        .eq("share_link_id", session.shareLinkId)
        .eq("gallery_id", session.galleryId)
        .in("photo_id", bo);
      if (error) {
        if (laChuaAp0083(error)) return ok({ cuaToi: null, chuaApMigration: true });
        throw error;
      }
    }

    const { ids, chuaApMigration } = await docTimCuaLink(admin, session.shareLinkId, session.galleryId);
    return ok({ cuaToi: ids, chuaApMigration });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
