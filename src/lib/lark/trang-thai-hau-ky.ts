/**
 * Trạng thái hậu kỳ đọc từ Lark — toán thuần (BB-200).
 *
 * OWNER: PM. Spec: docs/21 (quy trình hậu kỳ & CSKH), docs/19 mục 3.
 *
 * Không gọi mạng, không đụng cơ sở dữ liệu: vào là mã lựa chọn + ngày, ra là
 * nhãn và danh sách mốc nhắc. Phần đọc Lark nằm ở `doc-trang-thai-lark.ts`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao khớp theo MÃ lựa chọn
 * ---------------------------------------------------------------------------
 * Nhân viên đổi tên hiển thị trên Lark bất cứ lúc nào ("Đã Chọn Hình" hôm nay,
 * "Đã chọn ảnh" mai). Mã lựa chọn thì không đổi. Đọc 24/09/2026 — docs/21 phụ lục.
 */

/** 12 lựa chọn của cột "Trạng Thái" bảng Hậu Kỳ. */
export const TRANG_THAI_LARK = {
  optDAI9nFV: { giaiDoan: 1, ten: "Đã gửi file gốc" },
  optl5DyKLx: { giaiDoan: 2, ten: "Đã chọn hình" },
  optmhzW4sL: { giaiDoan: 3, ten: "Đang làm" },
  optWz9BTWy: { giaiDoan: 4, ten: "Leader check hình" },
  optjJ9MNLL: { giaiDoan: 5, ten: "Đã gửi duyệt" },
  optjhQwMrT: { giaiDoan: 6, ten: "Sửa" },
  optW0pvHGd: { giaiDoan: 6, ten: "Sửa lần 2, 3, 4" },
  optsXat0f1: { giaiDoan: 7, ten: "Đã chốt chưa in" },
  optxMAdtNX: { giaiDoan: 8, ten: "Đã gửi in" },
  opttKmVbce: { giaiDoan: 9, ten: "Hình đã về" },
  opttHXFpgy: { giaiDoan: 10, ten: "Đã giao" },
  optZUXP6XK: { giaiDoan: 11, ten: "Đã chăm sóc khách" },
} as const;

export type MaTrangThaiLark = keyof typeof TRANG_THAI_LARK;

/** Cột "Cảnh Báo" ↔ thang màu của sơ đồ (chủ studio chốt 24/09/2026). */
export const CANH_BAO_LARK = {
  optSj1R6PM: "xanh", // An Toàn
  opt1E9Y1AQ: "cam", // Cảnh Báo
  optmFaSbfW: "do", // Nguy Hiểm
  optQEfwHOy: "tim", // Phải Xong Trong Ngày
} as const;

export type MauCanhBao = (typeof CANH_BAO_LARK)[keyof typeof CANH_BAO_LARK];

/** Mã "neo" để tìm đúng cột trên Lark dù cột bị đổi tên. */
export const MA_NEO_COT_TRANG_THAI = "optDAI9nFV";
export const MA_NEO_COT_CANH_BAO = "optSj1R6PM";

export function giaiDoanCua(ma: string | null | undefined): number | null {
  if (!ma) return null;
  return (TRANG_THAI_LARK as Record<string, { giaiDoan: number }>)[ma]?.giaiDoan ?? null;
}

export function mauCanhBao(ma: string | null | undefined): MauCanhBao | null {
  if (!ma) return null;
  return (CANH_BAO_LARK as Record<string, MauCanhBao>)[ma] ?? null;
}

// ---------------------------------------------------------------------------
// Nhãn hiển thị
// ---------------------------------------------------------------------------

/**
 * Những trạng thái app mà sau đó Lark mới là nguồn chuẩn. Trước khi CSKH xác
 * nhận (ready / in_review / submitted), app tự biết rõ hơn Lark: khách đang
 * chọn, đã chốt, còn sửa được — Lark lúc đó chỉ ghi "Đã gửi file gốc".
 *
 * `awaiting_approval` KHÔNG có ở đây: màn khách lúc đó có nút duyệt/xin sửa của
 * chính app; đè nhãn Lark lên là nói một đằng, nút làm một nẻo.
 */
