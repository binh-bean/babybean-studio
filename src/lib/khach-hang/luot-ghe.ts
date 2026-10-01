/**
 * BB-337 mục 3 — "số lượt ghé trong năm nay và ở những chi nhánh nào" trên trang
 * chi tiết khách. HÀM THUẦN.
 *
 * Một lượt ghé = một buổi chụp (bộ ảnh) có ngày chụp trong năm. Bộ ảnh không có
 * ngày chụp thì không đếm (không đoán theo ngày tạo bộ — bộ nhập lại từ Lark có
 * ngày tạo là ngày nhập, không phải ngày khách tới).
 */
export interface LuotGhe {
  nam: number;
  soLuot: number;
  /** Chi nhánh khách đã ghé trong năm, kèm số lượt, nhiều lượt nhất lên trước. */
  chiNhanh: Array<{ ten: string; soLuot: number }>;
}

export function tomTatLuotGhe(
  boAnh: Array<{ ngayChup: string | null; branchName: string | null }>,
  nam: number,
): LuotGhe {
  const dem = new Map<string, number>();
  let soLuot = 0;
  for (const b of boAnh) {
    if (!b.ngayChup || !b.ngayChup.startsWith(`${nam}-`)) continue;
    soLuot++;
    const ten = b.branchName || "Chưa rõ chi nhánh";
    dem.set(ten, (dem.get(ten) ?? 0) + 1);
  }
  const chiNhanh = Array.from(dem, ([ten, n]) => ({ ten, soLuot: n })).sort(
    (a, b) => b.soLuot - a.soLuot || a.ten.localeCompare(b.ten, "vi"),
  );
  return { nam, soLuot, chiNhanh };
}
