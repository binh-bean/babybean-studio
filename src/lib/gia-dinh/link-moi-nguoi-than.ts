/**
 * BB-372 — nhân viên XEM (chỉ đọc) các link mời người thân (ông bà / họ hàng) mà
 * ba mẹ đã tạo: nhãn, ngày tạo, số lần mở, lần cuối, số tim, đã thu hồi chưa, và
 * người được mời có gửi yêu cầu mua thêm không.
 *
 * Nguồn: `share_links` (role = 'viewer'), `tim_gia_dinh` (0083), `yeu_cau_mua_them`
 * (0073: `share_link_id`). Chưa áp 0073/0083 → rớt về 0 kèm `chuaApMigration`,
 * không 500.
 *
 * AN NINH: hàm này KHÔNG bao giờ trả mã đầy đủ, `token_hash`, hay bản mã hoá
 * (`share_link_ma`). Chỉ 6 ký tự đầu (`token_prefix`) để nhân viên phân biệt hai
 * link cùng nhãn. Không trả số điện thoại / tên người mua — nhân viên đã có chúng
 * ở khối "Yêu cầu mua thêm" của bộ ảnh.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { laLoiThieuBang, laLoiThieuCot } from "@/lib/gallery/dot-chon-server";

export interface LinkMoiNguoiThan {
  shareLinkId: string;
  /** Nhãn ba mẹ đặt ("Bà nội"). */
  nhan: string | null;
  taoLuc: string;
  soLanMo: number;
  moLanCuoi: string | null;
  /** Số tấm đã thả tim (ở màn bộ ảnh: chỉ tim của bộ đó). */
  soTim: number;
  /** Số yêu cầu mua thêm do link này gửi (ở màn bộ ảnh: chỉ của bộ đó). */
  soYeuCau: number;
  daThuHoi: boolean;
  /** Quá hạn mà cột status chưa kịp đổi. */
  daHetHan: boolean;
  /** "ca_nha": mời xem mọi bộ (gắn theo khách). "bo": mời xem đúng một bộ (link cũ theo bộ). */
  phamVi: "ca_nha" | "bo";
  /** Chỉ có khi phamVi = "bo". */
  tieuDeBo: string | null;
  /** 6 ký tự đầu — KHÔNG BAO GIỜ nhiều hơn. */
  maDau: string;
}

export interface KetQuaLinkMoi {
  links: LinkMoiNguoiThan[];
  /** Có ít nhất một bảng/cột chưa áp (số tim / số yêu cầu có thể thiếu). */
  chuaApMigration: boolean;
}

const GIOI_HAN = 100;

type DongLink = {
  id: string;
  gallery_id: string | null;
  customer_id: string | null;
  label: string | null;
  token_prefix: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number | null;
  last_viewed_at: string | null;
};

const COT = "id, gallery_id, customer_id, label, token_prefix, status, created_at, expires_at, revoked_at, view_count, last_viewed_at";

/**
 * @param customerId khách của bộ/trang (null: bộ không gắn khách)
 * @param galleryId  có = màn bộ ảnh (tim và yêu cầu chỉ đếm trong bộ này); không = trang khách (đếm cả nhà)
 *
 * Người gọi PHẢI đã kiểm quyền nhân viên + chi nhánh của khách/bộ này.
 */
