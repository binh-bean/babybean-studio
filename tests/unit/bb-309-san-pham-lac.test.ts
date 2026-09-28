// BB-309 (A4) — sau bước nạp danh mục, sản phẩm không có lark_record_id hoặc
// không còn trong Lark phải bị TẮT (is_active=false), không xoá.
//
// Phép thử này chỉ giả lập BIÊN GIỚI: mảng "sản phẩm hiện có trong DB" và tập
// "record_id đọc được từ Lark lượt này" là dữ liệu tự tạo. Logic phân loại
// (sanPhamCanTat) chạy thật — không import script này sẽ KHÔNG gọi Lark/DB
// thật, vì sync-lark-catalog.mjs chỉ chạy main() khi gọi trực tiếp.

import { describe, it, expect } from "vitest";
import { sanPhamCanTat } from "../../scripts/sync-lark-catalog.mjs";

describe("sanPhamCanTat — sản phẩm lạc phải bị tắt sau bước nạp", () => {
  it("tắt sản phẩm không có lark_record_id (fixture/thử tay ghi thẳng vào DB)", () => {
    const hienCo = [
      { id: "p1", name: "Fixture Gỗ 20x30", lark_record_id: null, is_active: true },
      { id: "p2", name: "Ảnh gỗ 15x21", lark_record_id: "recABC", is_active: true },
    ];
    const dangDoc = new Set(["recABC"]);
    const ket = sanPhamCanTat(hienCo, dangDoc);
    expect(ket.map((p) => p.id)).toEqual(["p1"]);
  });

  it("tắt sản phẩm có lark_record_id nhưng KHÔNG còn trong lượt đọc Lark vừa rồi", () => {
    const hienCo = [
      { id: "p1", name: "Album cũ đã xoá bên Lark", lark_record_id: "recCU", is_active: true },
      { id: "p2", name: "Album còn bán", lark_record_id: "recCON", is_active: true },
    ];
    const dangDoc = new Set(["recCON"]);
    const ket = sanPhamCanTat(hienCo, dangDoc);
    expect(ket.map((p) => p.id)).toEqual(["p1"]);
  });

  it("KHÔNG động tới sản phẩm còn trong Lark", () => {
    const hienCo = [{ id: "p1", name: "Album còn bán", lark_record_id: "recCON", is_active: true }];
    const dangDoc = new Set(["recCON"]);
    expect(sanPhamCanTat(hienCo, dangDoc)).toEqual([]);
  });

  it("không lặp lại sản phẩm đã tắt từ trước (chỉ xét is_active=true)", () => {
    const hienCo = [
      { id: "p1", name: "Đã tắt từ lượt trước", lark_record_id: null, is_active: false },
    ];
    const dangDoc = new Set<string>();
    expect(sanPhamCanTat(hienCo, dangDoc)).toEqual([]);
  });

  it("một sản phẩm bị Lark SKIP (tên trống/phân loại lạ) vẫn KHÔNG bị tắt vì record_id vẫn có trong Lark", () => {
    // boMaLarkDangDoc phải gồm CẢ record_id của dòng bị skip — đây là ca
    // canh đúng chỗ dễ sai: nếu chỉ gom record_id của `items` (đã lọc bỏ
    // dòng skip) thì sản phẩm này bị tắt NHẦM dù nó vẫn đang tồn tại bên Lark.
    const hienCo = [
      { id: "p1", name: "Dịch vụ lạ chưa phân loại", lark_record_id: "recSKIP", is_active: true },
    ];
    const dangDoc = new Set(["recSKIP"]); // record_id của dòng skip vẫn được gom vào
    expect(sanPhamCanTat(hienCo, dangDoc)).toEqual([]);
  });
});
