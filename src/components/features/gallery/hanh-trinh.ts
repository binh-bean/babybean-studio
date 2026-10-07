import { trangThaiKhach } from "@/lib/lark/trang-thai-app-lark";
import type { KhoiVungDuyet } from "@/lib/anh-chinh-sua/vong-duyet";
import { vi } from "@/i18n/vi";

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
/**
 * BB-329 mục 1 — chủ studio 30/09/2026 (ảnh 2189fc61): ba mẹ vừa bấm Xác nhận,
 * CSKH CHƯA xác nhận, mà thanh tiến độ đã nhảy sang "Đang chỉnh". Sai hai chỗ:
 *   · `submitted` từng rơi vào bước 1 "Đang chỉnh" — phải là "Chờ xác nhận".
 *   · CSKH đã xác nhận nhưng Lark còn "Đã chọn hình" (giai đoạn 2 — bộ ảnh
 *     XẾP HÀNG, chưa ai chỉnh) cũng rơi vào "Đang chỉnh" (`giaiDoan <= 4`).
 *     Luật docs/19 mục 3 (và `nhanHienThi`): chỉ "Đang chỉnh" khi Lark sang
 *     "Đang làm" (giai đoạn 3) trở đi.
 * Nay 5 bước: Chờ xác nhận → Chờ chỉnh → Đang chỉnh → Duyệt ảnh → In/nhận ảnh.
 * "Đã giao" không còn là một bước: từ BB-298 thẻ này KHÔNG hiện khi đã giao
 * (bìa tự báo "Đã hoàn thiện").
 */
export const BUOC_HANH_TRINH = ["Chờ xác nhận", "Chờ chỉnh", "Đang chỉnh", "Duyệt ảnh", "In/nhận ảnh"] as const;

export function buocHanhTrinh(status: string, giaiDoan: number | null): HanhTrinhInfo {
  const buoc = [...BUOC_HANH_TRINH];
  let hienTai = 0;

  if (status === "awaiting_approval") {
    hienTai = 3;
  } else if (status === "delivered") {
    hienTai = 4;
  } else if (giaiDoan != null) {
    // Máy chủ (`nhanHienThi`) chỉ gửi giai đoạn khi CSKH đã xác nhận hoặc Lark
    // đã sang "Đã chọn hình" trở lên; giai đoạn 1 ("Đã gửi file gốc") coi như 2.
    if (giaiDoan <= 2) hienTai = 1;
    else if (giaiDoan === 3 || giaiDoan === 4 || giaiDoan === 6) hienTai = 2;
    else if (giaiDoan === 5 || giaiDoan === 7) hienTai = 3;
    else hienTai = 4;
  } else if (status === "submitted") {
    hienTai = 0;
  } else if (status === "in_retouch") {
    // CSKH đã xác nhận, chưa có tin Lark "Đang làm" → đang xếp hàng.
    hienTai = 1;
  } else if (status === "approved") {
    hienTai = 3;
  }

  return { buoc, hienTai };
}

/**
 * BB-386 — tiêu đề thẻ hành trình. Bước "Duyệt ảnh" mà app CHƯA có ảnh chỉnh
 * (`khoiVungDuyet` = "dang_chuan_bi", BB-384) thì thẻ nói CÙNG lời Bean với vùng
 * duyệt ("Bean đang chuẩn bị ảnh…"), không "Ảnh đã chỉnh xong, mời ba mẹ duyệt".
 * Luật quyết định nằm ở `khoiVungDuyet`; đây chỉ chọn chữ theo kết quả của nó.
 */
export function nhanTheHanhTrinh(status: string, giaiDoan: number | null, khoiDuyet?: KhoiVungDuyet): string {
  if (khoiDuyet === "dang_chuan_bi") return vi.gallery.anhChinh.chuanBiTieuDe;
  return trangThaiKhach(status, giaiDoan).khach;
}
