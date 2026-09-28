/**
 * BB-310 mục 6/7 — báo cáo chấm độc lập vòng 4 ("khách khó tính"):
 *
 *   Mục 6: màn quản trị (và trước đây có nguy cơ ở màn khách) hiện "Bé Bé
 *   Na" vì code ghép cứng `Bé ${babyName}` trong khi `babyName` (nickname từ
 *   Lark) đã có sẵn chữ "Bé". `tenGoiBe()` là nguồn DUY NHẤT cho việc thêm
 *   tiền tố — chỉ thêm khi tên CHƯA bắt đầu bằng "Bé"/"bé".
 *
 *   Mục 7: dữ liệu thật `bb-dev` đo được 254/258 bé không có `nickname`.
 *   Chỉ đạo admin 28/09/2026 (thay bản đầu "chữ cuối họ tên"): còn nickname
 *   thì dùng tên gọi như cũ; mất nickname thì bìa in NGUYÊN HỌ TÊN ĐẦY ĐỦ
 *   (không thêm "Bé ", không rút gọn) — cỡ chữ co theo độ dài qua
 *   `coChuTieuDeBia()` để không tràn quá 2 dòng ở 390px/1440px.
 *
 * Canh ba hàm THUẦN trong `dinh-dang.ts` (không dựng DOM, không đọc mã
 * nguồn làm dữ liệu thử — AGENTS.md §5a).
 */
import { describe, it, expect } from "vitest";
import { tenGoiBe, tinhTenBiaTuDuLieu, coChuTieuDeBia } from "@/lib/utils/dinh-dang";

describe("BB-310 mục 6: tenGoiBe — không bao giờ ghép 'Bé Bé'", () => {
  it("tên chưa có 'Bé' thì thêm tiền tố", () => {
    expect(tenGoiBe("Na")).toBe("Bé Na");
    expect(tenGoiBe("An")).toBe("Bé An");
  });

  it("tên ĐÃ bắt đầu bằng 'Bé ' thì giữ nguyên, không ghép chồng", () => {
    expect(tenGoiBe("Bé Na")).toBe("Bé Na");
  });

  it("không phân biệt hoa/thường ở tiền tố có sẵn ('bé na')", () => {
    expect(tenGoiBe("bé Na")).toBe("bé Na");
  });

  it("tên đúng bằng 'Bé' (không có gì theo sau) thì giữ nguyên", () => {
    expect(tenGoiBe("Bé")).toBe("Bé");
  });

  it("cắt khoảng trắng thừa quanh tên trước khi xét", () => {
    expect(tenGoiBe("  Na  ")).toBe("Bé Na");
  });

  it("tên rỗng/toàn khoảng trắng trả về rỗng, không bịa 'Bé '", () => {
    expect(tenGoiBe("")).toBe("");
    expect(tenGoiBe("   ")).toBe("");
  });

  it("từ bắt đầu giống 'Bé' nhưng là một từ khác ('Bến') thì vẫn thêm tiền tố", () => {
    expect(tenGoiBe("Bến Thành")).toBe("Bé Bến Thành");
  });
});

describe("BB-310 mục 7: tinhTenBiaTuDuLieu — còn nickname dùng tên gọi, mất thì HỌ TÊN ĐẦY ĐỦ nguyên vẹn", () => {
  it("còn nickname thì dùng nguyên nickname qua tenGoiBe", () => {
    expect(tinhTenBiaTuDuLieu("Bé Na", "Nguyễn Thị Na")).toBe("Bé Na");
  });

  it("nickname không có tiền tố 'Bé' vẫn được thêm qua tenGoiBe", () => {
    expect(tinhTenBiaTuDuLieu("Sushi", "Nguyễn Thị Na")).toBe("Bé Sushi");
  });

  it("mất nickname → HỌ TÊN ĐẦY ĐỦ nguyên vẹn, KHÔNG thêm 'Bé ', không rút gọn", () => {
    expect(tinhTenBiaTuDuLieu(null, "Nguyễn Minh An")).toBe("Nguyễn Minh An");
    expect(tinhTenBiaTuDuLieu(null, "Nguyễn Thị Minh Ngọc Hân")).toBe("Nguyễn Thị Minh Ngọc Hân");
  });

  it("nickname là chuỗi toàn khoảng trắng thì coi như không có, rơi xuống họ tên đầy đủ nguyên vẹn", () => {
    expect(tinhTenBiaTuDuLieu("   ", "Trần Văn Bin")).toBe("Trần Văn Bin");
  });

  it("không có cả nickname lẫn họ tên đầy đủ → rỗng, không bịa", () => {
    expect(tinhTenBiaTuDuLieu(null, null)).toBe("");
  });

  it("cắt khoảng trắng thừa ở hai đầu họ tên đầy đủ", () => {
    expect(tinhTenBiaTuDuLieu(null, "  Lê Gia Khang  ")).toBe("Lê Gia Khang");
  });
});

describe("BB-310 mục 7: coChuTieuDeBia — cỡ chữ co theo độ dài, không tràn quá 2 dòng", () => {
  it("tên ngắn ('Bé Na', 5 ký tự) → giữ nguyên bậc gốc 44/52/64/84", () => {
    expect(coChuTieuDeBia("Bé Na")).toEqual({ mobile: 44, sm: 52, lg: 64, xl: 84 });
  });

  it("đúng ngưỡng 10 ký tự vẫn ở bậc gốc", () => {
    expect(coChuTieuDeBia("0123456789")).toEqual({ mobile: 44, sm: 52, lg: 64, xl: 84 });
  });

  it("11 ký tự đã rơi xuống bậc kế tiếp (nhỏ hơn bậc gốc)", () => {
    const r = coChuTieuDeBia("01234567890");
    expect(r.mobile).toBeLessThan(44);
  });

  it("họ tên đầy đủ 5 chữ dài (vd 'Nguyễn Thị Minh Ngọc Hân', 24 ký tự) → bậc nhỏ nhất", () => {
    const ten = "Nguyễn Thị Minh Ngọc Hân";
    expect(ten.length).toBeGreaterThan(22);
    expect(coChuTieuDeBia(ten)).toEqual({ mobile: 27, sm: 32, lg: 38, xl: 46 });
  });

  it("cỡ chữ giảm ĐƠN ĐIỆU khi tên dài dần (không bao giờ tên dài hơn lại có cỡ lớn hơn)", () => {
    const doDai = ["Na", "Nguyễn An", "Nguyễn Minh An", "Nguyễn Thị Minh Ngọc Hân"];
    const cacBac = doDai.map((t) => coChuTieuDeBia(t).mobile);
    for (let i = 1; i < cacBac.length; i++) {
      expect(cacBac[i]).toBeLessThanOrEqual(cacBac[i - 1] as number);
    }
  });

  it("cắt khoảng trắng thừa trước khi đo độ dài", () => {
    expect(coChuTieuDeBia("  Bé Na  ")).toEqual(coChuTieuDeBia("Bé Na"));
  });
});
