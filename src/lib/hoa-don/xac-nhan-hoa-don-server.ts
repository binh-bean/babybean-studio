/**
 * BB-395 — xác nhận phát sinh bằng MÃ HOÁ ĐƠN (phía máy chủ). Route chỉ gọi tệp này; tệp này
 * chỉ nói chuyện với `NguonHoaDon` (không biết Lark) và `doi-chieu-hoa-don.ts` (thuần).
 *
 * ---------------------------------------------------------------------------
 * MỘT cơ chế nâng hạn mức (không cộng hai lần)
 * ---------------------------------------------------------------------------
 * Hoá đơn đủ điều kiện → app thêm dòng `gallery_items` "Edit file × N" mang dấu
 * `lark_record_id = 'hoa_don:<mã dòng>'` (N = file hoá đơn nâng hạn mức, `line_total` = tiền
 * hoá đơn phần đó) VÀ ghi phiếu thu vào `gallery_payments` (`ma_hoa_don`, `ma_phieu_thu`,
 * phương thức theo phiếu). KHÔNG gọi `dongBoHanMucTheoThanhToan` (BB-348) — số tiền khớp nhờ
 * `TienHanMucHoaDon` trong `layTienCanThu` (xem tien-phat-sinh.ts), nên BB-348 chạy ở lần
 * nhập tay kế tiếp cũng không nâng thêm cho phần hoá đơn đã nâng (phép thử chứng minh).
 *
 * ---------------------------------------------------------------------------
 * Không ghi nửa vời, không ghi hai lần
 * ---------------------------------------------------------------------------
 *   · Đọc HẾT hoá đơn từ nguồn trước khi ghi bất cứ thứ gì: nguồn lỗi/chậm → không ghi gì.
 *   · Dòng hạn mức đồng bộ theo MỤC TIÊU (thêm/sửa/xoá cho đúng), khoá `lark_record_id` unique.
 *   · Dòng sổ mang `ma_yeu_cau = hd-<lần gán>-<băm mã phiếu>`: chỉ mục duy nhất của 0086 chặn
 *     ghi lần hai (đồng bộ lại, bấm đúp, hai người cùng bấm).
 *   · Mỗi bước sau idempotent: hỏng giữa chừng thì bấm "Đồng bộ" lần nữa là đủ.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffSession } from "@/types/domain";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { KHOA_THU_SAN_PHAM_QUA_APP, laBatThuSanPhamQuaApp } from "@/lib/gallery/tien-phat-sinh";
import { baoKhachSauThanhToan, layKhoaKhiThu, xacNhanDot1, xacNhanDotMuaThem } from "@/lib/gallery/xac-nhan-danh-sach";
import { LoiNguonHoaDon, cauLoiNguon, type HoaDonChuan, type NguonHoaDon } from "@/lib/hoa-don/nguon-hoa-don";
import {
  CAU_KHACH,
  chiaTienTheoPhieuThu,
  doiChieuHoaDon,
  goiYBoAnhChoHoaDon,
  hauKyLechBo,
  kiemDieuKienHoaDon,
  kiemKhachHoaDon,
  tienFileNangHanMuc,
  tienGhiSoChoHoaDon,
  type BoUngVien,
  type KetQuaDoiChieu,
  type KetQuaKhach,
  type DotApp,
  type PhatSinhApp,
  type SanPhamApp,
  ghiChuDongSo,
} from "@/lib/hoa-don/doi-chieu-hoa-don";
import { TIEN_TO_DONG_HOA_DON, laDongHoaDon, maDongHoaDonTrongApp } from "@/lib/hoa-don/han-muc-hoa-don";
import {
  CAU_TRUNG_KHACH,
  docKhoaKhachHoaDonGoc,
  kiemKhachChoBo,
  laKhopKhach,
  type KetQuaKhachBo,
  type LenhNoiKhoa,
} from "@/lib/hoa-don/khop-khach-du-phong";
import { laLoiChuaApMigration, layMotDot } from "@/lib/gallery/dot-chon-server";

export const QUYEN_NHAP_TAY = "thanh_toan:nhap_tay";

/**
 * Nhập tiền tay / ép gán / gỡ gán hoá đơn: quyền `thanh_toan:nhap_tay` (0102 cấp owner, admin,
 * branch_manager). Vai `system:superuser` (owner/admin) cũng được — để trước khi áp 0102 Admin
 * vẫn còn đường dự phòng.
 */
export function coQuyenNhapTay(staff: Pick<StaffSession, "permissions">): boolean {
  return staff.permissions.includes(QUYEN_NHAP_TAY) || staff.permissions.includes("system:superuser");
}

export interface DongGanHoaDon {
  id: string;
  ma: string;
  trangThai: string;
  ketQua: unknown;
  epGanLyDo: string | null;
  ganLuc: string;
  dongBoLuc: string | null;
  xacNhanLuc: string | null;
}

export type KetQuaThaoTac =
  | { ok: true; message: string; canhBao: string[]; doiChieu: KetQuaDoiChieu | null; daGhiSo: number; daKhoa: boolean }
  | {
      ok: false;
      code: "INVALID_INPUT" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "LARK";
      message: string;
      /** Link Hậu Kỳ của hoá đơn trỏ bộ khác: gửi lại kèm `xacNhanHauKy: true`. */
      canXacNhanHauKy?: boolean;
      /** Khách không tự kiểm được: chỉ người có quyền nhập tay ép gán được, kèm lý do. */
      choPhepEpGan?: boolean;
    };

const BANG_GAN = "hoa_don_bo_anh";

/** Bảng 0102 chưa áp: PostgREST PGRST205 / Postgres 42P01. */
export function laLoiChuaCoBang(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "PGRST205" || e.code === "42P01" || /hoa_don_bo_anh/.test(e.message ?? "");
}

export const CAU_CHUA_AP_0102 = "Cơ sở dữ liệu chưa có bảng hoá đơn (chờ áp migration 0102).";

