/**
 * BB-380 — đọc nguyên liệu cho bộ báo cáo điều hành (phía máy chủ).
 *
 * Mọi số đều tính ở `cong-thuc.ts`; tệp này chỉ gom dòng từ cơ sở dữ liệu:
 *   · bộ ảnh: `locBoAnhThat` (loại "Fixture%" + lưu trữ) + lọc chi nhánh ở CẢ câu
 *     truy vấn lẫn lọc lại trong JS (vai chi nhánh không bao giờ thấy bộ chi nhánh khác);
 *   · bảng con chỉ đọc theo id của các bộ đã lọc ở trên — không tự lọc lại theo tên;
 *   · tiền: `layTienCanThuNhieuBo` (một công thức tiền duy nhất của app).
 *
 * Gói free: mỗi nguồn một câu `in (...)` theo lô 100 id, không gọi từng bộ (trừ
 * đếm "đã chọn ảnh" cho những bộ ĐANG chọn dở — vài bộ, đếm `head`).
 * Không cần migration: chạy trên cột/bảng sẵn có; cột 0094 (`lark_nguoi_photoshop`)
 * chưa áp thì đọc lùi về không có cột.
 */
import "server-only";
import type { NguCanhBaoCao } from "../loai";
import { locBoAnhThat } from "../loc-chung";
import {
  tachTien,
  type BoAnhDieuHanh,
  type DongSanPhamBan,
  type YeuCauSua,
} from "./cong-thuc";
import { layTienCanThuNhieuBo } from "@/lib/gallery/tien-can-thu-server";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";
import { nhomSanPham } from "@/lib/products/nhom-san-pham";

import { HANH_DONG_TAI_ANH } from "./hang-so";
/** Nhật ký app khi gửi ảnh đã chỉnh cho khách duyệt. */
const HANH_DONG_GUI_DUYET = ["gallery.retouch_sent", "gallery.anh_chinh_gui_khach"];

const LO = 100;

function chiaLo<T>(ds: T[], lo = LO): T[][] {
  const ket: T[][] = [];
  for (let i = 0; i < ds.length; i += lo) ket.push(ds.slice(i, i + lo));
  return ket;
}

interface HangGallery {
  id: string;
  branch_id: string;
  title: string;
  status: string;
  sent_at: string | null;
  submitted_at: string | null;
  lark_trang_thai: string | null;
  lark_trang_thai_tu: string | null;
  lark_nguoi_photoshop?: string | null;
}

const COT_BO = "id, branch_id, title, status, sent_at, submitted_at, lark_trang_thai, lark_trang_thai_tu";

function laBoThat(g: HangGallery, choPhep: Set<string> | null): boolean {
  if (g.status === "archived") return false;
  if ((g.title ?? "").toLowerCase().startsWith("fixture")) return false;
  if (choPhep && !choPhep.has(g.branch_id)) return false;
  return true;
}

type LocBo =
  | { loai: "khoang"; cot: "sent_at" | "submitted_at"; tu: Date; den: Date }
  | { loai: "dang-chay" };

async function docBo(ctx: NguCanhBaoCao, loc: LocBo, co: { cotNguoi: boolean }): Promise<HangGallery[]> {
  if (ctx.chiNhanhIds && ctx.chiNhanhIds.length === 0) return [];
  const chay = async (coCotNguoi: boolean) => {
    let q = ctx.client.from("galleries").select(coCotNguoi ? `${COT_BO}, lark_nguoi_photoshop` : COT_BO);
    q = locBoAnhThat(q);
    if (ctx.chiNhanhIds) q = q.in("branch_id", ctx.chiNhanhIds);
    if (loc.loai === "khoang") {
      q = q.gte(loc.cot, loc.tu.toISOString()).lt(loc.cot, loc.den.toISOString());
    } else {
      // Bộ đã gửi link mà chưa xong (ảnh chụp ngay lúc xem, không theo kỳ).
      q = q.not("sent_at", "is", null).not("status", "in", "(delivered,archived)");
    }
    return q.limit(5000);
  };
  let res = await chay(true);
  if (res.error && laLoiChuaApMigration(res.error)) {
    co.cotNguoi = false;
    res = await chay(false);
  }
  if (res.error) throw res.error;
  const choPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  return ((res.data ?? []) as unknown as HangGallery[]).filter((g) => laBoThat(g, choPhep));
}

