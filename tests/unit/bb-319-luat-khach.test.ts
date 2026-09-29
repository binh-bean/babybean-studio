/**
 * BB-319 — canh CHÍNH các hàm đo của sáu luật theo lớp lỗi màn khách
 * (`tests/e2e/helpers/luat-khach.ts`). Luật áp lên 24 khung hình thật nằm ở
 * `tests/e2e/bb-319-luat-lop-khach.spec.ts`; ở đây chỉ bảo đảm cái thước đo
 * không tự sai (đếm chữ, tách câu, nhận ra chữ nội bộ, nhận ra tiền sai dạng).
 *
 * Kiểm ngược (AGENTS.md §5a): đổi `TRAN_CHU_MOT_CAU` lên 30 thì ca "câu 25 chữ
 * của vòng 6" không còn bị bắt → ĐỎ; bỏ `\s[·|]\s` khỏi `tachCau` thì dòng
 * "400 ảnh · 15 tấm trong gói · …" bị đếm là một câu dài → ca tách danh sách ĐỎ.
 */
import { describe, it, expect } from "vitest";
import {
  demChu,
  tachCau,
  cauQuaDai,
  chuNoiBo,
  tienSaiDinhDang,
  KY_HIEU_X,
} from "../e2e/helpers/luat-khach";

describe("Luật 4 — đếm chữ, tách câu", () => {
  it("đếm theo âm tiết, bỏ dấu ngăn không có chữ", () => {
    expect(demChu("Studio đang cập nhật gói của ba mẹ.")).toBe(8);
    expect(demChu("400 ảnh · 15 tấm")).toBe(4);
    expect(demChu("UV 10×15 ×3")).toBe(3);
    expect(demChu("— · | ₫")).toBe(0);
  });

  it("câu 25 chữ vòng 6 bị bắt; dấu gạch dài KHÔNG cứu một câu dài", () => {
    const cau =
      "Còn 1 sản phẩm chưa đủ ảnh — chọn luôn thì studio in ngay, để sau cũng được, CSKH sẽ hỏi lại ba mẹ sau khi chốt nhé";
    expect(cauQuaDai(cau)).toHaveLength(1);
  });

  it("tách ở dấu chấm câu và dấu ngăn danh sách, không tách ở 100.000", () => {
    expect(tachCau("Chốt xong, bên mình sẽ kiểm. Trước lúc đó ba mẹ vẫn đổi được.")).toHaveLength(2);
    expect(tachCau("Thêm 100.000 ₫ cho 2 ảnh")).toHaveLength(1);
    expect(tachCau("400 ảnh · 15 tấm trong gói · Chọn trước 30/09")).toHaveLength(3);
  });

  it("chữ nội bộ bị nhận ra; lời của khách thì không", () => {
    expect(chuNoiBo("0 · Chờ hạn mức")).not.toHaveLength(0);
    expect(chuNoiBo("Còn 1/1 suất chưa chọn ảnh")).not.toHaveLength(0);
    expect(chuNoiBo("Ba mẹ nhắn CSKH giúp em nhé")).not.toHaveLength(0);
    expect(chuNoiBo("Studio đang cập nhật gói của ba mẹ.")).toHaveLength(0);
    // "xuất", "suất ăn" — chỉ bắt đúng từ "suất" đứng riêng.
    expect(chuNoiBo("Xuất danh sách")).toHaveLength(0);
  });
});

describe("Luật 1 — ký hiệu kích thước", () => {
  it("bắt '10x15', '10 x 15', '15X21'; không bắt '10×15' hay chữ x trong từ", () => {
    expect(KY_HIEU_X.test("UV 10x15")).toBe(true);
    expect(KY_HIEU_X.test("Album 15 x 21")).toBe(true);
    expect(KY_HIEU_X.test("Gỗ 15X21")).toBe(true);
    expect(KY_HIEU_X.test("UV 10×15 ×3")).toBe(false);
    expect(KY_HIEU_X.test("Xem lại bộ ảnh")).toBe(false);
  });
});

describe("Luật 5 — một định dạng tiền", () => {
  it("chỉ nhận 'N.NNN ₫' (chấm nghìn, một khoảng trắng, ₫ sau số)", () => {
    expect(tienSaiDinhDang("Thêm 100.000 ₫")).toEqual([]);
    expect(tienSaiDinhDang("Thêm 100.000 ₫ · 2 ảnh")).toEqual([]);
    expect(tienSaiDinhDang("Thêm 100000 ₫")).toHaveLength(1);
    expect(tienSaiDinhDang("Thêm 100,000₫")).toHaveLength(1);
  });
});
