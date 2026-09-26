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
  if (status === "approved") return "tien-do-duyet";
  
  if (status === "ready" || status === "in_review") return null;

  return null;
}

/**
 * BB-258 — chủ studio 26/09/2026: tranh minh hoạ hành trình đang là ảnh
 * VUÔNG 1:1 nhét vào ô 160×160/180×180 CĂN GIỮA thẻ (`object-contain`) — nhìn
 * như một ô vuông nổi lên giữa thẻ, lộ viền/nền khác màu, "cực không tinh
 * tế". Chủ studio đang nhờ vẽ lại bản NGANG 16:9 tràn hết bề rộng thẻ cho
 * TỪNG tranh; tranh nào có bản ngang thì liệt kê tên (đúng `TenTranh`) vào
 * đây — CHƯA vẽ xong tranh nào nên để RỖNG, Opus điền dần khi tranh về.
 *
 * CỐ Ý không kiểm tệp có tồn tại thật lúc chạy (không fetch HEAD): danh sách
 * này là nguồn sự thật duy nhất, đúng tinh thần "cổng kiểm đọc kết quả, không
 * đọc lời hứa" — nhưng ở đây lời hứa chính LÀ danh sách do người vẽ tranh xác
 * nhận, không phải một giả định code tự suy luận.
 *
 * 26/09/2026 — đủ 10/10 tranh (tỉ lệ 1376×768, đồ vật nằm trong 60% giữa
 * khung, hai mép trống nên `object-position: center` là đủ, không cần chỉnh
 * theo từng tranh).
 */
export const CO_BAN_NGANG: Set<TenTranh> = new Set([
  "tien-do-chon-anh",
  "tien-do-ghi-nhan",
  "tien-do-chinh-sua",
  "tien-do-duyet",
  "tien-do-in",
  "tien-do-da-ve",
  "tien-do-da-giao",
  "chot-thanh-cong",
  "link-het-han",
  "chua-co-anh",
]);

export interface AnhHanhTrinh {
  /** true = có bản ngang 16:9 tràn khung; false = dùng bản vuông 1:1 cũ. */
  ngang: boolean;
  src: string;
  srcSet: string;
}

/**
 * Đường dẫn ảnh cho khung tràn (full-bleed) ở đầu thẻ hành trình.
 * - Có trong `CO_BAN_NGANG` → dùng `ngang-<tên>-{640,1280}.webp`.
 * - Chưa có → dùng bản vuông `<tên>-{320,640}.webp` hiện có, vẫn object-cover
 *   được (ảnh vuông bị cắt trên/dưới khi nhét vào khung ngang, chấp nhận
 *   được — không còn lộ viền vì không còn `object-contain`/nền hở nữa).
 */
export function anhHanhTrinh(ten: TenTranh): AnhHanhTrinh {
  if (CO_BAN_NGANG.has(ten)) {
    return {
      ngang: true,
      src: `/hanh-trinh/ngang-${ten}-1280.webp`,
      srcSet: `/hanh-trinh/ngang-${ten}-640.webp 640w, /hanh-trinh/ngang-${ten}-1280.webp 1280w`,
    };
  }
  return {
    ngang: false,
    src: `/hanh-trinh/${ten}-640.webp`,
    srcSet: `/hanh-trinh/${ten}-320.webp 320w, /hanh-trinh/${ten}-640.webp 640w`,
  };
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
  } else if (status === "approved") {
    hienTai = 2;
  } else if (status === "ready" || status === "in_review") {
    hienTai = 0;
  }

  return { buoc, hienTai };
}
