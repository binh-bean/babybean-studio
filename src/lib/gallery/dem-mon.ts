/**
 * BB-358 (người chấm vòng 8, A4) — MỘT luật đếm cho giỏ mua thêm và hộp chốt.
 *
 * Trước đây cùng một giỏ được đếm ba kiểu: thẻ sản phẩm "Trong giỏ · 6" (cộng
 * số lượng), viên giỏ "4 món" (đếm dòng), hộp chốt "Mua thêm 1 món" (đếm dòng
 * của một bản khác) — và dòng "Còn 4 sản phẩm in chưa có ảnh" đếm luôn album
 * trong gói đang thiếu bìa, tức album bị nhắc HAI lần (một lần ở dòng "chọn ảnh
 * bìa" ngay trên).
 *
 * Luật duy nhất:
 *   1. "món" = một đơn vị sản phẩm = CỘNG SỐ LƯỢNG của các dòng (×3 là 3 món),
 *      không đếm số dòng. Thẻ sản phẩm, viên giỏ, huy hiệu túi, hộp chốt và màn
 *      cảm ơn đều đọc `demMon`.
 *   2. Album trong gói chưa có bìa chỉ được nhắc ở dòng "chọn ảnh bìa"; dòng
 *      "món in chưa có ảnh" không đếm nó (`demMonInChuaAnhHienThi`).
 *   3. "tấm" là đơn vị của ẢNH (ảnh trong gói, ảnh chọn thêm), không phải của món.
 */

export interface DongCoSoLuong {
  quantity: number;
}

/** Tổng số món của các dòng (cộng số lượng, bỏ số âm/hỏng). */
export function demMon(dong: ReadonlyArray<DongCoSoLuong>): number {
  return dong.reduce((n, d) => n + (Number.isFinite(d.quantity) ? Math.max(0, Math.trunc(d.quantity)) : 0), 0);
}

/** Số món của MỘT sản phẩm trong giỏ — cùng luật `demMon`. */
export function demMonCuaSanPham(dong: ReadonlyArray<DongCoSoLuong & { productId: string }>, productId: string): number {
  return demMon(dong.filter((d) => d.productId === productId));
}

/**
 * Số "món in chưa có ảnh" để HIỆN cho ba mẹ trong hộp chốt.
 *
 * `soMayChuDem` là số máy chủ đếm (`demSanPhamInChuaAnh`): gồm suất in/khung
 * trong gói chưa xếp đủ, hàng mua thêm chưa có ảnh, VÀ album trong gói chưa có
 * tấm nào (đúng = album chưa có bìa). Số máy chủ vẫn quyết ô tick bắt buộc;
 * chỉ câu hiện ra trừ album đang thiếu bìa — album đó đã có dòng nhắc riêng.
 */
export function demMonInChuaAnhHienThi(
  soMayChuDem: number,
  albumThieuBia: ReadonlyArray<DongCoSoLuong>,
): number {
  const soAlbum = demMon(albumThieuBia);
  return Math.max(0, Math.max(0, Math.trunc(soMayChuDem)) - soAlbum);
}
