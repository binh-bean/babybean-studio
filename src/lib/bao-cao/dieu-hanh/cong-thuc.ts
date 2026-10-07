/**
 * BB-380 — công thức của bộ báo cáo điều hành ("Sáu con số" + phễu khách + mua
 * thêm + chỉnh sửa). HÀM THUẦN: vào là các dòng đã đọc sẵn, ra là con số.
 *
 * Phần đọc cơ sở dữ liệu ở `nguyen-lieu.ts`. Tách ra để mỗi công thức có phép
 * thử với số liệu biết trước (tests/unit/bao-cao/bb-380-dieu-hanh.test.ts).
 *
 * ---------------------------------------------------------------------------
 * Định nghĩa (đọc trước khi đổi)
 * ---------------------------------------------------------------------------
 * - "Bộ gửi trong kỳ": `galleries.sent_at` rơi trong kỳ. "Bộ chốt trong kỳ":
 *   `galleries.submitted_at` rơi trong kỳ — CÙNG định nghĩa báo cáo "Tiến độ
 *   chọn ảnh", nên số "gửi → chốt" hai nơi khớp nhau.
 * - "Đã mở link": có lượt chọn (lượt chọn TẠO LÚC ba mẹ mở bộ ảnh, xem
 *   `luot-chon-theo-link.ts`), hoặc link riêng của bộ có lượt xem > 0, hoặc đã
 *   chốt. Mốc mở đầu tiên = lúc tạo lượt chọn sớm nhất (app không lưu mốc mở
 *   riêng: `galleries.first_viewed_at` chưa từng được ghi).
 * - Tiền: lấy NGUYÊN từ `layTienCanThuNhieuBo` (tien-can-thu-server.ts) — không
 *   tính lại. "Phát sinh" của một bộ = `tongPhaiThu` + `tienSanPhamQuaLark`
 *   (phần sản phẩm thu qua Lark theo cờ `thanh_toan.thu_san_pham_qua_app`).
 */

import { trungVi } from "../ky";
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";

const NGAY_MS = 86_400_000;

/** Phần tiền của một bộ, tách từ kết quả `layTienCanThuNhieuBo` (không tính lại). */
export interface TachTien {
  /** Ảnh vượt hạn mức (số lúc chốt, chưa chốt thì theo ảnh) + hạn mức đã quy đổi. */
  anhVuot: number;
  /** Tiền ảnh mua thêm: đợt ≥ 2 + "Edit file" mọi đợt. */
  anhMuaThem: number;
  /** Sản phẩm (in/khung/album) đã nằm trong "Phải thu" của app. */
  sanPhamTrongApp: number;
  /** Sản phẩm thu qua Lark — KHÔNG nằm trong "Phải thu". */
  sanPhamQuaLark: number;
}

/** Nguyên liệu tối thiểu từ `TienCanThuBo` để tách. */
export interface TienCanThuToiThieu {
  tongPhaiThu: number;
  tienDotMuaThem: number;
  tienSanPham: number;
  tienSanPhamQuaLark: number;
}

export function tachTien(t: TienCanThuToiThieu): TachTien {
  const sanPhamQuaLark = Math.max(0, t.tienSanPhamQuaLark);
  const sanPhamTrongApp = Math.max(0, t.tienSanPham - sanPhamQuaLark);
  const anhMuaThem = Math.max(0, t.tienDotMuaThem);
  return {
    anhVuot: Math.max(0, t.tongPhaiThu - anhMuaThem - sanPhamTrongApp),
    anhMuaThem,
    sanPhamTrongApp,
    sanPhamQuaLark,
  };
}

/** Tổng phát sinh của một bộ = phải thu trong app + phần sản phẩm thu qua Lark. */
export function tongPhatSinh(t: TachTien | null): number {
  if (!t) return 0;
  return t.anhVuot + t.anhMuaThem + t.sanPhamTrongApp + t.sanPhamQuaLark;
}

export interface BoAnhDieuHanh {
  id: string;
  branchId: string;
  status: string;
  sentAt: string | null;
  submittedAt: string | null;
  larkTrangThai: string | null;
  larkTrangThaiTu: string | null;
  /** Lượt chọn sớm nhất được tạo (= lúc ba mẹ mở bộ lần đầu). */
  moLanDauLuc: string | null;
  /** Link riêng của bộ có lượt xem > 0. */
  linkCoLuotXem: boolean;
  /** Đã có ít nhất một ảnh được chọn (chưa chốt cũng tính). */
  coAnhChon: boolean;
  /** Ảnh chọn thêm: vượt hạn mức lúc chốt + ảnh của các đợt mua thêm đã xác nhận. */
  anhChonThem: number;
  tien: TachTien | null;
  /** Lần tải ảnh đầu tiên của khách (nhật ký `gallery.tai_anh`). */
  taiAnhLanDauLuc: string | null;
  /** Lần đầu gửi ảnh chỉnh cho khách duyệt (nhật ký app hoặc Lark "Đã gửi duyệt"). */
  guiDuyetLuc: string | null;
  /** Tên người chỉnh sửa (Lark "Người Photoshop"), không có thì null. */
  nguoiChinhSua: string | null;
}

