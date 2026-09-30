/**
 * BB-329 mục 2 — khoá cuộn trang nền CÓ ĐẾM.
 *
 * Môi trường thử là Node (không có DOM): dựng một `document.body.style` tối
 * thiểu — đó là biên giới ra trình duyệt, không phải ruột của hàm.
 *
 * Kiểm ngược (AGENTS §5a): đổi `khoaCuonTrang` về kiểu cũ "nhớ giá trị hiện tại
 * → đặt hidden → trả giá trị đã nhớ" thì ca "đóng KHÔNG theo thứ tự ngược" đỏ
 * (trang kẹt `hidden`) — đúng lỗi chủ studio gặp trên iPhone.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { khoaCuonTrang, soLopKhoaCuon } from "@/lib/utils/khoa-cuon-trang";

const g = globalThis as unknown as { document?: { body: { style: { overflow: string } } } };
const docCu = g.document;

beforeEach(() => {
  g.document = { body: { style: { overflow: "" } } };
});
afterAll(() => {
  g.document = docCu;
});

describe("BB-329: khoaCuonTrang", () => {
  it("một lớp phủ: khoá rồi nhả về đúng giá trị cũ", () => {
    const mo = khoaCuonTrang();
    expect(g.document!.body.style.overflow).toBe("hidden");
    mo();
    expect(g.document!.body.style.overflow).toBe("");
    expect(soLopKhoaCuon()).toBe(0);
  });

  it("hai lớp phủ đóng KHÔNG theo thứ tự ngược (xem lớn → cửa hàng) — trang không kẹt khoá", () => {
    const moXemLon = khoaCuonTrang(); // màn xem lớn mở
    const moCuaHang = khoaCuonTrang(); // "Đặt in tấm này": cửa hàng mở…
    moXemLon(); // …màn xem lớn đóng TRƯỚC
    expect(g.document!.body.style.overflow, "cửa hàng còn mở thì nền còn khoá").toBe("hidden");
    moCuaHang(); // ba mẹ đóng cửa hàng, quay lại lưới ảnh
    expect(g.document!.body.style.overflow, "đóng hết rồi mà nền còn khoá").toBe("");
  });

  it("một lớp đóng không mở khoá lớp khác đang mở; gọi nhả hai lần chỉ tính một", () => {
    const a = khoaCuonTrang();
    const b = khoaCuonTrang();
    a();
    a();
    expect(g.document!.body.style.overflow).toBe("hidden");
    b();
    expect(g.document!.body.style.overflow).toBe("");
  });
});
