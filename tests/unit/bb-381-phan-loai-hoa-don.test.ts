/**
 * BB-381 — phân loại hoá đơn của bộ ảnh 0 tấm: gói chụp vs đơn hậu kỳ mua thêm.
 * Tên sản phẩm là tên DANH MỤC thật (Baby 02, Fam 03, UV 13x18, Edit file…) — danh mục
 * sản phẩm, không phải dữ liệu khách.
 *
 * Kiểm ngược (đã chạy, xem bàn giao): cho `laDichVuChup` trả `true` với mọi sản phẩm → ca
 * "in thêm / chỉnh thêm file" thành gói chụp → ĐỎ; bỏ ngoại lệ "Dịch Vụ Bán Lẻ" → ĐỎ;
 * cho `phanLoaiHoaDon([])` trả "hau_ky" → ĐỎ.
 */
import { describe, it, expect } from "vitest";
import {
  laDichVuChup,
  phanLoaiHoaDon,
  lyDoChuaCoAnh,
  tomTatDong,
  type DongSanPham,
} from "@/lib/gallery/phan-loai-hoa-don";
import { chonBoGoc } from "@/lib/gallery/bo-anh-rong";

const sp = (kind: string | null, name: string): DongSanPham => ({ kind, name });

describe("BB-381 phanLoaiHoaDon — gói chụp", () => {
  it.each([
    ["Baby 02 + UV 13x18 + Edit file", [sp("shoot_package", "Baby 02"), sp("print", "UV 13x18"), sp("edited_photo", "Edit file")]],
    ["Fam 03 + Makeup", [sp("shoot_package", "Fam 03"), sp("service", "Makeup")]],
    ["Newborn 01 trơn", [sp("shoot_package", "Newborn 01")]],
    ["chỉ có Thêm set chụp", [sp("addon", "Thêm set chụp")]],
    ["chỉ có Bóng bay (đạo cụ buổi chụp)", [sp("addon", "Bóng bay"), sp("print", "Gỗ 20x30")]],
  ])("%s → goi_chup", (_ten, dong) => {
    expect(phanLoaiHoaDon(dong)).toBe("goi_chup");
  });
});

describe("BB-381 phanLoaiHoaDon — đơn hậu kỳ mua thêm (không có dịch vụ chụp)", () => {
  it.each([
    ["chỉnh thêm file", [sp("edited_photo", "Edit file")]],
    ["in thêm UV + Gỗ", [sp("print", "UV 13x18"), sp("print", "Gỗ 20x30")]],
    ["in thêm + chỉnh thêm", [sp("edited_photo", "Edit file"), sp("print", "Khung HQ 20x30")]],
    ["Dịch vụ Hậu Kỳ", [sp("service", "Dịch vụ Hậu Kỳ")]],
    ["Dịch Vụ Bán Lẻ (Lark xếp nhóm Chụp/Quay nhưng không chụp) + in", [sp("shoot_package", "Dịch Vụ Bán Lẻ"), sp("print", "UV 10x15")]],
    ["addon hậu kỳ: Edit file Ảnh Phóng + Ghép layout Album", [sp("addon", "Edit file Ảnh Phóng"), sp("addon", "Ghép layout Album")]],
    ["Album in thêm", [sp("print", "Album (Ultra HD) 20x20"), sp("album_unedited", "Ảnh album không chỉnh sửa")]],
  ])("%s → hau_ky", (_ten, dong) => {
    expect(phanLoaiHoaDon(dong)).toBe("hau_ky");
  });

  it("chưa có dòng hoá đơn nào → chua_ro (không đoán là hậu kỳ để khỏi ẩn nhầm bộ có gói chụp)", () => {
    expect(phanLoaiHoaDon([])).toBe("chua_ro");
  });

  it("sản phẩm không còn trong danh mục (kind null) không tính là chụp", () => {
    expect(laDichVuChup(sp(null, "Baby 02"))).toBe(false);
    expect(phanLoaiHoaDon([sp(null, "Baby 02")])).toBe("hau_ky");
  });
});

describe("BB-381 lyDoChuaCoAnh", () => {
  it.each([
    [{ drive_folder_id: null, sync_error: null }, "chua_co_link"],
    [{ drive_folder_id: "  ", sync_error: null }, "chua_co_link"],
    [{ drive_folder_id: "SEED_FOLDER_ID_001", sync_error: null }, "chua_dong_bo"],
    [{ drive_folder_id: "SEED_FOLDER_ID_001", sync_error: "Thư mục chưa được chia sẻ công khai" }, "chua_chia_se"],
    [{ drive_folder_id: "SEED_FOLDER_ID_001", sync_error: "Thư mục không có tấm ảnh nào" }, "thu_muc_rong"],
    [{ drive_folder_id: "SEED_FOLDER_ID_001", sync_error: "Drive không khả dụng" }, "loi_drive"],
  ] as const)("%o → %s", (g, ky) => {
    expect(lyDoChuaCoAnh(g)).toBe(ky);
  });
});

describe("BB-381 tomTatDong + chonBoGoc", () => {
  it("gộp cùng tên, ×số lượng", () => {
    expect(
      tomTatDong([
        { name: "UV 13x18", quantity: 2 },
        { name: "Edit file", quantity: 5 },
        { name: "UV 13x18", quantity: 1 },
        { name: "Gỗ 20x30", quantity: null },
      ]),
    ).toBe("UV 13x18 ×3 · Edit file ×5 · Gỗ 20x30");
  });

  it("bộ gốc = bộ có ảnh gần nhất tạo TRƯỚC đơn; không có thì bộ mới nhất", () => {
    const bo = [
      { id: "a", created_at: "2026-05-01T00:00:00Z" },
      { id: "b", created_at: "2026-08-01T00:00:00Z" },
      { id: "c", created_at: "2026-10-01T00:00:00Z" },
    ];
    expect(chonBoGoc("2026-09-01T00:00:00Z", bo)?.id).toBe("b");
    expect(chonBoGoc("2026-01-01T00:00:00Z", bo)?.id).toBe("c");
    expect(chonBoGoc("2026-09-01T00:00:00Z", [])).toBeNull();
  });
});
