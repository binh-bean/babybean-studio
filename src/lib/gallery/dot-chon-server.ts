/**
 * Đọc/ghi "đợt chọn" phía máy chủ — dùng chung cho route khách, route CSKH,
 * route mở lại và hàng đợi "Việc cần xử lý".
 *
 * OWNER: DEV-BE. Task BB-321. Luật thuần nằm ở `./dot-chon.ts`; tệp này chỉ là
 * phần chạm cơ sở dữ liệu. Xem db/migrations/0077-dot-chon-anh.sql.
 *
 * ---------------------------------------------------------------------------
 * Migration 0077 CHƯA ÁP lúc viết tệp này
 * ---------------------------------------------------------------------------
 * Mọi hàm ĐỌC rớt về "không có đợt nào" nếu bảng/cột chưa tồn tại (42P01,
 * PGRST205, 42703, PGRST204) — để trang chi tiết bộ ảnh và màn khách KHÔNG hỏng
 * trên môi trường chưa áp. Hàm GHI thì báo lỗi rõ ràng (CONFLICT với câu tiếng
 * Việt) chứ không nuốt: ghi đợt mua trên môi trường thiếu bảng phải kêu lên.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nhomSanPham, canGanAnh, sanPhamBanChoKhach } from "@/lib/products/nhom-san-pham";
import {
  CAU_BIET_ANH_IN_CHAM,
  CAU_DONG_Y_STUDIO_CHON,
  demSanPhamInChuaAnh,
  kiemTraSanPhamInChuaAnh,
  phanLoaiAnhChonThem,
  soDotKeTiep,
  tinhTienDot,
  type TrangThaiDot,
} from "@/lib/gallery/dot-chon";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { locHangInTrongGoi } from "@/lib/products/hang-in-trong-goi";
import { giaDuocBaoTuDong } from "@/lib/products/kich-thuoc-dang-ban";

// ---------------------------------------------------------------------------
// Nhận diện lỗi "chưa áp migration"
// ---------------------------------------------------------------------------

type LoiDb = { code?: string; message?: string } | null | undefined;

export function laLoiThieuBang(err: LoiDb): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(err.message ?? "");
}

export function laLoiThieuCot(err: LoiDb): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* (does not exist|not found)|could not find the .* column/i.test(err.message ?? "");
}

export function laLoiChuaApMigration(err: LoiDb): boolean {
  return laLoiThieuBang(err) || laLoiThieuCot(err);
}

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface DongSanPhamDot {
  productId: string;
  ten: string;
  photoId: string | null;
  soLuong: number;
  donGia: number;
}

export interface DongDot {
  id: string;
  galleryId: string;
  selectionId: string;
  soDot: number;
  trangThai: TrangThaiDot;
  soAnh: number;
  soAnhTinhTien: number;
  giaMoiAnh: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  anhIds: string[];
  sanPham: DongSanPhamDot[];
  traLai: boolean;
  /** Số sản phẩm in khách chốt mà chưa gắn ảnh (khách đã tick biết ảnh sẽ chậm hơn). */
  soSanPhamInChuaAnh: number;
  bietAnhInChamHon: boolean;
  lyDoTuChoi: string | null;
  lyDoMoLai: string | null;
  submittedAt: string;
  submittedByName: string | null;
  confirmedAt: string | null;
  xuLyAt: string | null;
}

interface HangDotTho {
  id: string;
  gallery_id: string;
  selection_id: string;
  so_dot: number;
  trang_thai: TrangThaiDot;
  so_anh: number;
  so_anh_tinh_tien: number;
  gia_moi_anh: number | string;
  tien_anh: number | string;
  tien_san_pham: number | string;
  anh_ids: string[] | null;
  san_pham: unknown;
  tra_lai: boolean;
  so_san_pham_in_chua_anh: number | null;
  biet_anh_in_cham_hon: boolean | null;
  ly_do_tu_choi: string | null;
  ly_do_mo_lai: string | null;
  submitted_at: string;
  submitted_by_name: string | null;
  confirmed_at: string | null;
  xu_ly_at: string | null;
}

export function chuyenHangDot(r: HangDotTho): DongDot {
  const tienAnh = Number(r.tien_anh ?? 0);
  const tienSanPham = Number(r.tien_san_pham ?? 0);
  return {
    id: r.id,
    galleryId: r.gallery_id,
    selectionId: r.selection_id,
    soDot: r.so_dot,
    trangThai: r.trang_thai,
    soAnh: r.so_anh,
    soAnhTinhTien: r.so_anh_tinh_tien,
    giaMoiAnh: Number(r.gia_moi_anh ?? 0),
    tienAnh,
    tienSanPham,
    tong: tienAnh + tienSanPham,
    anhIds: r.anh_ids ?? [],
    sanPham: Array.isArray(r.san_pham) ? (r.san_pham as DongSanPhamDot[]) : [],
    traLai: r.tra_lai === true,
    soSanPhamInChuaAnh: r.so_san_pham_in_chua_anh ?? 0,
    bietAnhInChamHon: r.biet_anh_in_cham_hon === true,
    lyDoTuChoi: r.ly_do_tu_choi,
    lyDoMoLai: r.ly_do_mo_lai,
    submittedAt: r.submitted_at,
    submittedByName: r.submitted_by_name,
    confirmedAt: r.confirmed_at,
    xuLyAt: r.xu_ly_at,
  };
}

const COT_DOT =
  "id, gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh, tien_anh, tien_san_pham, " +
  "anh_ids, san_pham, tra_lai, so_san_pham_in_chua_anh, biet_anh_in_cham_hon, ly_do_tu_choi, ly_do_mo_lai, submitted_at, submitted_by_name, confirmed_at, xu_ly_at";

// ---------------------------------------------------------------------------
// ĐỌC
// ---------------------------------------------------------------------------

