/**
 * BB-381 — bộ ảnh 0 tấm: tách "đơn hậu kỳ mua thêm" khỏi "bộ có gói chụp nhưng chưa có ảnh".
 * Luật phân loại ở `phan-loai-hoa-don.ts` (thuần); tệp này chỉ đọc DB rồi gom.
 *
 * CHỈ ĐỌC. Liên kết "đơn hậu kỳ ↔ bộ gốc" TÍNH LÚC ĐỌC (cùng khách, hoặc khách khác mang
 * cùng SĐT chuẩn hoá) — không cần cột mới, không cần migration, không cần điền bù dữ liệu cũ.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  phanLoaiHoaDon,
  lyDoChuaCoAnh,
  NHAN_LY_DO,
  tomTatDong,
  type LoaiHoaDon,
  type LyDoChuaCoAnh,
} from "@/lib/gallery/phan-loai-hoa-don";
import { giaiDoanCua, TRANG_THAI_LARK } from "@/lib/lark/trang-thai-hau-ky";

const nhanTrangThaiLark = (ma: string): string | null =>
  (TRANG_THAI_LARK as Record<string, { ten: string }>)[ma]?.ten ?? null;

/** Giai đoạn Lark "Đã giao" — đơn hậu kỳ tới đây là xong việc, rời hàng theo dõi. */
const GIAI_DOAN_DA_GIAO = 10;
const KHONG_THEO_DOI = ["archived", "delivered"];

type Mot<T> = T | T[] | null;
const mot = <T,>(v: Mot<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface DongBoTho {
  id: string;
  title: string;
  status: string;
  branch_id: string;
  customer_id: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  sync_error: string | null;
  lark_contract_code: string | null;
  lark_contract_codes: string[] | null;
  lark_trang_thai: string | null;
  created_at: string;
  branches: Mot<{ name: string | null }>;
  customers: Mot<{ full_name: string | null; phone_normalized: string | null }>;
}

interface DongHang {
  gallery_id: string;
  quantity: number | null;
  products: Mot<{ kind: string | null; name: string | null }>;
}

const COT_BO =
  "id, title, status, branch_id, customer_id, drive_folder_id, drive_folder_url, sync_error, lark_contract_code, lark_contract_codes, lark_trang_thai, created_at, branches(name), customers(full_name, phone_normalized)";

function maHoaDon(g: Pick<DongBoTho, "lark_contract_code" | "lark_contract_codes">): string | null {
  const ma = g.lark_contract_codes?.length ? g.lark_contract_codes : [g.lark_contract_code];
  const sach = ma.filter((m): m is string => !!m && m.trim() !== "");
  return sach.length ? sach.join(" + ") : null;
}

async function docDongHoaDon(admin: SupabaseClient, ids: string[]): Promise<Map<string, DongHang[]>> {
  const theoBo = new Map<string, DongHang[]>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from("gallery_items")
      .select("gallery_id, quantity, products(kind, name)")
      .in("gallery_id", ids.slice(i, i + 100));
    if (error) throw error;
    for (const d of (data ?? []) as unknown as DongHang[]) {
      theoBo.set(d.gallery_id, [...(theoBo.get(d.gallery_id) ?? []), d]);
    }
  }
  return theoBo;
}

function loaiCua(dong: DongHang[] | undefined): LoaiHoaDon {
  return phanLoaiHoaDon((dong ?? []).map((d) => ({ kind: mot(d.products)?.kind ?? null, name: mot(d.products)?.name ?? null })));
}

function tomTat(dong: DongHang[] | undefined): string {
  return tomTatDong((dong ?? []).map((d) => ({ name: mot(d.products)?.name ?? null, quantity: d.quantity })));
}

// ---------------------------------------------------------------------------
// Bộ gốc của khách
// ---------------------------------------------------------------------------

export interface BoGoc {
  id: string;
  title: string;
}

