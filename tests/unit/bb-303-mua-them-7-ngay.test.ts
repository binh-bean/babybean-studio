/**
 * BB-303 — khối "Mua thêm · 7 ngày qua" + "Theo chi nhánh" của Bảng điều
 * khiển (bản vẽ BB-301). Canh các hàm tính thuần ở
 * src/lib/utils/mua-them-7-ngay.ts bằng dữ liệu bịa (BB-quy ước dữ liệu giả,
 * AGENTS.md §6) — không chạm Supabase.
 */

import { describe, it, expect } from "vitest";
import {
  tinhTongTienMuaThem,
  tinhSoDonMuaThem,
  tinhSoGiaDinhMuaThem,
  tinhCoCauMuaThem,
  tinhTheoNgayMuaThem,
  tinhTheoChiNhanhMuaThem,
  type DongMuaThem,
} from "@/lib/utils/mua-them-7-ngay";

const rows: DongMuaThem[] = [
  {
    ngay: "2026-09-22",
    branchId: "q1",
    branchName: "Chi nhánh Quận 1",
    selectionId: "sel-1",
    customerId: "kh-1",
    kind: "print",
    material: "Tráng gương",
    quantity: 1,
    unitPrice: 150000,
  },
  {
    ngay: "2026-09-22",
    branchId: "q1",
    branchName: "Chi nhánh Quận 1",
    selectionId: "sel-1",
    customerId: "kh-1",
    kind: "print",
    material: "Khung HQ",
    quantity: 1,
    unitPrice: 200000,
  },
  {
    ngay: "2026-09-27",
    branchId: "q3",
    branchName: "Chi nhánh Quận 3",
    selectionId: "sel-2",
    customerId: "kh-2",
    kind: "print",
    material: "Album (Ultra HD)",
    quantity: 1,
    unitPrice: 450000,
  },
  // Dòng dịch vụ không thuộc 3 nhóm bán (không khớp nhomSanPham) — phải bị
  // BỎ QUA khỏi cơ cấu, nhưng vẫn tính vào tổng tiền/số đơn/số gia đình.
  {
    ngay: "2026-09-27",
    branchId: "q3",
    branchName: "Chi nhánh Quận 3",
    selectionId: "sel-2",
    customerId: "kh-2",
    kind: "service",
    material: null,
    quantity: 1,
    unitPrice: 50000,
  },
];

describe("BB-303: tinhTongTienMuaThem", () => {
  it("cộng dồn quantity * unitPrice mọi dòng", () => {
    expect(tinhTongTienMuaThem(rows)).toBe(1 * 150000 + 1 * 200000 + 1 * 450000 + 1 * 50000);
  });
});

describe("BB-303: tinhSoDonMuaThem / tinhSoGiaDinhMuaThem", () => {
  it("đếm selectionId khác nhau, không đếm số dòng", () => {
    expect(tinhSoDonMuaThem(rows)).toBe(2); // sel-1, sel-2
  });
  it("đếm customerId khác nhau", () => {
    expect(tinhSoGiaDinhMuaThem(rows)).toBe(2); // kh-1, kh-2
  });
});

describe("BB-303: tinhCoCauMuaThem", () => {
  it("nhóm đúng ba loại, bỏ dòng không khớp nhóm (kind=service)", () => {
    const coCau = tinhCoCauMuaThem(rows);
    const nhomTen = coCau.map((c) => c.nhom);
    expect(nhomTen).toContain("anh_in");
    expect(nhomTen).toContain("khung");
    expect(nhomTen).toContain("album");
    // 4 dòng gốc, 1 dòng service bị loại -> tổng soMon các nhóm phải là 3.
    expect(coCau.reduce((t, c) => t + c.soMon, 0)).toBe(3);
  });

  it("tổng tiền từng nhóm đúng", () => {
    const coCau = tinhCoCauMuaThem(rows);
    const anhIn = coCau.find((c) => c.nhom === "anh_in");
    expect(anhIn?.tongTien).toBe(1 * 150000);
    const khung = coCau.find((c) => c.nhom === "khung");
    expect(khung?.tongTien).toBe(200000);
    const album = coCau.find((c) => c.nhom === "album");
    expect(album?.tongTien).toBe(450000);
  });

  it("giữ đúng thứ tự bản vẽ: Ảnh in, Khung, Album", () => {
    const coCau = tinhCoCauMuaThem(rows);
    expect(coCau.map((c) => c.nhom)).toEqual(["anh_in", "khung", "album"]);
  });
});

describe("BB-303: tinhTheoNgayMuaThem", () => {
  it("gộp đúng theo ngày, ngày không có dòng nào trả về 0", () => {
    const cacNgay = ["2026-09-21", "2026-09-22", "2026-09-27"];
    const theoNgay = tinhTheoNgayMuaThem(rows, cacNgay);
    expect(theoNgay).toEqual([
      { ngay: "2026-09-21", tong: 0 },
      { ngay: "2026-09-22", tong: 1 * 150000 + 200000 },
      { ngay: "2026-09-27", tong: 450000 + 50000 },
    ]);
  });
});

describe("BB-303: tinhTheoChiNhanhMuaThem", () => {
  it("gộp theo chi nhánh, sắp giảm dần theo tổng tiền", () => {
    const theoChiNhanh = tinhTheoChiNhanhMuaThem(rows);
    expect(theoChiNhanh[0]?.branchId).toBe("q3"); // 500.000 > 350.000
    expect(theoChiNhanh[0]?.tongTien).toBe(450000 + 50000);
    expect(theoChiNhanh[1]?.branchId).toBe("q1");
    expect(theoChiNhanh[1]?.tongTien).toBe(1 * 150000 + 200000);
  });
});
