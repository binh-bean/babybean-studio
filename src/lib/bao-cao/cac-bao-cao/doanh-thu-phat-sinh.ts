/**
 * Báo cáo "Doanh thu phát sinh" — reports:financial.
 *
 * OWNER: DEV-BE. Task BB-263 (dựa khung BB-260).
 *
 * ---------------------------------------------------------------------------
 * Định nghĩa từng số (đọc trước khi đổi)
 * ---------------------------------------------------------------------------
 * - "Tiền vượt hạn mức" (phát sinh): tổng `selections.snapshot_extra_amount`
 *   của lượt chọn CHÍNH (`is_primary`) mà `submitted_at` rơi trong kỳ. Đây LÀ
 *   con số khách đã NHÌN THẤY lúc bấm chốt (chụp lại ở `/api/g/submit`,
 *   `extraCount * extra_photo_price` — KHÔNG tính lại theo trạng thái hiện
 *   tại). Cùng luật với `/api/admin/galleries/[id]/payments` — xem
 *   `tests/unit/ghi-nhan-thu-tien.test.ts` (mã BB-123), bài test số 7.
 * - "Tiền mua thêm lúc chọn" (addons): tổng `quantity * unit_price` của
 *   `selection_addons` gắn với CHÍNH các lượt chọn đã chốt trong kỳ ở trên.
 *   Đây là dòng tiền RIÊNG với tiền vượt hạn mức — sản phẩm mua thêm lúc chọn
 *   (khung, ảnh in...) không trừ vào số ảnh vượt hạn mức.
 * - "Đã thu": tổng `gallery_payments.amount` có `confirmed_at` rơi trong kỳ —
 *   đây là DÒNG TIỀN thực tế ghi nhận trong kỳ, không giới hạn theo bộ ảnh
 *   chốt kỳ nào (CSKH có thể thu tiền của một bộ đã chốt tháng trước).
 * - "Còn phải thu": tính RIÊNG cho các bộ đã CHỐT TRONG KỲ này — phải thu
 *   (snapshot_extra_amount) trừ TOÀN BỘ số đã thu của đúng những bộ đó, thu ở
 *   bất kỳ thời điểm nào (không giới hạn trong kỳ), giống công thức
 *   `dueAmount - paidAmount` ở route ghi nhận thanh toán. Số dồn, không phải
 *   "trong kỳ".
 * - "Yêu cầu mua lần hai" (BB-245/254, bảng `yeu_cau_mua_them`): đếm theo
 *   `created_at` rơi trong kỳ, đọc TRẠNG THÁI HIỆN TẠI (`trang_thai`) của
 *   đúng những dòng đó. "Giá trị tham khảo" = tổng `so_luong * list_price`
 *   niêm yết — CSKH gọi lại chốt giá thật, đây chỉ là ước tính khi
 *   `list_price` có dữ liệu (bỏ qua dòng chưa có giá niêm yết).
 *
 * Mọi truy vấn lọc `locBoAnhThat()` trên `galleries`, join `!inner` cho các
 * bảng con — không tự lọc bằng `.not("galleries.title", ...)` qua embed vì
 * PostgREST không bảo đảm cú pháp đó qua mọi phiên bản (giống lý do đã ghi ở
 * `hau-ky-canh-bao.ts`); lọc lại thủ công ở tầng JS cho chắc.
 */

import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao, TheSoBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { chenhLechPhanTram, chiaMoc, nhanMoc } from "../ky";

// ---------------------------------------------------------------------------
// Hàm tính thuần — không đụng DB, dễ thử bằng dữ liệu truyền tay.
// ---------------------------------------------------------------------------

/** Tổng `snapshot_extra_amount` (bỏ qua null/NaN, coi như 0). */
export function tinhTongVuotHanMuc(rows: { snapshotExtraAmount: number | null }[]): number {
  return rows.reduce((t, r) => t + (Number.isFinite(r.snapshotExtraAmount) ? (r.snapshotExtraAmount as number) : 0), 0);
}

/** Tổng tiền addon = quantity * unit_price từng dòng. */
export function tinhTongAddon(rows: { soLuong: number; donGia: number }[]): number {
  return rows.reduce((t, r) => t + r.soLuong * r.donGia, 0);
}