export async function layHoaDonDaGan(admin: SupabaseClient, galleryId: string): Promise<DongGanHoaDon[]> {
  const { data, error } = await admin
    .from(BANG_GAN)
    .select("id, ma_hoa_don, trang_thai, ket_qua, ep_gan_ly_do, gan_luc, dong_bo_luc, xac_nhan_luc")
    .eq("gallery_id", galleryId)
    .order("gan_luc", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    ma: String(r.ma_hoa_don),
    trangThai: String(r.trang_thai),
    ketQua: r.ket_qua ?? null,
    epGanLyDo: (r.ep_gan_ly_do as string | null) ?? null,
    ganLuc: String(r.gan_luc),
    dongBoLuc: (r.dong_bo_luc as string | null) ?? null,
    xacNhanLuc: (r.xac_nhan_luc as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Phát sinh trên app
// ---------------------------------------------------------------------------


type ProductRow = { id: string; name: string | null; kind: string | null; lark_record_id: string | null; list_price?: number | string | null };

/**
 * Phát sinh của MỘT bộ cho đối chiếu: file vượt hạn mức gốc ĐỢT 1, "Edit file" mua thêm, sản
 * phẩm, và các đợt ≥ 2. `cacMa` = các mã hoá đơn đang gán cho bộ — mục đã được CHÍNH các mã đó
 * trả (đợt đã xác nhận, yêu cầu mua thêm `da_thanh_toan`) vẫn được tính lại, để đồng bộ lại
 * cùng mã ra cùng kết quả (không biến thành "Thừa").
 */
export async function layPhatSinhApp(
  admin: SupabaseClient,
  galleryId: string,
  cacMa: readonly string[] = [],
): Promise<PhatSinhApp & { coDongHopDong: boolean }> {
  const [{ data: g, error: eg }, { data: sel, error: es }, { data: hm, error: eq }, { data: items, error: ei }] = await Promise.all([
    admin.from("galleries").select("id, extra_photo_price").eq("id", galleryId).maybeSingle(),
    admin
      .from("selections")
      .select("id, snapshot_extra_count, snapshot_extra_amount")
      .eq("gallery_id", galleryId)
      .eq("is_primary", true)
      .maybeSingle(),
    admin.rpc("gallery_quota", { p_gallery_id: galleryId }),
    admin.from("gallery_items").select("quantity, lark_record_id, products(kind)").eq("gallery_id", galleryId),
  ]);
  if (eg) throw eg;
  if (es) throw es;
  if (eq) throw eq;
  if (ei) throw ei;
  if (!g) throw new Error("Không tìm thấy bộ ảnh");

  type ItemRow = { quantity: number | string; lark_record_id: string | null; products?: { kind: string | null } | null };
  const dsItem = (items ?? []) as unknown as ItemRow[];
  // Hạn mức gốc đọc được = có dòng hợp đồng "ảnh chỉnh sửa" KHÔNG phải dòng hoá đơn. Không có thì
  // `app.gallery_quota` là null (hoặc lấy `included_quota` khi chưa có dòng nào): thêm dòng hoá đơn
  // lúc đó làm hạn mức NHẢY về đúng số file hoá đơn — sai. Chặn, báo nhân viên kéo hợp đồng gốc.
  const coDongHopDong = dsItem.some((r) => !laDongHoaDon(r.lark_record_id) && r.products?.kind === "edited_photo");
  const hanMucHoaDon = dsItem
    .filter((r) => laDongHoaDon(r.lark_record_id) && r.products?.kind === "edited_photo")
    .reduce((s, r) => s + Number(r.quantity ?? 0), 0);

  let soAnhChon = 0;
  let fileMuaThem = 0;
  const sanPham = new Map<string, SanPhamApp>();
  const congSp = (p: ProductRow | null | undefined, soLuong: number, donGia: number, ghiChuGia?: string) => {
    if (!p || p.kind === "edited_photo" || p.kind === "album_unedited" || soLuong <= 0) return;
    const cu = sanPham.get(p.id);
    if (cu) cu.soLuong += soLuong;
    else sanPham.set(p.id, { productId: p.id, idSanPhamNguon: p.lark_record_id, ten: p.name ?? "", soLuong, donGia, ...(ghiChuGia ? { ghiChuGia } : {}) });
  };
  if (sel?.id) {
    const [{ count, error: ec }, { data: addons, error: ea }] = await Promise.all([
      // Vòng 2: chỉ ảnh ĐỢT 1 — ảnh đợt ≥ 2 tính tiền riêng theo đợt (`tinhTienDot`).
      admin
        .from("selection_items")
        .select("id", { count: "exact", head: true })
        .eq("selection_id", sel.id)
        .eq("mark", "selected")
        .eq("dot", 1),
      admin
        .from("selection_addons")
        .select("quantity, unit_price, dot, products(id, name, kind, lark_record_id)")
        .eq("selection_id", sel.id)
        .eq("dot", 1),
    ]);
    if (ec) throw ec;
    if (ea) throw ea;
    soAnhChon = count ?? 0;
    for (const a of (addons ?? []) as unknown as { quantity: number; unit_price: number | null; products: ProductRow | null }[]) {
      if (a.products?.kind === "edited_photo") fileMuaThem += Number(a.quantity ?? 0);
      else congSp(a.products, Number(a.quantity ?? 0), Number(a.unit_price ?? 0));
    }
  }
  // Yêu cầu mua thêm sau duyệt (BB-245): chưa huỷ, chưa thanh toán — hoặc đã thanh toán bằng chính
  // các mã đang gán. Không có đơn giá → giá niêm yết (`products.list_price`).
  const { data: yc, error: ey } = await admin
    .from("yeu_cau_mua_them")
    .select("so_luong, trang_thai, ma_hoa_don, products(id, name, kind, lark_record_id, list_price)")
    .eq("gallery_id", galleryId)
    .in("trang_thai", ["moi", "da_lien_he", "da_chot", "da_thanh_toan"]);
  if (ey) throw ey;
  for (const r of (yc ?? []) as unknown as { so_luong: number; trang_thai: string; ma_hoa_don: string | null; products: ProductRow | null }[]) {
    if (r.trang_thai === "da_thanh_toan" && !(r.ma_hoa_don && cacMa.includes(r.ma_hoa_don))) continue;
    if (r.products?.kind === "edited_photo") fileMuaThem += Number(r.so_luong ?? 0);
    else congSp(r.products, Number(r.so_luong ?? 0), Number(r.products?.list_price ?? 0), "giá niêm yết");
  }

  // Đợt ≥ 2: chờ xác nhận, hoặc đã xác nhận mà chưa trả bằng đường khác.
  const dot: DotApp[] = [];
  const { data: rounds, error: er } = await admin
    .from("selection_rounds")
    .select("id, so_dot, trang_thai, so_anh, tien_anh, tien_san_pham, san_pham, ma_hoa_don, da_thanh_toan_luc")
    .eq("gallery_id", galleryId)
    .gte("so_dot", 2)
    .in("trang_thai", ["cho_xac_nhan", "da_xac_nhan"]);
  if (er && !laLoiChuaApMigration(er)) throw er;
  type RoundRow = {
    id: string;
    so_dot: number;
    trang_thai: string;
    so_anh: number | null;
    tien_anh: number | string | null;
    tien_san_pham: number | string | null;
    san_pham: unknown;
    ma_hoa_don: string | null;
    da_thanh_toan_luc: string | null;
  };
  const dsRound = ((er ? [] : rounds) ?? []) as RoundRow[];
  const spIds = new Set<string>();
  type DongSp = { productId?: string; donGia?: number | string; soLuong?: number | string };
  const dongSp = (r: RoundRow) => (Array.isArray(r.san_pham) ? r.san_pham : []) as DongSp[];
  for (const r of dsRound) for (const d of dongSp(r)) if (d?.productId) spIds.add(String(d.productId));
  const spTheoId = new Map<string, ProductRow>();
  if (spIds.size > 0) {
    const { data: sps, error: esp } = await admin.from("products").select("id, name, kind, lark_record_id").in("id", [...spIds]);
    if (esp) throw esp;
    for (const p of (sps ?? []) as ProductRow[]) spTheoId.set(String(p.id), p);
  }
  for (const r of dsRound) {
    const traBangMaKhac = r.ma_hoa_don && !cacMa.includes(r.ma_hoa_don);
    const traBangDuongKhac = !r.ma_hoa_don && r.da_thanh_toan_luc;
    if (traBangMaKhac || traBangDuongKhac) continue;
    let soAnh = Number(r.so_anh ?? 0);
    let tienAnh = Number(r.tien_anh ?? 0);
    const spDot: SanPhamApp[] = [];
    let tienSp = 0;
    for (const d of dongSp(r)) {
      const p = d?.productId ? spTheoId.get(String(d.productId)) : undefined;
      const sl = Number(d?.soLuong ?? 0);
      const dg = Number(d?.donGia ?? 0);
      if (!p || sl <= 0) continue;
      // "Edit file" trong giỏ đợt là tiền ẢNH: cộng vào số file của đợt.
      if (p.kind === "edited_photo") {
        soAnh += sl;
        tienAnh += sl * dg;
      } else if (p.kind !== "album_unedited") {
        spDot.push({ productId: p.id, idSanPhamNguon: p.lark_record_id, ten: p.name ?? "", soLuong: sl, donGia: dg });
        tienSp += sl * dg;
      }
    }
    dot.push({
      roundId: String(r.id),
      soDot: Number(r.so_dot),
      soAnh,
      tienAnh,
      tienSanPham: tienSp || Math.max(0, Number(r.tien_san_pham ?? 0) - (tienAnh - Number(r.tien_anh ?? 0))),
      sanPham: spDot,
      daXacNhan: r.trang_thai === "da_xac_nhan",
    });
  }

  const hanMuc = typeof hm === "number" ? hm : hm == null ? null : Number(hm);
  const hanMucGoc = hanMuc == null ? null : hanMuc - hanMucHoaDon;
  const fileVuot = hanMucGoc == null ? 0 : Math.max(0, Math.max(0, soAnhChon - hanMucGoc) - fileMuaThem);
  const soLucChot = Number(sel?.snapshot_extra_count ?? 0);
  const tienLucChot = Number(sel?.snapshot_extra_amount ?? 0);
  const giaMotFile = soLucChot > 0 && tienLucChot > 0 ? tienLucChot / soLucChot : Number(g.extra_photo_price ?? 0);
  return { fileVuot, fileMuaThem, giaMotFile, sanPham: [...sanPham.values()], dot, coDongHopDong };
}


// ---------------------------------------------------------------------------
// Đọc hoá đơn từ nguồn
// ---------------------------------------------------------------------------

async function docTatCa(
  nguon: NguonHoaDon,
  cacMa: string[],
): Promise<{ ok: true; ds: HoaDonChuan[] } | { ok: false; message: string }> {
  try {
    const ds = await Promise.all(cacMa.map((m) => nguon.layHoaDon(m)));
    const thieu = cacMa.filter((_, i) => !ds[i]);
    if (thieu.length > 0) return { ok: false, message: `Không tìm thấy hoá đơn ${thieu.join(", ")} bên Lark. Chưa có gì được ghi.` };
    return { ok: true, ds: ds as HoaDonChuan[] };
  } catch (e) {
    if (!(e instanceof LoiNguonHoaDon)) console.error(JSON.stringify({ evt: "hoa_don.doc_loi", loi: e instanceof Error ? e.message : String(e) }));
    return { ok: false, message: cauLoiNguon(e) };
  }
}

// ---------------------------------------------------------------------------
// Gán + đồng bộ
// ---------------------------------------------------------------------------

export interface DauVaoDongBo {
  galleryId: string;
  staff: StaffSession;
  nguon: NguonHoaDon;
  /** Mã mới muốn gán (null = chỉ đồng bộ lại các mã đã gán). */
  maMoi: string | null;
  xacNhanHauKy: boolean;
  /** Ép gán khi app không tự kiểm được khách — chỉ người có quyền nhập tay. */
  epGanLyDo: string | null;
}

const bamNgan = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

export async function dongBoHoaDonChoBo(admin: SupabaseClient, v: DauVaoDongBo): Promise<KetQuaThaoTac> {
  const { data: g, error: eg } = await admin
    .from("galleries")
    .select("id, branch_id, customer_id, status, lark_hauky_record_id, lark_contract_code, lark_contract_codes")
    .eq("id", v.galleryId)
    .maybeSingle();
  if (eg) throw eg;
  if (!g) return { ok: false, code: "NOT_FOUND", message: "Không tìm thấy bộ ảnh" };

  const daGan = await layHoaDonDaGan(admin, v.galleryId);
  const cacMa = daGan.map((d) => d.ma);
  if (v.maMoi) {
    const maHopDongGoc = [g.lark_contract_code as string | null, ...(((g.lark_contract_codes as string[] | null) ?? []))]
      .filter(Boolean)
      .map((m) => String(m).toUpperCase());
    if (maHopDongGoc.includes(v.maMoi)) {
      return { ok: false, code: "INVALID_INPUT", message: `${v.maMoi} là hợp đồng gốc của bộ ảnh, không phải hoá đơn phát sinh.` };
    }
    if (!cacMa.includes(v.maMoi)) {
      const { data: khac, error: ek } = await admin.from(BANG_GAN).select("gallery_id").eq("ma_hoa_don", v.maMoi).maybeSingle();
      if (ek) throw ek;
      if (khac) {
        return { ok: false, code: "CONFLICT", message: `Mã ${v.maMoi} đã gán cho một bộ ảnh khác. Admin/Quản lý gỡ gán ở bộ đó trước.` };
      }
      cacMa.push(v.maMoi);
    }
  }
  if (cacMa.length === 0) return { ok: false, code: "INVALID_INPUT", message: "Bộ ảnh chưa có mã hoá đơn nào. Nhập mã rồi bấm Đồng bộ." };

  // 1. Đọc HẾT từ nguồn trước khi ghi gì.
  const doc = await docTatCa(v.nguon, cacMa);
  if (!doc.ok) return { ok: false, code: "LARK", message: doc.message };
  const hoaDons = doc.ds;

  // 2. Khách (điều kiện cứng) + Hậu Kỳ (gợi ý) — kiểm trên MỌI mã, kể cả mã đã gán.
  const { data: kh, error: ekh } = g.customer_id
    ? await admin.from("customers").select("lark_customer_key").eq("id", g.customer_id).maybeSingle()
    : { data: null, error: null };
  if (ekh) throw ekh;
  const khoaKhachBo = (kh?.lark_customer_key as string | null) ?? null;
  const duocEpGan = coQuyenNhapTay(v.staff);
  const epGan = v.epGanLyDo && v.epGanLyDo.trim().length >= 3 ? v.epGanLyDo.trim().slice(0, 500) : null;
  // BB-397: khách chưa có khoá Lark → dự phòng bằng hoá đơn GỐC của bộ (cùng nguồn, chỉ đọc).
  let khach: KetQuaKhachBo;
  try {
    khach = await kiemKhachChoBo({
      hoaDons,
      customerId: (g.customer_id as string | null) ?? null,
      khoaKhachBo,
      maGoc: [g.lark_contract_code as string | null, ...(((g.lark_contract_codes as string[] | null) ?? []))].filter((m) => !cacMa.includes(String(m ?? "").toUpperCase())),
      nguon: v.nguon,
      timKhachGiuKhoa: async (khoa) => {
        const { data, error } = await admin.from("customers").select("id").eq("lark_customer_key", khoa).limit(1).maybeSingle();
        if (error) throw error;
        return (data?.id as string | undefined) ?? null;
      },
    });
  } catch (e) {
    if (!(e instanceof LoiNguonHoaDon)) throw e;
    return { ok: false, code: "LARK", message: cauLoiNguon(e) };
  }
  for (const hd of hoaDons) {
    const k = khach.theoMa[hd.ma] ?? kiemKhachHoaDon(hd, khoaKhachBo);
    if (laKhopKhach(k)) continue;
    if (k === "khac_khach") return { ok: false, code: "INVALID_INPUT", message: `${hd.ma}: ${CAU_KHACH.khac_khach}` };
    const daEp = daGan.find((d) => d.ma === hd.ma)?.epGanLyDo;
    if (daEp) continue;
    if (!(hd.ma === v.maMoi && epGan && duocEpGan)) {
      return { ok: false, code: duocEpGan ? "INVALID_INPUT" : "FORBIDDEN", message: `${hd.ma}: ${CAU_KHACH[k as Exclude<KetQuaKhach, "khop">]}`, choPhepEpGan: duocEpGan };
    }
  }
  const moi = v.maMoi ? hoaDons.find((h) => h.ma === v.maMoi) : null;
  if (moi && !daGan.some((d) => d.ma === moi.ma) && hauKyLechBo(moi, g.lark_hauky_record_id as string | null) && !v.xacNhanHauKy) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `${moi.ma} trỏ tới dòng Hậu Kỳ của một bộ khác (cùng khách). Kiểm lại đúng bộ rồi xác nhận lần nữa.`,
      canXacNhanHauKy: true,
    };
  }

  // 2b. BB-397: khớp qua hoá đơn gốc → nối khoá Lark vào khách (lần sau khớp thẳng).
  const canhBaoKhach = khach.lenhNoi
    ? await noiKhoaKhachLark(admin, khach.lenhNoi, {
        staff: v.staff,
        branchId: g.branch_id as string,
        galleryId: v.galleryId,
        maHoaDon: hoaDons.filter((h) => khach.theoMa[h.ma] === "khop_qua_hoa_don_goc").map((h) => h.ma),
        maGoc: khach.khoaGoc?.maGoc ?? [],
      })
    : [];

  // 3. Lưu việc gán (một mã một bộ — chỉ mục duy nhất).
  if (v.maMoi && !daGan.some((d) => d.ma === v.maMoi)) {
    const { data: moiGan, error: eg2 } = await admin
      .from(BANG_GAN)
      .insert({
        gallery_id: v.galleryId,
        ma_hoa_don: v.maMoi,
        nguon: v.nguon.ten,
        gan_boi: v.staff.staffId,
        ep_gan_ly_do: laKhopKhach(khach.theoMa[(moi as HoaDonChuan).ma]) ? null : epGan,
      })
      .select("id, ma_hoa_don, trang_thai, ket_qua, ep_gan_ly_do, gan_luc, dong_bo_luc, xac_nhan_luc")
      .single();
    if (eg2 && eg2.code === "23505") {
      return { ok: false, code: "CONFLICT", message: `Mã ${v.maMoi} vừa được gán cho một bộ khác.` };
    }
    if (eg2) throw eg2;
    daGan.push({
      id: String(moiGan.id),
      ma: v.maMoi,
      trangThai: "cho_dong_bo",
      ketQua: null,
      epGanLyDo: (moiGan.ep_gan_ly_do as string | null) ?? null,
      ganLuc: String(moiGan.gan_luc),
      dongBoLuc: null,
      xacNhanLuc: null,
    });
    await ghiNhatKy({
      actorType: "staff",
      actorId: v.staff.staffId,
      actorLabel: v.staff.role,
      branchId: g.branch_id as string,
      action: "gallery.hoa_don_gan",
      entityType: "gallery",
      entityId: v.galleryId,
      galleryId: v.galleryId,
      metadata: { maHoaDon: v.maMoi, nguon: v.nguon.ten, epGan: Boolean(epGan), khopKhach: khach.theoMa[v.maMoi] ?? null },
    });
  }

  // 4. Điều kiện từng hoá đơn. Chưa đủ → lưu lý do, KHÔNG ghi tiền/hạn mức.
  const dieuKien = hoaDons.map((hd) => ({ hd, k: kiemDieuKienHoaDon(hd) }));
  const canhBao = dieuKien.flatMap((x) => x.k.canhBao);
  const chuaDu = dieuKien.filter((x) => !x.k.duDieuKien);
  const now = new Date().toISOString();
  const tomTat = (hd: HoaDonChuan) => ({
    tongPhaiThu: hd.tongPhaiThu,
    daThu: hd.daThu,
    conLai: hd.conLai,
    trangThaiNguon: hd.trangThai,
    phieuThu: hd.phieuThu.map((p) => ({ ma: p.ma, soTien: p.soTien, phuongThuc: p.phuongThucGoc })),
    // BB-397: cách khớp khách ("khop" | "khop_qua_hoa_don_goc" | lý do ép gán).
    khopKhach: khach.theoMa[hd.ma] ?? null,
  });
  if (chuaDu.length > 0) {
    for (const { hd, k } of dieuKien) {
      const row = daGan.find((d) => d.ma === hd.ma);
      if (!row) continue;
      await admin
        .from(BANG_GAN)
        .update({ trang_thai: k.duDieuKien ? row.trangThai : "chua_du_dieu_kien", ket_qua: { ...tomTat(hd), lyDo: k.lyDo }, dong_bo_luc: now })
        .eq("id", row.id);
    }
    return { ok: false, code: "INVALID_INPUT", message: chuaDu.flatMap((x) => x.k.lyDo).join(". ") + "." };
  }

  // 5. Đối chiếu (cộng dồn mọi hoá đơn của bộ).
  const app = await layPhatSinhApp(admin, v.galleryId, cacMa);
  if (!app.coDongHopDong) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message:
        "Bộ ảnh chưa có dòng hợp đồng gốc \"Edit file\" (hạn mức chưa rõ hoặc đang nhập tay). Kéo dòng hợp đồng từ Lark trước rồi đồng bộ lại.",
    };
  }
  const kq = doiChieuHoaDon(hoaDons, app);

  // 6. Dòng hạn mức + sản phẩm theo hoá đơn (đồng bộ theo MỤC TIÊU).
  const dongHan = await dongBoDongHoaDon(admin, v.galleryId, hoaDons, kq);

  // 7. Sổ tiền.
  const { data: caiDat } = await admin.from("settings").select("value").eq("key", KHOA_THU_SAN_PHAM_QUA_APP).is("branch_id", null).maybeSingle();
  const thuSanPhamQuaApp = laBatThuSanPhamQuaApp(caiDat?.value);
  const { data: sel } = await admin.from("selections").select("id, snapshot_extra_amount").eq("gallery_id", v.galleryId).eq("is_primary", true).maybeSingle();
  const { data: daCoSo, error: eso } = await admin
    .from("gallery_payments")
    .select("ma_yeu_cau")
    .eq("gallery_id", v.galleryId)
    .like("ma_yeu_cau", "hd-%");
  if (eso) throw eso;
  const daCoMa = new Set(((daCoSo ?? []) as { ma_yeu_cau: string | null }[]).map((r) => String(r.ma_yeu_cau)));
  let daGhiSo = 0;
  for (const hd of hoaDons) {
    const row = daGan.find((d) => d.ma === hd.ma);
    if (!row) continue;
    const tien = tienGhiSoChoHoaDon(hd, thuSanPhamQuaApp);
    for (const phan of chiaTienTheoPhieuThu(hd, tien.tong)) {
      const maYeuCau = `hd-${row.id.slice(0, 8)}-${bamNgan(phan.maPhieuThu)}`;
      if (daCoMa.has(maYeuCau)) continue;
      const { error } = await admin.from("gallery_payments").insert({
        gallery_id: v.galleryId,
        selection_id: sel?.id ?? null,
        snapshot_extra_amount: sel?.snapshot_extra_amount ?? null,
        confirmed_by: v.staff.staffId,
        amount: phan.soTien,
        payment_method: phan.phuongThuc,
        note: ghiChuDongSo(hd.ma, phan),
        ma_hoa_don: hd.ma,
        ma_phieu_thu: phan.maPhieuThu.slice(0, 64),
        ma_yeu_cau: maYeuCau,
      });
      if (error && error.code === "23505") continue; // lần bấm khác vừa ghi — không ghi hai lần
      if (error) throw error;
      daGhiSo += phan.soTien;
    }
  }

  // 7b. Vòng 2 — đánh dấu mục đã trả bằng hoá đơn (đợt ≥ 2, giỏ đợt 1) rồi mới xác nhận đợt:
  //     dấu trước, xác nhận sau — hỏng giữa chừng thì đợt chưa xác nhận (chưa vào "Phải thu"),
  //     không bao giờ có đợt đã xác nhận mà thiếu dấu (bị đòi `tien_anh` lần hai).
  const ghiChuKhoa: string[] = [];
  const soDotDaXacNhan = await danhDauDaTraBangHoaDon(admin, {
    galleryId: v.galleryId,
    branchId: g.branch_id as string,
    staff: v.staff,
    cacMa,
    maMoiNhat: hoaDons.at(-1)?.ma ?? cacMa[0] ?? "",
    maPhieuThu: hoaDons.flatMap((h) => h.phieuThu).at(-1)?.ma ?? null,
    kq,
    dot: app.dot ?? [],
    ghiChu: ghiChuKhoa,
  });

  // 8. Khớp → khoá đợt 1 (khách đã gửi, không đang sửa dở). Thừa → KHÔNG khoá: khách còn chọn tiếp
  //    phần đã trả ở đợt 1. Thiếu → chờ nhân viên bỏ mục / gán thêm hoá đơn.
  let daKhoa = soDotDaXacNhan.length > 0;
  if (kq.trangThai === "khop") {
    const khoa = await layKhoaKhiThu(admin, v.galleryId);
    if (khoa.coTheKhoa && khoa.soDot === 1 && !khoa.dangMoLai) {
      const r = await xacNhanDot1(admin, { galleryId: v.galleryId, branchId: g.branch_id as string, staff: { staffId: v.staff.staffId, role: v.staff.role } });
      daKhoa = daKhoa || r.ok;
      if (!r.ok) ghiChuKhoa.push(r.message);
    } else if (khoa.coTheKhoa && khoa.soDot === 1 && khoa.dangMoLai) {
      ghiChuKhoa.push("Khách đang sửa lại danh sách — chưa khoá; xác nhận danh sách khi khách gửi lại.");
    }
    // Yêu cầu mua thêm khớp hoá đơn → đã thanh toán.
    const { error: eyc } = await admin
      .from("yeu_cau_mua_them")
      .update({ trang_thai: "da_thanh_toan", ma_hoa_don: hoaDons.at(-1)?.ma ?? null, da_thanh_toan_luc: now })
      .eq("gallery_id", v.galleryId)
      .in("trang_thai", ["moi", "da_lien_he", "da_chot"]);
    if (eyc) console.error(JSON.stringify({ evt: "hoa_don.yeu_cau_mua_them.loi", loi: eyc.message }));
  }

  // 9. Lưu kết quả lên từng mã.
  for (const hd of hoaDons) {
    const row = daGan.find((d) => d.ma === hd.ma);
    if (!row) continue;
    const { error } = await admin
      .from(BANG_GAN)
      .update({
        trang_thai: kq.trangThai,
        ket_qua: { ...tomTat(hd), doiChieu: kq, dongHanMuc: dongHan },
        dong_bo_luc: now,
        ...(kq.trangThai === "khop" && !row.xacNhanLuc ? { xac_nhan_luc: now } : {}),
      })
      .eq("id", row.id);
    if (error) throw error;
  }

  await ghiNhatKy({
    actorType: "staff",
    actorId: v.staff.staffId,
    actorLabel: v.staff.role,
    branchId: g.branch_id as string,
    action: "gallery.hoa_don_dong_bo",
    entityType: "gallery",
    entityId: v.galleryId,
    galleryId: v.galleryId,
    metadata: {
      maHoaDon: cacMa,
      trangThai: kq.trangThai,
      fileHoaDon: kq.fileHoaDon,
      fileNangHanMuc: kq.fileNangHanMuc,
      tienThieu: kq.tienThieu,
      daGhiSo,
      daKhoa,
    },
  });
  if (daGhiSo > 0 || daKhoa) {
    await phatSuKienBoAnh({ galleryId: v.galleryId, branchId: g.branch_id as string, loai: LOAI_TUC_THI.studioThanhToan });
    await baoKhachSauThanhToan(admin, v.galleryId, daKhoa);
  }

  const cau =
    kq.trangThai === "khop"
      ? "Khớp hoá đơn — đã xác nhận."
      : kq.trangThai === "thua"
        ? `Hoá đơn nhiều hơn khách chọn — đã xác nhận phần đã chọn, còn ${kq.fileDaTraConLai} ảnh đã trả chờ khách chọn.`
        : `Khách chọn nhiều hơn hoá đơn — phần trong hoá đơn đã ghi nhận, phần dư CHỜ (thiếu ${kq.tienThieu.toLocaleString("vi-VN")} ₫).`;
  return { ok: true, message: cau, canhBao: [...canhBaoKhach, ...canhBao, ...ghiChuKhoa, ...dongHan.canhBao], doiChieu: kq, daGhiSo, daKhoa };
}

