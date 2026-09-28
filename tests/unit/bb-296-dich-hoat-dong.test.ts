/**
 * BB-296 mục #7 — báo cáo chấm độc lập lần 3: dòng thời gian quản trị ghi
 * "Thao tác khác" không nói rõ việc gì, và dòng "Ba mẹ chốt lựa chọn…" gán
 * nhầm người làm thành "Ông bà (Mẹ Mai)" dù người chốt là ba mẹ.
 *
 * Truy ngược `src/app/api/g/addons/route.ts`: nhánh MUA NHIỀU TẤM (BB-279) ghi
 * action `addon.batch_set`/`addon.batch_remove` — hai action này chưa từng có
 * trong từ điển `dich-hoat-dong.ts`, rơi vào nhánh mặc định "Thao tác khác".
 *
 * Truy ngược `src/app/api/g/submit/route.ts` dòng 102/345: route CHẶN
 * `session.role !== "owner"` trước khi cho chốt (chỉ link CHÍNH gọi tới được),
 * nhưng ghi `actor_label = input.confirmedByName` (tên ba mẹ tự gõ) — khác Ý
 * NGHĨA với `actorLabel` ở mọi action khác (nhãn LINK do CSKH đặt). Kết luận:
 * APP GÁN SAI, không phải do phép thử đặt tên "Mẹ Mai" trùng hình dạng nhãn
 * link — `suyNguoi` so khớp tên thật với whitelist "chính chủ" nên gần như
 * luôn trật.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên nhánh `addon.batch_set`/`batch_remove`
 * (xoá khỏi TU_DIEN) thì test đầu đỏ ("Thao tác khác") đúng dự kiến (đã tự
 * kiểm tay); hoàn nguyên nhánh `action === "selection.submit"` trong
 * `suyNguoi` thì test "Ba mẹ (Mẹ Mai)" đỏ thành "Ông bà (Mẹ Mai)" đúng dự
 * kiến. Vá lại cả hai thì xanh.
 */

import { describe, it, expect } from "vitest";
import { dichHoatDong, suyNguoi } from "@/lib/nhat-ky/dich-hoat-dong";

describe("BB-296 mục #7: addon.batch_set/batch_remove không còn 'Thao tác khác'", () => {
  it("addon.batch_set với tên sản phẩm + nhiều tấm -> câu rõ việc", () => {
    const { cau, nhom } = dichHoatDong("addon.batch_set", {
      productName: "Ảnh in UV 10x15",
      photoIds: ["a", "b", "c"],
      quantity: 1,
    });
    expect(cau).not.toBe("Thao tác khác");
    expect(cau).toBe("Ba mẹ đặt thêm Ảnh in UV 10x15 cho 3 tấm");
    expect(nhom).toBe("khach");
  });

  it("addon.batch_remove -> câu rõ việc, không rơi về mặc định", () => {
    const { cau } = dichHoatDong("addon.batch_remove", {
      productName: "Khung HQ 40x60",
      photoIds: ["a", "b"],
    });
    expect(cau).not.toBe("Thao tác khác");
    expect(cau).toContain("Khung HQ 40x60");
  });

  it("action thật sự lạ (không có trong từ điển) vẫn trả 'Thao tác khác' — không đổi hành vi này", () => {
    const { cau } = dichHoatDong("mot_action_khong_ton_tai", {});
    expect(cau).toBe("Thao tác khác");
  });
});

describe("BB-296 mục #7: suyNguoi('selection.submit') luôn là Ba mẹ, không phải Ông bà", () => {
  it("tên xác nhận là 'Mẹ Mai' (ca thật của báo cáo chấm) -> 'Ba mẹ (Mẹ Mai)'", () => {
    const nguoi = suyNguoi({
      action: "selection.submit",
      actorType: "customer",
      actorLabel: "Mẹ Mai",
    });
    expect(nguoi).toBe("Ba mẹ (Mẹ Mai)");
    expect(nguoi).not.toContain("Ông bà");
  });

  it("thiếu tên xác nhận -> vẫn 'Ba mẹ', không suy diễn 'Ông bà'", () => {
    const nguoi = suyNguoi({ action: "selection.submit", actorType: "customer", actorLabel: null });
    expect(nguoi).toBe("Ba mẹ");
  });

  it("action KHÁC selection.submit vẫn theo luật cũ (nhãn link không khớp 'chính chủ' -> Ông bà)", () => {
    const nguoi = suyNguoi({
      action: "addon.set",
      actorType: "customer",
      actorLabel: "Bà ngoại",
    });
    expect(nguoi).toBe("Ông bà (Bà ngoại)");
  });
});