/** Còn phải thu = phải thu - đã thu (không âm hoá — thu dư thì trả số âm để hiện rõ). */
export function tinhConPhaiThu(phaiThu: number, daThu: number): number {
  return phaiThu - daThu;
}

/** Tỉ lệ chốt (%) = đã chốt / tổng mới. `null` khi tổng mới = 0 (không chia 0). */
export function tinhTiLeChot(daChot: number, tongMoi: number): number | null {
  if (tongMoi === 0) return null;
  return (daChot / tongMoi) * 100;
}

/** Giá trị tham khảo mua lần hai = tổng so_luong * list_price (bỏ dòng list_price null). */
export function tinhThamKhaoMuaLanHai(rows: { soLuong: number; listPrice: number | null }[]): number {
  return rows.reduce((t, r) => t + (r.listPrice === null ? 0 : r.soLuong * r.listPrice), 0);
}

// ---------------------------------------------------------------------------
// Truy vấn
// ---------------------------------------------------------------------------

interface HangGalleryGon {
  id: string;
  branch_id: string;
  title: string;
  status: string;
}

function motGallery<T extends HangGalleryGon>(raw: T | T[] | null): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function laBoAnhThat(g: HangGalleryGon | null): g is HangGalleryGon {
  if (!g) return false;
  if (g.status === "archived") return false;
  if (g.title.toLowerCase().startsWith("fixture")) return false;
  return true;
}

interface HangChot {
  selectionId: string;
  galleryId: string;
  branchId: string;
  submittedAt: string;
  snapshotExtraAmount: number | null;
}

interface RawSelectionRow {
  id: string;
  gallery_id: string;
  submitted_at: string | null;
  snapshot_extra_amount: number | null;
  galleries: HangGalleryGon | HangGalleryGon[] | null;
}

