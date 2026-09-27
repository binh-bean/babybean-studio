/**
 * BB-279 — dựng "bộ cấu hình" của cửa hàng: nhóm → kích thước → chất liệu →
 * đúng MỘT sản phẩm, thay vì bày 69 thẻ sản phẩm tràn lan.
 *
 * OWNER: DEV-FE. Chủ studio 27/09/2026:
 *
 *     "danh mục quá tràn lan tôi muốn tối giản chuẩn thiết kế chọn kích
 *      thước chất liệu số lượng ra tiền và chọn ảnh"
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách riêng hàm thuần, không viết thẳng trong `cua-hang.tsx`
 * ---------------------------------------------------------------------------
 * Bốn hàm dưới đây không đụng DOM, không đụng React — chỉ đọc mảng danh mục
 * (`gallery.addons.catalogue`, đã có sẵn từ BB-105) và trả về danh sách/1 sản
 * phẩm. Tách riêng để phép thử đơn vị canh đúng LOGIC XẾP TẦNG (nhóm → size →
 * chất liệu → sản phẩm), không phải canh có bấm được nút hay không — bấm được
 * hay không là việc của phép thử e2e.
 *
 * ---------------------------------------------------------------------------
 * Quy tắc khi một tổ hợp khớp NHIỀU sản phẩm
 * ---------------------------------------------------------------------------
 * Dữ liệu `products` đồng bộ từ Lark, tay người nhập có thể trùng tên/chất
 * liệu/kích thước. `chonSanPham()` xử lý rõ ràng: chọn sản phẩm GIÁ THẤP NHẤT
 * trong các ứng viên khớp — không bao giờ vô tình bán đắt hơn giá niêm yết
 * thấp nhất đang mở bán cho đúng tổ hợp đó. Trùng giá thì chọn theo
 * `productId` nhỏ hơn (so sánh chuỗi), để kết quả ổn định qua nhiều lần tải
 * lại thay vì phụ thuộc thứ tự trả về của Postgres.
 */

import { THU_TU_NHOM, type NhomSanPham } from "./nhom-san-pham";

export interface SanPhamCuaHang {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
  canGanAnh: boolean;
}

/** Chỉ các nhóm ĐANG CÓ ít nhất một sản phẩm, theo đúng thứ tự bày ra. */
export function nhomCoHang(danhMuc: SanPhamCuaHang[]): NhomSanPham[] {
  return THU_TU_NHOM.filter((nhom) => danhMuc.some((sp) => sp.nhom === nhom));
}

/**
 * Kích thước có hàng trong một nhóm, không trùng lặp, theo thứ tự xuất hiện
 * trong danh mục (danh mục đã được máy chủ sắp theo thứ tự bán chạy/tên).
 *
 * Sản phẩm không khai `size` (vd. một số dòng album) bị bỏ khỏi danh sách —
 * bước "Kích thước" coi như KHÔNG TỒN TẠI cho nhóm đó (đề bài: "size/material
 * rỗng thì ẩn bước đó"), xử lý ở tầng gọi bằng cách kiểm `.length === 0`.
 */
export function kichThuocCuaNhom(danhMuc: SanPhamCuaHang[], nhom: NhomSanPham): string[] {
  const daThay = new Set<string>();
  const ds: string[] = [];
  for (const sp of danhMuc) {
    if (sp.nhom !== nhom) continue;
    const kt = sp.size?.trim();
    if (!kt || daThay.has(kt)) continue;
    daThay.add(kt);
    ds.push(kt);
  }
  return ds;
}

/**
 * Chất liệu có hàng trong một nhóm, LỌC THEO kích thước đã chọn.
 *
 * `size = null` nghĩa là nhóm không có bước chọn kích thước (xem
 * `kichThuocCuaNhom`) — khi đó so khớp mọi sản phẩm của nhóm, không lọc theo
 * size.
 */
export function chatLieuTheoKichThuoc(
  danhMuc: SanPhamCuaHang[],
  nhom: NhomSanPham,
  size: string | null,
): string[] {
  const daThay = new Set<string>();
  const ds: string[] = [];
  for (const sp of danhMuc) {
    if (sp.nhom !== nhom) continue;
    if (size !== null && (sp.size?.trim() || null) !== size) continue;
    const cl = sp.material?.trim();
    if (!cl || daThay.has(cl)) continue;
    daThay.add(cl);
    ds.push(cl);
  }
  return ds;
}

/**
 * Tổ hợp nhóm + kích thước + chất liệu → đúng MỘT sản phẩm (hoặc `null` nếu
 * tổ hợp đó chưa từng bán).
 *
 * `size`/`material` truyền `null` nghĩa là bước đó không tồn tại cho nhóm này
 * (xem hai hàm ở trên) — so khớp sản phẩm KHÔNG khai trường tương ứng.
 */
export function chonSanPham(
  danhMuc: SanPhamCuaHang[],
  nhom: NhomSanPham,
  size: string | null,
  material: string | null,
): SanPhamCuaHang | null {
  const ungVien = danhMuc.filter((sp) => {
    if (sp.nhom !== nhom) return false;
    const spSize = sp.size?.trim() || null;
    const spMaterial = sp.material?.trim() || null;
    if (size === null ? spSize !== null : spSize !== size) return false;
    if (material === null ? spMaterial !== null : spMaterial !== material) return false;
    return true;
  });
  if (ungVien.length === 0) return null;

  const sapXep = ungVien.slice().sort((a, b) => {
    if (a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
    return a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0;
  });
  return sapXep[0] ?? null;
}
