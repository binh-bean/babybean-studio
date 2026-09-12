import { describe, it, expect } from "vitest";
import { parseFolderName } from "@/lib/drive/parse-folder-name";

describe("parseFolderName (BB-097)", () => {
  it("bóc đúng khi có đủ tên mẹ và tên bé trong ngoặc", () => {
    // Tên giả hoàn toàn theo AGENTS.md §6
    const result = parseFolderName("Mẹ Thỏ (Bé Cà Rốt)");
    expect(result).toEqual({
      motherName: "Mẹ Thỏ",
      babyName: "Bé Cà Rốt",
      isGuessed: false,
    });
  });

  it("chỉ có tên mẹ, không có ngoặc -> isGuessed là true", () => {
    const result = parseFolderName("Mẹ Thỏ");
    expect(result).toEqual({
      motherName: "Mẹ Thỏ",
      babyName: "",
      isGuessed: true,
    });
  });

  it("xử lý hai cặp ngoặc: lấy cặp ngoặc đầu tiên làm tên bé, phần còn lại là tên mẹ", () => {
    const result = parseFolderName("Mẹ Thỏ (Bé Cà Rốt) (Gói Tiệc)");
    expect(result).toEqual({
      motherName: "Mẹ Thỏ (Gói Tiệc)",
      babyName: "Bé Cà Rốt",
      isGuessed: false,
    });
  });

  it("chỉ có ngoặc tên bé -> mẹ rỗng", () => {
    const result = parseFolderName("(Bé Cà Rốt)");
    expect(result).toEqual({
      motherName: "",
      babyName: "Bé Cà Rốt",
      isGuessed: false,
    });
  });

  it("chuẩn hoá khoảng trắng thừa ở các vị trí", () => {
    const result = parseFolderName("   Mẹ   Thỏ    (   Bé   Cà Rốt   )   ");
    expect(result).toEqual({
      motherName: "Mẹ Thỏ",
      babyName: "Bé Cà Rốt",
      isGuessed: false,
    });
  });

  it("chuỗi rỗng hoặc chỉ có khoảng trắng không ném lỗi", () => {
    expect(parseFolderName("")).toEqual({
      motherName: "",
      babyName: "",
      isGuessed: false,
    });
    expect(parseFolderName("   ")).toEqual({
      motherName: "",
      babyName: "",
      isGuessed: false,
    });
    expect(parseFolderName(null)).toEqual({
      motherName: "",
      babyName: "",
      isGuessed: false,
    });
    expect(parseFolderName(undefined)).toEqual({
      motherName: "",
      babyName: "",
      isGuessed: false,
    });
  });

  it("ngoặc rỗng bên trong ()", () => {
    const result = parseFolderName("Mẹ Thỏ ()");
    expect(result).toEqual({
      motherName: "Mẹ Thỏ",
      babyName: "",
      isGuessed: false,
    });
  });

  it("dấu ngoặc không hợp lệ hoặc đóng trước mở", () => {
    // Chỉ có dấu mở ngoặc
    expect(parseFolderName("Mẹ Thỏ (Bé Cà Rốt")).toEqual({
      motherName: "Mẹ Thỏ (Bé Cà Rốt",
      babyName: "",
      isGuessed: true,
    });
    // Dấu đóng trước dấu mở
    expect(parseFolderName("Mẹ Thỏ ) Bé Cà Rốt (")).toEqual({
      motherName: "Mẹ Thỏ ) Bé Cà Rốt (",
      babyName: "",
      isGuessed: true,
    });
  });
});
