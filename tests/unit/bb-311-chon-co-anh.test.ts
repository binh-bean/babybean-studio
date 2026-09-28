/**
 * BB-311 (P1, mục #5) — `chonCoAnhTheoO()` (`src/lib/utils/chon-co-anh.ts`).
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): đổi `DPR_TRAN_CHO_LUOI`
 * từ 2 thành 3 (bỏ giới hạn) → ca "DPR 3 vẫn bị chặn ở tương đương DPR 2"
 * phải ĐỎ (ô 186px DPR 3 sẽ chọn 800w thay vì 400w).
 */
import { describe, it, expect } from "vitest";
import { chonCoAnhTheoO } from "@/lib/utils/chon-co-anh";

describe("chonCoAnhTheoO — cell × min(DPR, 2), làm tròn lên bậc có sẵn", () => {
  it("ô nhỏ, DPR 1 (máy tính thường) — chọn bậc nhỏ nhất đủ", () => {
    // 100 × 1 = 100 -> bậc đầu tiên >= 100 là 200
    expect(chonCoAnhTheoO(100, 1)).toBe(200);
  });

  it("ô lưới 186px (đo trong báo cáo vận hành vòng 4), DPR 2 — chọn 400w", () => {
    // 186 × 2 = 372 -> bậc đầu tiên >= 372 là 400
    expect(chonCoAnhTheoO(186, 2)).toBe(400);
  });

  it("ô lưới 186px, DPR 3 (điện thoại thật đo trong báo cáo) — VẪN chỉ 400w, không nhảy lên 800w", () => {
    // Đây là toàn bộ ý nghĩa của BB-311 mục #5: trần DPR ở 2 dù máy thật là DPR 3.
    expect(chonCoAnhTheoO(186, 3)).toBe(400);
  });

  it("ô vừa, DPR 2, đúng ranh giới giữa hai bậc — làm tròn LÊN", () => {
    // 400 × 2 = 800 -> đúng bằng bậc 800, không phải 1600
    expect(chonCoAnhTheoO(400, 2)).toBe(800);
    // 399 × 2 = 798 -> bậc đầu tiên >= 798 vẫn là 800
    expect(chonCoAnhTheoO(399, 2)).toBe(800);
    // 401 × 2 = 802 -> bậc đầu tiên >= 802 là 1600 (làm tròn LÊN, không xuống 800)
    expect(chonCoAnhTheoO(401, 2)).toBe(1600);
  });

  it("ô rất lớn hơn cả bậc lớn nhất — trả về bậc lớn nhất (2048), không lỗi", () => {
    expect(chonCoAnhTheoO(2000, 2)).toBe(2048);
  });

  it("chưa đo được kích thước ô (undefined/0/NaN) — trả về mặc định an toàn 800", () => {
    expect(chonCoAnhTheoO(undefined)).toBe(800);
    expect(chonCoAnhTheoO(0)).toBe(800);
    expect(chonCoAnhTheoO(Number.NaN)).toBe(800);
    expect(chonCoAnhTheoO(-10)).toBe(800);
  });

  it("DPR dưới 1 (không hợp lý nhưng phòng thủ) vẫn coi như tối thiểu 1", () => {
    expect(chonCoAnhTheoO(186, 0.5)).toBe(chonCoAnhTheoO(186, 1));
  });
});