/**
 * BB-397 — thi hành lệnh nối khoá: ghi `customers.lark_customer_key` khi khách còn NULL (điều
 * kiện ngay trong câu update — không đè khoá đã có). Khách khác giữ khoá (hoặc vừa giành trước:
 * 23505 trên `uq_customers_lark_key`) → không ghi, cảnh báo "có thể trùng khách". Mọi nhánh ghi
 * nhật ký. Lỗi ghi không làm hỏng việc gán (khớp khách đã được chứng minh qua hoá đơn gốc).
 */
async function noiKhoaKhachLark(
  admin: SupabaseClient,
  lenh: LenhNoiKhoa,
  ctx: { staff: StaffSession; branchId: string; galleryId: string; maHoaDon: string[]; maGoc: string[] },
): Promise<string[]> {
  let ketQua: "da_noi" | "trung_khach" | "loi" = lenh.loai === "noi" ? "da_noi" : "trung_khach";
  let khachGiuKhoa: string | null = lenh.loai === "trung_khach" ? lenh.khachGiuKhoa : null;
  if (lenh.loai === "noi") {
    const { error } = await admin
      .from("customers")
      .update({ lark_customer_key: lenh.khoa })
      .eq("id", lenh.customerId)
      .is("lark_customer_key", null);
    if (error && error.code === "23505") {
      ketQua = "trung_khach";
      const { data } = await admin.from("customers").select("id").eq("lark_customer_key", lenh.khoa).limit(1).maybeSingle();
      khachGiuKhoa = (data?.id as string | undefined) ?? null;
    } else if (error) {
      ketQua = "loi";
      console.error(JSON.stringify({ evt: "hoa_don.noi_khoa_khach.loi", galleryId: ctx.galleryId, loi: error.message }));
    }
  }
  await ghiNhatKy({
    actorType: "staff",
    actorId: ctx.staff.staffId,
    actorLabel: ctx.staff.role,
    branchId: ctx.branchId,
    action: ketQua === "da_noi" ? "customer.noi_khoa_lark" : "customer.noi_khoa_lark_bo_qua",
    entityType: "customer",
    entityId: lenh.customerId,
    galleryId: ctx.galleryId,
    metadata: {
      ketQua,
      cachKhop: "khop_qua_hoa_don_goc",
      maHoaDon: ctx.maHoaDon,
      maHoaDonGoc: ctx.maGoc,
      ...(ketQua === "trung_khach" ? { canhBao: "co_the_trung_khach", khachGiuKhoa } : {}),
    },
  });
  return ketQua === "trung_khach" ? [CAU_TRUNG_KHACH] : [];
}