/** Mọi đợt (từ 2 trở đi) của một bộ ảnh, theo số đợt tăng dần. Chưa áp 0077 → []. */
export async function layCacDot(admin: SupabaseClient, galleryId: string): Promise<DongDot[]> {
  const { data, error } = await admin
    .from("selection_rounds")
    .select(COT_DOT)
    .eq("gallery_id", galleryId)
    .order("so_dot", { ascending: true });
  if (error) {
    if (laLoiChuaApMigration(error)) return [];
    throw error;
  }
  return ((data ?? []) as unknown as HangDotTho[]).map(chuyenHangDot);
}

/** photoId → số đợt của mọi ảnh đang được chọn (mark = 'selected') trong lượt chọn. Chưa áp 0077 → rỗng. */
export async function layDotTheoAnh(
  admin: SupabaseClient,
  selectionId: string,
): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from("selection_items")
    .select("photo_id, dot")
    .eq("selection_id", selectionId)
    .eq("mark", "selected");
  if (error) {
    if (laLoiChuaApMigration(error)) return new Map();
    throw error;
  }
  return new Map(
    ((data ?? []) as { photo_id: string; dot: number | null }[]).map((r) => [r.photo_id, r.dot ?? 1]),
  );
}

/** Số ảnh đang được chọn (mark = 'selected') trong lượt chọn, mọi đợt. */
export async function demAnhDangChon(admin: SupabaseClient, selectionId: string): Promise<number> {
  const { count, error } = await admin
    .from("selection_items")
    .select("id", { count: "exact", head: true })
    .eq("selection_id", selectionId)
    .eq("mark", "selected");
  if (error) throw error;
  return count ?? 0;
}

/** Hạn mức ảnh trong gói: hàm `gallery_quota` (theo hợp đồng), rớt về cột chụp lại, rớt về null. */
export async function layHanMucAnh(admin: SupabaseClient, galleryId: string): Promise<number | null> {
  const { data: q } = await admin.rpc("gallery_quota", { p_gallery_id: galleryId });
  if (q !== null && q !== undefined) return Number(q);
  const { data: g } = await admin.from("galleries").select("included_quota").eq("id", galleryId).maybeSingle();
  const c = (g as { included_quota: number | null } | null)?.included_quota;
  return c === null || c === undefined ? null : Number(c);
}

export interface DongChoXacNhanDot extends DongDot {
  galleryTitle: string;
  branchId: string;
  branchName: string | null;
  customerName: string | null;
}

/**
 * Hàng đợi CSKH: mọi đợt đang `cho_xac_nhan`, trong phạm vi chi nhánh
 * (`null` = mọi chi nhánh, chỉ superuser). Cũ nhất lên trước.
 */
export async function layDanhSachChoXacNhanDot(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<DongChoXacNhanDot[]> {
  const { data, error } = await admin
    .from("selection_rounds")
    .select(COT_DOT)
    .eq("trang_thai", "cho_xac_nhan")
    .order("submitted_at", { ascending: true })
    .limit(500);
  if (error) {
    if (laLoiChuaApMigration(error)) return [];
    throw error;
  }
  const dong = ((data ?? []) as unknown as HangDotTho[]).map(chuyenHangDot);
  if (dong.length === 0) return [];

  const ids = Array.from(new Set(dong.map((d) => d.galleryId)));
  const { data: gs, error: e2 } = await admin
    .from("galleries")
    .select("id, title, branch_id, customer_id, branches(name)")
    .in("id", ids);
  if (e2) throw e2;

  type G = {
    id: string;
    title: string;
    branch_id: string;
    customer_id: string | null;
    branches: { name: string } | { name: string }[] | null;
  };
  const gMap = new Map(((gs ?? []) as unknown as G[]).map((g) => [g.id, g]));

  const kIds = Array.from(
    new Set(((gs ?? []) as unknown as G[]).map((g) => g.customer_id).filter((v): v is string => !!v)),
  );
  const { data: ks } = kIds.length
    ? await admin.from("customers").select("id, full_name").in("id", kIds)
    : { data: [] as { id: string; full_name: string }[] };
  const kMap = new Map((ks ?? []).map((k) => [k.id, k.full_name as string]));

  const tenCn = (raw: G["branches"]) => (Array.isArray(raw) ? raw[0]?.name : raw?.name) ?? null;

  return dong
    .map((d): DongChoXacNhanDot | null => {
      const g = gMap.get(d.galleryId);
      if (!g) return null;
      if (branchIds && !branchIds.includes(g.branch_id)) return null;
      return {
        ...d,
        galleryTitle: g.title,
        branchId: g.branch_id,
        branchName: tenCn(g.branches),
        customerName: g.customer_id ? (kMap.get(g.customer_id) ?? null) : null,
      };
    })
    .filter((v): v is DongChoXacNhanDot => v !== null);
}

// ---------------------------------------------------------------------------
// Kiểm sản phẩm trong đợt (cùng luật tiền của /api/g/addons và /api/g/mua-them)
// ---------------------------------------------------------------------------

export interface DauVaoSanPham {
  productId: string;
  photoId: string | null;
  soLuong: number;
}

export type KetQuaChuanBiSanPham =
  | { ok: true; dong: DongSanPhamDot[]; tienSanPham: number; soChuaAnh: number }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND"; message: string };

/**
 * Kiểm từng dòng sản phẩm khách bỏ vào đợt: có bán không, giá đủ tin cậy chưa,
 * ảnh gắn kèm có thuộc bộ ảnh và nằm trong ảnh khách chọn không.
 *
 * `anhDuocGan` = mọi ảnh khách đã chọn (mọi đợt) CỘNG ảnh đang chốt ở đợt này.
 * Gộp các dòng trùng (cùng sản phẩm + ảnh) bằng cách cộng số lượng, trần 20.
 */
export async function chuanBiSanPham(
  admin: SupabaseClient,
  dauVao: DauVaoSanPham[],
  anhDuocGan: ReadonlySet<string>,
): Promise<KetQuaChuanBiSanPham> {
  if (dauVao.length === 0) return { ok: true, dong: [], tienSanPham: 0, soChuaAnh: 0 };

  const gop = new Map<string, DauVaoSanPham>();
  for (const d of dauVao) {
    const khoa = `${d.productId}::${d.photoId ?? ""}`;
    const cu = gop.get(khoa);
    gop.set(khoa, cu ? { ...cu, soLuong: Math.min(20, cu.soLuong + d.soLuong) } : { ...d });
  }

  const productIds = Array.from(new Set(dauVao.map((d) => d.productId)));
  const { data: products, error } = await admin
    .from("products")
    .select("id, name, kind, material, list_price, price_confidence, price_samples, is_active")
    .in("id", productIds);
  if (error) throw error;
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));

  const dong: DongSanPhamDot[] = [];
  let soChuaAnh = 0;
  for (const d of gop.values()) {
    const p = pMap.get(d.productId);
    if (!p || !p.is_active) {
      return { ok: false, code: "NOT_FOUND", message: "Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh" };
    }
    if (!sanPhamBanChoKhach({ isActive: p.is_active, kind: p.kind, material: p.material })) {
      return { ok: false, code: "INVALID_INPUT", message: "Sản phẩm này không bán trong mục chọn thêm" };
    }
    if (p.list_price === null || p.list_price === undefined) {
      return { ok: false, code: "INVALID_INPUT", message: "Có sản phẩm chưa có đơn giá niêm yết, vui lòng liên hệ CSKH" };
    }
    // BB-335: cùng luật giá với danh mục của /api/g/gallery.
    if (!giaDuocBaoTuDong(p)) {
      return { ok: false, code: "INVALID_INPUT", message: "Có sản phẩm chưa đủ độ tin cậy về giá, CSKH sẽ báo giá trực tiếp" };
    }
    // Sản phẩm in (ảnh in/khung) chưa gắn ảnh, hoặc album (ảnh đưa vào sau) — KHÔNG
    // từ chối ở đây nữa: đếm lại, và bước chốt đòi khách tick "biết ảnh sẽ chậm hơn".
    const nhom = nhomSanPham(p.kind, p.material);
    if (!d.photoId && (canGanAnh(nhom) || nhom === "album")) soChuaAnh += d.soLuong;
    if (d.photoId && !anhDuocGan.has(d.photoId)) {
      return { ok: false, code: "INVALID_INPUT", message: "Tấm ảnh gắn với sản phẩm phải là ảnh ba mẹ đã chọn" };
    }
    dong.push({
      productId: d.productId,
      ten: String(p.name),
      photoId: d.photoId,
      soLuong: d.soLuong,
      donGia: Number(p.list_price),
    });
  }

  return {
    ok: true,
    dong,
    tienSanPham: dong.reduce((t, d) => t + d.donGia * d.soLuong, 0),
    soChuaAnh,
  };
}

