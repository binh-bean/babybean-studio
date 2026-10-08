import { trangThaiKhach, type MaTrangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";
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
 * BB-402 — tranh + bước của thẻ hành trình ĐỌC TỪ `trangThaiKhach()` (cùng hàm của
 * bìa, tiêu đề thẻ, màn quản trị qua `trangThaiBoAnh`), không tự suy lại từ
 * status/giai đoạn như trước.
 *
 * Lỗi anh báo 08/10: hai bảng tự suy riêng lệch nhau — `approved` (ba mẹ đã duyệt,
 * chờ in) rơi vào tranh "duyệt" + bước "Duyệt ảnh", Lark "Đã chốt chưa in" (GĐ7)
 * cũng thế, trong khi `trangThaiKhach` nói "Ảnh đã chốt, Bean đang chuẩn bị in"
 * (bước "In & giao"). Nay một bảng theo MÃ trạng thái, đọc một lần.
 */
const HANH_TRINH_THEO_MA: Record<MaTrangThaiBoAnh, { buoc: number; tranh: TenTranh | null }> = {
  moi_nhap: { buoc: 0, tranh: null },
  dang_tai: { buoc: 0, tranh: null },
  loi_tai: { buoc: 0, tranh: null },
  cho_tao_link: { buoc: 0, tranh: null },
  san_sang: { buoc: 0, tranh: null },
  cho_khach_chon: { buoc: 0, tranh: null },
  cho_studio_xac_nhan: { buoc: 0, tranh: "chot-thanh-cong" },
  da_chon_hinh: { buoc: 1, tranh: "tien-do-ghi-nhan" },
  dang_chinh_sua: { buoc: 2, tranh: "tien-do-chinh-sua" },
  leader_kiem: { buoc: 2, tranh: "tien-do-chinh-sua" },
  cho_khach_duyet: { buoc: 3, tranh: "tien-do-duyet" },
  // Ba mẹ đã xin sửa: thợ đang làm lại — thanh ở "Đang chỉnh" (như trước BB-402).
  dang_sua_theo_yeu_cau: { buoc: 2, tranh: "tien-do-chinh-sua" },
  da_chot_cho_in: { buoc: 4, tranh: "tien-do-in" },
  dang_in: { buoc: 4, tranh: "tien-do-in" },
  hinh_da_ve: { buoc: 4, tranh: "tien-do-da-ve" },
  da_giao: { buoc: 4, tranh: "tien-do-da-giao" },
  da_cham_soc: { buoc: 4, tranh: "tien-do-da-giao" },
  het_han: { buoc: 0, tranh: null },
  luu_tru: { buoc: 0, tranh: null },
};

/**
 * Ánh xạ trạng thái bộ ảnh sang tên tranh hành trình.
 */
export function tranhHanhTrinh(status: string, giaiDoan: number | null, photoCount: number = -1): TenTranh | null {
  if (photoCount === 0) return "chua-co-anh";
  return HANH_TRINH_THEO_MA[trangThaiKhach(status, giaiDoan).ma].tranh;
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
  return { buoc: [...BUOC_HANH_TRINH], hienTai: HANH_TRINH_THEO_MA[trangThaiKhach(status, giaiDoan).ma].buoc };
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
