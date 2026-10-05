/**
 * GET /api/k/<mã> — trang gia đình: danh sách bộ ảnh của nhà.
 *
 * OWNER: DEV-BE. Task BB-334A. Hợp đồng: docs/29-link-gia-dinh.md §2.1.
 *
 * Mã trong đường dẫn là nguồn đúng (như BB-187): cookie đang giữ phiên của
 * ĐÚNG link này (so bằng token_hash của link trong phiên — không tra ngược mã
 * nào khác, nên không thành máy dò mã) thì dùng luôn, khỏi đốt lượt giới hạn.
 * Không thì đổi mã lấy phiên bằng `dangNhapBangMa` (giới hạn lượt theo IP,
 * nhật ký, link thu hồi → NOT_FOUND, hết hạn → LINK_EXPIRED) và đặt cookie trên
 * chính phản hồi này.
 *
 * Phiên đặt ở đây có `galleryId` RỖNG với link gia đình: mọi lượt gọi `/api/g/*`
 * sau đó phải nêu bộ ảnh bằng `x-bb-bo` (src/lib/auth/phien-bo-anh.ts).
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { getGallerySession, assertShareLinkUsable, GallerySessionError } from "@/lib/auth/gallery-session";
import { dangNhapBangMa, datCookiePhien } from "@/lib/auth/dang-nhap-bang-ma";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { createAdminClient } from "@/lib/supabase/admin";
import { kenhKhach } from "@/lib/supabase/tuc-thi";
import { danhSachBoAnhGiaDinh, choKhach, tenNhaTuDanhSach } from "@/lib/gia-dinh/bo-anh-gia-dinh";
import type { GallerySession } from "@/types/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phiên trong cookie có phải của ĐÚNG mã này, và link còn dùng được không. */
async function phienCuaDungMa(ma: string): Promise<GallerySession | null> {
  const s = await getGallerySession();
  if (!s) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("share_links").select("token_hash").eq("id", s.shareLinkId).maybeSingle();
  if (!data || data.token_hash !== (await bamMaLink(ma))) return null;
  try {
    await assertShareLinkUsable(s.shareLinkId);
  } catch (err) {
    if (err instanceof GallerySessionError) return null;
    throw err;
  }
  return s;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ma: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { ma } = await context.params;
    if (!ma || ma.length > 200) return fail("NOT_FOUND");

    let session = await phienCuaDungMa(ma);
    let cookieMoi: { token: string; expiresAt: Date } | null = null;
    if (!session) {
      const kq = await dangNhapBangMa(ma, request);
      if (!kq.ok) return fail(kq.code, kq.message);
      session = { ...kq.phien, exp: Math.floor(kq.cookie.expiresAt.getTime() / 1000) };
      cookieMoi = kq.cookie;
    }

    const admin = createAdminClient();
    let loaiLink: "gia_dinh" | "theo_bo" = "gia_dinh";
    let customerId = session.customerId;
    if (!customerId) {
      // Link cũ theo bộ mở qua /k/: CHỈ đúng bộ của nó — không thêm quyền.
      loaiLink = "theo_bo";
      const { data: g, error } = await admin
        .from("galleries")
        .select("customer_id")
        .eq("id", session.galleryId)
        .maybeSingle();
      if (error) throw error;
      customerId = (g?.customer_id as string | undefined) ?? "";
    }

    let ds = customerId ? await danhSachBoAnhGiaDinh(admin, customerId) : [];
    if (loaiLink === "theo_bo") ds = ds.filter((b) => b.id === session!.galleryId);

    const { tenNha, tenNgan } = tenNhaTuDanhSach(ds);
    const res = ok({
      loaiLink,
      vai: session.role,
      tenNha,
      tenNgan,
      manifest: `/api/k/${encodeURIComponent(ma)}/manifest.webmanifest`,
      kenhTucThi: ds.map((b) => kenhKhach(b.id)),
      boAnh: choKhach(ds),
    });
    if (cookieMoi) datCookiePhien(res, cookieMoi);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
