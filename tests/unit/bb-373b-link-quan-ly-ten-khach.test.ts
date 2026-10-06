/**
 * 06/10 — sửa lượt điền bù link quản lý bộ ảnh lên Lark:
 *  - lượt đầu chạy từ máy thử ghi `http://localhost:3000/admin/galleries/<id>` → phải được THAY
 *    bằng địa chỉ thật (trước đây coi là "nội dung khác" và bỏ qua mãi);
 *  - anh chốt: ô URL hiện TÊN KHÁCH ở phần chữ → đọc được phần chữ để biết khi nào cần ghi lại.
 */
import { describe, it, expect } from "vitest";
import { quyetDinhGhiLinkQuanLy, nhanTrongO, diaChiTrongO } from "@/lib/lark/ghi-link-quan-ly";

const THAT = "https://hauky.babybeanstudio.vn/admin/galleries/11111111-1111-4111-8111-111111111111";

describe("BB-373b: link quản lý bộ ảnh — gốc thật + tên khách", () => {
  it("ô đang giữ link localhost của app (cùng bộ) → ghi lại bằng địa chỉ thật", () => {
    const cu = "http://localhost:3000/admin/galleries/11111111-1111-4111-8111-111111111111";
    expect(quyetDinhGhiLinkQuanLy(cu, THAT)).toEqual({ ghi: true });
  });

  it("ô đang giữ link 127.0.0.1 của app → ghi lại", () => {
    expect(quyetDinhGhiLinkQuanLy("http://127.0.0.1:3100/admin/galleries/abc", THAT).ghi).toBe(true);
  });

  it("ô đang giữ link localhost KHÔNG phải màn quản lý (vd /k/...) → không đụng", () => {
    const kq = quyetDinhGhiLinkQuanLy("http://localhost:3000/k/abc", THAT);
    expect(kq.ghi).toBe(false);
    expect(kq.boQua).toBe("o_co_noi_dung_khac");
  });

  it("ô đã đúng link thật → không ghi (phần chữ do hàm ghi xét riêng)", () => {
    expect(quyetDinhGhiLinkQuanLy(THAT, THAT)).toEqual({ ghi: false, boQua: "da_dung" });
  });

  it("đọc phần chữ và phần link của ô URL Lark", () => {
    const o = [{ link: THAT, text: "Nguyễn Thị Mai" }];
    expect(diaChiTrongO(o)).toBe(THAT);
    expect(nhanTrongO(o)).toBe("Nguyễn Thị Mai");
    expect(nhanTrongO("chữ thuần")).toBe("");
  });
});