const APP_THEO_LARK = new Set(["in_retouch", "approved", "delivered"]);

export interface NhanHienThi {
  /** Chữ cho màn quản trị. */
  quanTri: string;
  /** Chữ cho màn khách; null = giữ chữ sẵn có của app cho trạng thái đó. */
  khach: string | null;
  /** Giai đoạn Lark đã dùng để ra nhãn; null = nhãn theo app. */
  giaiDoan: number | null;
}

const KHACH_THEO_GIAI_DOAN: Record<number, string> = {
  2: "Bộ ảnh đã được ghi nhận yêu cầu",
  3: "Đang chỉnh sửa",
  4: "Đang chỉnh sửa",
  5: "Ảnh đã chỉnh xong, bên mình gửi ba mẹ duyệt",
  6: "Đang sửa theo yêu cầu của ba mẹ",
  7: "Đã chốt ảnh, đang chuẩn bị in",
  8: "Đang in",
  9: "Sản phẩm đã về, mời ba mẹ ghé nhận",
  10: "Đã giao",
  11: "Đã giao",
};

const QUAN_TRI_THEO_GIAI_DOAN: Record<number, string> = {
  2: "Đã chọn hình · chờ chỉnh sửa",
  3: "Đang chỉnh sửa",
  4: "Leader đang kiểm hình",
  5: "Đã gửi khách duyệt",
  6: "Đang sửa theo yêu cầu",
  7: "Đã chốt, chờ in",
  8: "Đã gửi in",
  9: "Hình đã về, chờ giao",
  10: "Đã giao",
  11: "Đã chăm sóc khách",
};

/**
 * Nhãn cho một bộ ảnh.
 *
 * Luật chính (docs/19 mục 3): CSKH đã xác nhận (`in_retouch`) mà Lark còn ở
 * "Đã chọn hình" — hoặc app CHƯA đọc được Lark — thì bộ ảnh đang XẾP HÀNG, chưa
 * ai chỉnh: khách thấy "Bộ ảnh đã được ghi nhận yêu cầu", không phải "Đang
 * chỉnh sửa". Chỉ khi Lark sang "Đang làm" thì hai màn mới nói đang chỉnh.
 *
 * Lark ở giai đoạn 1 (file gốc) trong khi app đã xác nhận: Lark chưa được cập
 * nhật — coi như giai đoạn 2, không lùi nhãn về "chờ chọn ảnh".
 */
export function nhanHienThi(
  trangThaiApp: string,
  maLark: string | null | undefined,
  nhanApp: (s: string) => string,
): NhanHienThi {
  if (!APP_THEO_LARK.has(trangThaiApp)) {
    return { quanTri: nhanApp(trangThaiApp), khach: null, giaiDoan: null };
  }
  let gd = giaiDoanCua(maLark);
  if (gd === null || gd < 2) gd = 2;
  // App đã ghi "đã giao" mà Lark còn chậm: tin app, không lùi nhãn.
  if (trangThaiApp === "delivered" && gd < 10) {
    return { quanTri: nhanApp(trangThaiApp), khach: null, giaiDoan: null };
  }
  return {
    quanTri: QUAN_TRI_THEO_GIAI_DOAN[gd] ?? nhanApp(trangThaiApp),
    khach: KHACH_THEO_GIAI_DOAN[gd] ?? null,
    giaiDoan: gd,
  };
}

// ---------------------------------------------------------------------------
// Mốc nhắc (docs/21 — phần APP gửi; Lark tự gửi GĐ1 và tin 17:00)
// ---------------------------------------------------------------------------

export type NguoiNhan = "quan_ly" | "nhom_chinh_anh" | "cskh";

export interface LuatNhac {
  maNhac: string;
  giaiDoan: number;
  /** Số ngày tính từ lúc vào giai đoạn. */
  moc: number[];
  nguoiNhan: NguoiNhan;
  /** Chỉ áp cho nhánh này; thiếu = mọi nhánh. */
  chiNhanh?: "A" | "C";
}

