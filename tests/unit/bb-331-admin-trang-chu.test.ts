/**
 * BB-331 — luật thuần của đợt "Admin + trang chủ" (30/09/2026). Mỗi khối canh
 * ĐÚNG một lỗi anh báo; hoàn nguyên bản vá tương ứng là khối đó đỏ.
 */
import { describe, it, expect } from "vitest";
import { lyDoKhongXoaChiNhanh } from "@/lib/utils/xoa-chi-nhanh";
import { tinhTheoChiNhanhMuaThem, type DongMuaThem } from "@/lib/utils/mua-them-7-ngay";
import { linkChatKhach } from "@/lib/lien-lac/link-chat-khach";
import { coTheNhac, noiDungNhacThanhToan } from "@/lib/gallery/nhac-khach-ngay";
import { dungCayHopDong } from "@/lib/lark/dong-hop-dong";
import { trangThaiKichThuoc, khoaXepKichThuoc } from "@/lib/products/kich-thuoc-dang-ban";

describe("BB-331 chi nhánh: chỉ xoá được chi nhánh rỗng", () => {
  it("không bộ ảnh, không nhân sự, không gì khác → xoá được", () => {
    expect(lyDoKhongXoaChiNhanh({ galleries: 0, staff: 0 })).toBeNull();
  });
  it("còn bộ ảnh hoặc nhân sự → nói rõ số và mời Ngừng hoạt động", () => {
    const cau = lyDoKhongXoaChiNhanh({ galleries: 6, staff: 2 });
    expect(cau).toContain("6 bộ ảnh");
    expect(cau).toContain("2 nhân sự");
    expect(cau).toContain("Ngừng hoạt động");
  });
  it("còn khách/buổi chụp (khoá ngoại không cascade) → cũng chặn", () => {
    expect(lyDoKhongXoaChiNhanh({ galleries: 0, staff: 0, customers: 7, shoots: 7 })).toMatch(/7 khách, 7 buổi chụp/);
  });
});

describe("BB-331 Bàn làm việc: 'Theo chi nhánh' bỏ chi nhánh Fixture", () => {
  const dong = (branchId: string, branchName: string, unitPrice: number): DongMuaThem =>
    ({
      ngay: "30/09",
      branchId,
      branchName,
      selectionId: `s-${branchId}`,
      customerId: `c-${branchId}`,
      kind: "print",
      material: "UV",
      quantity: 1,
      unitPrice,
    }) as DongMuaThem;
  it("ảnh anh 30/09: 'Fixture DANH…' đứng đầu khối — nay không còn", () => {
    const kq = tinhTheoChiNhanhMuaThem([
      dong("f1", "Fixture DANHGIA5-dfwnp3 Chi nhánh", 40000),
      dong("f2", "Fixture DANHGIA5-0av3qc Chi nhánh", 40000),
      dong("b1", "Chi nhánh Mẫu 1", 25000),
    ]);
    expect(kq.map((k) => k.branchName)).toEqual(["Chi nhánh Mẫu 1"]);
  });
});

describe("BB-331 Nhắn khách: chỉ nhận link http(s)", () => {
  it("link chat Lark giữ nguyên", () => {
    expect(linkChatKhach("https://business.facebook.com/latest/inbox/all?x=1")).toBe(
      "https://business.facebook.com/latest/inbox/all?x=1",
    );
  });
  it("javascript:, chuỗi rỗng, không phải chuỗi → null (không vẽ nút)", () => {
    expect(linkChatKhach("javascript:alert(1)")).toBeNull();
    expect(linkChatKhach("  ")).toBeNull();
    expect(linkChatKhach(null)).toBeNull();
    expect(linkChatKhach("Nguyễn Thị Mai")).toBeNull();
  });
});