/**
 * Vòng 2 — dấu "đã trả bằng hoá đơn" trên các mục app (để `layTienCanThu` không tính lại) và xác
 * nhận đợt ≥ 2 đã phủ đủ bằng ĐÚNG `xacNhanDotMuaThem`. Mục không còn được phủ (vd sau gỡ gán) thì
 * bỏ dấu của các mã đang gán. Trả số các đợt vừa xác nhận.
 */
async function danhDauDaTraBangHoaDon(
  admin: SupabaseClient,
  p: {
    galleryId: string;
    branchId: string;
    staff: StaffSession;
    cacMa: string[];
    maMoiNhat: string;
    maPhieuThu: string | null;
    kq: KetQuaDoiChieu;
    dot: DotApp[];
    ghiChu: string[];
  },
): Promise<number[]> {
  const bay = new Date().toISOString();
  const daXacNhan: number[] = [];
  const traIds = new Set(p.kq.dotDaTra.map((d) => d.roundId));
  for (const dt of p.dot) {
    if (traIds.has(dt.roundId)) {
      const { error } = await admin
        .from("selection_rounds")
        .update({
          ma_hoa_don: p.maMoiNhat,
          ma_phieu_thu: p.maPhieuThu ? p.maPhieuThu.slice(0, 64) : null,
          da_thanh_toan_luc: bay,
          da_thanh_toan_boi: p.staff.staffId,
        })
        .eq("id", dt.roundId)
        .is("ma_hoa_don", null);
      if (error) throw error;
      if (!dt.daXacNhan) {
        const dong = await layMotDot(admin, p.galleryId, dt.soDot);
        if (dong && dong.trangThai === "cho_xac_nhan") {
          const r = await xacNhanDotMuaThem(admin, {
            galleryId: p.galleryId,
            branchId: p.branchId,
            staff: { staffId: p.staff.staffId, role: p.staff.role },
            dot: dong,
          });
          if (r.ok) daXacNhan.push(dt.soDot);
          else p.ghiChu.push(r.message);
        }
      }
    } else {
      // Không còn được phủ: bỏ dấu của các mã đang gán (đợt quay lại "Phải thu" nếu đã xác nhận).
      const { error } = await admin
        .from("selection_rounds")
        .update({ ma_hoa_don: null, ma_phieu_thu: null, da_thanh_toan_luc: null, da_thanh_toan_boi: null })
        .eq("id", dt.roundId)
        .in("ma_hoa_don", p.cacMa);
      if (error) throw error;
    }
  }
  if (daXacNhan.length > 0) p.ghiChu.push(`Đã xác nhận đợt ${daXacNhan.join(", ")} theo hoá đơn.`);

  // Giỏ đợt 1 (`selection_addons.ma_hoa_don`, cột 0102).
  const { data: sel } = await admin.from("selections").select("id").eq("gallery_id", p.galleryId).eq("is_primary", true).maybeSingle();
  if (sel?.id) {
    const { data: addons, error: ea } = await admin
      .from("selection_addons")
      .select("id, product_id, ma_hoa_don, products(kind)")
      .eq("selection_id", sel.id)
      .eq("dot", 1);
    if (ea && !laLoiChuaApMigration(ea)) throw ea;
    for (const a of ((ea ? [] : addons) ?? []) as unknown as { id: string; product_id: string; ma_hoa_don: string | null; products: { kind: string | null } | null }[]) {
      const laEdit = a.products?.kind === "edited_photo";
      const duocTra = laEdit ? p.kq.fileMuaThemDaTra : p.kq.sanPhamDot1DaTra.includes(a.product_id);
      if (duocTra && !a.ma_hoa_don) {
        const { error } = await admin.from("selection_addons").update({ ma_hoa_don: p.maMoiNhat }).eq("id", a.id);
        if (error) throw error;
      } else if (!duocTra && a.ma_hoa_don && p.cacMa.includes(a.ma_hoa_don)) {
        const { error } = await admin.from("selection_addons").update({ ma_hoa_don: null }).eq("id", a.id);
        if (error) throw error;
      }
    }
  }
  return daXacNhan;
}