export interface NguyenLieuDieuHanh {
  boGui: BoAnhDieuHanh[];
  boChot: BoAnhDieuHanh[];
  /** Chỉ có khi `can.ket`. */
  boDangChay: BoAnhDieuHanh[];
  /** Chỉ có khi `can.sanPham`: dòng sản phẩm khách mua của các bộ CHỐT trong kỳ. */
  sanPham: DongSanPhamBan[];
  /** Chỉ có khi `can.chinhSua`: yêu cầu sửa (qua app) tạo trong kỳ. */
  yeuCauSua: (YeuCauSua & { branchId: string })[];
  /** Lần đầu app ghi được một lượt tải ảnh (mọi chi nhánh); null = chưa đo. */
  mocDoTai: string | null;
  tenChiNhanh: Map<string, string>;
  /** Có đọc được cột người chỉnh sửa (0094) không. */
  coCotNguoiChinhSua: boolean;
}

export interface CanDoc {
  tien?: boolean;
  sanPham?: boolean;
  ket?: boolean;
  chinhSua?: boolean;
}

export async function docNguyenLieu(
  ctx: NguCanhBaoCao,
  tu: Date,
  den: Date,
  can: CanDoc = {},
): Promise<NguyenLieuDieuHanh> {
  const co = { cotNguoi: true };
  const [gui, chot, dangChay, tenChiNhanh, mocDoTai] = await Promise.all([
    docBo(ctx, { loai: "khoang", cot: "sent_at", tu, den }, co),
    docBo(ctx, { loai: "khoang", cot: "submitted_at", tu, den }, co),
    can.ket ? docBo(ctx, { loai: "dang-chay" }, co) : Promise.resolve([] as HangGallery[]),
    docTenChiNhanh(ctx),
    docMocDoTai(ctx),
  ]);
  const coCotNguoiChinhSua = co.cotNguoi;

  const tatCa = new Map<string, HangGallery>();
  for (const g of [...gui, ...chot, ...dangChay]) tatCa.set(g.id, g);
  const ids = [...tatCa.keys()];
  const idChot = chot.map((g) => g.id);

  const [luot, linkXem, dot, nhatKy, tien] = await Promise.all([
    docLuotChon(ctx, ids),
    docLinkCoLuotXem(ctx, ids),
    docDotDaXacNhan(ctx, ids),
    docNhatKy(ctx, ids),
    can.tien || can.sanPham ? docTien(ctx, idChot) : Promise.resolve(new Map<string, ReturnType<typeof tachTien>>()),
  ]);

  // "Đã chọn ảnh" chỉ cần đếm cho bộ đã mở mà CHƯA chốt (bộ chốt thì chắc chắn đã chọn).
  const canDemChon = ids.filter((id) => !tatCa.get(id)!.submitted_at && luot.moLanDau.has(id));
  const coAnhChon = await docCoAnhChon(ctx, canDemChon);

  const dung = (g: HangGallery): BoAnhDieuHanh => ({
    id: g.id,
    branchId: g.branch_id,
    status: g.status,
    sentAt: g.sent_at,
    submittedAt: g.submitted_at,
    larkTrangThai: g.lark_trang_thai,
    larkTrangThaiTu: g.lark_trang_thai_tu,
    moLanDauLuc: luot.moLanDau.get(g.id) ?? null,
    linkCoLuotXem: linkXem.has(g.id),
    coAnhChon: !!g.submitted_at || coAnhChon.has(g.id),
    anhChonThem: (luot.anhVuotLucChot.get(g.id) ?? 0) + (dot.anhThem.get(g.id) ?? 0),
    tien: tien.get(g.id) ?? null,
    taiAnhLanDauLuc: nhatKy.taiAnh.get(g.id) ?? null,
    guiDuyetLuc: nhatKy.guiDuyet.get(g.id) ?? null,
    nguoiChinhSua: g.lark_nguoi_photoshop ?? null,
  });

  const sanPham = can.sanPham ? await docSanPhamBan(ctx, chot.map((g) => g.id), luot.luotChinhDaChot, dot.dong) : [];
  const yeuCauSua = can.chinhSua ? await docYeuCauSua(ctx, tu, den) : [];

  return {
    boGui: gui.map(dung),
    boChot: chot.map(dung),
    boDangChay: dangChay.map(dung),
    sanPham,
    yeuCauSua,
    mocDoTai,
    tenChiNhanh,
    coCotNguoiChinhSua,
  };
}