export async function docLinkMoiNguoiThan(
  admin: SupabaseClient,
  opts: { customerId: string | null; galleryId?: string | null },
): Promise<KetQuaLinkMoi> {
  const { customerId, galleryId = null } = opts;
  let chuaApMigration = false;

  // Bộ ảnh nằm trong phạm vi: một bộ (màn bộ ảnh) hoặc mọi bộ của khách (trang khách).
  const tieuDeBo = new Map<string, string>();
  if (customerId) {
    const { data, error } = await admin.from("galleries").select("id, title").eq("customer_id", customerId);
    if (error) throw error;
    for (const g of data ?? []) tieuDeBo.set(g.id as string, (g.title as string | null) ?? "");
  }
  if (galleryId && !tieuDeBo.has(galleryId)) {
    const { data, error } = await admin.from("galleries").select("id, title").eq("id", galleryId).maybeSingle();
    if (error) throw error;
    if (data) tieuDeBo.set(data.id as string, (data.title as string | null) ?? "");
  }
  const idsBo = [...tieuDeBo.keys()];

  // Link mời: gắn theo khách (cả nhà) HOẶC gắn theo một bộ của khách (link cũ theo bộ).
  const loc: string[] = [];
  if (customerId) loc.push(`customer_id.eq.${customerId}`);
  const idsBoLoc = galleryId ? [galleryId] : idsBo;
  if (idsBoLoc.length > 0) loc.push(`gallery_id.in.(${idsBoLoc.join(",")})`);
  if (loc.length === 0) return { links: [], chuaApMigration };

  const { data: dong, error: lErr } = await admin
    .from("share_links")
    .select(COT)
    .eq("role", "viewer")
    .or(loc.join(","))
    .order("created_at", { ascending: false })
    .limit(GIOI_HAN);
  if (lErr) throw lErr;
  const hang = (dong ?? []) as DongLink[];
  if (hang.length === 0) return { links: [], chuaApMigration };
  const ids = hang.map((h) => h.id);

  // Tim — theo link (và theo bộ nếu đang ở màn bộ ảnh).
  const tim = new Map<string, number>();
  {
    let q = admin.from("tim_gia_dinh").select("share_link_id").in("share_link_id", ids).limit(10000);
    if (galleryId) q = q.eq("gallery_id", galleryId);
    const { data, error } = await q;
    if (error) {
      if (laLoiThieuBang(error) || laLoiThieuCot(error)) chuaApMigration = true;
      else throw error;
    } else {
      for (const r of (data ?? []) as { share_link_id: string }[]) {
        tim.set(r.share_link_id, (tim.get(r.share_link_id) ?? 0) + 1);
      }
    }
  }

  // Yêu cầu mua thêm do người được mời gửi (share_link_id gắn từ 0073).
  const yeuCau = new Map<string, number>();
  {
    let q = admin.from("yeu_cau_mua_them").select("share_link_id").in("share_link_id", ids).limit(10000);
    if (galleryId) q = q.eq("gallery_id", galleryId);
    const { data, error } = await q;
    if (error) {
      if (laLoiThieuBang(error) || laLoiThieuCot(error)) chuaApMigration = true;
      else throw error;
    } else {
      for (const r of (data ?? []) as { share_link_id: string | null }[]) {
        if (!r.share_link_id) continue;
        yeuCau.set(r.share_link_id, (yeuCau.get(r.share_link_id) ?? 0) + 1);
      }
    }
  }

  const bay = Date.now();
  const links = hang.map((h): LinkMoiNguoiThan => {
    const theoBo = !h.customer_id && !!h.gallery_id;
    return {
      shareLinkId: h.id,
      nhan: h.label,
      taoLuc: h.created_at,
      soLanMo: h.view_count ?? 0,
      moLanCuoi: h.last_viewed_at,
      soTim: tim.get(h.id) ?? 0,
      soYeuCau: yeuCau.get(h.id) ?? 0,
      daThuHoi: h.status === "revoked" || !!h.revoked_at,
      daHetHan: h.status === "expired" || (!!h.expires_at && new Date(h.expires_at).getTime() < bay),
      phamVi: theoBo ? "bo" : "ca_nha",
      tieuDeBo: theoBo ? (tieuDeBo.get(h.gallery_id as string) ?? null) : null,
      // 6 ký tự đầu, cắt cứng ở đây — kể cả khi cột lưu nhiều hơn.
      maDau: (h.token_prefix ?? "").slice(0, 6),
    };
  });

  return { links, chuaApMigration };
}