/** Sản phẩm "ảnh chỉnh sửa" của danh mục (cùng luật BB-348). */
async function timSanPhamAnhChinh(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from("products")
    .select("id, lark_record_id, created_at")
    .eq("kind", "edited_photo")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ds = (data ?? []) as { id: string; lark_record_id: string | null }[];
  return (ds.find((p) => p.lark_record_id) ?? ds[0])?.id ?? null;
}

/**
 * Đưa các dòng `hoa_don:` của bộ về đúng mục tiêu: file nâng hạn mức (sau khi trừ phần dành
 * cho "Edit file" đã mua trên app) + sản phẩm hoá đơn có mà app chưa có.
 */
async function dongBoDongHoaDon(
  admin: SupabaseClient,
  galleryId: string,
  hoaDons: HoaDonChuan[],
  kq: KetQuaDoiChieu,
): Promise<{ soAnhNangHanMuc: number; sanPhamThem: number; canhBao: string[] }> {
  const canhBao: string[] = [];
  const mucTieu = new Map<string, { product_id: string; quantity: number; line_total: number | null }>();
  const anhChinhId = kq.fileHoaDon > 0 ? await timSanPhamAnhChinh(admin) : null;
  if (kq.fileHoaDon > 0 && !anhChinhId) throw new Error("Danh mục chưa có sản phẩm ảnh chỉnh sửa (Edit file)");

  // Vòng 2: chỉ `fileNangHanMuc` file nâng hạn mức (đợt 1); phần cho "Edit file" mua thêm và cho
  // ảnh đợt ≥ 2 KHÔNG thành dòng hạn mức — tiền của chúng nằm trong sổ, mục app được đánh dấu đã trả.
  let conNangHanMuc = kq.fileNangHanMuc;
  let soAnhNangHanMuc = 0;
  for (const hd of hoaDons) {
    for (const d of hd.dong) {
      if (d.loai !== "file_chinh") continue;
      const q = Math.min(conNangHanMuc, d.soLuong);
      conNangHanMuc -= q;
      if (q <= 0 || !anhChinhId) continue;
      soAnhNangHanMuc += q;
      mucTieu.set(maDongHoaDonTrongApp(d.maDong), {
        product_id: anhChinhId,
        quantity: q,
        line_total: tienFileNangHanMuc(d.thanhTien, d.soLuong, q),
      });
    }
  }

  // Sản phẩm hoá đơn có mà app chưa có → thêm vào bộ.
  let sanPhamThem = 0;
  if (kq.sanPhamThemVao.length > 0) {
    const ids = kq.sanPhamThemVao.map((s) => s.idSanPhamNguon);
    const { data: sps, error } = await admin.from("products").select("id, lark_record_id").in("lark_record_id", ids);
    if (error) throw error;
    const theoNguon = new Map(((sps ?? []) as { id: string; lark_record_id: string }[]).map((p) => [p.lark_record_id, p.id]));
    for (const s of kq.sanPhamThemVao) {
      const pid = theoNguon.get(s.idSanPhamNguon);
      if (!pid) {
        canhBao.push(`Sản phẩm "${s.ten}" trên hoá đơn chưa có trong danh mục app — chưa thêm vào bộ.`);
        continue;
      }
      let can = s.soLuong;
      for (const hd of hoaDons) {
        for (const d of hd.dong) {
          if (can <= 0 || d.loai !== "san_pham" || d.idSanPhamNguon !== s.idSanPhamNguon) continue;
          const q = Math.min(can, d.soLuong);
          can -= q;
          sanPhamThem += q;
          mucTieu.set(maDongHoaDonTrongApp(d.maDong), { product_id: pid, quantity: q, line_total: d.thanhTien || null });
        }
      }
    }
  }

  const { data: hienCo, error: eh } = await admin
    .from("gallery_items")
    .select("id, lark_record_id, quantity, line_total, product_id")
    .eq("gallery_id", galleryId)
    .like("lark_record_id", `${TIEN_TO_DONG_HOA_DON}%`);
  if (eh) throw eh;
  const hien = new Map(((hienCo ?? []) as { id: string; lark_record_id: string; quantity: number; line_total: number | null; product_id: string }[]).map((r) => [r.lark_record_id, r]));
  for (const [maApp, t] of mucTieu) {
    const cu = hien.get(maApp);
    if (!cu) {
      const { error } = await admin.from("gallery_items").insert({
        gallery_id: galleryId,
        product_id: t.product_id,
        parent_item_id: null,
        quantity: t.quantity,
        unit_price: null,
        line_total: t.line_total,
        lark_contract_code: null,
        lark_record_id: maApp,
      });
      if (error && error.code !== "23505") throw error; // 23505: lần bấm khác vừa thêm đúng dòng này
    } else if (Number(cu.quantity) !== t.quantity || Number(cu.line_total ?? 0) !== Number(t.line_total ?? 0)) {
      const { error } = await admin.from("gallery_items").update({ quantity: t.quantity, line_total: t.line_total }).eq("id", cu.id);
      if (error) throw error;
    }
  }
  for (const [maApp, cu] of hien) {
    if (mucTieu.has(maApp)) continue;
    const { error } = await admin.from("gallery_items").delete().eq("id", cu.id);
    if (error) throw error;
  }
  return { soAnhNangHanMuc, sanPhamThem, canhBao };
}

