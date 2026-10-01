/**
 * BB-337 — "Khách gửi ảnh chọn" gom MỖI BỘ ẢNH MỘT DÒNG; số trên tab/menu đếm
 * theo số bộ; lượt ghé trong năm của trang khách.
 *
 * Hàm thuần, không chạm DB. Kiểm ngược (AGENTS §5a): bỏ phần gom theo
 * `galleryId` trong `gomTheoBoAnh` (mỗi nguồn một dòng) thì ca 1 và ca 4 đỏ.
 */
import { describe, expect, it } from "vitest";
import { gomTheoBoAnh } from "@/lib/gallery/khach-gui-anh-chon";
import { tomTatLuotGhe } from "@/lib/khach-hang/luot-ghe";
import { TABS_VIEC_CAN_XU_LY } from "@/lib/utils/viec-can-xu-ly-tabs";

const BO_A = { galleryId: "a", galleryTitle: "Fixture BB-337 A", branchName: "Chi nhánh Mẫu 1", customerName: "Nguyễn Thị Mai" };
const BO_B = { galleryId: "b", galleryTitle: "Fixture BB-337 B", branchName: "Chi nhánh Mẫu 2", customerName: "Trần Văn Nam" };

const dotMuaThem = (g: typeof BO_A, soDot: number, submittedAt: string) => ({
  ...g,
  soDot,
  soAnh: 3,
  tong: 90000,
  soSanPhamInChuaAnh: 0,
  submittedAt,
  sanPham: [{ ten: "Ảnh in 15x21", soLuong: 1, productId: "p", photoId: null, donGia: 0 }],
});

describe("BB-337 gomTheoBoAnh — mỗi bộ ảnh một dòng", () => {
  it("1. một khách vừa gửi đợt 1, vừa mua thêm 2 đợt, vừa nhờ chọn giúp → MỘT dòng đủ cả bốn việc", () => {
    const dong = gomTheoBoAnh(
      [{ ...BO_A, submittedAt: "2026-10-01T02:00:00Z" }],
      [dotMuaThem(BO_A, 3, "2026-10-01T05:00:00Z"), dotMuaThem(BO_A, 2, "2026-10-01T04:00:00Z")],
      [{ ...BO_A, nhoStudioChonThem: 4, soSanPhamInChuaAnh: 1, submittedAt: "2026-10-01T02:00:00Z" }],
    );
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({
      galleryId: "a",
      dot1ChoXacNhan: true,
      nhoStudioChonThem: 4,
      soSanPhamInChuaAnh: 1,
      guiLuc: "2026-10-01T02:00:00Z",
    });
    expect(dong[0]!.dotMuaThem.map((d) => d.soDot)).toEqual([2, 3]);
  });

  it("2. hai bộ khác nhau → hai dòng, bộ gửi sớm nhất lên trước", () => {
    const dong = gomTheoBoAnh(
      [{ ...BO_A, submittedAt: "2026-10-01T09:00:00Z" }],
      [dotMuaThem(BO_B, 2, "2026-09-30T09:00:00Z")],
      [],
    );
    expect(dong.map((d) => d.galleryId)).toEqual(["b", "a"]);
    expect(dong[0]!.dot1ChoXacNhan).toBe(false);
  });

  it("3. không có việc nào → không có dòng", () => {
    expect(gomTheoBoAnh([], [], [])).toEqual([]);
  });

  it("4. số trên tab 'Khách gửi ảnh chọn' = số BỘ ẢNH, không cộng dồn từng việc", () => {
    const tab = TABS_VIEC_CAN_XU_LY.find((t) => t.value === "khach-mua-them")!;
    expect(tab.label).toBe("Khách gửi ảnh chọn");
    const boAnh = gomTheoBoAnh(
      [{ ...BO_A, submittedAt: null }],
      [dotMuaThem(BO_A, 2, "2026-10-01T04:00:00Z")],
      [{ ...BO_A, nhoStudioChonThem: 2, soSanPhamInChuaAnh: 0, submittedAt: null }],
    );
    // Route trả cả `items` (từng đợt) lẫn `viecDot1` cho tương thích — số đếm phải theo `boAnh`.
    expect(tab.demSo({ boAnh, items: [{}], viecDot1: [{}] })).toBe(1);
  });
});

describe("BB-337 tomTatLuotGhe — lượt ghé trong năm", () => {
  it("chỉ đếm buổi chụp trong năm, gom theo chi nhánh, nhiều lượt lên trước", () => {
    const kq = tomTatLuotGhe(
      [
        { ngayChup: "2026-03-03", branchName: "Chi nhánh Mẫu 2" },
        { ngayChup: "2026-09-12", branchName: "Chi nhánh Mẫu 1" },
        { ngayChup: "2026-09-28", branchName: "Chi nhánh Mẫu 1" },
        { ngayChup: "2025-11-14", branchName: "Chi nhánh Mẫu 1" },
        { ngayChup: null, branchName: "Chi nhánh Mẫu 2" },
      ],
      2026,
    );
    expect(kq).toEqual({
      nam: 2026,
      soLuot: 3,
      chiNhanh: [
        { ten: "Chi nhánh Mẫu 1", soLuot: 2 },
        { ten: "Chi nhánh Mẫu 2", soLuot: 1 },
      ],
    });
  });
});
