/**
 * BB-369 (chủ studio 06/10/2026, ảnh fe05fc22): thuật sĩ "Tạo bộ ảnh mới" đã tra
 * được dòng Hậu Kỳ trên Lark mà vẫn bắt chọn tay Chi nhánh và Photo. Dòng Lark
 * có sẵn hai thứ đó — ô "Chi Nhánh" và cột "photo" (người chụp).
 *
 * Hàm THUẦN: từ chữ trên Lark → id chi nhánh + id nhân sự trong app. Không khớp
 * chắc chắn thì trả null (KHÔNG đoán người đầu tiên) — thuật sĩ để nhân viên
 * chọn tay.
 */
import { khopChiNhanh } from "@/lib/lark/ban-ghi-moi";

export interface NguoiChupLuaChon {
  id: string;
  name: string;
  /** Rỗng = mọi chi nhánh. */
  branchIds: string[];
}

export interface GoiYTaoBo {
  /** Chi nhánh khớp ô "Chi Nhánh" của Lark; null khi Lark trống / không khớp. */
  branchId: string | null;
  /** Người chụp khớp cột "photo" của Lark; null khi Lark trống / không khớp. */
  photographerId: string | null;
  /** Chữ trên Lark, để thuật sĩ nói rõ "Lark ghi: …" khi không khớp. */
  chiNhanhLark: string;
  photoLark: string | null;
}

function boDau(x: string): string {
  return x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Tên trên Lark → nhân sự. Lark có thể ghi nhiều người ("A, B") — lấy người
 * ĐẦU. Khớp trùng tên (bỏ dấu, không phân biệt hoa thường) trước; không có thì
 * khớp chứa-nhau nhưng chỉ khi DUY NHẤT một người khớp.
 */
export function khopNguoiChup(
  photoLark: string | null,
  branchId: string | null,
  ds: NguoiChupLuaChon[],
): string | null {
  const ten = boDau((photoLark ?? "").split(",")[0] ?? "");
  if (!ten) return null;
  const trongChiNhanh = ds.filter((p) => !branchId || p.branchIds.length === 0 || p.branchIds.includes(branchId));
  const trung = trongChiNhanh.filter((p) => boDau(p.name) === ten);
  if (trung.length === 1) return trung[0]!.id;
  if (trung.length > 1) return null;
  const chua = trongChiNhanh.filter((p) => {
    const n = boDau(p.name);
    return n.length >= 2 && (n.includes(ten) || ten.includes(n));
  });
  return chua.length === 1 ? chua[0]!.id : null;
}

export function goiYTuDongLark(
  dong: { chiNhanh: string; photo: string | null },
  branches: { id: string; code: string; name: string }[],
  nguoiChup: NguoiChupLuaChon[],
): GoiYTaoBo {
  const branchId = khopChiNhanh(dong.chiNhanh, branches);
  return {
    branchId,
    photographerId: khopNguoiChup(dong.photo, branchId, nguoiChup),
    chiNhanhLark: dong.chiNhanh,
    photoLark: dong.photo,
  };
}
