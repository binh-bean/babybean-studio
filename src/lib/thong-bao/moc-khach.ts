/**
 * BB-347 — hai mốc báo ba mẹ (chuông + đẩy) khi cột "Trạng Thái" bên Lark đổi,
 * ngoài mốc "Hình đã về" đã có từ BB-250/252. HÀM THUẦN, không gọi mạng, không
 * `server-only` (phần gửi nằm ở bao-moc-khach.ts).
 *
 * Chủ studio chốt 01/10/2026 — đúng BA mốc, KHÔNG báo "Đã giao":
 *   1. "Đã xác nhận danh sách" — Lark sang "Đã chọn hình". Đây là ca CSKH xác
 *      nhận bên Lark thay vì trong app.
 *   2. "Đang chỉnh sửa"        — Lark sang "Đang làm".
 *   3. "Hình đã về"            — đã có (baoHinhDaVe), giữ nguyên.
 *
 * Giọng Bean: xưng "Bean", gọi "ba mẹ", câu nào cũng kết bằng "ạ".
 */
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";

export type MocBaoKhach = "da_xac_nhan_danh_sach" | "dang_chinh_sua";

/** Giai đoạn Lark mà mỗi mốc bắt đầu (trang-thai-hau-ky.ts). */
const GIAI_DOAN_MOC: Record<MocBaoKhach, number> = {
  da_xac_nhan_danh_sach: 2, // "Đã chọn hình"
  dang_chinh_sua: 3, // "Đang làm"
};

export const NOI_DUNG_MOC: Record<MocBaoKhach, { tieuDe: string; noiDung: string }> = {
  da_xac_nhan_danh_sach: {
    tieuDe: "Bean đã xác nhận danh sách ảnh ạ",
    noiDung: "Bean đã nhận danh sách ảnh ba mẹ chọn và sẽ xếp lịch chỉnh sửa cho bé ạ.",
  },
  dang_chinh_sua: {
    tieuDe: "Bean đang chỉnh ảnh của bé ạ!",
    noiDung: "Ảnh của bé đã vào khâu chỉnh sửa, xong Bean sẽ báo ba mẹ vào duyệt ngay ạ.",
  },
};

/**
 * Cột `thong_bao_khach.loai` đã có nghĩa là mốc này ĐÃ báo rồi (hoặc app đã báo
 * thay). Chống báo lặp khi Lark đi lùi rồi tiến lại, và khi app đã tự gửi tin
 * xác nhận (BB-321: `dot_chon_xac_nhan`).
 */
export const LOAI_DA_BAO: Record<MocBaoKhach, string[]> = {
  da_xac_nhan_danh_sach: ["da_xac_nhan_danh_sach", "dot_chon_xac_nhan"],
  dang_chinh_sua: ["dang_chinh_sua"],
};

/**
 * Đổi trạng thái Lark này có phải một mốc cần báo ba mẹ không (ngoài "Hình đã
 * về"). Chỉ báo khi CHUYỂN TIẾN từ giai đoạn app đã biết, vào đúng giai đoạn
 * của mốc:
 *   - `maCu = null` là lần đầu app đọc bộ đó — có thể nó đã ở đó từ lâu; báo
 *     lúc này là lặp vụ nhắc ồ ạt ngày đầu BB-200 (cùng luật `vuaSangHinhDaVe`).
 *   - Bộ đã `delivered` thì ba mẹ đã cầm ảnh, không báo.
 *   - Nhảy cóc (vd 1 → 3) chỉ báo mốc đích, không bù mốc đã bỏ qua.
 */
export function mocCanBaoKhach(d: {
  maCu: string | null;
  maMoi: string | null;
  trangThaiApp: string;
}): MocBaoKhach | null {
  // BB-402 — ba mẹ đã DUYỆT ảnh chỉnh trong app (`approved`): "đã xác nhận danh sách" /
  // "đang chỉnh ảnh" là tin CŨ hơn điều ba mẹ đang thấy (Lark đổi trễ) — không báo lùi.
  if (d.trangThaiApp === "delivered" || d.trangThaiApp === "approved") return null;
  const cu = giaiDoanCua(d.maCu);
  const moi = giaiDoanCua(d.maMoi);
  if (cu === null || moi === null) return null;
  for (const moc of Object.keys(GIAI_DOAN_MOC) as MocBaoKhach[]) {
    const gd = GIAI_DOAN_MOC[moc];
    if (cu < gd && moi === gd) return moc;
  }
  return null;
}
