export type TenTranh =
  | "tien-do-chon-anh"
  | "chot-thanh-cong"
  | "tien-do-ghi-nhan"
  | "tien-do-chinh-sua"
  | "tien-do-duyet"
  | "tien-do-in"
  | "tien-do-da-ve"
  | "tien-do-da-giao"
  | "chua-co-anh"
  | "link-het-han";

/**
 * Ánh xạ trạng thái bộ ảnh sang tên tranh hành trình.
 */
export function tranhHanhTrinh(status: string, giaiDoan: number | null, photoCount: number = -1): TenTranh | null {
  if (photoCount === 0) return "chua-co-anh";
  
  if (status === "awaiting_approval") return "tien-do-duyet";
  if (status === "delivered") return "tien-do-da-giao";
  
  if (giaiDoan === 2) return "tien-do-ghi-nhan";
  if (giaiDoan === 3 || giaiDoan === 4 || giaiDoan === 6) return "tien-do-chinh-sua";
  if (giaiDoan === 5 || giaiDoan === 7) return "tien-do-duyet";
  if (giaiDoan === 8) return "tien-do-in";
  if (giaiDoan === 9) return "tien-do-da-ve";
  if (giaiDoan === 10 || giaiDoan === 11) return "tien-do-da-giao";

  if (status === "submitted") return "chot-thanh-cong";
  if (status === "in_retouch") return "tien-do-chinh-sua";
  
  if (status === "ready" || status === "in_review") return null;

  return null;
}

export interface HanhTrinhInfo {
  buoc: string[];
  hienTai: number;
}

/**
 * Trả về danh sách 5 bước và vị trí hiện tại (0-4).
 * Lưu ý: nếu không in thì từ Duyệt (2) nhảy thẳng lên Nhận ảnh (4), đây là hành vi thiết kế có chủ ý.
 */
export function buocHanhTrinh(status: string, giaiDoan: number | null): HanhTrinhInfo {
  const buoc = ["Chọn ảnh", "Chỉnh sửa", "Duyệt", "In", "Nhận ảnh"];
  let hienTai = 0;

  if (status === "awaiting_approval") {
    hienTai = 2;
  } else if (status === "delivered") {
    hienTai = 4;
  } else if (giaiDoan != null) {
    if (giaiDoan <= 4 || giaiDoan === 6) hienTai = 1;
    else if (giaiDoan === 5 || giaiDoan === 7) hienTai = 2;
    else if (giaiDoan === 8) hienTai = 3;
    else if (giaiDoan >= 9) hienTai = 4;
  } else if (status === "submitted") {
    hienTai = 1; 
  } else if (status === "in_retouch") {
    hienTai = 1;
  } else if (status === "ready" || status === "in_review") {
    hienTai = 0;
  }

  return { buoc, hienTai };
}