/** Các lượt chọn CHÍNH đã CHỐT trong [tu, den), bộ ảnh thật, đúng chi nhánh. */
async function chotTrongKy(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<HangChot[]> {
  const q = ctx.client
    .from("selections")
    .select("id, gallery_id, submitted_at, snapshot_extra_amount, galleries!inner(id, branch_id, title, status)")
    .eq("is_primary", true)
    .gte("submitted_at", tu.toISOString())
    .lt("submitted_at", den.toISOString());

  const { data, error } = await q;
  if (error) throw error;

  const chiNhanhChoPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const ket: HangChot[] = [];
  for (const r of (data ?? []) as RawSelectionRow[]) {
    const g = motGallery(r.galleries);
    if (!laBoAnhThat(g)) continue;
    if (chiNhanhChoPhep && !chiNhanhChoPhep.has(g.branch_id)) continue;
    if (!r.submitted_at) continue;
    ket.push({
      selectionId: r.id,
      galleryId: r.gallery_id,
      branchId: g.branch_id,
      submittedAt: r.submitted_at,
      snapshotExtraAmount: r.snapshot_extra_amount,
    });
  }
  return ket;
}

interface RawAddonRow {
  selection_id: string;
  quantity: number;
  unit_price: number;
}

/** Tổng addon (số lượng * đơn giá) theo `selection_id`, chỉ cho các id truyền vào. */
async function addonTheoSelection(
  ctx: NguCanhBaoCao,
  selectionIds: string[],
): Promise<Map<string, { soLuong: number; donGia: number }[]>> {
  const ket = new Map<string, { soLuong: number; donGia: number }[]>();
  if (selectionIds.length === 0) return ket;
  const { data, error } = await ctx.client
    .from("selection_addons")
    .select("selection_id, quantity, unit_price")
    .in("selection_id", selectionIds);
  if (error) throw error;
  for (const r of (data ?? []) as RawAddonRow[]) {
    const mang = ket.get(r.selection_id) ?? [];
    mang.push({ soLuong: r.quantity, donGia: Number(r.unit_price) });
    ket.set(r.selection_id, mang);
  }
  return ket;
}

interface RawPaymentRow {
  gallery_id: string;
  amount: number;
  confirmed_at: string;
  galleries: HangGalleryGon | HangGalleryGon[] | null;
}

interface HangDaThu {
  galleryId: string;
  branchId: string;
  amount: number;
}

/** Tiền đã thu (ghi nhận `confirmed_at` trong kỳ), bộ ảnh thật, đúng chi nhánh. */
async function daThuTrongKy(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<HangDaThu[]> {
  const { data, error } = await ctx.client
    .from("gallery_payments")
    .select("gallery_id, amount, confirmed_at, galleries!inner(id, branch_id, title, status)")
    .gte("confirmed_at", tu.toISOString())
    .lt("confirmed_at", den.toISOString());
  if (error) throw error;

  const chiNhanhChoPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const ket: HangDaThu[] = [];
  for (const r of (data ?? []) as RawPaymentRow[]) {
    const g = motGallery(r.galleries);
    if (!laBoAnhThat(g)) continue;
    if (chiNhanhChoPhep && !chiNhanhChoPhep.has(g.branch_id)) continue;
    ket.push({ galleryId: r.gallery_id, branchId: g.branch_id, amount: Number(r.amount) });
  }
  return ket;
}

/** Tổng đã thu MỌI THỜI ĐIỂM (không lọc kỳ) cho một danh sách gallery_id cho trước. */
async function tongDaThuTheoGallery(ctx: NguCanhBaoCao, galleryIds: string[]): Promise<Map<string, number>> {
  const ket = new Map<string, number>();
  if (galleryIds.length === 0) return ket;
  const { data, error } = await ctx.client
    .from("gallery_payments")
    .select("gallery_id, amount")
    .in("gallery_id", galleryIds);
  if (error) throw error;
  for (const r of (data ?? []) as { gallery_id: string; amount: number }[]) {
    ket.set(r.gallery_id, (ket.get(r.gallery_id) ?? 0) + Number(r.amount));
  }
  return ket;
}

interface RawYeuCauRow {
  id: string;
  gallery_id: string;
  so_luong: number;
  trang_thai: string;
  created_at: string;
  galleries: HangGalleryGon | HangGalleryGon[] | null;
  products: { list_price: number | null } | { list_price: number | null }[] | null;
}

interface HangYeuCau {
  branchId: string;
  soLuong: number;
  trangThai: string;
  listPrice: number | null;
}

function motSanPham(raw: RawYeuCauRow["products"]): { list_price: number | null } | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/** Yêu cầu mua lần hai (BB-245/254) tạo mới trong kỳ, bộ ảnh thật, đúng chi nhánh. */
async function yeuCauMuaLanHaiTrongKy(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<HangYeuCau[]> {
  const { data, error } = await ctx.client
    .from("yeu_cau_mua_them")
    .select("id, gallery_id, so_luong, trang_thai, created_at, galleries!inner(id, branch_id, title, status), products(list_price)")
    .gte("created_at", tu.toISOString())
    .lt("created_at", den.toISOString());
  if (error) throw error;

  const chiNhanhChoPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const ket: HangYeuCau[] = [];
  for (const r of (data ?? []) as RawYeuCauRow[]) {
    const g = motGallery(r.galleries);
    if (!laBoAnhThat(g)) continue;
    if (chiNhanhChoPhep && !chiNhanhChoPhep.has(g.branch_id)) continue;
    const sp = motSanPham(r.products);
    ket.push({
      branchId: g.branch_id,
      soLuong: r.so_luong,
      trangThai: r.trang_thai,
      listPrice: sp?.list_price ?? null,
    });
  }
  return ket;
}

async function tenCacChiNhanh(ctx: NguCanhBaoCao): Promise<Map<string, string>> {
  let q = ctx.client.from("branches").select("id, name").order("name");
  if (ctx.chiNhanhIds) q = q.in("id", ctx.chiNhanhIds);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map<string, string>();
  for (const b of (data ?? []) as { id: string; name: string }[]) m.set(b.id, b.name);
  return m;
}

// ---------------------------------------------------------------------------
// chay()
// ---------------------------------------------------------------------------

interface TongTheoKy {
  vuotHanMuc: number;
  addon: number;
  daThu: number;
}

async function tongHopKy(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<TongTheoKy> {
  const [chot, daThuRows] = await Promise.all([chotTrongKy(ctx, tu, den), daThuTrongKy(ctx, tu, den)]);
  const addonMap = await addonTheoSelection(
    ctx,
    chot.map((c) => c.selectionId),
  );
  const vuotHanMuc = tinhTongVuotHanMuc(chot.map((c) => ({ snapshotExtraAmount: c.snapshotExtraAmount })));
  let addon = 0;
  for (const c of chot) addon += tinhTongAddon(addonMap.get(c.selectionId) ?? []);
  const daThu = daThuRows.reduce((t, r) => t + r.amount, 0);
  return { vuotHanMuc, addon, daThu };
}

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const [tenChiNhanh, chot, daThuRows, yeuCau] = await Promise.all([
    tenCacChiNhanh(ctx),
    chotTrongKy(ctx, ctx.tu, ctx.den),
    daThuTrongKy(ctx, ctx.tu, ctx.den),
    yeuCauMuaLanHaiTrongKy(ctx, ctx.tu, ctx.den),
  ]);

  const addonMap = await addonTheoSelection(
    ctx,
    chot.map((c) => c.selectionId),
  );
  const conPhaiThuMap = await tongDaThuTheoGallery(
    ctx,
    chot.map((c) => c.galleryId),
  );

  const vuotHanMuc = tinhTongVuotHanMuc(chot.map((c) => ({ snapshotExtraAmount: c.snapshotExtraAmount })));
  let addon = 0;
  for (const c of chot) addon += tinhTongAddon(addonMap.get(c.selectionId) ?? []);
  const daThu = daThuRows.reduce((t, r) => t + r.amount, 0);

  const phaiThuChotKy = tinhTongVuotHanMuc(chot.map((c) => ({ snapshotExtraAmount: c.snapshotExtraAmount })));
  const daThuChotKy = chot.reduce((t, c) => t + (conPhaiThuMap.get(c.galleryId) ?? 0), 0);
  const conPhaiThu = tinhConPhaiThu(phaiThuChotKy, daThuChotKy);

  let kyTruocSo: TongTheoKy | null = null;
  if (ctx.kyTruoc) {
    kyTruocSo = await tongHopKy(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den);
  }

  const yeuCauMoi = yeuCau.length;
  const yeuCauDaChot = yeuCau.filter((y) => y.trangThai === "da_chot").length;
  const tiLeChot = tinhTiLeChot(yeuCauDaChot, yeuCauMoi);
  const thamKhao = tinhThamKhaoMuaLanHai(yeuCau.map((y) => ({ soLuong: y.soLuong, listPrice: y.listPrice })));

  const theSo: TheSoBaoCao[] = [
    {
      nhan: "Tiền vượt hạn mức (phát sinh)",
      giaTri: vuotHanMuc,
      donVi: "đ",
      kyTruoc: kyTruocSo?.vuotHanMuc,
      chenhLechPhanTram: kyTruocSo ? chenhLechPhanTram(vuotHanMuc, kyTruocSo.vuotHanMuc) : undefined,
    },
    {
      nhan: "Tiền mua thêm lúc chọn (addon)",
      giaTri: addon,
      donVi: "đ",
      kyTruoc: kyTruocSo?.addon,
      chenhLechPhanTram: kyTruocSo ? chenhLechPhanTram(addon, kyTruocSo.addon) : undefined,
    },
    {
      nhan: "Đã thu (ghi nhận trong kỳ)",
      giaTri: daThu,
      donVi: "đ",
      kyTruoc: kyTruocSo?.daThu,
      chenhLechPhanTram: kyTruocSo ? chenhLechPhanTram(daThu, kyTruocSo.daThu) : undefined,
    },
    { nhan: "Còn phải thu (bộ chốt trong kỳ, số dồn)", giaTri: conPhaiThu, donVi: "đ" },
    { nhan: "Yêu cầu mua lần hai — mới trong kỳ", giaTri: yeuCauMoi, donVi: "yêu cầu" },
    { nhan: "Yêu cầu mua lần hai — đã chốt", giaTri: yeuCauDaChot, donVi: "yêu cầu" },
    { nhan: "Tỉ lệ chốt yêu cầu mua lần hai", giaTri: tiLeChot === null ? "—" : Math.round(tiLeChot * 10) / 10, donVi: tiLeChot === null ? undefined : "%" },
    { nhan: "Giá trị tham khảo mua lần hai", giaTri: thamKhao, donVi: "đ" },
  ];

  const moc = chiaMoc({ tu: ctx.tu, den: ctx.den }, ctx.nhom).map((m) => {
    const trongMoc = chot.filter((c) => {
      const t = new Date(c.submittedAt).getTime();
      return t >= m.tu.getTime() && t < m.den.getTime();
    });
    let tong = tinhTongVuotHanMuc(trongMoc.map((c) => ({ snapshotExtraAmount: c.snapshotExtraAmount })));
    for (const c of trongMoc) tong += tinhTongAddon(addonMap.get(c.selectionId) ?? []);
    return { nhan: nhanMoc(m.tu, ctx.nhom), tong };
  });

  const bangDong = [...tenChiNhanh.entries()].map(([id, ten]) => {
    const chotChiNhanh = chot.filter((c) => c.branchId === id);
    const vhmChiNhanh = tinhTongVuotHanMuc(chotChiNhanh.map((c) => ({ snapshotExtraAmount: c.snapshotExtraAmount })));
    let addonChiNhanh = 0;
    for (const c of chotChiNhanh) addonChiNhanh += tinhTongAddon(addonMap.get(c.selectionId) ?? []);
    const daThuChiNhanh = daThuRows.filter((r) => r.branchId === id).reduce((t, r) => t + r.amount, 0);
    const conPhaiThuChiNhanh = tinhConPhaiThu(
      vhmChiNhanh,
      chotChiNhanh.reduce((t, c) => t + (conPhaiThuMap.get(c.galleryId) ?? 0), 0),
    );
    return [ten, vhmChiNhanh, addonChiNhanh, vhmChiNhanh + addonChiNhanh, daThuChiNhanh, conPhaiThuChiNhanh];
  });

  const tongDong = [
    "TỔNG",
    vuotHanMuc,
    addon,
    vuotHanMuc + addon,
    daThu,
    conPhaiThu,
  ];

  return {
    theSo,
    bang: {
      cot: ["Chi nhánh", "Tiền vượt hạn mức", "Tiền addon", "Tổng phát sinh", "Đã thu (trong kỳ)", "Còn phải thu (dồn)"],
      dong: [...bangDong, tongDong],
    },
    bieuDo: {
      loai: "cot",
      nhan: moc.map((m) => m.nhan),
      chuoi: [{ ten: "Doanh thu phát sinh (đ)", giaTri: moc.map((m) => m.tong) }],
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "\"Tiền vượt hạn mức\" là con số khách đã NHÌN THẤY lúc bấm chốt (snapshot lúc chốt), không tính lại theo trạng thái hiện tại.",
      "\"Đã thu\" là dòng tiền ghi nhận TRONG KỲ, không giới hạn theo bộ ảnh chốt kỳ nào (có thể thu tiền của bộ đã chốt trước đó).",
      "\"Còn phải thu\" tính trên các bộ CHỐT TRONG KỲ này, là số DỒN (trừ mọi khoản đã thu của đúng những bộ đó, thu ở bất kỳ thời điểm nào).",
      "Giá trị tham khảo mua lần hai dùng đơn giá NIÊM YẾT — CSKH gọi lại chốt giá thật, không phải số cuối cùng khách trả.",
    ],
  };
}

export const doanhThuPhatSinh: DinhNghiaBaoCao = {
  ma: "doanh-thu-phat-sinh",
  ten: "Doanh thu phát sinh",
  moTa:
    "Tiền vượt hạn mức và mua thêm lúc chọn của các bộ chốt trong kỳ, đã thu/còn phải thu, và yêu cầu mua lần hai.",
  nhom: "doanh-thu",
  quyen: "reports:financial",
  boLoc: { kySoSanh: true },
  chay,
};