// ---------------------------------------------------------------------------
// GHI: chốt một đợt
// ---------------------------------------------------------------------------

export type KetQuaChotDot =
  | { ok: true; dot: DongDot; daChonTruoc: number }
  | { ok: false; code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "INTERNAL"; message: string; chiTiet?: unknown };

/**
 * Chốt đợt mới. Gọi SAU khi route đã kiểm phiên (owner) và trạng thái bộ ảnh
 * (`dangCheDoChonThem`). Không nhận trạng thái bộ ảnh ở đây để hàm này chỉ lo
 * dữ liệu.
 *
 * Không có giao dịch SQL (không thêm hàm SQL mới — xem AGENTS §5b): ghi theo
 * thứ tự dòng đợt → ảnh → sản phẩm, và nếu một bước hỏng thì DỌN NGƯỢC những gì
 * đã ghi rồi báo lỗi, để không bao giờ để lại ảnh mồ côi ở một đợt không tồn tại.
 * Hai lượt chốt cùng lúc giành cùng số đợt bị chỉ mục duy nhất
 * `(gallery_id, so_dot)` chặn; lượt thua thử lại với số kế tiếp.
 */
export async function chotDotChon(
  admin: SupabaseClient,
  p: {
    galleryId: string;
    selectionId: string;
    photoIds: string[];
    sanPham: DauVaoSanPham[];
    tenNguoiChot: string;
    giaMoiAnh: number;
    /** Khách đã tick "Tôi biết nếu chưa chọn ảnh in, thời gian nhận ảnh sẽ lâu hơn timeline". */
    bietAnhInChamHon?: boolean;
  },
): Promise<KetQuaChotDot> {
  const photoIds = Array.from(new Set(p.photoIds));

  // 1. Ảnh phải thuộc bộ ảnh này, còn hoạt động.
  if (photoIds.length > 0) {
    const { data: anh, error } = await admin
      .from("photos")
      .select("id, status")
      .eq("gallery_id", p.galleryId)
      .in("id", photoIds);
    if (error) throw error;
    const hopLeTrongBo = new Set(
      (anh ?? []).filter((a) => a.status === "active").map((a) => a.id as string),
    );
    const sai = photoIds.filter((id) => !hopLeTrongBo.has(id));
    if (sai.length > 0) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Có ảnh không thuộc bộ ảnh này hoặc không còn trong thư mục",
        chiTiet: { photoIds: sai },
      };
    }
  }

  // 2. Ảnh đã nằm trong đợt khác thì KHOÁ — không chọn lại ở đây.
  const { data: dongCo, error: eCo } = await admin
    .from("selection_items")
    .select("id, photo_id, mark, dot")
    .eq("selection_id", p.selectionId);
  if (eCo) {
    if (laLoiChuaApMigration(eCo)) {
      return { ok: false, code: "CONFLICT", message: "Tính năng chọn thêm ảnh chưa sẵn sàng, ba mẹ nhắn CSKH giúp em nhé" };
    }
    throw eCo;
  }
  type DongCo = { id: string; photo_id: string; mark: string | null; dot: number | null };
  const cacDongCo = (dongCo ?? []) as DongCo[];

  const daChonMap = new Map<string, number>(
    cacDongCo.filter((d) => d.mark === "selected").map((d) => [d.photo_id, d.dot ?? 1]),
  );
  const { hopLe, biKhoa } = phanLoaiAnhChonThem(photoIds, daChonMap);
  if (biKhoa.length > 0) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Có ảnh đã được chốt ở đợt trước, muốn đổi thì ba mẹ gửi yêu cầu mở lại nhé",
      chiTiet: { biKhoa },
    };
  }

  // 3. Sản phẩm.
  const anhDuocGan = new Set<string>([...daChonMap.keys(), ...hopLe]);
  const sp = await chuanBiSanPham(admin, p.sanPham, anhDuocGan);
  if (!sp.ok) return { ok: false, code: sp.code, message: sp.message };

  // Sản phẩm in chưa gắn ảnh: phải có cờ "biết ảnh sẽ chậm hơn" — máy chủ tự kiểm.
  const kiemIn = kiemTraSanPhamInChuaAnh({ soChuaAnh: sp.soChuaAnh, biet: p.bietAnhInChamHon === true });
  if (!kiemIn.ok) return { ok: false, code: kiemIn.code, message: kiemIn.message, chiTiet: kiemIn.chiTiet };

  if (hopLe.length === 0 && sp.dong.length === 0) {
    return { ok: false, code: "INVALID_INPUT", message: "Ba mẹ chọn ít nhất một tấm ảnh hoặc một sản phẩm để chốt đợt này nhé" };
  }

  // 4. Tiền, chụp lại. Từ đợt 2 mọi ảnh mới tính tiền từ ảnh đầu tiên (chủ studio 29/09/2026).
  const daChonTruoc = daChonMap.size;
  const tien = tinhTienDot({
    soAnhMoi: hopLe.length,
    giaMoiAnh: p.giaMoiAnh,
    tienSanPham: sp.tienSanPham,
  });

  // 5. Dòng đợt — thử tối đa 3 lần nếu trùng số đợt với lượt chốt song song.
  let dongDot: DongDot | null = null;
  for (let lan = 0; lan < 3 && !dongDot; lan++) {
    const cacDot = await layCacDot(admin, p.galleryId);
    const soDot = soDotKeTiep(cacDot);
    const { data: moi, error: eIns } = await admin
      .from("selection_rounds")
      .insert({
        gallery_id: p.galleryId,
        selection_id: p.selectionId,
        so_dot: soDot,
        trang_thai: "cho_xac_nhan",
        so_anh: hopLe.length,
        so_anh_tinh_tien: tien.soAnhTinhTien,
        gia_moi_anh: p.giaMoiAnh,
        tien_anh: tien.tienAnh,
        tien_san_pham: tien.tienSanPham,
        anh_ids: hopLe,
        san_pham: sp.dong,
        so_san_pham_in_chua_anh: sp.soChuaAnh,
        biet_anh_in_cham_hon: sp.soChuaAnh > 0,
        submitted_by_name: p.tenNguoiChot,
      })
      .select(COT_DOT)
      .single();
    if (!eIns) {
      dongDot = chuyenHangDot(moi as unknown as HangDotTho);
      break;
    }
    if (eIns.code === "23505") continue; // trùng số đợt → thử số kế tiếp
    if (laLoiChuaApMigration(eIns)) {
      return { ok: false, code: "CONFLICT", message: "Tính năng chọn thêm ảnh chưa sẵn sàng, ba mẹ nhắn CSKH giúp em nhé" };
    }
    throw eIns;
  }
  if (!dongDot) {
    return { ok: false, code: "CONFLICT", message: "Có lượt chốt khác đang xử lý, ba mẹ thử lại sau ít giây nhé" };
  }
  const soDot = dongDot.soDot;

  const donDep = async () => {
    // Từng bước dọn đều kiểm lỗi và ghi log — dọn hỏng một nửa mà im lặng là để lại ảnh mồ côi.
    const kiem = (buoc: string, error: { message?: string } | null) => {
      if (error) console.error(`[dot-chon] Dọn sau lỗi — bước "${buoc}" hỏng:`, error.message);
    };
    const { error: e1 } = await admin
      .from("selection_addons")
      .delete()
      .eq("selection_id", p.selectionId)
      .eq("dot", soDot);
    kiem("xoá sản phẩm của đợt", e1);
    // Dòng ảnh CŨ được nâng lên đợt này (đã tim/ghi chú, chưa chọn) trả về như cũ.
    for (const d of cacDongCo.filter((x) => x.mark !== "selected" && hopLe.includes(x.photo_id))) {
      const { error: e2 } = await admin
        .from("selection_items")
        .update({ mark: d.mark, dot: d.dot ?? 1 })
        .eq("id", d.id);
      kiem("trả dòng ảnh cũ", e2);
    }
    const idsMoi = hopLe.filter((id) => !cacDongCo.some((x) => x.photo_id === id));
    if (idsMoi.length > 0) {
      const { error: e3 } = await admin
        .from("selection_items")
        .delete()
        .eq("selection_id", p.selectionId)
        .in("photo_id", idsMoi);
      kiem("xoá ảnh mới thêm", e3);
    }
    const { error: e4 } = await admin.from("selection_rounds").delete().eq("id", dongDot!.id);
    kiem("xoá dòng đợt", e4);
  };

  try {
    // 6. Ảnh: dòng đã có (tim/ghi chú, chưa chọn) thì nâng lên; chưa có thì thêm.
    const dongCoTheoAnh = new Map(cacDongCo.map((d) => [d.photo_id, d]));
    const cacThem = hopLe.filter((id) => !dongCoTheoAnh.has(id));
    const cacNang = hopLe.filter((id) => dongCoTheoAnh.has(id));

    if (cacThem.length > 0) {
      const { error } = await admin.from("selection_items").insert(
        cacThem.map((photoId) => ({
          selection_id: p.selectionId,
          photo_id: photoId,
          gallery_id: p.galleryId,
          mark: "selected",
          dot: soDot,
        })),
      );
      if (error) throw error;
    }
    if (cacNang.length > 0) {
      const { error } = await admin
        .from("selection_items")
        .update({ mark: "selected", dot: soDot, updated_at: new Date().toISOString() })
        .eq("selection_id", p.selectionId)
        .in("photo_id", cacNang);
      if (error) throw error;
    }

    // 7. Sản phẩm mua thêm của đợt, đơn giá chốt lúc này (luật 1 của BB-105).
    if (sp.dong.length > 0) {
      const { error } = await admin.from("selection_addons").insert(
        sp.dong.map((d) => ({
          selection_id: p.selectionId,
          product_id: d.productId,
          photo_id: d.photoId,
          quantity: d.soLuong,
          unit_price: d.donGia,
          dot: soDot,
        })),
      );
      if (error) throw error;
    }
  } catch (err) {
    await donDep().catch((e) => console.error("[dot-chon] Dọn sau lỗi cũng hỏng:", e));
    throw err;
  }

  // 8. Ảnh/sản phẩm của các đợt bị trả lại trước đó đã được dùng — hết "trả lại".
  const { error: eTraLai } = await admin
    .from("selection_rounds")
    .update({ tra_lai: false })
    .eq("gallery_id", p.galleryId)
    .eq("tra_lai", true);
  // Không chặn phản hồi (đợt đã ghi xong) nhưng phải kêu: cờ kẹt thì lần sau ảnh cũ bị điền sẵn lại.
  if (eTraLai) console.error("[dot-chon] Không gỡ được cờ tra_lai:", eTraLai.message);

  return { ok: true, dot: dongDot, daChonTruoc };
}

