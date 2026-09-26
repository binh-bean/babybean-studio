/**
 * BB-260 — xuất CSV: BOM cho Excel đọc đúng dấu tiếng Việt, và thoát đúng
 * dấu phẩy/ngoặc kép/xuống dòng trong ô.
 */

import { describe, it, expect } from "vitest";
import { bangThanhCsv } from "@/lib/bao-cao/csv";

describe("BB-260: bangThanhCsv", () => {
  it("có BOM UTF-8 ở đầu tệp", () => {
    const csv = bangThanhCsv({ cot: ["Chi nhánh"], dong: [["Quận 1"]] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("ô có dấu phẩy được bọc trong ngoặc kép", () => {
    const csv = bangThanhCsv({ cot: ["Ghi chú"], dong: [["Đã gửi, đang chờ"]] });
    expect(csv).toContain('"Đã gửi, đang chờ"');
  });

  it("ô có ngoặc kép: ngoặc kép nhân đôi VÀ cả ô được bọc ngoặc kép", () => {
    const csv = bangThanhCsv({ cot: ["Tên"], dong: [['Nói "xin chào"']] });
    expect(csv).toContain('"Nói ""xin chào"""');
  });

  it("ô có xuống dòng cũng phải bọc ngoặc kép, không thì Excel đọc thành hai dòng", () => {
    const csv = bangThanhCsv({ cot: ["Ghi chú"], dong: [["Dòng 1\nDòng 2"]] });
    expect(csv).toContain('"Dòng 1\nDòng 2"');
  });

  it("ô bình thường không bị thêm ngoặc kép thừa", () => {
    const csv = bangThanhCsv({ cot: ["Số"], dong: [[42]] });
    expect(csv).toContain("42");
    expect(csv).not.toContain('"42"');
  });

  it("null hiển thị thành ô rỗng, không phải chữ 'null'", () => {
    const csv = bangThanhCsv({ cot: ["A"], dong: [[null]] });
    const dongThu2 = csv.split("\r\n")[1];
    expect(dongThu2).toBe("");
  });

  it("dùng CRLF giữa các dòng (Excel Windows)", () => {
    const csv = bangThanhCsv({ cot: ["A", "B"], dong: [[1, 2], [3, 4]] });
    expect(csv).toContain("\r\n");
  });
});