async function docTenChiNhanh(ctx: NguCanhBaoCao): Promise<Map<string, string>> {
  let q = ctx.client.from("branches").select("id, name").order("name");
  if (ctx.chiNhanhIds) q = q.in("id", ctx.chiNhanhIds);
  const { data, error } = await q;
  if (error) throw error;
  const choPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const m = new Map<string, string>();
  for (const b of (data ?? []) as { id: string; name: string }[]) {
    if (choPhep && !choPhep.has(b.id)) continue;
    if (b.name.toLowerCase().startsWith("fixture")) continue;
    m.set(b.id, b.name);
  }
  return m;
}

async function docMocDoTai(ctx: NguCanhBaoCao): Promise<string | null> {
  const { data, error } = await ctx.client
    .from("activity_logs")
    .select("created_at")
    .eq("action", HANH_DONG_TAI_ANH)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as { created_at: string }[])[0]?.created_at ?? null;
}

interface KetLuotChon {
  moLanDau: Map<string, string>;
  anhVuotLucChot: Map<string, number>;
  /** selection id → gallery id, lượt CHÍNH đã chốt. */
  luotChinhDaChot: Map<string, string>;
}

async function docLuotChon(ctx: NguCanhBaoCao, ids: string[]): Promise<KetLuotChon> {
  const ket: KetLuotChon = { moLanDau: new Map(), anhVuotLucChot: new Map(), luotChinhDaChot: new Map() };
  for (const lo of chiaLo(ids)) {
    const { data, error } = await ctx.client
      .from("selections")
      .select("id, gallery_id, created_at, is_primary, submitted_at, snapshot_extra_count")
      .in("gallery_id", lo);
    if (error) throw error;
    for (const r of (data ?? []) as {
      id: string;
      gallery_id: string;
      created_at: string;
      is_primary: boolean;
      submitted_at: string | null;
      snapshot_extra_count: number | null;
    }[]) {
      const g = String(r.gallery_id);
      const cu = ket.moLanDau.get(g);
      if (!cu || Date.parse(r.created_at) < Date.parse(cu)) ket.moLanDau.set(g, r.created_at);
      if (r.is_primary && r.submitted_at) {
        ket.anhVuotLucChot.set(g, Math.max(0, Number(r.snapshot_extra_count ?? 0)));
        ket.luotChinhDaChot.set(String(r.id), g);
      }
    }
  }
  return ket;
}

async function docLinkCoLuotXem(ctx: NguCanhBaoCao, ids: string[]): Promise<Set<string>> {
  const ket = new Set<string>();
  for (const lo of chiaLo(ids)) {
    const { data, error } = await ctx.client
      .from("share_links")
      .select("gallery_id, view_count")
      .in("gallery_id", lo)
      .gt("view_count", 0);
    if (error) throw error;
    for (const r of (data ?? []) as { gallery_id: string; view_count: number }[]) {
      if (Number(r.view_count) > 0) ket.add(String(r.gallery_id));
    }
  }
  return ket;
}

interface DongDotTho {
  gallery_id: string;
  so_dot: number;
  so_anh: number | null;
  san_pham: unknown;
}