function ms(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export interface TiLe {
  tu: number;
  mau: number;
  /** % (một số lẻ); null khi mẫu = 0. */
  phanTram: number | null;
}

function tiLe(tu: number, mau: number): TiLe {
  return { tu, mau, phanTram: mau === 0 ? null : Math.round((tu / mau) * 1000) / 10 };
}

export function daMoLink(b: BoAnhDieuHanh): boolean {
  return b.moLanDauLuc !== null || b.linkCoLuotXem || b.submittedAt !== null;
}

/** 1. Tỉ lệ mở link — trên các bộ GỬI trong kỳ. */
export function tinhTiLeMoLink(boGui: BoAnhDieuHanh[]): TiLe {
  return tiLe(boGui.filter(daMoLink).length, boGui.length);
}

/** 2. Trung vị số ngày gửi link → chốt — trên các bộ CHỐT trong kỳ có cả hai mốc. */
export function tinhTrungViNgayGuiDenChot(boChot: BoAnhDieuHanh[]): number | null {
  const ngay: number[] = [];
  for (const b of boChot) {
    const g = ms(b.sentAt);
    const c = ms(b.submittedAt);
    if (g === null || c === null || c < g) continue;
    ngay.push((c - g) / NGAY_MS);
  }
  const tv = trungVi(ngay);
  return tv === null ? null : Math.round(tv * 10) / 10;
}

/**
 * 3. % chốt trong 7 ngày — trên các bộ GỬI trong kỳ.
 * Bộ gửi chưa đủ 7 ngày mà chưa chốt thì CHƯA biết kết quả: không vào mẫu
 * (không thì kỳ "7 ngày qua" luôn ra tỉ lệ thấp oan).
 */
export function tinhTiLeChotTrong7Ngay(boGui: BoAnhDieuHanh[], now: Date): TiLe {
  let tu = 0;
  let mau = 0;
  for (const b of boGui) {
    const g = ms(b.sentAt);
    if (g === null) continue;
    const c = ms(b.submittedAt);
    const chotTrong7 = c !== null && c >= g && c - g <= 7 * NGAY_MS;
    const du7Ngay = now.getTime() - g >= 7 * NGAY_MS;
    if (chotTrong7) {
      tu += 1;
      mau += 1;
    } else if (du7Ngay) {
      mau += 1;
    }
  }
  return tiLe(tu, mau);
}

/** 4. Số ảnh chọn thêm trung bình mỗi bộ — trên các bộ CHỐT trong kỳ. */
export function tinhAnhChonThemMoiBo(boChot: BoAnhDieuHanh[]): number | null {
  if (boChot.length === 0) return null;
  const tong = boChot.reduce((t, b) => t + Math.max(0, b.anhChonThem), 0);
  return Math.round((tong / boChot.length) * 10) / 10;
}

/** 5. Doanh thu mua thêm trung bình mỗi bộ (đ) — trên các bộ CHỐT trong kỳ. */
export function tinhDoanhThuMuaThemMoiBo(boChot: BoAnhDieuHanh[]): number | null {
  if (boChot.length === 0) return null;
  const tong = boChot.reduce((t, b) => t + tongPhatSinh(b.tien), 0);
  return Math.round(tong / boChot.length);
}

/**
 * 6. % khách tải ảnh trước khi chốt — trên các bộ CHỐT trong kỳ, CHỐT TỪ lúc
 * app bắt đầu ghi lượt tải (`mocBatDauDo`). Chưa có mốc = chưa đo được (null).
 */
export function tinhTiLeTaiTruocChot(boChot: BoAnhDieuHanh[], mocBatDauDo: string | null): TiLe | null {
  const moc = ms(mocBatDauDo);
  if (moc === null) return null;
  let tu = 0;
  let mau = 0;
  for (const b of boChot) {
    const c = ms(b.submittedAt);
    if (c === null || c < moc) continue;
    mau += 1;
    const t = ms(b.taiAnhLanDauLuc);
    if (t !== null && t < c) tu += 1;
  }
  return tiLe(tu, mau);
}

// ---------------------------------------------------------------------------
// Phễu khách
// ---------------------------------------------------------------------------

export const CAC_BUOC_PHEU = [
  "Gửi link",
  "Mở link",
  "Chọn ảnh",
  "Chốt",
  "Chỉnh sửa",
  "Gửi duyệt",
  "In / giao",
] as const;

/** Số ngày một bộ được nằm ở mỗi bước trước khi coi là "kẹt" (chỉ số 0..5; bước cuối là xong). */
export const NGUONG_KET_NGAY = [3, 5, 7, 3, 7, 7] as const;

/**
 * Bước xa nhất một bộ đã tới (0..6). App biết rõ các bước tới lúc chốt; sau đó
 * Lark là nguồn (trạng thái hậu kỳ), app chỉ bổ sung khi CSKH bấm trong app.
 */
export function buocCua(b: BoAnhDieuHanh): number {
  const gd = giaiDoanCua(b.larkTrangThai);
  if (b.status === "delivered" || b.status === "approved" || (gd !== null && gd >= 7)) return 6;
  if (b.status === "awaiting_approval" || b.guiDuyetLuc !== null || (gd !== null && gd >= 5)) return 5;
  if (b.status === "in_retouch" || (gd !== null && gd >= 2)) return 4;
  if (b.submittedAt !== null || b.status === "submitted") return 3;
  if (b.coAnhChon) return 2;
  if (daMoLink(b)) return 1;
  return 0;
}

/** Số bộ đã tới (ít nhất) mỗi bước. Phễu đơn điệu: tới bước sau là đã qua bước trước. */
export function demPheu(bo: BoAnhDieuHanh[]): number[] {
  const dem = CAC_BUOC_PHEU.map(() => 0);
  for (const b of bo) {
    const toi = buocCua(b);
    for (let i = 0; i <= toi; i++) dem[i] = (dem[i] ?? 0) + 1;
  }
  return dem;
}

/** Trung vị số ngày giữa hai mốc, trên các bộ có đủ cả hai mốc. */
export function trungViNgayGiua(
  bo: BoAnhDieuHanh[],
  tu: (b: BoAnhDieuHanh) => string | null,
  den: (b: BoAnhDieuHanh) => string | null,
): { trungVi: number | null; mau: number } {
  const ngay: number[] = [];
  for (const b of bo) {
    const a = ms(tu(b));
    const z = ms(den(b));
    if (a === null || z === null || z < a) continue;
    ngay.push((z - a) / NGAY_MS);
  }
  const tv = trungVi(ngay);
  return { trungVi: tv === null ? null : Math.round(tv * 10) / 10, mau: ngay.length };
}

/** Mốc một bộ BƯỚC VÀO bước hiện tại (để đo đang nằm đó bao lâu). */
export function vaoBuocLuc(b: BoAnhDieuHanh): string | null {
  const buoc = buocCua(b);
  if (buoc >= 4 && b.larkTrangThaiTu) return b.larkTrangThaiTu;
  if (buoc === 5 && b.guiDuyetLuc) return b.guiDuyetLuc;
  if (buoc >= 3) return b.submittedAt;
  if (buoc >= 1) return b.moLanDauLuc ?? b.sentAt;
  return b.sentAt;
}

export interface DongKet {
  buoc: number;
  dangO: number;
  quaNguong: number;
  nguongNgay: number;
  trungViNgayDangO: number | null;
}

/** Bộ đang dở dang theo bước hiện tại: bao nhiêu bộ đang ở đó, bao nhiêu quá ngưỡng. */
export function tinhBoKet(bo: BoAnhDieuHanh[], now: Date): DongKet[] {
  const ket: DongKet[] = NGUONG_KET_NGAY.map((nguong, buoc) => ({
    buoc,
    dangO: 0,
    quaNguong: 0,
    nguongNgay: nguong,
    trungViNgayDangO: null,
  }));
  const ngayTheoBuoc: number[][] = NGUONG_KET_NGAY.map(() => []);
  for (const b of bo) {
    const buoc = buocCua(b);
    if (buoc >= CAC_BUOC_PHEU.length - 1) continue; // đã in / giao
    const dong = ket[buoc]!;
    dong.dangO += 1;
    const vao = ms(vaoBuocLuc(b));
    if (vao === null) continue;
    const ngay = (now.getTime() - vao) / NGAY_MS;
    ngayTheoBuoc[buoc]!.push(ngay);
    if (ngay > dong.nguongNgay) dong.quaNguong += 1;
  }
  for (const dong of ket) {
    const tv = trungVi(ngayTheoBuoc[dong.buoc]!);
    dong.trungViNgayDangO = tv === null ? null : Math.round(tv * 10) / 10;
  }
  return ket;
}

// ---------------------------------------------------------------------------
// Mua thêm (sales + doanh thu)
// ---------------------------------------------------------------------------

export interface TongMuaThem {
  soBo: number;
  soBoCoMua: number;
  tiLeCoMua: TiLe;
  tongPhatSinh: number;
  /** Trung bình trên các bộ CÓ mua thêm; null khi không bộ nào mua. */
  tbTrenBoCoMua: number | null;
  tach: TachTien;
}

export function tongHopMuaThem(boChot: BoAnhDieuHanh[]): TongMuaThem {
  const tach: TachTien = { anhVuot: 0, anhMuaThem: 0, sanPhamTrongApp: 0, sanPhamQuaLark: 0 };
  let soBoCoMua = 0;
  let tong = 0;
  for (const b of boChot) {
    const t = b.tien;
    const ps = tongPhatSinh(t);
    if (ps > 0) soBoCoMua += 1;
    tong += ps;
    if (t) {
      tach.anhVuot += t.anhVuot;
      tach.anhMuaThem += t.anhMuaThem;
      tach.sanPhamTrongApp += t.sanPhamTrongApp;
      tach.sanPhamQuaLark += t.sanPhamQuaLark;
    }
  }
  return {
    soBo: boChot.length,
    soBoCoMua,
    tiLeCoMua: tiLe(soBoCoMua, boChot.length),
    tongPhatSinh: tong,
    tbTrenBoCoMua: soBoCoMua === 0 ? null : Math.round(tong / soBoCoMua),
    tach,
  };
}

/** Một dòng sản phẩm khách đã mua (đợt 1 lúc chốt, hoặc đợt ≥ 2 đã xác nhận). */
export interface DongSanPhamBan {
  galleryId: string;
  dot: number;
  productId: string;
  ten: string;
  /** Nhóm hiển thị: "Ảnh chỉnh thêm (Edit file)", "Ảnh in", "Khung", "Album", "Khác". */
  nhom: string;
  soLuong: number;
  tien: number;
}

export interface SanPhamGop {
  ten: string;
  nhom: string;
  soLuong: number;
  tien: number;
  soBo: number;
}

/** Gộp theo `productId`, xếp theo tiền giảm dần rồi số lượng. */
export function gopSanPhamBanChay(dong: DongSanPhamBan[]): SanPhamGop[] {
  const theoSp = new Map<string, SanPhamGop & { bo: Set<string> }>();
  for (const d of dong) {
    let g = theoSp.get(d.productId);
    if (!g) {
      g = { ten: d.ten, nhom: d.nhom, soLuong: 0, tien: 0, soBo: 0, bo: new Set() };
      theoSp.set(d.productId, g);
    }
    g.soLuong += d.soLuong;
    g.tien += d.tien;
    g.bo.add(d.galleryId);
  }
  return [...theoSp.values()]
    .map(({ bo, ...g }) => ({ ...g, soBo: bo.size }))
    .sort((a, b) => b.tien - a.tien || b.soLuong - a.soLuong || a.ten.localeCompare(b.ten, "vi"));
}

/** Gộp theo một khoá bất kỳ (nhóm sản phẩm, đợt...). */
export function gopTheo<K extends string | number>(
  dong: DongSanPhamBan[],
  khoa: (d: DongSanPhamBan) => K,
): Map<K, { soLuong: number; tien: number }> {
  const m = new Map<K, { soLuong: number; tien: number }>();
  for (const d of dong) {
    const k = khoa(d);
    const v = m.get(k) ?? { soLuong: 0, tien: 0 };
    v.soLuong += d.soLuong;
    v.tien += d.tien;
    m.set(k, v);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Vận hành chỉnh sửa
// ---------------------------------------------------------------------------

export interface YeuCauSua {
  galleryId: string;
  /** Vòng thứ mấy (1 = lần sửa đầu). */
  vong: number;
}

export interface TongChinhSua {
  soYeuCau: number;
  soBoCoSua: number;
  /** Số lần sửa trung bình trên các bộ CÓ yêu cầu sửa (vòng cao nhất). */
  tbLanSua: number | null;
}

export function tongHopChinhSua(yeuCau: YeuCauSua[]): TongChinhSua {
  const vongCaoNhat = new Map<string, number>();
  for (const y of yeuCau) vongCaoNhat.set(y.galleryId, Math.max(vongCaoNhat.get(y.galleryId) ?? 0, y.vong));
  const tongVong = [...vongCaoNhat.values()].reduce((t, v) => t + v, 0);
  return {
    soYeuCau: yeuCau.length,
    soBoCoSua: vongCaoNhat.size,
    tbLanSua: vongCaoNhat.size === 0 ? null : Math.round((tongVong / vongCaoNhat.size) * 10) / 10,
  };
}

/** Khoá gom "người chỉnh sửa": tên Lark; nhiều người "A, B" giữ nguyên chuỗi; trống = "Chưa rõ". */
export function khoaNguoiChinhSua(ten: string | null): string {
  const s = (ten ?? "").trim();
  return s.length > 0 ? s : "Chưa rõ";
}