// ---------------------------------------------------------------------------
// Bỏ mục dư (Thiếu tiền)
// ---------------------------------------------------------------------------

export interface MucBo {
  khoa: string;
  soLuong: number;
  productId: string | null;
}

export interface AnhCoTheBo {
  /** `selection_items.id` */
  id: string;
  photoId: string;
  tenTep: string;
  /** Tích sẵn (thuộc N ảnh chọn SAU CÙNG của nhóm). */
  tichSan: boolean;
}
export interface NhomAnhCoTheBo {
  /** 1 = đợt 1; ≥ 2 = đợt mua thêm. */
  dot: number;
  /** Số ảnh còn thiếu tiền (= số cần bỏ để khớp). */
  thieu: number;
  anh: AnhCoTheBo[];
}

/**
 * Vòng 2 — danh sách ảnh khách chọn VƯỢT phần đã trả, để nhân viên tích bỏ (anh chốt "tích chọn
 * bỏ"). Mỗi nhóm (đợt 1, từng đợt ≥ 2 đang chờ xác nhận mà thiếu) liệt kê ảnh mới nhất trước, TÍCH
 * SẴN đúng `thieu` ảnh chọn sau cùng; hiện thêm tối đa 30 ảnh để nhân viên đổi tích.
 */
export async function layAnhCoTheBo(admin: SupabaseClient, galleryId: string, kq: KetQuaDoiChieu): Promise<NhomAnhCoTheBo[]> {
  const { data: sel, error: es } = await admin.from("selections").select("id").eq("gallery_id", galleryId).eq("is_primary", true).maybeSingle();
  if (es) throw es;
  if (!sel?.id) return [];
  const nhom: { dot: number; thieu: number }[] = [];
  if (kq.anhDot1Thieu > 0) nhom.push({ dot: 1, thieu: kq.anhDot1Thieu });
  for (const d of kq.dotThieu) if (d.anhThieu > 0) nhom.push({ dot: d.soDot, thieu: d.anhThieu });
  const ra: NhomAnhCoTheBo[] = [];
  for (const n of nhom) {
    if (n.dot >= 2) {
      const dong = await layMotDot(admin, galleryId, n.dot);
      if (!dong || dong.trangThai !== "cho_xac_nhan") continue; // đợt đã xác nhận thì không bỏ ảnh được
    }
    const { data, error } = await admin
      .from("selection_items")
      .select("id, photo_id, created_at, photos(file_name)")
      .eq("selection_id", sel.id)
      .eq("mark", "selected")
      .eq("dot", n.dot)
      .order("created_at", { ascending: false })
      .order("order_index", { ascending: false })
      .limit(n.thieu + 30);
    if (error) throw error;
    const ds = (data ?? []) as unknown as { id: string; photo_id: string; photos: { file_name: string | null } | null }[];
    ra.push({
      dot: n.dot,
      thieu: n.thieu,
      anh: ds.map((r, i) => ({ id: String(r.id), photoId: String(r.photo_id), tenTep: r.photos?.file_name ?? "", tichSan: i < n.thieu })),
    });
  }
  return ra;
}

/**
 * Bỏ các ảnh nhân viên đã tích khỏi lượt chọn (khách không mua tiếp). Chỉ ảnh của lượt chọn chính,
 * đang chọn, thuộc đợt 1 hoặc một đợt ≥ 2 ĐANG CHỜ xác nhận. Đợt 1: trừ số lúc chốt tương ứng
 * (khách đồng ý trả ít hơn). Đợt ≥ 2: trừ số ảnh + tiền của đợt theo đúng giá đợt (`gia_moi_anh`).
 * Nhật ký ghi id ảnh để khôi phục được.
 */
