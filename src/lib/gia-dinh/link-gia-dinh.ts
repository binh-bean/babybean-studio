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
import { soThuTuCacBo } from "@/lib/gia-dinh/bo-anh-gia-dinh";

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
  dong: { galleryId: string; recordId: string; soThuTu: number | null; ghiDuoc: boolean; lyDo: string | null }[];
  lyDo?: string | null;
}

/** BB-368 — đường dẫn "màn con" của bộ thứ `n` trong trang gia đình. */
export const duongDanManCon = (ma: string, soThuTu: number) => `/k/${ma}/${soThuTu}`;

/**
 * Ghi vào cột "Link app" của MỌI dòng Hậu Kỳ của khách (mỗi bộ có
 * `lark_hauky_record_id`). BB-368 (anh chốt 06/10): mỗi dòng nhận link MÀN CON
 * của ĐÚNG bộ đó `/k/<mã>/<n>` — không phải `/k/<mã>` chung — để CSKH bấm từ
 * dòng Lark là vào thẳng buổi chụp đó. Dùng lại `ghiLinkAppVeLark` — hàm đó
 * không bao giờ ném, tự tắt khi chạy phép thử (`khongGuiRaLarkThat`). Tuần tự
 * từng dòng: Lark giới hạn tần suất theo app, và một nhà chỉ có vài bộ.
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

  if (!diaChiDayDu(duongDanGiaDinh(ma))) {
    return {
      tong: dsDong.length,
      ghiDuoc: 0,
      dong: [],
      lyDo: "Thiếu NEXT_PUBLIC_APP_URL nên không dựng được địa chỉ đầy đủ để ghi sang Lark.",
    };
  }

  const soThuTu = dsDong.length > 0 ? await soThuTuCacBo(admin, customerId) : new Map<string, number>();

  const dong: KetQuaGhiLarkGiaDinh["dong"] = [];
  for (const g of dsDong) {
    const so = soThuTu.get(g.id) ?? null;
    if (so === null) {
      // Không thể xảy ra (bộ vừa đọc theo đúng khách này) — nhưng ghi `/k/<mã>`
      // chung thay vào là ghi sai bộ, nên thà báo không ghi.
      dong.push({ galleryId: g.id, recordId: g.lark_hauky_record_id!, soThuTu: null, ghiDuoc: false, lyDo: "Không tính được số thứ tự bộ." });
      continue;
    }
    const diaChi = diaChiDayDu(duongDanManCon(ma, so))!;
    const kq = await ghiLinkAppVeLark({ recordId: g.lark_hauky_record_id!, diaChi, ghiThat: true }).catch(
      (err: unknown) => ({ ghiDuoc: false, lyDo: err instanceof Error ? err.message : String(err) }),
    );
    dong.push({ galleryId: g.id, recordId: g.lark_hauky_record_id!, soThuTu: so, ghiDuoc: kq.ghiDuoc, lyDo: kq.lyDo ?? null });
  }
  return { tong: dsDong.length, ghiDuoc: dong.filter((d) => d.ghiDuoc).length, dong };
}

export interface KetQuaGhiSauDongBo {
  /** Đã thử ghi lên Lark chưa (false: không đủ điều kiện — xem `boQua`). */
  daThu: boolean;
  ghiDuoc: boolean;
  boQua?: "khong_co_khach" | "khong_co_dong_lark" | "bo_chua_co_anh" | "chua_co_link_gia_dinh" | "khong_doc_lai_duoc_ma" | "thieu_dia_chi_goc";
  lyDo?: string | null;
  duongDan?: string;
}

/**
 * BB-368 — sau khi ĐỒNG BỘ ẢNH xong (bộ đã có ảnh) mà khách ĐÃ có link gia đình:
 * ghi link màn con `/k/<mã>/<n>` của bộ này vào cột "Link app" của dòng Hậu Kỳ
 * của bộ — CHỈ KHI Ô ĐANG TRỐNG (`chiKhiTrong`). Không gửi gì cho khách.
 *
 * Không bao giờ ném: đồng bộ ảnh đã xong, lỗi ở đây chỉ được làm mất một lượt
 * ghi tiện tay, không được biến lượt đồng bộ thành lỗi.
 */
export async function ghiLinkManConSauDongBo(
  admin: SupabaseClient,
  galleryId: string,
  ngucanh: { requestId: string; actorId?: string | null },
): Promise<KetQuaGhiSauDongBo> {
  try {
    const { data: g, error } = await admin
      .from("galleries")
      .select("id, branch_id, customer_id, photo_count, lark_hauky_record_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (error) throw error;
    if (!g?.customer_id) return { daThu: false, ghiDuoc: false, boQua: "khong_co_khach" };
    if (!g.lark_hauky_record_id) return { daThu: false, ghiDuoc: false, boQua: "khong_co_dong_lark" };
    if (!((g.photo_count as number | null) ?? 0)) return { daThu: false, ghiDuoc: false, boQua: "bo_chua_co_anh" };

    const song = await linkGiaDinhSong(admin, g.customer_id as string);
    if (!song) return { daThu: false, ghiDuoc: false, boQua: "chua_co_link_gia_dinh" };
    const ma = await giaiMaLink(admin, song);
    if (!ma) return { daThu: false, ghiDuoc: false, boQua: "khong_doc_lai_duoc_ma" };
    const so = (await soThuTuCacBo(admin, g.customer_id as string)).get(galleryId);
    if (!so) return { daThu: false, ghiDuoc: false, boQua: "khong_co_khach" };

    const duongDan = duongDanManCon(ma, so);
    const diaChi = diaChiDayDu(duongDan);
    if (!diaChi) return { daThu: false, ghiDuoc: false, boQua: "thieu_dia_chi_goc" };

    const kq = await ghiLinkAppVeLark({
      recordId: g.lark_hauky_record_id as string,
      diaChi,
      ghiThat: true,
      chiKhiTrong: true,
    }).catch((err: unknown) => ({ ghiDuoc: false, lyDo: err instanceof Error ? err.message : String(err) }));

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: ngucanh.actorId ? "staff" : "system",
      actor_id: ngucanh.actorId ?? null,
      branch_id: g.branch_id ?? null,
      action: "share_link.gia_dinh_ghi_lark_sau_dong_bo",
      entity_type: "gallery",
      entity_id: galleryId,
      gallery_id: galleryId,
      // SÁU ký tự đầu — không bao giờ cả mã (AGENTS §5).
      metadata: { shareLinkId: song.id, tokenPrefix: ma.slice(0, 6), soThuTu: so, ghiDuoc: kq.ghiDuoc, lyDo: kq.lyDo ?? null },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    console.info(
      JSON.stringify({
        evt: "share_link.gia_dinh_lark_sau_dong_bo",
        requestId: ngucanh.requestId,
        galleryId,
        tokenPrefix: ma.slice(0, 6),
        soThuTu: so,
        ghiDuoc: kq.ghiDuoc,
        lyDo: kq.lyDo ?? null,
      }),
    );
    return { daThu: true, ghiDuoc: kq.ghiDuoc, lyDo: kq.lyDo ?? null, duongDan };
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "share_link.gia_dinh_lark_sau_dong_bo_loi",
        requestId: ngucanh.requestId,
        galleryId,
        lyDo: err instanceof Error ? err.message : String(err),
      }),
    );
    return { daThu: false, ghiDuoc: false, lyDo: err instanceof Error ? err.message : String(err) };
  }
}