export const LUAT_NHAC: LuatNhac[] = [
  // GĐ2 — nhánh A "Làm ảnh nhanh": 4 ngày chưa làm là khủng hoảng.
  { maNhac: "qua_han_chon_hinh", giaiDoan: 2, moc: [4], nguoiNhan: "quan_ly", chiNhanh: "A" },
  // GĐ2 — nhánh C: 10 ngày (sau khi đã tím ở ngày 9) gọi quản lý vào.
  { maNhac: "qua_han_chon_hinh", giaiDoan: 2, moc: [10], nguoiNhan: "quan_ly", chiNhanh: "C" },
  { maNhac: "dang_lam_lau", giaiDoan: 3, moc: [2], nguoiNhan: "nhom_chinh_anh" },
  { maNhac: "cho_khach_duyet", giaiDoan: 5, moc: [2, 5, 10, 20, 30], nguoiNhan: "cskh" },
  { maNhac: "dang_in_lau", giaiDoan: 8, moc: [2], nguoiNhan: "cskh" },
  { maNhac: "hinh_ve_chua_lay", giaiDoan: 9, moc: [2, 5, 10], nguoiNhan: "cskh" },
  { maNhac: "cam_on_sau_giao", giaiDoan: 10, moc: [2], nguoiNhan: "cskh" },
];

/**
 * Số NGÀY LỊCH đã qua theo giờ Việt Nam (UTC+7), không phải số lần 24 giờ:
 * bộ vào giai đoạn lúc 23:00 thì 08:00 sáng hôm sau là "1 ngày", đúng cách
 * CSKH đếm.
 */
export function soNgayLich(tu: Date, den: Date): number {
  const VN = 7 * 3600 * 1000;
  const ngay = (d: Date) => Math.floor((d.getTime() + VN) / 86_400_000);
  return ngay(den) - ngay(tu);
}

export interface MocCanGui {
  maNhac: string;
  moc: number;
  nguoiNhan: NguoiNhan;
  /** Mốc nhỏ hơn đã qua mà chưa gửi — ghi là đã gửi luôn, không dội tin. */
  mocBoQua: number[];
}

/**
 * Hôm nay bộ ảnh này tới mốc nhắc nào.
 *
 * Chỉ trả MỐC LỚN NHẤT đã tới mà chưa gửi. Bộ ảnh vừa được đồng bộ lần đầu đã ở
 * "Đã gửi duyệt" 25 ngày thì nhận MỘT tin "20 ngày", không phải bốn tin 2/5/10/20
 * cùng lúc; cron lỡ một ngày cũng không mất tin.
 */
export function mocNhacHomNay(opts: {
  maLark: string | null | undefined;
  tu: Date | null;
  homNay: Date;
  nhanhA: boolean;
  daGui: ReadonlySet<string>; // khoá `${maNhac}:${moc}` của lượt hiện tại
}): MocCanGui[] {
  const gd = giaiDoanCua(opts.maLark);
  if (gd === null || !opts.tu) return [];
  const soNgay = soNgayLich(opts.tu, opts.homNay);
  const nhanh = opts.nhanhA ? "A" : "C";
  const ra: MocCanGui[] = [];
  for (const luat of LUAT_NHAC) {
    if (luat.giaiDoan !== gd) continue;
    if (luat.chiNhanh && luat.chiNhanh !== nhanh) continue;
    const daToi = luat.moc.filter((m) => soNgay >= m);
    const chuaGui = daToi.filter((m) => !opts.daGui.has(`${luat.maNhac}:${m}`));
    if (chuaGui.length === 0) continue;
    const lonNhat = Math.max(...chuaGui);
    ra.push({
      maNhac: luat.maNhac,
      moc: lonNhat,
      nguoiNhan: luat.nguoiNhan,
      mocBoQua: chuaGui.filter((m) => m !== lonNhat),
    });
  }
  return ra;
}