export async function boAnhDu(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string; staff: StaffSession; selectionItemIds: string[] },
): Promise<{ ok: true; soAnh: number } | { ok: false; message: string }> {
  const { data: sel, error: es } = await admin
    .from("selections")
    .select("id, snapshot_extra_count, snapshot_extra_amount")
    .eq("gallery_id", p.galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  if (es) throw es;
  if (!sel?.id) return { ok: false, message: "Bộ ảnh chưa có lượt chọn" };
  const { data: rows, error } = await admin
    .from("selection_items")
    .select("id, photo_id, dot")
    .eq("selection_id", sel.id)
    .eq("mark", "selected")
    .in("id", p.selectionItemIds);
  if (error) throw error;
  const ds = (rows ?? []) as { id: string; photo_id: string; dot: number | null }[];
  if (ds.length !== p.selectionItemIds.length) return { ok: false, message: "Có ảnh không còn trong danh sách khách chọn — tải lại rồi tích lại giúp." };
  const theoDot = new Map<number, { id: string; photo_id: string }[]>();
  for (const r of ds) {
    const d = Number(r.dot ?? 1);
    theoDot.set(d, [...(theoDot.get(d) ?? []), r]);
  }
  // Kiểm hết trước khi xoá: đợt ≥ 2 phải đang chờ xác nhận.
  const dongDot = new Map<number, Awaited<ReturnType<typeof layMotDot>>>();
  for (const d of theoDot.keys()) {
    if (d < 2) continue;
    const dong = await layMotDot(admin, p.galleryId, d);
    if (!dong || dong.trangThai !== "cho_xac_nhan") return { ok: false, message: `Đợt ${d} đã xác nhận — không bỏ ảnh được.` };
    dongDot.set(d, dong);
  }
  for (const [d, anh] of theoDot) {
    const { error: ed } = await admin.from("selection_items").delete().in("id", anh.map((r) => r.id));
    if (ed) throw ed;
    if (d === 1) {
      const soCu = Number(sel.snapshot_extra_count ?? 0);
      if (soCu > 0) {
        const gia = Number(sel.snapshot_extra_amount ?? 0) / soCu;
        const soMoi = Math.max(0, soCu - anh.length);
        const { error: eu } = await admin
          .from("selections")
          .update({ snapshot_extra_count: soMoi, snapshot_extra_amount: Math.round(soMoi * gia) })
          .eq("id", sel.id);
        if (eu) throw eu;
      }
    } else {
      const dong = dongDot.get(d)!;
      const bo = new Set(anh.map((r) => r.photo_id));
      const soAnh = Math.max(0, dong.soAnh - anh.length);
      const soTinhTien = Math.max(0, dong.soAnhTinhTien - anh.length);
      const tienAnh = soTinhTien * dong.giaMoiAnh;
      const { error: eu } = await admin
        .from("selection_rounds")
        .update({ so_anh: soAnh, so_anh_tinh_tien: soTinhTien, tien_anh: tienAnh, anh_ids: dong.anhIds.filter((x) => !bo.has(x)) })
        .eq("id", dong.id)
        .eq("trang_thai", "cho_xac_nhan");
      if (eu) throw eu;
    }
    await ghiNhatKy({
      actorType: "staff",
      actorId: p.staff.staffId,
      actorLabel: p.staff.role,
      branchId: p.branchId,
      action: "gallery.hoa_don_bo_muc",
      entityType: "gallery",
      entityId: p.galleryId,
      galleryId: p.galleryId,
      metadata: { khoa: d === 1 ? "file" : `dot:${d}`, soLuong: anh.length, photoIds: anh.map((r) => r.photo_id) },
    });
  }
  return { ok: true, soAnh: ds.length };
}

/**
 * Nhân viên đã liên hệ khách, khách KHÔNG mua tiếp sản phẩm dư: giảm số lượng ở giỏ đợt 1 (dòng
 * mới nhất trước) / huỷ yêu cầu mua thêm. Ảnh dư bỏ bằng `boAnhDu` (danh sách tích).
 */
export async function boMucDu(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string; staff: StaffSession; muc: MucBo[] },
): Promise<{ daBo: { khoa: string; soLuong: number }[] }> {
  const daBo: { khoa: string; soLuong: number }[] = [];
  const { data: sel, error: es } = await admin
    .from("selections")
    .select("id, snapshot_extra_count, snapshot_extra_amount")
    .eq("gallery_id", p.galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  if (es) throw es;
  for (const m of p.muc) {
    const n = Math.max(0, Math.floor(m.soLuong));
    if (n === 0) continue;
    // Vòng 2: ảnh (đợt 1 / đợt ≥ 2) bỏ theo DANH SÁCH nhân viên tích — `boAnhDu`.
    if (m.productId) {
      let con = n;
      if (sel?.id) {
        const { data: rows, error } = await admin
          .from("selection_addons")
          .select("id, quantity")
          .eq("selection_id", sel.id)
          .eq("product_id", m.productId)
          .eq("dot", 1) // giỏ đợt ≥ 2 nằm trong đợt — đổi bằng từ chối/mở lại đợt
          .order("created_at", { ascending: false });
        if (error) throw error;
        for (const r of (rows ?? []) as { id: string; quantity: number }[]) {
          if (con <= 0) break;
          const q = Number(r.quantity);
          if (q <= con) {
            const { error: e } = await admin.from("selection_addons").delete().eq("id", r.id);
            if (e) throw e;
            con -= q;
          } else {
            const { error: e } = await admin.from("selection_addons").update({ quantity: q - con }).eq("id", r.id);
            if (e) throw e;
            con = 0;
          }
        }
      }
      if (con > 0) {
        const { data: yc, error } = await admin
          .from("yeu_cau_mua_them")
          .select("id, so_luong")
          .eq("gallery_id", p.galleryId)
          .eq("product_id", m.productId)
          .in("trang_thai", ["moi", "da_lien_he", "da_chot"])
          .order("created_at", { ascending: false });
        if (error) throw error;
        for (const r of (yc ?? []) as { id: string; so_luong: number }[]) {
          if (con <= 0) break;
          const { error: e } = await admin.from("yeu_cau_mua_them").update({ trang_thai: "huy" }).eq("id", r.id);
          if (e) throw e;
          con -= Number(r.so_luong);
        }
      }
      daBo.push({ khoa: m.khoa, soLuong: n - Math.max(0, con) });
      await ghiNhatKy({
        actorType: "staff",
        actorId: p.staff.staffId,
        actorLabel: p.staff.role,
        branchId: p.branchId,
        action: "gallery.hoa_don_bo_muc",
        entityType: "gallery",
        entityId: p.galleryId,
        galleryId: p.galleryId,
        metadata: { khoa: m.khoa, productId: m.productId, soLuong: n - Math.max(0, con) },
      });
    }
  }
  return { daBo };
}

// ---------------------------------------------------------------------------
// Gỡ gán (Admin/Quản lý)
// ---------------------------------------------------------------------------

/**
 * Gỡ một mã khỏi bộ: bỏ dòng hạn mức/sản phẩm của mã, ghi dòng ĐÍNH CHÍNH ÂM cho tiền đã ghi
 * theo mã đó (sổ chỉ ghi thêm), xoá việc gán. Sau đó gán sang bộ đúng như bình thường.
 */
export async function goGanHoaDon(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string; ma: string; staff: StaffSession; lyDo: string },
): Promise<{ ok: boolean; message: string }> {
  const daGan = await layHoaDonDaGan(admin, p.galleryId);
  const row = daGan.find((d) => d.ma === p.ma);
  if (!row) return { ok: false, message: `Bộ ảnh không có mã ${p.ma}` };

  const { data: dong, error: ed } = await admin
    .from("gallery_items")
    .select("id, lark_record_id")
    .eq("gallery_id", p.galleryId)
    .like("lark_record_id", `${TIEN_TO_DONG_HOA_DON}%`);
  if (ed) throw ed;
  const cuaMa = ((dong ?? []) as { id: string; lark_record_id: string }[]).filter((r) => r.lark_record_id.startsWith(`${TIEN_TO_DONG_HOA_DON}${p.ma}_`));
  if (cuaMa.length > 0) {
    const { error } = await admin.from("gallery_items").delete().in("id", cuaMa.map((r) => r.id));
    if (error) throw error;
  }

  const { data: so, error: eso } = await admin
    .from("gallery_payments")
    .select("amount, payment_method, ma_phieu_thu, selection_id")
    .eq("gallery_id", p.galleryId)
    .eq("ma_hoa_don", p.ma);
  if (eso) throw eso;
  const theoPhieu = new Map<string, { tong: number; method: string; selectionId: string | null }>();
  for (const r of (so ?? []) as { amount: number; payment_method: string; ma_phieu_thu: string | null; selection_id: string | null }[]) {
    const k = `${r.ma_phieu_thu ?? ""}|${r.payment_method}`;
    const cu = theoPhieu.get(k) ?? { tong: 0, method: r.payment_method, selectionId: r.selection_id };
    cu.tong += Number(r.amount);
    theoPhieu.set(k, cu);
  }
  for (const [k, v] of theoPhieu) {
    if (v.tong === 0) continue;
    const maPhieu = k.split("|")[0] || null;
    const { error } = await admin.from("gallery_payments").insert({
      gallery_id: p.galleryId,
      selection_id: v.selectionId,
      confirmed_by: p.staff.staffId,
      amount: -v.tong,
      payment_method: v.method,
      note: `Gỡ gán hoá đơn ${p.ma} — ${p.lyDo}`.slice(0, 540),
      ma_hoa_don: p.ma,
      ma_phieu_thu: maPhieu,
      ma_yeu_cau: `hdgo-${row.id.slice(0, 8)}-${bamNgan(k)}`,
    });
    if (error && error.code !== "23505") throw error;
  }

  // Vòng 2: bỏ dấu "đã trả bằng hoá đơn" của mã này (đợt ≥ 2, giỏ đợt 1, yêu cầu mua thêm) — các
  // mục đó quay lại "Phải thu" đúng lúc dòng đính chính âm ở trên trừ tiền hoá đơn ra.
  const { error: er } = await admin
    .from("selection_rounds")
    .update({ ma_hoa_don: null, ma_phieu_thu: null, da_thanh_toan_luc: null, da_thanh_toan_boi: null })
    .eq("gallery_id", p.galleryId)
    .eq("ma_hoa_don", p.ma);
  if (er && !laLoiChuaApMigration(er)) throw er;
  const { data: sel } = await admin.from("selections").select("id").eq("gallery_id", p.galleryId).eq("is_primary", true).maybeSingle();
  if (sel?.id) {
    const { error: ea } = await admin.from("selection_addons").update({ ma_hoa_don: null }).eq("selection_id", sel.id).eq("ma_hoa_don", p.ma);
    if (ea && !laLoiChuaApMigration(ea)) throw ea;
  }
  const { error: eyc } = await admin
    .from("yeu_cau_mua_them")
    .update({ trang_thai: "da_chot", ma_hoa_don: null, da_thanh_toan_luc: null })
    .eq("gallery_id", p.galleryId)
    .eq("ma_hoa_don", p.ma)
    .eq("trang_thai", "da_thanh_toan");
  if (eyc) throw eyc;

  const { error: edel } = await admin.from(BANG_GAN).delete().eq("id", row.id);
  if (edel) throw edel;
  await ghiNhatKy({
    actorType: "staff",
    actorId: p.staff.staffId,
    actorLabel: p.staff.role,
    branchId: p.branchId,
    action: "gallery.hoa_don_go_gan",
    entityType: "gallery",
    entityId: p.galleryId,
    galleryId: p.galleryId,
    metadata: { maHoaDon: p.ma, soDongBo: cuaMa.length },
  });
  await phatSuKienBoAnh({ galleryId: p.galleryId, branchId: p.branchId, loai: LOAI_TUC_THI.studioThanhToan });
  return { ok: true, message: `Đã gỡ ${p.ma} khỏi bộ ảnh (đã ghi dòng đính chính trong sổ).` };
}

