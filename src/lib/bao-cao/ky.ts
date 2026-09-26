/**
 * Tiện ích kỳ báo cáo — múi giờ Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè).
 *
 * OWNER: DEV-BE. Task BB-260.
 *
 * Dùng lệch giờ cố định +7 giống `soNgayLich` ở
 * `src/lib/lark/trang-thai-hau-ky.ts` — Việt Nam không đổi giờ theo mùa nên
 * cách này đúng quanh năm, không cần thư viện múi giờ.
 */

import type { DonViGomNhom, KhoangThoiGian } from "./loai";

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Nửa đêm (giờ VN) của ngày chứa `d`, dịch thêm `offsetNgay` ngày. Trả UTC Date. */
export function ngayVN(d: Date, offsetNgay = 0): Date {
  const shifted = new Date(d.getTime() + VN_OFFSET_MS);
  const utcMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + offsetNgay,
  );
  return new Date(utcMidnight - VN_OFFSET_MS);
}

/** Ngày 1 đầu tháng (giờ VN) chứa `d`, dịch thêm `offsetThang` tháng. */
export function dauThangVN(d: Date, offsetThang = 0): Date {
  const shifted = new Date(d.getTime() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const tong = y * 12 + m + offsetThang;
  const namMoi = Math.floor(tong / 12);
  const thangMoi = ((tong % 12) + 12) % 12;
  const utcStart = Date.UTC(namMoi, thangMoi, 1);
  return new Date(utcStart - VN_OFFSET_MS);
}

export function homNay(now: Date): KhoangThoiGian {
  return { tu: ngayVN(now, 0), den: ngayVN(now, 1) };
}

/** `soNgay` ngày gần nhất TÍNH CẢ hôm nay — vd 7 ngày = hôm nay và 6 ngày trước. */
export function nNgayGanDay(now: Date, soNgay: number): KhoangThoiGian {
  return { tu: ngayVN(now, -(soNgay - 1)), den: ngayVN(now, 1) };
}

export function thangNay(now: Date): KhoangThoiGian {
  return { tu: dauThangVN(now, 0), den: dauThangVN(now, 1) };
}

export function thangTruoc(now: Date): KhoangThoiGian {
  return { tu: dauThangVN(now, -1), den: dauThangVN(now, 0) };
}

/** Kỳ trước, CÙNG ĐỘ DÀI với kỳ đã cho, liền kề ngay trước `tu`. */
export function kyTruocCungDoDai(k: KhoangThoiGian): KhoangThoiGian {
  const doDaiMs = k.den.getTime() - k.tu.getTime();
  return { tu: new Date(k.tu.getTime() - doDaiMs), den: new Date(k.tu.getTime()) };
}

/** % chênh lệch giữa giá trị kỳ này và kỳ trước; `null` khi không tính được. */
export function chenhLechPhanTram(hienTai: number, kyTruoc: number | null | undefined): number | null {
  if (kyTruoc === null || kyTruoc === undefined) return null;
  if (kyTruoc === 0) return hienTai === 0 ? 0 : null;
  return ((hienTai - kyTruoc) / kyTruoc) * 100;
}

/**
 * Diễn giải một chuỗi `yyyy-mm-dd` (từ query string) thành nửa đêm giờ VN của
 * đúng ngày đó, dịch thêm `offsetNgay` ngày. Ném lỗi nếu chuỗi sai định dạng.
 */
export function ngayVnTuChuoi(s: string, offsetNgay = 0): Date {
  const khop = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!khop) throw new Error(`Ngày không hợp lệ: "${s}"`);
  const [, yS, mS, dS] = khop;
  // Giờ trưa UTC của ngày đó luôn rơi đúng ngày đó ở giờ VN (UTC+7), nên
  // dùng làm mốc trung gian an toàn trước khi chuẩn hoá về nửa đêm giờ VN.
  const truaUtc = new Date(Date.UTC(Number(yS), Number(mS) - 1, Number(dS), 12));
  return ngayVN(truaUtc, offsetNgay);
}

/** Định dạng một Date thành `yyyy-mm-dd` theo NGÀY LỊCH giờ VN. */
export function dinhDangNgayVN(d: Date): string {
  const shifted = new Date(d.getTime() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type MaKyDungSan = "hom-nay" | "7-ngay" | "30-ngay" | "thang-nay" | "thang-truoc";

export const CAC_KY_DUNG_SAN: { ma: MaKyDungSan; ten: string }[] = [
  { ma: "hom-nay", ten: "Hôm nay" },
  { ma: "7-ngay", ten: "7 ngày qua" },
  { ma: "30-ngay", ten: "30 ngày qua" },
  { ma: "thang-nay", ten: "Tháng này" },
  { ma: "thang-truoc", ten: "Tháng trước" },
];

export function kyTuMaDungSan(ma: MaKyDungSan, now: Date = new Date()): KhoangThoiGian {
  switch (ma) {
    case "hom-nay":
      return homNay(now);
    case "7-ngay":
      return nNgayGanDay(now, 7);
    case "30-ngay":
      return nNgayGanDay(now, 30);
    case "thang-nay":
      return thangNay(now);
    case "thang-truoc":
      return thangTruoc(now);
  }
}

/** Nhãn hiển thị một mốc thời gian theo đơn vị gom nhóm, giờ VN. */
export function nhanMoc(d: Date, nhom: DonViGomNhom): string {
  const shifted = new Date(d.getTime() + VN_OFFSET_MS);
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = shifted.getUTCFullYear();
  if (nhom === "thang") return `${mm}/${yyyy}`;
  return `${dd}/${mm}`;
}

/**
 * Chia `[tu, den)` thành các mốc liên tiếp theo `nhom`, giờ VN.
 * Mốc cuối bị cắt ở `den` nếu `den` không rơi đúng ranh giới.
 */
export function chiaMoc(k: KhoangThoiGian, nhom: DonViGomNhom): KhoangThoiGian[] {
  const moc: KhoangThoiGian[] = [];
  let con = k.tu;
  const buoc = (d: Date): Date => {
    if (nhom === "ngay") return ngayVN(d, 1);
    if (nhom === "tuan") return ngayVN(d, 7);
    // tháng: mốc kế tiếp là đầu THÁNG SAU tháng chứa d, cộng theo lịch chứ
    // không phải +30 ngày — tránh trôi mốc qua các tháng 28/29/31 ngày.
    return dauThangVN(d, 1);
  };
  let bao = 0;
  while (con.getTime() < k.den.getTime() && bao < 1000) {
    const ke = buoc(con);
    const denThat = ke.getTime() > k.den.getTime() ? k.den : ke;
    moc.push({ tu: con, den: denThat });
    con = ke;
    bao += 1;
  }
  return moc;
}

/** Trung vị (phút) của một mảng số phút; `null` nếu mảng rỗng. */
export function trungVi(soLieu: number[]): number | null {
  if (soLieu.length === 0) return null;
  const s = [...soLieu].sort((a, b) => a - b);
  const giua = Math.floor(s.length / 2);
  if (s.length % 2 === 0) return ((s[giua - 1] as number) + (s[giua] as number)) / 2;
  return s[giua] as number;
}
