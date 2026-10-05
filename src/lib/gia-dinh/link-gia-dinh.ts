/**
 * BB-334A — link gia đình: tra theo mã, tạo / đổi / thu hồi, ghi sang Lark.
 *
 * OWNER: DEV-BE. Hợp đồng: docs/29-link-gia-dinh.md §3.
 *
 * Link gia đình = `share_links` có `customer_id`, `role = 'owner'`,
 * `expires_at = null` (0010 — địa chỉ vĩnh viễn). Mỗi khách tối đa MỘT link
 * sống: tạo mới luôn thu hồi link cũ TRƯỚC (0090 thêm chỉ mục duy nhất làm lưới
 * cuối). Mã trần không bao giờ vào cơ sở dữ liệu: `token_hash` (SHA-256) +
 * bản mã hoá AES-GCM ở `share_link_ma` (BB-201) để màn CSKH hiện lại.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { giaiMaMaLink, maHoaMaLink } from "@/lib/auth/ma-link";
import { ghiLinkAppVeLark, diaChiDayDu } from "@/lib/lark/ghi-link-app";

export interface DongLink {
  id: string;
  gallery_id: string | null;
  customer_id: string | null;
  role: string;
  status: string;
  expires_at: string | null;
}

/** Link còn dùng được: đang `active` và chưa quá hạn. */
export function linkDungDuoc(l: Pick<DongLink, "status" | "expires_at"> | null | undefined): boolean {
  return !!l && l.status === "active" && (!l.expires_at || new Date(l.expires_at) > new Date());
}

/** Tra link theo mã trần (KHÔNG giới hạn lượt — chỉ dùng cho manifest/icon, như BB-213). */
export async function traLinkTheoMa(admin: SupabaseClient, ma: string): Promise<DongLink | null> {
  if (!ma || ma.length > 200) return null;
  const { data, error } = await admin
    .from("share_links")
    .select("id, gallery_id, customer_id, role, status, expires_at")
    .eq("token_hash", await bamMaLink(ma))
    .maybeSingle();
  if (error) throw error;
  return (data as DongLink | null) ?? null;
}

/** 32 byte ngẫu nhiên base64url (43 ký tự) — cùng cách sinh mã với link CSKH. */
export function taoMaLink(): string {
  return randomBytes(32).toString("base64url");
}

export const duongDanGiaDinh = (ma: string) => `/k/${ma}`;

/** Vai được ĐỔI / THU HỒI link gia đình (anh chốt Q8 ★: CSKH và Admin; `owner` = chủ studio, hiện "Admin"). */
export const VAI_DOI_LINK_GIA_DINH = ["cs", "admin", "owner"] as const;

export function duocDoiLinkGiaDinh(staff: { role: string }): boolean {
  return (VAI_DOI_LINK_GIA_DINH as readonly string[]).includes(staff.role);
}

