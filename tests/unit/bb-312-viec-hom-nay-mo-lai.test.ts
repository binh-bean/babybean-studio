/**
 * BB-312 — yêu cầu "xin mở lại" xuất hiện trong khối "Việc hôm nay" của Bảng
 * điều khiển, ở đúng chip "Duyệt & giao" (studio cần trả lời, không phải chờ
 * khách) và ĐỨNG đầu nhóm "Hôm nay" (không có hạn giao thật để so).
 *
 * Hai hàm THUẦN canh ở đây:
 *   - `nhomViecHomNay`/`forceHomNay` (src/lib/utils/bang-dieu-khien.ts) — việc
 *     không có `dueAt` NHƯNG có `forceHomNay: true` vẫn phải rơi vào "Hôm
 *     nay", không bị loại như một dòng thiếu hạn bình thường.
 *   - `nhomThaoTacViec`/`waitingReopen` (src/components/features/admin/dashboard.tsx)
 *     — một dòng có `waitingReopen` luôn về nhóm "duyet_giao", BẤT KỂ
 *     `status` thật của bộ ảnh là gì (vd `in_retouch`, `expired`…).
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên `forceHomNay` (bỏ nhánh `|| v.forceHomNay`)
 * thì ca "forceHomNay đứng ngoài dueAt/status" dưới đây phải ĐỎ — một dòng
 * không `dueAt`, `status` không phải "submitted" sẽ rơi vào `null` (bị loại
 * khỏi cả ba nhóm) thay vì "hom_nay".
 */

import { describe, it, expect } from "vitest";
import { nhomViecHomNay } from "@/lib/utils/bang-dieu-khien";
import { nhomThaoTacViec } from "@/components/features/admin/dashboard";

describe("BB-312: forceHomNay — yêu cầu xin mở lại luôn ở nhóm Hôm nay", () => {
  it("không dueAt, status không phải submitted, forceHomNay=true -> hom_nay", () => {
    expect(nhomViecHomNay({ dueAt: null, status: "in_retouch", forceHomNay: true })).toBe(
      "hom_nay",
    );
  });

  it("cùng dữ liệu nhưng KHÔNG forceHomNay -> null (bị loại, hành vi cũ giữ nguyên)", () => {
    expect(nhomViecHomNay({ dueAt: null, status: "in_retouch" })).toBeNull();
  });

  it("forceHomNay không đè lên việc đã quá hạn thật (status khác submitted, có dueAt quá khứ) — vẫn hom_nay vì forceHomNay ưu tiên trước", () => {
    // Không phải bug: forceHomNay là "luôn hôm nay", nhất quán vì các dòng
    // BB-312 không bao giờ mang `dueAt` thật (route dashboard luôn gán null).
    expect(
      nhomViecHomNay({ dueAt: "2020-01-01T00:00:00Z", status: "in_retouch", forceHomNay: true }),
    ).toBe("hom_nay");
  });
});

describe("BB-312: nhomThaoTacViec — waitingReopen luôn về Duyệt & giao", () => {
  it("waitingReopen có giá trị, status bất kỳ (in_retouch) -> duyet_giao", () => {
    expect(
      nhomThaoTacViec({
        status: "in_retouch",
        sentAt: null,
        waitingReopen: { requestedAt: "2026-09-28T10:00:00Z", lyDo: "Đổi tấm 12", lanThu: 1 },
      }),
    ).toBe("duyet_giao");
  });

  it("waitingReopen có giá trị, status 'expired' (bình thường sẽ là nhac_khach) -> vẫn duyet_giao", () => {
    expect(
      nhomThaoTacViec({
        status: "expired",
        sentAt: null,
        waitingReopen: { requestedAt: "2026-09-28T10:00:00Z", lyDo: null, lanThu: 2 },
      }),
    ).toBe("duyet_giao");
  });

  it("không có waitingReopen thì hành vi cũ giữ nguyên (status expired -> nhac_khach)", () => {
    expect(nhomThaoTacViec({ status: "expired", sentAt: null })).toBe("nhac_khach");
  });
});