// ---------------------------------------------------------------------------
// Gợi ý bộ theo khách (cấp khách hàng)
// ---------------------------------------------------------------------------

/** BB-397: trần số bộ đọc hoá đơn gốc khi gợi ý theo khách chưa có khoá (mỗi bộ ≤ 5 lượt đọc). */
const TRAN_BO_DU_PHONG = 3;

type BoCoMaGoc = { customer_id: string | null; lark_contract_code: string | null; lark_contract_codes: string[] | null };

async function khachChuaCoKhoa(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await admin.from("customers").select("id").in("id", [...new Set(ids)]).is("lark_customer_key", null);
  if (error) throw error;
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** Khách (của các bộ) có hoá đơn gốc cùng khách nguồn `khoa`. Tuần tự, dừng sớm khi đủ. */
async function khachKhopQuaHoaDonGoc(nguon: NguonHoaDon, bos: BoCoMaGoc[], khoa: string): Promise<string[]> {
  const ra = new Set<string>();
  for (const b of bos.slice(0, TRAN_BO_DU_PHONG)) {
    if (!b.customer_id || ra.has(b.customer_id)) continue;
    const goc = await docKhoaKhachHoaDonGoc(nguon, [b.lark_contract_code, ...(b.lark_contract_codes ?? [])]);
    if (goc.ok && goc.khoa === khoa) ra.add(b.customer_id);
  }
  return [...ra];
}

export async function goiYBoTheoHoaDon(
  admin: SupabaseClient,
  p: { nguon: NguonHoaDon; ma: string; branchIds: string[] | null; customerId?: string | null },
): Promise<
  | { ok: true; hoaDon: { ma: string; tongPhaiThu: number; daThu: number; conLai: number; lyDoChuaDu: string[] }; daGanCho: string | null; ds: (BoUngVien & { diem: number; lyDo: string[] })[]; goiY: string | null }
  | { ok: false; message: string }
> {
  const doc = await docTatCa(p.nguon, [p.ma]);
  if (!doc.ok) return { ok: false, message: doc.message };
  const hd = doc.ds[0];
  if (!hd) return { ok: false, message: `Không tìm thấy hoá đơn ${p.ma}.` };
  const { data: gan } = await admin.from(BANG_GAN).select("gallery_id").eq("ma_hoa_don", p.ma).maybeSingle();
  if (!hd.khoaKhachNguon) return { ok: false, message: CAU_KHACH.hoa_don_khong_co_khach };
  const { data: khach, error: ek } = await admin.from("customers").select("id").eq("lark_customer_key", hd.khoaKhachNguon);
  if (ek) throw ek;
  let khachIds = ((khach ?? []) as { id: string }[]).map((k) => k.id);
  try {
    if (p.customerId) {
      // Trang khách hàng: hoá đơn phải là của CHÍNH khách này. BB-397: khách chưa có khoá Lark
      // → so với hoá đơn gốc các bộ của khách (khách đã có khoá khác thì vẫn là khách khác).
      if (!khachIds.includes(p.customerId)) {
        const chuaKhoa = await khachChuaCoKhoa(admin, [p.customerId]);
        if (!chuaKhoa.has(p.customerId)) return { ok: false, message: CAU_KHACH.khac_khach };
        const { data: bosKhach, error: ebk } = await admin
          .from("galleries")
          .select("customer_id, lark_contract_code, lark_contract_codes")
          .eq("customer_id", p.customerId)
          .not("lark_contract_code", "is", null)
          .order("created_at", { ascending: false })
          .limit(TRAN_BO_DU_PHONG);
        if (ebk) throw ebk;
        const khop = await khachKhopQuaHoaDonGoc(p.nguon, (bosKhach ?? []) as BoCoMaGoc[], hd.khoaKhachNguon);
        if (!khop.includes(p.customerId)) return { ok: false, message: CAU_KHACH.khac_khach };
      }
      khachIds = [p.customerId];
    }
    if (khachIds.length === 0 && hd.maHauKyNguon.length > 0) {
      // BB-397: chưa khách nào mang khoá → đi theo dòng Hậu Kỳ hoá đơn trỏ tới (không quét kho Lark):
      // bộ neo dòng đó, khách chưa có khoá, hoá đơn gốc của bộ cùng khách nguồn.
      const { data: bosHk, error: ehk } = await admin
        .from("galleries")
        .select("customer_id, lark_contract_code, lark_contract_codes")
        .in("lark_hauky_record_id", hd.maHauKyNguon.slice(0, TRAN_BO_DU_PHONG))
        .limit(TRAN_BO_DU_PHONG);
      if (ehk) throw ehk;
      const ds = (bosHk ?? []) as BoCoMaGoc[];
      const chuaKhoa = await khachChuaCoKhoa(admin, ds.map((b) => b.customer_id).filter((x): x is string => Boolean(x)));
      khachIds = await khachKhopQuaHoaDonGoc(p.nguon, ds.filter((b) => b.customer_id && chuaKhoa.has(b.customer_id)), hd.khoaKhachNguon);
    }
  } catch (e) {
    if (e instanceof LoiNguonHoaDon) return { ok: false, message: cauLoiNguon(e) };
    throw e;
  }
  if (khachIds.length === 0) return { ok: false, message: "Chưa có khách nào trên app khớp với khách của hoá đơn này." };
  let q = admin
    .from("galleries")
    .select("id, title, branch_id, lark_hauky_record_id, status")
    .in("customer_id", khachIds)
    .neq("status", "archived");
  if (p.branchIds) q = q.in("branch_id", p.branchIds);
  const { data: bos, error: eb } = await q;
  if (eb) throw eb;
  const ungVien: BoUngVien[] = [];
  for (const b of (bos ?? []) as { id: string; title: string; lark_hauky_record_id: string | null }[]) {
    const ps = await layPhatSinhApp(admin, b.id);
    const sanPhamCho: Record<string, number> = {};
    for (const s of ps.sanPham) if (s.idSanPhamNguon) sanPhamCho[s.idSanPhamNguon] = (sanPhamCho[s.idSanPhamNguon] ?? 0) + s.soLuong;
    ungVien.push({
      galleryId: b.id,
      tieuDe: b.title,
      khoaKhach: hd.khoaKhachNguon,
      maHauKy: b.lark_hauky_record_id,
      fileCho: ps.fileVuot + ps.fileMuaThem,
      sanPhamCho,
    });
  }
  const goiY = goiYBoAnhChoHoaDon(hd, ungVien);
  const theoId = new Map(ungVien.map((u) => [u.galleryId, u]));
  return {
    ok: true,
    hoaDon: { ma: hd.ma, tongPhaiThu: hd.tongPhaiThu, daThu: hd.daThu, conLai: hd.conLai, lyDoChuaDu: kiemDieuKienHoaDon(hd).lyDo },
    daGanCho: (gan?.gallery_id as string | null) ?? null,
    ds: goiY.ds.map((d) => ({ ...(theoId.get(d.galleryId) as BoUngVien), diem: d.diem, lyDo: d.lyDo })),
    goiY: goiY.goiY,
  };
}