/** Link gia đình đang sống của khách (owner, theo khách, active). */
export async function linkGiaDinhSong(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ id: string; token_hash: string; token_prefix: string | null; created_at: string; view_count: number | null; last_viewed_at: string | null } | null> {
  const { data, error } = await admin
    .from("share_links")
    .select("id, token_hash, token_prefix, created_at, view_count, last_viewed_at")
    .eq("customer_id", customerId)
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Giải mã lại mã trần của một link, ĐỐI CHIẾU với token_hash — lệch thì null. */
export async function giaiMaLink(
  admin: SupabaseClient,
  link: { id: string; token_hash: string },
): Promise<string | null> {
  const { data } = await admin.from("share_link_ma").select("ma_hoa").eq("share_link_id", link.id).maybeSingle();
  const ma = giaiMaMaLink((data as { ma_hoa?: string } | null)?.ma_hoa);
  if (!ma) return null;
  return (await bamMaLink(ma)) === link.token_hash ? ma : null;
}

export interface KetQuaTaoLink {
  shareLinkId: string;
  ma: string;
  luuDiaChiDuoc: boolean;
  daThuHoi: string | null;
}

/**
 * Tạo link gia đình mới cho khách. Có link sống thì thu hồi TRƯỚC và chuyển
 * lượt chọn của link cũ sang link mới (luật BB-148: cấp lại link thì danh sách
 * đi theo). Kiểm quyền/xác nhận là việc của route.
 */
export async function taoLinkGiaDinh(
  admin: SupabaseClient,
  args: { customerId: string; staffId: string | null; requestId: string },
): Promise<KetQuaTaoLink> {
  const cu = await linkGiaDinhSong(admin, args.customerId);
  if (cu) {
    const { error } = await admin
      .from("share_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: args.staffId })
      .eq("id", cu.id)
      .eq("status", "active");
    if (error) throw error;
  }

  const ma = taoMaLink();
  const { data: link, error } = await admin
    .from("share_links")
    .insert({
      customer_id: args.customerId,
      // gallery_id TRỐNG: chk_share_link_target bắt đúng một trong hai.
      token_hash: await bamMaLink(ma),
      token_prefix: ma.slice(0, 6),
      role: "owner",
      label: "Link gia đình",
      status: "active",
      expires_at: null,
      created_by: args.staffId,
    })
    .select("id")
    .single();
  if (error || !link) throw error ?? new Error("Tạo link gia đình không trả về gì");

  if (cu) {
    // BB-148 — lượt chọn của link gia đình cũ đi theo link mới. (Lượt chọn chính
    // dùng chung với link cũ theo bộ thì vẫn nằm trên link theo bộ — không đụng.)
    const { error: chuyenErr } = await admin
      .from("selections")
      .update({ share_link_id: link.id })
      .eq("share_link_id", cu.id);
    if (chuyenErr) throw chuyenErr;
  }

  let luuDiaChiDuoc = true;
  try {
    const { error: maErr } = await admin.from("share_link_ma").insert({ share_link_id: link.id, ma_hoa: maHoaMaLink(ma) });
    if (maErr) throw new Error(maErr.message);
  } catch (err) {
    luuDiaChiDuoc = false;
    console.error(
      JSON.stringify({
        evt: "share_link_ma.insert_failed",
        requestId: args.requestId,
        shareLinkId: link.id,
        lyDo: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { shareLinkId: link.id as string, ma, luuDiaChiDuoc, daThuHoi: cu?.id ?? null };
}

export interface KetQuaGhiLarkGiaDinh {
  tong: number;
  ghiDuoc: number;
  dong: { galleryId: string; recordId: string; ghiDuoc: boolean; lyDo: string | null }[];
  lyDo?: string | null;
}

/**
 * Ghi CÙNG MỘT địa chỉ `/k/<mã>` vào cột "Link app" của MỌI dòng Hậu Kỳ của
 * khách (mỗi bộ có `lark_hauky_record_id`). Dùng lại `ghiLinkAppVeLark` — hàm
 * đó không bao giờ ném, tự tắt khi chạy phép thử (`khongGuiRaLarkThat`). Tuần
 * tự từng dòng: Lark giới hạn tần suất theo app, và một nhà chỉ có vài bộ.
 */
export async function ghiLinkGiaDinhVeLark(
  admin: SupabaseClient,
  customerId: string,
  ma: string,
): Promise<KetQuaGhiLarkGiaDinh> {
  const { data, error } = await admin
    .from("galleries")
    .select("id, lark_hauky_record_id")
    .eq("customer_id", customerId)
    .not("lark_hauky_record_id", "is", null);
  if (error) throw error;
  const dsDong = ((data ?? []) as { id: string; lark_hauky_record_id: string | null }[]).filter(
    (g) => !!g.lark_hauky_record_id,
  );

  const diaChi = diaChiDayDu(duongDanGiaDinh(ma));
  if (!diaChi) {
    return {
      tong: dsDong.length,
      ghiDuoc: 0,
      dong: [],
      lyDo: "Thiếu NEXT_PUBLIC_APP_URL nên không dựng được địa chỉ đầy đủ để ghi sang Lark.",
    };
  }

  const dong: KetQuaGhiLarkGiaDinh["dong"] = [];
  for (const g of dsDong) {
    const kq = await ghiLinkAppVeLark({ recordId: g.lark_hauky_record_id!, diaChi, ghiThat: true }).catch(
      (err: unknown) => ({ ghiDuoc: false, lyDo: err instanceof Error ? err.message : String(err) }),
    );
    dong.push({ galleryId: g.id, recordId: g.lark_hauky_record_id!, ghiDuoc: kq.ghiDuoc, lyDo: kq.lyDo ?? null });
  }
  return { tong: dsDong.length, ghiDuoc: dong.filter((d) => d.ghiDuoc).length, dong };
}