// ---------------------------------------------------------------------------
// GHI: trả một đợt về cho khách (từ chối / mở lại)
// ---------------------------------------------------------------------------

/**
 * Xoá dòng ảnh + sản phẩm của đợt `dongDot` khỏi `selection_items`/
 * `selection_addons` và đánh dấu đợt đã trả lại. Ảnh/sản phẩm còn nguyên trong
 * `anh_ids`/`san_pham` để màn khách điền sẵn khi chọn lại.
 *
 * Ảnh đã có tim / ghi chú thì chỉ bỏ dấu "đã chọn" (giữ dòng, giữ tim). Các
 * bảng con (đặt ảnh vào sản phẩm, bìa album…) xoá theo `on delete cascade`.
 */
export async function traDotVeChoKhach(
  admin: SupabaseClient,
  dongDot: DongDot,
  p: { trangThai: "tu_choi" | "da_mo_lai"; lyDo: string; nhanVienId: string | null },
): Promise<void> {
  const { data: dongAnh, error } = await admin
    .from("selection_items")
    .select("id, is_favorite, retouch_note")
    .eq("selection_id", dongDot.selectionId)
    .eq("dot", dongDot.soDot);
  if (error) throw error;

  const giu = (dongAnh ?? []).filter(
    (d) => d.is_favorite === true || (d.retouch_note !== null && d.retouch_note !== ""),
  );
  const xoa = (dongAnh ?? []).filter((d) => !giu.includes(d));

  if (xoa.length > 0) {
    const { error: e1 } = await admin.from("selection_items").delete().in("id", xoa.map((d) => d.id));
    if (e1) throw e1;
  }
  if (giu.length > 0) {
    const { error: e2 } = await admin
      .from("selection_items")
      .update({ mark: null, dot: 1 })
      .in("id", giu.map((d) => d.id));
    if (e2) throw e2;
  }
  const { error: e3 } = await admin
    .from("selection_addons")
    .delete()
    .eq("selection_id", dongDot.selectionId)
    .eq("dot", dongDot.soDot);
  if (e3) throw e3;

  const bay = new Date().toISOString();
  const cot = p.trangThai === "tu_choi" ? { ly_do_tu_choi: p.lyDo } : { ly_do_mo_lai: p.lyDo };
  const { error: e4 } = await admin
    .from("selection_rounds")
    .update({
      trang_thai: p.trangThai,
      tra_lai: true,
      xu_ly_at: bay,
      xu_ly_by: p.nhanVienId,
      updated_at: bay,
      ...cot,
    })
    .eq("id", dongDot.id);
  if (e4) throw e4;
}

