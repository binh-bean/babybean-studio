/**
 * BB-331 — khi nào được XOÁ HẲN một chi nhánh.
 *
 * Anh: màn Chi nhánh không có nút xoá. Chỉ cho xoá chi nhánh "rỗng" — không
 * bộ ảnh, không nhân sự. Còn dữ liệu gắn vào thì nói rõ vì sao không xoá được
 * và mời "Ngừng hoạt động" thay thế (lịch sử vẫn giữ).
 *
 * Ngoài bộ ảnh và nhân sự, bảng `customers`, `shoots`, `deliveries`,
 * `packages`, `products` cũng trỏ vào chi nhánh bằng khoá ngoại KHÔNG cascade
 * — còn dòng nào thì Postgres sẽ từ chối, nên chặn trước và nói bằng lời.
 * `activity_logs`, `notifications`, `settings` thì route tự gỡ/xoá (nhật ký
 * giữ lại, chỉ bỏ liên kết chi nhánh).
 */
export interface DemGanChiNhanh {
  galleries: number;
  staff: number;
  customers?: number;
  shoots?: number;
  deliveries?: number;
  packages?: number;
  products?: number;
}

const NHAN: Record<keyof DemGanChiNhanh, string> = {
  galleries: "bộ ảnh",
  staff: "nhân sự",
  customers: "khách",
  shoots: "buổi chụp",
  deliveries: "lượt giao",
  packages: "gói chụp",
  products: "sản phẩm",
};

/** `null` = xoá được. Ngược lại là câu giải thích cho nhân viên. */
export function lyDoKhongXoaChiNhanh(dem: DemGanChiNhanh): string | null {
  const con = (Object.keys(NHAN) as (keyof DemGanChiNhanh)[])
    .filter((k) => (dem[k] ?? 0) > 0)
    .map((k) => `${dem[k]} ${NHAN[k]}`);
  if (con.length === 0) return null;
  return `Chi nhánh còn ${con.join(", ")} nên không xoá được. Hãy chọn “Ngừng hoạt động” — lịch sử vẫn giữ nguyên.`;
}