async function docDotDaXacNhan(
  ctx: NguCanhBaoCao,
  ids: string[],
): Promise<{ anhThem: Map<string, number>; dong: DongDotTho[] }> {
  const anhThem = new Map<string, number>();
  const dong: DongDotTho[] = [];
  for (const lo of chiaLo(ids)) {
    const { data, error } = await ctx.client
      .from("selection_rounds")
      .select("gallery_id, so_dot, so_anh, san_pham")
      .in("gallery_id", lo)
      .eq("trang_thai", "da_xac_nhan")
      .gte("so_dot", 2);
    if (error) {
      if (laLoiChuaApMigration(error)) return { anhThem, dong };
      throw error;
    }
    for (const r of (data ?? []) as DongDotTho[]) {
      const g = String(r.gallery_id);
      anhThem.set(g, (anhThem.get(g) ?? 0) + Math.max(0, Number(r.so_anh ?? 0)));
      dong.push(r);
    }
  }
  return { anhThem, dong };
}

async function docNhatKy(
  ctx: NguCanhBaoCao,
  ids: string[],
): Promise<{ taiAnh: Map<string, string>; guiDuyet: Map<string, string> }> {
  const taiAnh = new Map<string, string>();
  const guiDuyet = new Map<string, string>();
  const somHon = (m: Map<string, string>, k: string, v: string) => {
    const cu = m.get(k);
    if (!cu || Date.parse(v) < Date.parse(cu)) m.set(k, v);
  };
  for (const lo of chiaLo(ids)) {
    const { data, error } = await ctx.client
      .from("activity_logs")
      .select("entity_id, action, created_at")
      .eq("entity_type", "gallery")
      .in("entity_id", lo)
      .in("action", [HANH_DONG_TAI_ANH, ...HANH_DONG_GUI_DUYET]);
    if (error) throw error;
    for (const r of (data ?? []) as { entity_id: string; action: string; created_at: string }[]) {
      somHon(r.action === HANH_DONG_TAI_ANH ? taiAnh : guiDuyet, String(r.entity_id), r.created_at);
    }
  }
  return { taiAnh, guiDuyet };
}

async function docCoAnhChon(ctx: NguCanhBaoCao, ids: string[]): Promise<Set<string>> {
  const ket = new Set<string>();
  const dem = await Promise.all(
    ids.slice(0, 300).map(async (id) => {
      const { count, error } = await ctx.client
        .from("selection_items")
        .select("id", { count: "exact", head: true })
        .eq("gallery_id", id);
      if (error) throw error;
      return [id, count ?? 0] as const;
    }),
  );
  for (const [id, n] of dem) if (n > 0) ket.add(id);
  return ket;
}

async function docTien(ctx: NguCanhBaoCao, ids: string[]): Promise<Map<string, ReturnType<typeof tachTien>>> {
  const ket = new Map<string, ReturnType<typeof tachTien>>();
  for (const lo of chiaLo(ids, 80)) {
    const m = await layTienCanThuNhieuBo(ctx.client, lo);
    for (const [g, t] of m) ket.set(g, tachTien(t));
  }
  return ket;
}

/** Nhóm hiển thị của một sản phẩm — dùng lại `nhomSanPham` của màn chọn ảnh. */
export function nhomHienThi(kind: string | null, material: string | null): string {
  if (kind === "edited_photo") return "Ảnh chỉnh thêm (Edit file)";
  const n = nhomSanPham(kind, material);
  if (n === "anh_in") return "Ảnh in";
  if (n === "khung") return "Khung";
  if (n === "album") return "Album";
  return "Khác";
}

interface SanPhamTho {
  id: string;
  name: string | null;
  kind: string | null;
  material: string | null;
}

async function docSanPhamTheoId(ctx: NguCanhBaoCao, ids: string[]): Promise<Map<string, SanPhamTho>> {
  const m = new Map<string, SanPhamTho>();
  for (const lo of chiaLo(ids)) {
    const { data, error } = await ctx.client.from("products").select("id, name, kind, material").in("id", lo);
    if (error) throw error;
    for (const p of (data ?? []) as SanPhamTho[]) m.set(String(p.id), p);
  }
  return m;
}