// ---------------------------------------------------------------------------
// Trạng thái đợt cho MÀN KHÁCH
// ---------------------------------------------------------------------------

export interface DotChoKhach {
  soDot: number;
  trangThai: TrangThaiDot;
  soAnh: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  lyDoTuChoi: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  sanPham: Array<{ ten: string; soLuong: number }>;
}

export interface TrangThaiDotChoKhach {
  /** Bộ ảnh đã sang giai đoạn "Chọn thêm ảnh" (đợt 1 đã được studio xác nhận). */
  cheDoChonThem: boolean;
  giaMoiAnh: number;
  /** Hạn mức ảnh trong gói; null = studio chưa nhập. */
  hanMuc: number | null;
  /** Số ảnh đang chọn (mọi đợt đang khoá) — để màn khách tính ảnh nào còn nằm trong gói. */
  daChonTruoc: number;
  cacDot: DotChoKhach[];
  /** photoId → số đợt, CHỈ đợt ≥ 2 (ảnh không có trong bản đồ này mà đang chọn = đợt 1). */
  dotTheoAnh: Record<string, number>;
  /** Ảnh + sản phẩm của các đợt bị từ chối/mở lại, để điền sẵn khi khách chọn lại. */
  banNhap: { anhIds: string[]; sanPham: DongSanPhamDot[]; lyDo: string | null } | null;
  /**
   * Số ảnh còn THIẾU so với hạn mức gói (`max(0, hanMuc − ảnh đang chọn)`); null khi
   * chưa biết hạn mức. Đợt 1 dùng để hỏi "nhờ studio chọn bổ sung".
   */
  soAnhThieu: number | null;
  /** Số sản phẩm in ĐỢT 1 hiện chưa gắn ảnh (suất trong gói + mua thêm). */
  soSanPhamInChuaAnh: number;
  /** Các cờ ghi lúc chốt đợt 1 (nhờ studio chọn, biết ảnh in chậm hơn). */
  dot1: ThongTinChotDot1;
  /** Câu chữ CHÍNH XÁC của hai ô tick — để giao diện dùng đúng câu chủ studio duyệt. */
  cauDongY: { studioChon: string; bietAnhInCham: string };
}