/** Bộ gốc = bộ CÓ ẢNH gần nhất tạo trước đơn; không có thì bộ có ảnh mới nhất. Thuần. */
export function chonBoGoc<T extends { id: string; created_at: string }>(donTao: string, ungVien: T[]): T | null {
  const sap = [...ungVien].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sap.find((g) => g.created_at <= donTao) ?? sap[0] ?? null;
}

/** Các bộ CÓ ẢNH của những khách trùng id hoặc trùng SĐT chuẩn hoá — theo từng đơn. */
async function timBoGoc(
  admin: SupabaseClient,
  don: Array<{ id: string; customer_id: string | null; phone: string | null; created_at: string }>,
): Promise<Map<string, BoGoc | null>> {
  const ketQua = new Map<string, BoGoc | null>();
  const khachIds = [...new Set(don.map((d) => d.customer_id).filter((x): x is string => !!x))];
  const sdts = [...new Set(don.map((d) => d.phone).filter((x): x is string => !!x && x.length >= 9))];
  const khachTheoSdt = new Map<string, string[]>();
  if (sdts.length) {
    const { data, error } = await admin.from("customers").select("id, phone_normalized").in("phone_normalized", sdts);
    if (error) throw error;
    for (const k of (data ?? []) as Array<{ id: string; phone_normalized: string }>) {
      khachTheoSdt.set(k.phone_normalized, [...(khachTheoSdt.get(k.phone_normalized) ?? []), k.id]);
    }
  }
  const tatCaKhach = [...new Set([...khachIds, ...[...khachTheoSdt.values()].flat()])];
  const boTheoKhach = new Map<string, Array<{ id: string; title: string; created_at: string }>>();
  if (tatCaKhach.length) {
    const { data, error } = await admin
      .from("galleries")
      .select("id, title, customer_id, created_at")
      .in("customer_id", tatCaKhach)
      .gt("photo_count", 0)
      .neq("status", "archived");
    if (error) throw error;
    for (const g of (data ?? []) as Array<{ id: string; title: string; customer_id: string; created_at: string }>) {
      boTheoKhach.set(g.customer_id, [...(boTheoKhach.get(g.customer_id) ?? []), g]);
    }
  }
  for (const d of don) {
    const khach = new Set([...(d.customer_id ? [d.customer_id] : []), ...(d.phone ? (khachTheoSdt.get(d.phone) ?? []) : [])]);
    const ungVien = [...khach].flatMap((k) => boTheoKhach.get(k) ?? []).filter((g) => g.id !== d.id);
    const goc = chonBoGoc(d.created_at, ungVien);
    ketQua.set(d.id, goc ? { id: goc.id, title: goc.title } : null);
  }
  return ketQua;
}

// ---------------------------------------------------------------------------
// Hai hàng đợi của "Việc cần xử lý"
// ---------------------------------------------------------------------------

export interface DongGoiChuaCoAnh {
  galleryId: string;
  title: string;
  status: string;
  maHoaDon: string | null;
  branchName: string | null;
  customerName: string | null;
  /** "goi_chup" hoặc "chua_ro" (chưa có dòng hoá đơn trong app). */
  loai: Exclude<LoaiHoaDon, "hau_ky">;
  lyDo: LyDoChuaCoAnh;
  nhanLyDo: string;
  huongDan: string;
  driveFolderUrl: string | null;
  createdAt: string;
}

export interface DongDonHauKy {
  galleryId: string;
  title: string;
  maHoaDon: string | null;
  branchName: string | null;
  customerName: string | null;
  /** "UV 13x18 ×2 · Edit file ×5" */
  thanhPhan: string;
  trangThaiLark: string | null;
  boGoc: BoGoc | null;
  createdAt: string;
}

export interface KetQuaBoAnhRong {
  /** Bộ có gói chụp (hoặc chưa rõ gói) mà chưa có ảnh, CHƯA nằm ở tab "Bộ ảnh lỗi tải". */
  goiChuaCoAnh: DongGoiChuaCoAnh[];
  /**
   * Bộ có gói chụp chưa có ảnh nhưng ĐANG có lỗi Drive (`sync_error`) — đã là một dòng của
   * tab "Bộ ảnh lỗi tải", nên chỉ đếm theo lý do ở đây (không đếm hai lần trên huy hiệu).
   */
  dangOLoiTai: Partial<Record<LyDoChuaCoAnh, number>>;
  donHauKy: DongDonHauKy[];
}

