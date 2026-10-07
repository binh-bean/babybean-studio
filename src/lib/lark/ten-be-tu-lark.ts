/**
 * BB-379 — lấy TÊN BÉ cho bộ ảnh từ Lark khi tên thư mục không có (ngoặc đơn).
 *
 * Bảng Hậu Kỳ KHÔNG có cột tên bé (đọc tên cột thật 06/10/2026). Tên bé nằm ở hai bảng khác:
 *   · "📸 Lịch Chụp" — cột "Tên Bé" của TỪNG buổi chụp, nối với Hậu Kỳ qua mã hợp đồng tổng
 *     (Hậu Kỳ "HĐ Tổng" = Lịch Chụp "HD Tổng"). Chính xác nhất: một nhà hai bé thì mỗi buổi một tên.
 *   · "👑 Khách Hàng" — "Tên Bé 1" / "Tên bé 2", nối qua "Mã Khách Hàng" = Hậu Kỳ "Mã KH".
 *     Chỉ dùng khi nhà đó có ĐÚNG MỘT tên bé (hai bé thì không biết bộ này của bé nào → để trống).
 *
 * Luật: chỉ trả tên khi KHÔNG mơ hồ — "để trống, không đoán" (nhân viên thấy trống thì điền, chứ
 * thấy tên sai thì tin là đúng). Việc ghi (chỉ điền khi trống) do nơi gọi đảm nhiệm.
 * Hàm thuần: không gọi Lark, không đụng DB — để thử bằng dữ liệu bịa.
 */

/** Ô của Lark có nhiều hình dạng (chuỗi, {text}, mảng các {text}). */
export function docChuoiO(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    // Ghép NGUYÊN các mảnh (không cắt khoảng trắng từng mảnh — "Bảo " + "An"), cắt ở hai đầu một lần.
    return value
      .map((v) => (v == null ? "" : typeof v === "object" ? String((v as Record<string, unknown>).text ?? (v as Record<string, unknown>).name ?? "") : String(v)))
      .join("")
      .trim();
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o.text ?? o.name ?? "").trim();
  }
  return String(value).trim();
}

const gon = (s: string): string => s.replace(/\s+/g, " ").trim();

export type NguonTenBe = "thu_muc" | "lich_chup" | "khach_hang";

export interface KetQuaTenBeLark {
  ten: string | null;
  nguon: NguonTenBe | null;
  /** Có tên bé trên Lark nhưng không chọn được vì mơ hồ (hai bé / nhiều tên khác nhau). */
  moHo: boolean;
}

export interface DongLark {
  fields: Record<string, unknown>;
}

export interface BoTraCuuTenBe {
  /** Gọi với CÁC Ô của dòng Hậu Kỳ + tên bé bóc từ thư mục (nếu có). */
  tra(hauKy: Record<string, unknown>, tenTuThuMuc?: string | null): KetQuaTenBeLark;
  soMaKhachCoTenBe: number;
  soHopDongCoTenBe: number;
}

export function taoBoTraCuuTenBe(p: { khachHang: DongLark[]; lichChup: DongLark[] }): BoTraCuuTenBe {
  const theoMaKhach = new Map<string, string[]>();
  for (const r of p.khachHang) {
    const ma = docChuoiO(r.fields["Mã Khách Hàng"]);
    if (!ma) continue;
    const ten = [docChuoiO(r.fields["Tên Bé 1"]), docChuoiO(r.fields["Tên bé 2"])].map(gon).filter(Boolean);
    if (ten.length) theoMaKhach.set(ma, ten);
  }
  const theoHopDong = new Map<string, Set<string>>();
  for (const r of p.lichChup) {
    const hd = docChuoiO(r.fields["HD Tổng"]);
    const ten = gon(docChuoiO(r.fields["Tên Bé"]));
    if (!hd || !ten) continue;
    const s = theoHopDong.get(hd) ?? new Set<string>();
    s.add(ten);
    theoHopDong.set(hd, s);
  }

  return {
    soMaKhachCoTenBe: theoMaKhach.size,
    soHopDongCoTenBe: theoHopDong.size,
    tra(hauKy, tenTuThuMuc) {
      const tuThuMuc = gon(tenTuThuMuc ?? "");
      if (tuThuMuc) return { ten: tuThuMuc, nguon: "thu_muc", moHo: false };

      let moHo = false;
      const lich = theoHopDong.get(docChuoiO(hauKy["HĐ Tổng"]));
      if (lich && lich.size === 1) return { ten: [...lich][0]!, nguon: "lich_chup", moHo: false };
      if (lich && lich.size > 1) moHo = true;

      const kh = theoMaKhach.get(docChuoiO(hauKy["Mã KH"]));
      if (kh && kh.length === 1 && !moHo) return { ten: kh[0]!, nguon: "khach_hang", moHo: false };
      if (kh && kh.length > 1) moHo = true;

      return { ten: null, nguon: null, moHo };
    },
  };
}
