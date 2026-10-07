/**
 * BB-392 mục 3 (anh 06/10, mục 10 + 6) — THUẦN, không cơ sở dữ liệu.
 *  a. Nhãn nhà "Nhà <tên> · Buổi N/M" cho bộ thuộc khách có ≥ 2 bộ.
 *  b. Tên bộ cũ dính đuôi số dòng chi tiết hoá đơn → hiển thị sạch.
 */
import { describe, it, expect } from "vitest";
import { tinhNhaCuaBo, chuNhanNha } from "@/lib/gia-dinh/nha-cua-bo";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";
import { tinhTieuDeBoAnhQuanTri, dongThongTinBoAnhQuanTri } from "@/lib/utils/dinh-dang";

const BAN = "Album · HD_20260910#5074_12654,HD_20260910#5074_12886";

describe("BB-392 mục 3b: tên bộ hiển thị sạch", () => {
  it("bỏ đuôi số dòng chi tiết, gộp trùng; tên thường giữ nguyên", () => {
    expect(hienTieuDeBoAnh(BAN)).toBe("Album · HD_20260910#5074");
    expect(hienTieuDeBoAnh("Album · HD_20260907#5034_1,HD_20260910#5100_2")).toBe("Album · HD_20260907#5034 + HD_20260910#5100");
    expect(hienTieuDeBoAnh("Bé Na thôi nôi")).toBe("Bé Na thôi nôi");
  });
  it("tiêu đề quản trị dùng chung (danh sách bộ, Bàn làm việc, chi tiết) lùi về tên sạch", () => {
    expect(tinhTieuDeBoAnhQuanTri({ customerName: "KH · HD_20260910#5074", duPhong: BAN })).toEqual({
      tieuDe: "Album · HD_20260910#5074",
      laMaHopDong: true,
    });
    expect(dongThongTinBoAnhQuanTri({ tieuDe: "Nguyễn Thị Mai", maHoaDon: "HD_20260910#5074_12654,HD_20260910#5074_12886" })).toBe(
      "HD_20260910#5074",
    );
  });
});

describe("BB-392 mục 3a: nhãn nhà nhiều buổi", () => {
  const bo = (id: string, kh: string | null, ngay: string, so?: number | null) => ({
    id,
    customer_id: kh,
    created_at: `2026-${ngay}T01:00:00Z`,
    so_thu_tu_khach: so,
  });
  it("khách ≥ 2 bộ: Buổi N/M theo thứ tự tạo; khách 1 bộ: không có nhãn", () => {
    const nha = tinhNhaCuaBo(
      [bo("b2", "kh-1", "09-20"), bo("b1", "kh-1", "09-01"), bo("b3", "kh-1", "10-01"), bo("c1", "kh-2", "09-05")],
      new Map([["kh-1", "Nguyễn Thị Mai"]]),
    );
    expect(nha.get("b1")).toMatchObject({ customerId: "kh-1", buoi: 1, tong: 3 });
    expect(nha.get("b3")).toMatchObject({ buoi: 3, tong: 3 });
    expect(chuNhanNha(nha.get("b2")!)).toBe("Nhà Nguyễn Thị Mai · Buổi 2/3");
    expect(nha.has("c1")).toBe(false);
  });
  it("có cột so_thu_tu_khach thì dùng đúng số đó (khớp link gia đình); không tên thật → 'Nhà này'", () => {
    const nha = tinhNhaCuaBo([bo("x1", "kh-3", "09-01", 2), bo("x2", "kh-3", "09-02", 1)]);
    expect(nha.get("x1")!.buoi).toBe(2);
    expect(chuNhanNha(nha.get("x2")!)).toBe("Nhà này · Buổi 1/2");
  });
});