/**
 * Đọc mọi bộ 0 ảnh (chưa lưu trữ/chưa giao) trong `branchIds` (null = mọi chi nhánh) rồi
 * chia hai hàng đợi — MỘT công thức cho cả hai tab và huy hiệu.
 */
export async function layBoAnhRong(admin: SupabaseClient, branchIds: string[] | null): Promise<KetQuaBoAnhRong> {
  const ketQua: KetQuaBoAnhRong = { goiChuaCoAnh: [], dangOLoiTai: {}, donHauKy: [] };
  if (branchIds && branchIds.length === 0) return ketQua;

  let q = admin
    .from("galleries")
    .select(COT_BO)
    .eq("photo_count", 0)
    .not("status", "in", `(${KHONG_THEO_DOI.join(",")})`)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (branchIds) q = q.in("branch_id", branchIds);
  const { data, error } = await q;
  if (error) throw error;
  const bo = (data ?? []) as unknown as DongBoTho[];
  if (bo.length === 0) return ketQua;

  const dong = await docDongHoaDon(admin, bo.map((g) => g.id));
  const hauKy: DongBoTho[] = [];
  for (const g of bo) {
    const loai = loaiCua(dong.get(g.id));
    if (loai === "hau_ky") {
      if ((giaiDoanCua(g.lark_trang_thai) ?? 0) < GIAI_DOAN_DA_GIAO) hauKy.push(g);
      continue;
    }
    const lyDo = lyDoChuaCoAnh(g);
    if (g.sync_error?.trim()) {
      ketQua.dangOLoiTai[lyDo] = (ketQua.dangOLoiTai[lyDo] ?? 0) + 1;
      continue;
    }
    ketQua.goiChuaCoAnh.push({
      galleryId: g.id,
      title: g.title,
      status: g.status,
      maHoaDon: maHoaDon(g),
      branchName: mot(g.branches)?.name ?? null,
      customerName: mot(g.customers)?.full_name ?? null,
      loai,
      lyDo,
      nhanLyDo: NHAN_LY_DO[lyDo].nhan,
      huongDan:
        loai === "chua_ro"
          ? `Chưa rõ gói: bấm “Kéo dòng hợp đồng từ Lark”. ${NHAN_LY_DO[lyDo].huongDan}`
          : NHAN_LY_DO[lyDo].huongDan,
      driveFolderUrl: g.drive_folder_url,
      createdAt: g.created_at,
    });
  }

  if (hauKy.length) {
    const goc = await timBoGoc(
      admin,
      hauKy.map((g) => ({ id: g.id, customer_id: g.customer_id, phone: mot(g.customers)?.phone_normalized ?? null, created_at: g.created_at })),
    );
    ketQua.donHauKy = hauKy.map((g) => ({
      galleryId: g.id,
      title: g.title,
      maHoaDon: maHoaDon(g),
      branchName: mot(g.branches)?.name ?? null,
      customerName: mot(g.customers)?.full_name ?? null,
      thanhPhan: tomTat(dong.get(g.id)),
      trangThaiLark: g.lark_trang_thai ? nhanTrangThaiLark(g.lark_trang_thai) : null,
      boGoc: goc.get(g.id) ?? null,
      createdAt: g.created_at,
    }));
  }
  return ketQua;
}

/** Tập id các bộ 0 ảnh là đơn hậu kỳ mua thêm — để các hàng "bộ chưa có ảnh" cũ loại ra. */
export async function idDonHauKy(admin: SupabaseClient, galleryIds: string[]): Promise<Set<string>> {
  if (galleryIds.length === 0) return new Set();
  const dong = await docDongHoaDon(admin, galleryIds);
  return new Set(galleryIds.filter((id) => loaiCua(dong.get(id)) === "hau_ky"));
}

