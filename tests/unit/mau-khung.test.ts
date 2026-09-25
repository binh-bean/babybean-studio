/**
 * Phép thử canh cho `src/lib/gallery/mau-khung.ts` (BB-222 — mẫu khung tham
 * khảo trên màn "treo ảnh của con lên tường") và phần đổi của
 * `khung-tren-tuong.ts` cho phép truyền bề rộng viền theo mẫu.
 *
 * KIỂM NGƯỢC (chạy tay trước khi nộp, dán kết quả vào commit):
 *   1. Đổi `anh` của một mẫu trong `MAU_KHUNG` thành đường dẫn không tồn tại
 *      trong `public/` → test "mọi mẫu có tệp ảnh tồn tại" phải ĐỎ, nêu đúng
 *      tên mẫu và đường dẫn sai.
 *   2. Đổi tham số `vienCmMoiCanh` mặc định của `tinhKhungTrenTuong` thành
 *      một số CỐ ĐỊNH không đọc từ đối số (bỏ qua đối số thứ 5) → test "viền
 *      mảnh 1cm cho phép cỡ lớn hơn vừa tường" phải ĐỎ vì viền 1cm và 2.5cm
 *      cho kết quả giống hệt nhau.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAU_KHUNG, MAU_KHUNG_MAC_DINH } from "@/lib/gallery/mau-khung";
import { tinhKhungTrenTuong } from "@/lib/gallery/khung-tren-tuong";
import { PHONG_TREO } from "@/lib/gallery/phong-treo";

const ROOT = path.resolve(__dirname, "../..");

describe("MAU_KHUNG", () => {
  it("có ít nhất một mẫu, mỗi mẫu đủ trường bắt buộc", () => {
    expect(MAU_KHUNG.length).toBeGreaterThan(0);
    for (const m of MAU_KHUNG) {
      expect(m.ma.length).toBeGreaterThan(0);
      expect(m.ten.length).toBeGreaterThan(0);
      expect(m.anh.startsWith("/")).toBe(true);
      expect(m.slicePx).toBeGreaterThan(0);
      expect(m.vienCm).toBeGreaterThan(0);
    }
  });

  it("mã không trùng nhau", () => {
    const mas = MAU_KHUNG.map((m) => m.ma);
    expect(new Set(mas).size).toBe(mas.length);
  });

  it("mọi mẫu có tệp ảnh tồn tại thật trong public/", () => {
    for (const m of MAU_KHUNG) {
      const full = path.join(ROOT, "public", m.anh.replace(/^\//, ""));
      expect(fs.existsSync(full), `Thiếu tệp ảnh cho mẫu "${m.ma}": ${full}`).toBe(true);
    }
  });

  it("mẫu mặc định nằm trong danh sách", () => {
    expect(MAU_KHUNG.some((m) => m.ma === MAU_KHUNG_MAC_DINH.ma)).toBe(true);
  });
});

describe("tinhKhungTrenTuong với vienCmMoiCanh theo mẫu khung", () => {
  it("không truyền vienCmMoiCanh vẫn dùng đúng mặc định cũ (không vỡ chỗ gọi khác)", () => {
    const phong = PHONG_TREO["phong-khach"].doc;
    const cu = tinhKhungTrenTuong(phong, "40x60", "doc", true);
    const moiMacDinh = tinhKhungTrenTuong(phong, "40x60", "doc", true, 2.5);
    expect(cu).toEqual(moiMacDinh);
  });

  it("viền mảnh 1cm (vàng) cho phép cỡ lớn hơn vừa tường so với viền 2.5cm (đen/gỗ/trắng)", () => {
    // hanh-lang-doc: tường trống cao ~143.3cm (910px / 6.35px·cm⁻¹). Cỡ
    // 80×140 dọc: cao thật + viền 2.5cm×2=5cm → 145cm (TRÀN, không vừa);
    // cùng cỡ đó với viền mảnh 1cm×2=2cm → 142cm (VỪA, sát nhưng lọt) — đúng
    // biên đo tay để khác biệt hai bề rộng viền lộ ra ở kết quả "vua".
    const phong = PHONG_TREO["hanh-lang"].doc;
    const vien25 = tinhKhungTrenTuong(phong, "80x140", "doc", true, 2.5);
    const vien1 = tinhKhungTrenTuong(phong, "80x140", "doc", true, 1);
    expect(vien25.vua).toBe(false);
    expect(vien1.vua).toBe(true);
  });

  it("mọi vienCm khai báo trong MAU_KHUNG đều tạo ra kết quả tính khác nhau khi khác số", () => {
    const phong = PHONG_TREO["phong-khach"].doc;
    const ketQua = MAU_KHUNG.map((m) => tinhKhungTrenTuong(phong, "60x90", "doc", true, m.vienCm));
    // Không đòi tất cả khác nhau (có thể trùng vienCm), chỉ đòi hàm THẬT SỰ
    // đọc vienCm của từng mẫu — so hai mẫu có vienCm khác nhau trong danh mục.
    const vienKhacNhau = MAU_KHUNG.filter((m) => MAU_KHUNG.findIndex((n) => n.vienCm !== m.vienCm) !== -1);
    expect(vienKhacNhau.length).toBeGreaterThan(0);
    const a = MAU_KHUNG.find((m) => m.vienCm === 2.5)!;
    const b = MAU_KHUNG.find((m) => m.vienCm === 1)!;
    const kqA = tinhKhungTrenTuong(phong, "60x90", "doc", true, a.vienCm);
    const kqB = tinhKhungTrenTuong(phong, "60x90", "doc", true, b.vienCm);
    if (kqA.vua && kqB.vua) {
      expect(kqA.hinh.rong).not.toBeCloseTo(kqB.hinh.rong, 3);
    }
    expect(ketQua.length).toBe(MAU_KHUNG.length);
  });
});
