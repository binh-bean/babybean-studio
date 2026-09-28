/**
 * BB-303 — khối "Mua thêm · 7 ngày qua" + "Theo chi nhánh" của Bảng điều
 * khiển, theo bản vẽ BB-301 (`bang-dieu-khien.html`, admin duyệt 28/09/2026).
 *
 * OWNER: DEV-FE (`src/lib/utils/**`) — tách khỏi route API để phép thử canh
 * được đúng phần TÍNH TOÁN bằng dữ liệu truyền tay, không cần Supabase giả
 * (AGENTS.md §5a).
 *
 * ---------------------------------------------------------------------------
 * Nguồn "tiền mua thêm" — CÙNG ĐỊNH NGHĨA với báo cáo "Doanh thu phát sinh"
 * ---------------------------------------------------------------------------
 * `src/lib/bao-cao/cac-bao-cao/doanh-thu-phat-sinh.ts` đã định nghĩa "tiền
 * mua thêm lúc chọn" = tổng `quantity * unit_price` của `selection_addons`
 * gắn với các lượt CHỌN CHÍNH (`is_primary`) đã CHỐT (`submitted_at` khớp kỳ).
 * Khối này dùng lại ĐÚNG định nghĩa đó (route API truyền các dòng addon đã
 * lọc theo cùng luật), chỉ thêm chiều nhóm theo NGÀY/CHI NHÁNH/NHÓM SẢN PHẨM
 * mà báo cáo kia chưa cần.
 */

import { nhomSanPham, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";

/** Thứ tự hiện + màu của bản vẽ: Ảnh in (mực) · Khung ảnh (rêu) · Album (hồng) — KHÁC thứ tự bày hàng cho khách (THU_TU_NHOM ở nhom-san-pham.ts). */
export const THU_TU_HIEN_THI_MUA_THEM: readonly NhomSanPham[] = ["anh_in", "khung", "album"];

export interface DongMuaThem {
  /** Ngày (giờ VN, "yyyy-mm-dd") lúc CHỐT — mốc để nhóm theo ngày/biểu đồ. */
  ngay: string;
  branchId: string;
  branchName: string;
  /** Định danh lượt chọn — dùng đếm "N đơn" (nhiều dòng addon có thể cùng một lượt chọn). */
  selectionId: string;
  customerId: string;
  kind: string | null;
  material: string | null;
  quantity: number;
  unitPrice: number;
}

export interface CoCauMuaThem {
  nhom: NhomSanPham;
  ten: string;
  soMon: number;
  tongTien: number;
}

/** Tổng tiền = quantity * unitPrice từng dòng. */
export function tinhTongTienMuaThem(rows: DongMuaThem[]): number {
  return rows.reduce((t, r) => t + r.quantity * r.unitPrice, 0);
}

/** Số đơn = số lượt chọn (`selectionId`) KHÁC NHAU có ít nhất một dòng addon — một đơn có thể mua nhiều món. */
export function tinhSoDonMuaThem(rows: DongMuaThem[]): number {
  return new Set(rows.map((r) => r.selectionId)).size;
}

/** Số gia đình = số khách (`customerId`) KHÁC NHAU. */
export function tinhSoGiaDinhMuaThem(rows: DongMuaThem[]): number {
  return new Set(rows.map((r) => r.customerId)).size;
}

/**
 * Cơ cấu theo nhóm sản phẩm (Ảnh in/Khung/Album) — dòng KHÔNG khớp nhóm nào
 * (`nhomSanPham` trả `null`, ví dụ dịch vụ kèm buổi chụp lỡ lọt vào addon) bị
 * BỎ QUA: khối này chỉ nói về ba nhóm đang bán, không phải mọi dòng addon.
 * Trả theo ĐÚNG thứ tự bản vẽ (`THU_TU_HIEN_THI_MUA_THEM`), bỏ nhóm không có
 * dòng nào — ba dải màu không vẽ dải rỗng.
 */
export function tinhCoCauMuaThem(rows: DongMuaThem[]): CoCauMuaThem[] {
  const map = new Map<NhomSanPham, { soMon: number; tongTien: number }>();
  for (const r of rows) {
    const nhom = nhomSanPham(r.kind, r.material);
    if (!nhom) continue;
    const cu = map.get(nhom) ?? { soMon: 0, tongTien: 0 };
    cu.soMon += 1;
    cu.tongTien += r.quantity * r.unitPrice;
    map.set(nhom, cu);
  }
  return THU_TU_HIEN_THI_MUA_THEM.filter((n) => map.has(n)).map((nhom) => ({
    nhom,
    ten: TEN_NHOM[nhom],
    ...(map.get(nhom) as { soMon: number; tongTien: number }),
  }));
}

/** Tổng tiền theo từng ngày trong `cacNgay` (thứ tự giữ nguyên như truyền vào — dùng cho trục biểu đồ). */
export function tinhTheoNgayMuaThem(
  rows: DongMuaThem[],
  cacNgay: readonly string[],
): { ngay: string; tong: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.ngay, (map.get(r.ngay) ?? 0) + r.quantity * r.unitPrice);
  return cacNgay.map((ngay) => ({ ngay, tong: map.get(ngay) ?? 0 }));
}

export interface ChiNhanhMuaThem {
  branchId: string;
  branchName: string;
  tongTien: number;
}

/** Tổng tiền theo chi nhánh, sắp giảm dần (chi nhánh nhiều tiền nhất lên đầu — bản vẽ vẽ thanh theo tỉ lệ so với chi nhánh cao nhất). */
export function tinhTheoChiNhanhMuaThem(rows: DongMuaThem[]): ChiNhanhMuaThem[] {
  const map = new Map<string, ChiNhanhMuaThem>();
  for (const r of rows) {
    const cu = map.get(r.branchId) ?? { branchId: r.branchId, branchName: r.branchName, tongTien: 0 };
    cu.tongTien += r.quantity * r.unitPrice;
    map.set(r.branchId, cu);
  }
  return [...map.values()].sort((a, b) => b.tongTien - a.tongTien);
}