describe("BB-331 Ảnh vượt hạn mức: Nhắc khách THANH TOÁN được cả khi bộ đã chốt", () => {
  it("nhắc chọn ảnh vẫn chặn bộ đã chốt; nhắc thanh toán thì không", () => {
    expect(coTheNhac("chon_anh", "submitted")).toBe(false);
    expect(coTheNhac("thanh_toan", "submitted")).toBe(true);
    expect(coTheNhac("chon_anh", "ready")).toBe(true);
  });
  it("tin đẩy không mang tên, số tiền hay link", () => {
    const n = noiDungNhacThanhToan();
    expect(n.loai).toBe("nhac_thanh_toan");
    expect(`${n.tieuDe} ${n.noiDung}`).not.toMatch(/\d|http/);
  });
});

describe("BB-331 dòng hợp đồng từ Lark: cây cha/con đúng MỘT mã", () => {
  const sp = new Map([
    ["recGoi", "prod-goi"],
    ["recEdit", "prod-edit"],
  ]);
  const link = (id: string, text = "x") => [{ record_ids: [id], text }];
  const cha = [
    { record_id: "r1", fields: { "Hóa Đơn": [{ text: "HD_20260101#57" }], "Mã Hóa Đơn Chi Tiết": "HD_20260101#57_1", "Chi Tiết SP / DV": link("recGoi"), "Số Lượng": 1, "Giá chốt cuối": 3500000 } },
    // "contains" của Lark coi #57 khớp #572 — dòng này KHÔNG được vào cây.
    { record_id: "r2", fields: { "Hóa Đơn": [{ text: "HD_20260101#572" }], "Mã Hóa Đơn Chi Tiết": "HD_20260101#572_1", "Chi Tiết SP / DV": link("recGoi"), "Số Lượng": 1 } },
  ];
  const con = [
    { record_id: "c1", fields: { "Hợp đồng chi tiet liên quan": "HD_20260101#57_1", "Sản Phẩm": link("recEdit"), "Số Lượng": 15, "Mã Chi Tiet goi chup": "CT1" } },
    { record_id: "c2", fields: { "Hợp đồng chi tiet liên quan": "HD_20260101#57_1", "Sản Phẩm": link("recLa", "Bánh kem"), "Số Lượng": 1 } },
  ];
  it("chỉ lấy đúng mã, con nối theo mã dòng cha, số lượng con giữ nguyên (hạn mức 15)", () => {
    const { parents, unknownProducts } = dungCayHopDong("HD_20260101#57", cha, con, sp);
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ larkRecordId: "HD_20260101#57_1", productId: "prod-goi", lineTotal: 3500000 });
    expect(parents[0]?.children).toEqual([{ larkRecordId: "CT1", productId: "prod-edit", quantity: 15 }]);
    expect(unknownProducts).toEqual(["Bánh kem"]);
  });
});

describe("BB-331 kích thước đang bán: phân loại theo luật giá (BB-335 hạ ngưỡng)", () => {
  it("đủ tin cậy + nhiều lần bán → khách thấy", () => {
    expect(trangThaiKichThuoc({ listPrice: 1200000, priceConfidence: 1, priceSamples: 12 })).toBe("khach_thay");
  });
  it("Gỗ 70×110: có giá, mới 3 lần bán → BB-335: khách THẤY (trước BB-335 bị ẩn vì < 5 mẫu)", () => {
    expect(trangThaiKichThuoc({ listPrice: 1600000, priceConfidence: 1, priceSamples: 3 })).toBe("khach_thay");
  });
  it("chưa có giá → không bịa giá", () => {
    expect(trangThaiKichThuoc({ listPrice: null, priceConfidence: null, priceSamples: 0 })).toBe("chua_co_gia");
  });
  it("xếp kích thước nhỏ → lớn theo số, không theo chữ", () => {
    const ds = ["100x150", "15x21", "70x110", "20x30"].sort((a, b) => {
      const [a1, a2] = khoaXepKichThuoc(a);
      const [b1, b2] = khoaXepKichThuoc(b);
      return a1 - b1 || a2 - b2;
    });
    expect(ds).toEqual(["15x21", "20x30", "70x110", "100x150"]);
  });
});
