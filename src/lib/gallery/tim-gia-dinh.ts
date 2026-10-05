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
  /**
   * Cú chạm CHƯA được máy chủ xác nhận (hàng chờ trong trình duyệt). Thả tim rồi
   * tải lại / đóng tab ngay thì lượt POST có thể bị huỷ giữa đường hoặc chưa
   * ghi xong: máy chủ chưa có tấm đó, nên nếu chỉ tin máy chủ thì tim MẤT
   * (e2e bb-338 "2c" bắt được, 05/10). Hàng chờ thắng máy chủ cho đúng những
   * tấm này, và được gửi lại.
   */
  choGui?: { them: readonly string[]; bo: readonly string[] };
}): { hienThi: string[]; canDua: string[]; canBo: string[] } {
  const server = Array.from(new Set(input.server));
  const coTrenServer = new Set(server);
  const choThem = Array.from(new Set(input.choGui?.them ?? []));
  const choBo = new Set(input.choGui?.bo ?? []);

  if (input.daDua) {
    const canDua = choThem.filter((id) => !coTrenServer.has(id) && !choBo.has(id));
    const canBo = [...choBo].filter((id) => coTrenServer.has(id));
    const hienThi = [...server.filter((id) => !choBo.has(id)), ...canDua];
    return { hienThi, canDua, canBo };
  }
  const canDua = Array.from(new Set([...input.local, ...choThem])).filter(
    (id) => !coTrenServer.has(id) && !choBo.has(id),
  );
  const canBo = [...choBo].filter((id) => coTrenServer.has(id));
  return { hienThi: [...server.filter((id) => !choBo.has(id)), ...canDua], canDua, canBo };
}

/** Khoá hàng chờ cú chạm tim chưa được máy chủ xác nhận (BB-334A, vá BB-345). */
export function khoaTimChoGui(galleryId: string): string {
  return `bb-tim-nguoi-xem-cho-gui:${galleryId}`;
}

/** Ghi một cú chạm vào hàng chờ: tấm nằm ở đúng MỘT phía (thêm hoặc bỏ). */
export function ghiChoGui(
  cu: { them: readonly string[]; bo: readonly string[] },
  photoId: string,
  them: boolean,
): { them: string[]; bo: string[] } {
  const t = cu.them.filter((x) => x !== photoId);
  const b = cu.bo.filter((x) => x !== photoId);
  return them ? { them: [...t, photoId], bo: b } : { them: t, bo: [...b, photoId] };
}

/** Máy chủ đã trả lời (nhận hoặc từ chối) cho tấm này → bỏ khỏi hàng chờ. */
export function xoaChoGui(
  cu: { them: readonly string[]; bo: readonly string[] },
  photoIds: readonly string[],
): { them: string[]; bo: string[] } {
  const s = new Set(photoIds);
  return { them: cu.them.filter((x) => !s.has(x)), bo: cu.bo.filter((x) => !s.has(x)) };
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
