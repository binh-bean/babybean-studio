/**
 * BB-295 mục #14 — báo cáo chấm độc lập (`4-cham-lai-doc-lap.md`, việc #14):
 * "Đang chỉnh: không vẽ thẻ rỗng". Trước bản vá, `ReviewPanel` vẽ ra một thẻ
 * viền + nền TRẮNG RỖNG (chỉ padding, không chữ) khi thẻ hành trình đã nói
 * trạng thái (`anCauTrangThai`) và không còn gì khác để nói.
 *
 * Canh đúng LUẬT bằng hàm thuần `coNoiDungDeVe` (AGENTS.md §5a mục 4 — không
 * canh chuỗi HTML), cùng cách `trangThaiSoTam` ở `cam-on-sau-chot.test.ts`
 * đã làm.
 *
 * Kiểm ngược (AGENTS.md §5a): hoàn nguyên `coNoiDungDeVe` về `return true`
 * không điều kiện (hành vi CŨ — luôn vẽ thẻ) làm ca "không có gì để nói" đỏ.
 * Đã tự chạy: đỏ trước khi vá, xanh sau khi vá — dán ở bàn giao BB-295.
 */
import { describe, expect, it } from "vitest";
import { coNoiDungDeVe } from "@/components/features/gallery/review-panel";

describe("BB-295 mục #14 — ReviewPanel không vẽ thẻ rỗng", () => {
  it("anCauTrangThai=true, không link/không duyệt/không vòng sửa -> KHÔNG có gì để vẽ", () => {
    expect(coNoiDungDeVe(true, null, false, 0)).toBe(false);
  });

  it("anCauTrangThai=false (chưa gộp câu trạng thái) -> LUÔN có gì để vẽ (câu trạng thái riêng)", () => {
    expect(coNoiDungDeVe(false, null, false, 0)).toBe(true);
  });

  it("có link ảnh đã chỉnh -> có gì để vẽ dù anCauTrangThai=true", () => {
    expect(coNoiDungDeVe(true, "https://drive.example/final", false, 0)).toBe(true);
  });

  it("tới lúc duyệt (showDecide) -> có gì để vẽ dù anCauTrangThai=true", () => {
    expect(coNoiDungDeVe(true, null, true, 0)).toBe(true);
  });

  it("có lịch sử vòng sửa -> có gì để vẽ dù anCauTrangThai=true", () => {
    expect(coNoiDungDeVe(true, null, false, 1)).toBe(true);
  });
});
