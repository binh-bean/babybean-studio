/**
 * BB-369 — phần thuần, dùng được ở trình duyệt (màn chi tiết bộ ảnh): dòng hiển
 * thị người chỉnh sửa. Phần đọc/ghi cơ sở dữ liệu ở nguoi-chinh-sua-lark.ts.
 */
export interface NguoiChinhSua {
  nguoiPhotoshop: string | null;
  photoshopCtv: string | null;
}

/** "Chỉnh sửa: A · CTV B" — null khi Lark chưa ghi ai. */
export function nhanNguoiChinhSua(n: NguoiChinhSua): string | null {
  const ds = [n.nguoiPhotoshop, n.photoshopCtv ? `CTV ${n.photoshopCtv}` : null].filter(Boolean);
  return ds.length ? `Chỉnh sửa: ${ds.join(" · ")}` : null;
}