export async function layTrangThaiDotChoKhach(
  admin: SupabaseClient,
  p: {
    galleryId: string;
    selectionId: string;
    cheDoChonThem: boolean;
    giaMoiAnh: number;
  },
): Promise<TrangThaiDotChoKhach> {
  const [cacDot, dotTheoAnh, hanMuc, soInChuaAnh, dot1] = await Promise.all([
    layCacDot(admin, p.galleryId),
    layDotTheoAnh(admin, p.selectionId),
    layHanMucAnh(admin, p.galleryId),
    demSanPhamInChuaGanAnh(admin, p.galleryId, p.selectionId),
    layThongTinChotDot1(admin, p.galleryId),
  ]);
  const daChonHienTai = await demAnhDangChon(admin, p.selectionId);

  const traLai = cacDot.filter((d) => d.traLai);
  const anhIds = Array.from(new Set(traLai.flatMap((d) => d.anhIds)));
  const sanPham = traLai.flatMap((d) => d.sanPham);
  const dongCuoi = traLai.length > 0 ? traLai[traLai.length - 1] : null;

  const theoAnh: Record<string, number> = {};
  for (const [photoId, dot] of dotTheoAnh) if (dot >= 2) theoAnh[photoId] = dot;

  return {
    cheDoChonThem: p.cheDoChonThem,
    giaMoiAnh: p.giaMoiAnh,
    hanMuc,
    daChonTruoc: dotTheoAnh.size,
    cacDot: cacDot.map((d) => ({
      soDot: d.soDot,
      trangThai: d.trangThai,
      soAnh: d.soAnh,
      tienAnh: d.tienAnh,
      tienSanPham: d.tienSanPham,
      tong: d.tong,
      lyDoTuChoi: d.trangThai === "tu_choi" ? d.lyDoTuChoi : null,
      submittedAt: d.submittedAt,
      confirmedAt: d.confirmedAt,
      sanPham: d.sanPham.map((s) => ({ ten: s.ten, soLuong: s.soLuong })),
    })),
    dotTheoAnh: theoAnh,
    soAnhThieu: hanMuc === null ? null : Math.max(0, hanMuc - daChonHienTai),
    soSanPhamInChuaAnh: soInChuaAnh,
    dot1,
    cauDongY: { studioChon: CAU_DONG_Y_STUDIO_CHON, bietAnhInCham: CAU_BIET_ANH_IN_CHAM },
    banNhap:
      traLai.length > 0
        ? {
            anhIds,
            sanPham,
            lyDo: dongCuoi ? (dongCuoi.trangThai === "tu_choi" ? dongCuoi.lyDoTuChoi : null) : null,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Chi tiết đợt cho TRANG QUẢN TRỊ (ảnh theo từng đợt)
// ---------------------------------------------------------------------------

export interface AnhCuaDot {
  photoId: string;
  fileName: string;
}

export interface DotQuanTri {
  soDot: number;
  /** 1 = đợt 1 (ảnh trong gói, không có dòng ở selection_rounds). */
  laDot1: boolean;
  trangThai: TrangThaiDot | null;
  soAnh: number;
  soAnhTinhTien: number;
  giaMoiAnh: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  lyDoTuChoi: string | null;
  lyDoMoLai: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  confirmedAt: string | null;
  xuLyAt: string | null;
  anh: AnhCuaDot[];
  sanPham: DongSanPhamDot[];
}

/**
 * Ảnh khách đã chọn theo từng đợt, cho khối "Đợt chọn" ở trang chi tiết bộ ảnh
 * và để CSKH/thợ chỉnh ảnh biết đợt nào là ảnh MỚI (xuất "chỉ đợt N").
 * Đợt 1 luôn đứng đầu; đợt bị từ chối/mở lại chỉ giữ số liệu, không còn ảnh.
 * Chưa áp 0077 → chỉ có đợt 1 (nếu có ảnh) — không lỗi.
 */
export async function layChiTietDotQuanTri(
  admin: SupabaseClient,
  galleryId: string,
): Promise<DotQuanTri[]> {
  const { data: luot } = await admin
    .from("selections")
    .select("id")
    .eq("gallery_id", galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  const selectionId = (luot as { id: string } | null)?.id;
  if (!selectionId) return [];

  const cacDot = await layCacDot(admin, galleryId);
  if (cacDot.length === 0) return []; // chưa có đợt nào ≥ 2 thì khối này không có gì để nói

  const { data: dong, error } = await admin
    .from("selection_items")
    .select("photo_id, dot, photos(file_name, sort_index)")
    .eq("selection_id", selectionId)
    .eq("mark", "selected");
  if (error) {
    if (laLoiChuaApMigration(error)) return [];
    throw error;
  }

  type HangAnh = {
    photo_id: string;
    dot: number | null;
    photos: { file_name: string; sort_index: number } | { file_name: string; sort_index: number }[] | null;
  };
  const theoDot = new Map<number, (AnhCuaDot & { sortIndex: number })[]>();
  for (const r of (dong ?? []) as unknown as HangAnh[]) {
    const p = Array.isArray(r.photos) ? r.photos[0] : r.photos;
    if (!p) continue;
    const n = r.dot ?? 1;
    const ds = theoDot.get(n) ?? [];
    ds.push({ photoId: r.photo_id, fileName: p.file_name, sortIndex: p.sort_index ?? 0 });
    theoDot.set(n, ds);
  }
  const anhCuaDot = (n: number): AnhCuaDot[] =>
    (theoDot.get(n) ?? [])
      .sort((a, b) => a.sortIndex - b.sortIndex || a.fileName.localeCompare(b.fileName, "vi", { numeric: true }))
      .map(({ photoId, fileName }) => ({ photoId, fileName }));

  const dot1Anh = anhCuaDot(1);
  const ketQua: DotQuanTri[] = [
    {
      soDot: 1,
      laDot1: true,
      trangThai: null,
      soAnh: dot1Anh.length,
      soAnhTinhTien: 0,
      giaMoiAnh: 0,
      tienAnh: 0,
      tienSanPham: 0,
      tong: 0,
      lyDoTuChoi: null,
      lyDoMoLai: null,
      submittedAt: null,
      submittedByName: null,
      confirmedAt: null,
      xuLyAt: null,
      anh: dot1Anh,
      sanPham: [],
    },
  ];

  for (const d of cacDot) {
    ketQua.push({
      soDot: d.soDot,
      laDot1: false,
      trangThai: d.trangThai,
      soAnh: d.soAnh,
      soAnhTinhTien: d.soAnhTinhTien,
      giaMoiAnh: d.giaMoiAnh,
      tienAnh: d.tienAnh,
      tienSanPham: d.tienSanPham,
      tong: d.tong,
      lyDoTuChoi: d.lyDoTuChoi,
      lyDoMoLai: d.lyDoMoLai,
      submittedAt: d.submittedAt,
      submittedByName: d.submittedByName,
      confirmedAt: d.confirmedAt,
      xuLyAt: d.xuLyAt,
      anh: anhCuaDot(d.soDot),
      sanPham: d.sanPham,
    });
  }
  return ketQua;
}

/** Đọc MỘT đợt theo (bộ ảnh, số đợt). null nếu không có / chưa áp migration. */
export async function layMotDot(
  admin: SupabaseClient,
  galleryId: string,
  soDot: number,
): Promise<DongDot | null> {
  const { data, error } = await admin
    .from("selection_rounds")
    .select(COT_DOT)
    .eq("gallery_id", galleryId)
    .eq("so_dot", soDot)
    .maybeSingle();
  if (error) {
    if (laLoiChuaApMigration(error)) return null;
    throw error;
  }
  return data ? chuyenHangDot(data as unknown as HangDotTho) : null;
}

// ---------------------------------------------------------------------------
// Đợt 1: sản phẩm in chưa gắn ảnh + nhờ studio chọn bổ sung
// ---------------------------------------------------------------------------

/**
 * Đếm sản phẩm in của ĐỢT 1 chưa gắn ảnh (xem `demSanPhamInChuaAnh`): suất ảnh
 * in/khung trong gói chưa xếp đủ, album trong gói chưa có tấm nào, và hàng mua
 * thêm cần ảnh mà chưa có ảnh.
 */
export async function demSanPhamInChuaGanAnh(
  admin: SupabaseClient,
  galleryId: string,
  selectionId: string,
): Promise<number> {
  const tomTat = await getGalleryContractSummary(galleryId, admin);
  const hangTrongGoi = locHangInTrongGoi(tomTat.items);

  const soXepTheoHang = new Map<string, number>();
  if (hangTrongGoi.length > 0) {
    const { data, error } = await admin
      .from("selection_placements")
      .select("gallery_item_id, selection_items!inner(selection_id)")
      .eq("selection_items.selection_id", selectionId);
    if (error) throw error;
    for (const r of (data ?? []) as unknown as { gallery_item_id: string }[]) {
      soXepTheoHang.set(r.gallery_item_id, (soXepTheoHang.get(r.gallery_item_id) ?? 0) + 1);
    }
  }

  // Album trong gói ĐÃ CÓ BÌA thì tính là có ảnh: lúc chốt đợt 1 bìa album là bắt buộc
  // (BB-202) và ảnh ruột đưa vào sau — không đòi thêm cờ "biết ảnh chậm hơn" cho nó.
  // Bảng `album_covers` (0075) có thể chưa áp: lỗi bảng thiếu thì coi như không có bìa.
  const idAlbumTrongGoi = hangTrongGoi.filter((h) => h.nhom === "album").map((h) => h.galleryItemId);
  if (idAlbumTrongGoi.length > 0) {
    const { data: bia, error: eBia } = await admin
      .from("album_covers")
      .select("gallery_item_id")
      .in("gallery_item_id", idAlbumTrongGoi);
    if (eBia && !laLoiChuaApMigration(eBia)) throw eBia;
    for (const r of (bia ?? []) as { gallery_item_id: string }[]) {
      soXepTheoHang.set(r.gallery_item_id, (soXepTheoHang.get(r.gallery_item_id) ?? 0) + 1);
    }
  }

  const { data: addons, error: eAd } = await admin
    .from("selection_addons")
    .select("id, quantity, photo_id, products(kind, material)")
    .eq("selection_id", selectionId);
  if (eAd) throw eAd;
  type Sp = { kind: string | null; material: string | null };
  type Ad = { id: string; quantity: number; photo_id: string | null; products: Sp | Sp[] | null };
  const cacDong = ((addons ?? []) as unknown as Ad[])
    .map((a) => {
      const pr = Array.isArray(a.products) ? a.products[0] : a.products;
      return { a, nhom: pr ? nhomSanPham(pr.kind, pr.material) : null };
    })
    .filter(({ nhom }) => nhom === "album" || canGanAnh(nhom));

  const idAlbum = cacDong.filter(({ nhom }) => nhom === "album").map(({ a }) => a.id);
  const albumCoAnh = new Set<string>();
  if (idAlbum.length > 0) {
    const { data: ap } = await admin.from("selection_addon_photos").select("addon_id").in("addon_id", idAlbum);
    for (const r of (ap ?? []) as { addon_id: string }[]) albumCoAnh.add(r.addon_id);
  }

  return demSanPhamInChuaAnh({
    hangTrongGoi,
    soXepTheoHang,
    muaThem: cacDong.map(({ a, nhom }) => ({
      soLuong: Number(a.quantity),
      daCoAnh: nhom === "album" ? albumCoAnh.has(a.id) : a.photo_id !== null,
    })),
  });
}

export interface ThongTinChotDot1 {
  /** Số ảnh khách nhờ studio chọn bổ sung lúc chốt đợt 1 (0 = không nhờ). */
  nhoStudioChonThem: number;
  dongYAnhStudioChon: boolean;
  soSanPhamInChuaAnh: number;
  bietAnhInChamHon: boolean;
}

const RONG_DOT1: ThongTinChotDot1 = {
  nhoStudioChonThem: 0,
  dongYAnhStudioChon: false,
  soSanPhamInChuaAnh: 0,
  bietAnhInChamHon: false,
};

/** Đọc các cờ của lần chốt đợt 1 (lượt chọn chính). Chưa áp 0077 → toàn số 0. */
export async function layThongTinChotDot1(
  admin: SupabaseClient,
  galleryId: string,
): Promise<ThongTinChotDot1> {
  const { data, error } = await admin
    .from("selections")
    .select("nho_studio_chon_them, dong_y_anh_studio_chon, so_san_pham_in_chua_anh, biet_anh_in_cham_hon")
    .eq("gallery_id", galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) {
    if (laLoiChuaApMigration(error)) return { ...RONG_DOT1 };
    throw error;
  }
  const r = data as {
    nho_studio_chon_them: number | null;
    dong_y_anh_studio_chon: boolean | null;
    so_san_pham_in_chua_anh: number | null;
    biet_anh_in_cham_hon: boolean | null;
  } | null;
  if (!r) return { ...RONG_DOT1 };
  return {
    nhoStudioChonThem: r.nho_studio_chon_them ?? 0,
    dongYAnhStudioChon: r.dong_y_anh_studio_chon === true,
    soSanPhamInChuaAnh: r.so_san_pham_in_chua_anh ?? 0,
    bietAnhInChamHon: r.biet_anh_in_cham_hon === true,
  };
}

export interface DongViecDot1 {
  galleryId: string;
  galleryTitle: string;
  status: string;
  branchName: string | null;
  customerName: string | null;
  nhoStudioChonThem: number;
  soSanPhamInChuaAnh: number;
  submittedAt: string | null;
}

/**
 * Hàng đợi CSKH: bộ ảnh đợt 1 mà khách NHỜ studio chọn thêm ảnh, hoặc chốt khi còn
 * sản phẩm in chưa chọn ảnh. Còn là "việc" chừng nào bộ ảnh còn ở `submitted`/
 * `in_retouch`: sang `awaiting_approval` là studio đã làm xong phần chỉnh.
 */
export async function layDanhSachViecDot1(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<DongViecDot1[]> {
  const { data, error } = await admin
    .from("selections")
    .select(
      "gallery_id, nho_studio_chon_them, so_san_pham_in_chua_anh, submitted_at, " +
        "galleries!inner(title, status, branch_id, customer_id, branches(name))",
    )
    .eq("is_primary", true)
    .or("nho_studio_chon_them.gt.0,so_san_pham_in_chua_anh.gt.0")
    .in("galleries.status", ["submitted", "in_retouch"])
    .limit(500);
  if (error) {
    if (laLoiChuaApMigration(error)) return [];
    throw error;
  }
  type G = {
    title: string;
    status: string;
    branch_id: string;
    customer_id: string | null;
    branches: { name: string } | { name: string }[] | null;
  };
  type R = {
    gallery_id: string;
    nho_studio_chon_them: number | null;
    so_san_pham_in_chua_anh: number | null;
    submitted_at: string | null;
    galleries: G | G[] | null;
  };
  const rows = ((data ?? []) as unknown as R[])
    .map((r) => ({ r, g: Array.isArray(r.galleries) ? r.galleries[0] : r.galleries }))
    .filter((x): x is { r: R; g: G } => !!x.g && (!branchIds || branchIds.includes(x.g.branch_id)));
  if (rows.length === 0) return [];

  const kIds = Array.from(new Set(rows.map((x) => x.g.customer_id).filter((v): v is string => !!v)));
  const { data: ks } = kIds.length
    ? await admin.from("customers").select("id, full_name").in("id", kIds)
    : { data: [] as { id: string; full_name: string }[] };
  const kMap = new Map((ks ?? []).map((k) => [k.id, k.full_name as string]));
  const tenCn = (raw: G["branches"]) => (Array.isArray(raw) ? raw[0]?.name : raw?.name) ?? null;

  return rows
    .map(({ r, g }) => ({
      galleryId: r.gallery_id,
      galleryTitle: g.title,
      status: g.status,
      branchName: tenCn(g.branches),
      customerName: g.customer_id ? (kMap.get(g.customer_id) ?? null) : null,
      nhoStudioChonThem: r.nho_studio_chon_them ?? 0,
      soSanPhamInChuaAnh: r.so_san_pham_in_chua_anh ?? 0,
      submittedAt: r.submitted_at,
    }))
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
}
