/**
 * Vá BB-345 (bắt được khi soát BB-334A, 05/10): người được mời thả tim rồi TẢI
 * LẠI ngay — lượt POST bị huỷ giữa đường / chưa ghi xong, máy chủ chưa có tấm
 * đó. Bản cũ sau lần đưa đầu chỉ tin máy chủ → tim MẤT (e2e bb-338 "2c": "0 tấm").
 *
 * Nay cú chạm chưa được máy chủ xác nhận nằm trong hàng chờ (localStorage) và
 * thắng máy chủ cho đúng những tấm đó, rồi được gửi lại.
 */
import { describe, it, expect } from "vitest";
import { gopTimLanDau, ghiChoGui, xoaChoGui } from "@/lib/gallery/tim-gia-dinh";

describe("tim gia đình: cú chạm chưa được máy chủ xác nhận không mất khi tải lại", () => {
  it("đã đưa lên rồi + thả tim 'p1' chưa kịp ghi → vẫn hiện p1 và gửi lại p1", () => {
    const choGui = ghiChoGui({ them: [], bo: [] }, "p1", true);
    const kq = gopTimLanDau({ local: ["p1"], server: [], daDua: true, choGui });
    expect(kq.hienThi).toEqual(["p1"]);
    expect(kq.canDua).toEqual(["p1"]);
    expect(kq.canBo).toEqual([]);
  });

  it("bỏ tim 'p2' chưa kịp ghi → không hiện p2 dù máy chủ còn, và gửi lại lệnh bỏ", () => {
    const choGui = ghiChoGui({ them: [], bo: [] }, "p2", false);
    const kq = gopTimLanDau({ local: [], server: ["p2", "p3"], daDua: true, choGui });
    expect(kq.hienThi).toEqual(["p3"]);
    expect(kq.canBo).toEqual(["p2"]);
  });

  it("hàng chờ rỗng → máy chủ vẫn là nguồn thật (không hồi sinh tim cũ trong trình duyệt)", () => {
    const kq = gopTimLanDau({ local: ["cu"], server: ["p3"], daDua: true, choGui: { them: [], bo: [] } });
    expect(kq.hienThi).toEqual(["p3"]);
    expect(kq.canDua).toEqual([]);
  });

  it("thả rồi bỏ cùng một tấm: chỉ giữ cú chạm cuối; máy chủ trả lời xong thì rời hàng chờ", () => {
    let cg = ghiChoGui({ them: [], bo: [] }, "p1", true);
    cg = ghiChoGui(cg, "p1", false);
    expect(cg).toEqual({ them: [], bo: ["p1"] });
    expect(xoaChoGui(cg, ["p1"])).toEqual({ them: [], bo: [] });
  });
});