async function docSanPhamBan(
  ctx: NguCanhBaoCao,
  idChot: string[],
  luotChinhDaChot: Map<string, string>,
  dotDong: DongDotTho[],
): Promise<DongSanPhamBan[]> {
  const boChot = new Set(idChot);
  type DongAddon = { selection_id: string; product_id: string; quantity: number | string; unit_price: number | string | null; dot?: number | null };
  const addon: DongAddon[] = [];
  const luotIds = [...luotChinhDaChot.entries()].filter(([, g]) => boChot.has(g)).map(([s]) => s);
  for (const lo of chiaLo(luotIds)) {
    let res: { data: unknown[] | null; error: { message: string; code?: string } | null } = await ctx.client
      .from("selection_addons")
      .select("selection_id, product_id, quantity, unit_price, dot")
      .in("selection_id", lo);
    if (res.error && laLoiChuaApMigration(res.error)) {
      res = await ctx.client.from("selection_addons").select("selection_id, product_id, quantity, unit_price").in("selection_id", lo);
    }
    if (res.error) throw res.error;
    addon.push(...((res.data ?? []) as DongAddon[]));
  }

  type DongSp = { productId?: string; ten?: string; soLuong?: number | string; donGia?: number | string };
  const dongDot = dotDong.filter((d) => boChot.has(String(d.gallery_id)));
  const spIds = new Set<string>(addon.map((a) => String(a.product_id)));
  for (const d of dongDot) for (const s of (Array.isArray(d.san_pham) ? d.san_pham : []) as DongSp[]) if (s?.productId) spIds.add(String(s.productId));
  const sp = await docSanPhamTheoId(ctx, [...spIds]);

  const ket: DongSanPhamBan[] = [];
  for (const a of addon) {
    if (a.dot != null && Number(a.dot) !== 1) continue; // đợt ≥ 2 có dòng riêng ở selection_rounds
    const g = luotChinhDaChot.get(String(a.selection_id));
    if (!g) continue;
    const p = sp.get(String(a.product_id));
    const soLuong = Number(a.quantity ?? 0);
    ket.push({
      galleryId: g,
      dot: 1,
      productId: String(a.product_id),
      ten: p?.name ?? "Sản phẩm",
      nhom: nhomHienThi(p?.kind ?? null, p?.material ?? null),
      soLuong,
      tien: soLuong * Number(a.unit_price ?? 0),
    });
  }
  for (const d of dongDot) {
    for (const s of (Array.isArray(d.san_pham) ? d.san_pham : []) as DongSp[]) {
      if (!s?.productId) continue;
      const p = sp.get(String(s.productId));
      const soLuong = Number(s.soLuong ?? 0);
      ket.push({
        galleryId: String(d.gallery_id),
        dot: Number(d.so_dot),
        productId: String(s.productId),
        ten: p?.name ?? s.ten ?? "Sản phẩm",
        nhom: nhomHienThi(p?.kind ?? null, p?.material ?? null),
        soLuong,
        tien: soLuong * Number(s.donGia ?? 0),
      });
    }
  }
  return ket;
}

async function docYeuCauSua(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<(YeuCauSua & { branchId: string })[]> {
  if (ctx.chiNhanhIds && ctx.chiNhanhIds.length === 0) return [];
  const { data, error } = await ctx.client
    .from("revision_requests")
    .select("gallery_id, round, created_at, galleries!inner(branch_id, title, status)")
    .gte("created_at", tu.toISOString())
    .lt("created_at", den.toISOString())
    .limit(5000);
  if (error) {
    if (laLoiChuaApMigration(error)) return [];
    throw error;
  }
  const choPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  type G = { branch_id: string; title: string; status: string };
  const ket: (YeuCauSua & { branchId: string })[] = [];
  for (const r of (data ?? []) as unknown as { gallery_id: string; round: number; galleries: G | G[] | null }[]) {
    const g = Array.isArray(r.galleries) ? r.galleries[0] : r.galleries;
    if (!g) continue;
    if (!laBoThat({ ...g, id: r.gallery_id } as HangGallery, choPhep)) continue;
    ket.push({ galleryId: String(r.gallery_id), vong: Number(r.round ?? 1), branchId: g.branch_id });
  }
  return ket;
}