// ---------------------------------------------------------------------------
// Chi tiết một bộ ảnh
// ---------------------------------------------------------------------------

export interface DonMuaThemCuaBo {
  galleryId: string;
  maHoaDon: string | null;
  thanhPhan: string;
  trangThaiLark: string | null;
}

export interface HauKyCuaBo {
  /** Chính bộ này là đơn hậu kỳ mua thêm (0 ảnh, không có dịch vụ chụp). */
  laDonHauKy: boolean;
  /** Khi `laDonHauKy`: bộ gốc của khách (null = khách chưa có bộ có ảnh trong app). */
  boGoc: BoGoc | null;
  thanhPhan: string | null;
  /** Khi bộ này là bộ gốc: các đơn hậu kỳ mua thêm ngoài app của khách. */
  donMuaThem: DonMuaThemCuaBo[];
}

export async function layHauKyCuaBo(admin: SupabaseClient, galleryId: string): Promise<HauKyCuaBo | null> {
  const { data: g0, error } = await admin
    .from("galleries")
    .select(COT_BO + ", photo_count")
    .eq("id", galleryId)
    .maybeSingle();
  if (error) throw error;
  if (!g0) return null;
  const g = g0 as unknown as DongBoTho & { photo_count: number | null };
  const ketQua: HauKyCuaBo = { laDonHauKy: false, boGoc: null, thanhPhan: null, donMuaThem: [] };

  if ((g.photo_count ?? 0) === 0) {
    const dong = await docDongHoaDon(admin, [g.id]);
    if (loaiCua(dong.get(g.id)) === "hau_ky") {
      const goc = await timBoGoc(admin, [
        { id: g.id, customer_id: g.customer_id, phone: mot(g.customers)?.phone_normalized ?? null, created_at: g.created_at },
      ]);
      return { laDonHauKy: true, boGoc: goc.get(g.id) ?? null, thanhPhan: tomTat(dong.get(g.id)), donMuaThem: [] };
    }
    return ketQua;
  }

  // Bộ có ảnh: tìm các bộ 0 ảnh của cùng khách / cùng SĐT là đơn hậu kỳ mà bộ gốc là bộ này.
  const sdt = mot(g.customers)?.phone_normalized ?? null;
  const khach = new Set<string>(g.customer_id ? [g.customer_id] : []);
  if (sdt && sdt.length >= 9) {
    const { data: ks, error: ek } = await admin.from("customers").select("id").eq("phone_normalized", sdt);
    if (ek) throw ek;
    for (const k of (ks ?? []) as Array<{ id: string }>) khach.add(k.id);
  }
  if (khach.size === 0) return ketQua;
  const { data: rong, error: er } = await admin
    .from("galleries")
    .select(COT_BO)
    .in("customer_id", [...khach])
    .eq("photo_count", 0)
    .neq("status", "archived");
  if (er) throw er;
  const ungVien = (rong ?? []) as unknown as DongBoTho[];
  if (ungVien.length === 0) return ketQua;
  const dong = await docDongHoaDon(admin, ungVien.map((x) => x.id));
  const don = ungVien.filter((x) => loaiCua(dong.get(x.id)) === "hau_ky");
  if (don.length === 0) return ketQua;
  const goc = await timBoGoc(
    admin,
    don.map((x) => ({ id: x.id, customer_id: x.customer_id, phone: mot(x.customers)?.phone_normalized ?? null, created_at: x.created_at })),
  );
  ketQua.donMuaThem = don
    .filter((x) => goc.get(x.id)?.id === g.id)
    .map((x) => ({
      galleryId: x.id,
      maHoaDon: maHoaDon(x),
      thanhPhan: tomTat(dong.get(x.id)),
      trangThaiLark: x.lark_trang_thai ? nhanTrangThaiLark(x.lark_trang_thai) : null,
    }));
  return ketQua;
}
