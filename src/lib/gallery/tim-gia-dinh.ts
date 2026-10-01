/**
 * BB-345 — tim của gia đình (link "Mời gia đình", vai viewer) và "Đặt chỉnh sửa".
 *
 * Tệp này là HÀM THUẦN, dùng được ở cả trình duyệt lẫn máy chủ. Phần chạm cơ
 * sở dữ liệu nằm ở `tim-gia-dinh-server.ts`.
 *
 * Luật (anh 01/10/2026 — "thêm tim cho màn mời để tối ưu doanh thu chỉnh sửa"):
 *   · Tim của gia đình KHÔNG phải danh sách trong gói. Danh sách đó do ba mẹ
 *     quyết; tim chỉ là gợi ý cho ba mẹ và là đầu mối doanh thu chỉnh sửa.
 *   · Giá tạm tính = số tấm × giá ảnh thêm của bộ ảnh (`galleries.extra_photo_price`,
 *     mặc định lấy từ cài đặt `gallery.extra_photo_price_default` lúc tạo bộ).
 *     Không bịa giá riêng.
 */

/** Số tấm tối đa một lượt gửi / một yêu cầu chỉnh sửa — khớp check của 0083. */
export const TOI_DA_ANH_CHINH_SUA = 500;

/** Khoá localStorage của BB-338 — giữ nguyên để tim cũ trên máy khách không mất. */
export function khoaTimNguoiXem(galleryId: string): string {
  return `bb-tim-nguoi-xem:${galleryId}`;
}

/** Cờ "đã đưa tim cũ lên máy chủ" — sau lần đầu, máy chủ là nguồn thật. */
export function khoaDaDuaTim(galleryId: string): string {
  return `bb-tim-nguoi-xem-da-dua:${galleryId}`;
}

/**
 * Lần đầu máy chủ có bảng tim: gộp tim cũ trong trình duyệt (BB-338) với tim
 * trên máy chủ, và nói tấm nào cần gửi lên.
 *
 * Sau khi đã đưa (`daDua`), máy chủ là nguồn thật — tim bỏ ở máy khác không
 * được máy này "hồi sinh" từ bộ nhớ đệm cũ.
 */
export function gopTimLanDau(input: {
  local: readonly string[];
  server: readonly string[];
  daDua: boolean;
}): { hienThi: string[]; canDua: string[] } {
  const server = Array.from(new Set(input.server));
  if (input.daDua) return { hienThi: server, canDua: [] };
  const coTrenServer = new Set(server);
  const canDua = Array.from(new Set(input.local)).filter((id) => !coTrenServer.has(id));
  return { hienThi: [...server, ...canDua], canDua };
}

/** Tạm tính một yêu cầu chỉnh sửa. Giá thiếu/âm/không phải số → 0 (CSKH báo giá). */
export function tinhTamTinh(soAnh: number, donGia: number | string | null | undefined): {
  donGia: number;
  tamTinh: number;
} {
  const gia = Number(donGia);
  const g = Number.isFinite(gia) && gia > 0 ? Math.round(gia) : 0;
  const n = Number.isFinite(soAnh) && soAnh > 0 ? Math.floor(soAnh) : 0;
  return { donGia: g, tamTinh: g * n };
}

/** Câu Bean báo đã nhận — giọng Bean, kết thúc bằng "ạ". */
export function cauDaNhanChinhSua(soAnh: number): string {
  return `Bean đã nhận yêu cầu chỉnh sửa ${soAnh} tấm của gia đình ạ!`;
}

/** Chữ ghi vào `yeu_cau_mua_them.ghi_chu` để CSKH đọc ngay ở mọi chỗ cũ. */
export function ghiChuDatChinhSua(soAnh: number, ghiChuKhach: string | null | undefined): string {
  const dau = `Đặt chỉnh sửa ${soAnh} tấm gia đình thả tim`;
  const them = (ghiChuKhach ?? "").trim();
  return (them ? `${dau} — ${them}` : dau).slice(0, 500);
}
