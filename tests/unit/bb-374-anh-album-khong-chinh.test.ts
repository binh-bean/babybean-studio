/**
 * BB-374 — "Ảnh album không chỉnh sửa": luật thuần (không chạm cơ sở dữ liệu).
 *
 * Canh:
 *   1. Số suất = tổng quantity dòng `album_unedited`, cả hai tầng hợp đồng — KHÔNG lẫn
 *      dòng "Edit file" (hạn mức chỉnh sửa) và ngược lại.
 *   2. Không vượt N; tấm đang thả tim không vào được; chọn lại tấm đã có thì không bị chặn.
 *   3. Khách không tự "mua" suất này: `sanPhamBanChoKhach` loại nó, kể cả khi chất liệu
 *      mang chữ "album" (khi đó `nhomSanPham` xếp nó vào nhóm album ĐANG BÁN).
 *   4. Đồng bộ danh mục Lark không tắt sản phẩm của app (không có mã Lark).
 *   5. Một tấm không bao giờ nằm ở cả hai danh sách (ảnh chỉnh thắng).
 */
import { describe, it, expect } from "vitest";
import {
  kiemChonAlbumKhongChinh,
  soSuatAlbumKhongChinh,
  tachAnhChinhVaKhongChinh,
} from "@/lib/gallery/anh-album-khong-chinh";
import { sanPhamBanChoKhach } from "@/lib/products/nhom-san-pham";
import { sanPhamCanTat } from "../../scripts/sync-lark-catalog.mjs";

describe("BB-374 số suất ảnh album không chỉnh sửa", () => {
  it("cộng dòng album_unedited ở cả dòng cha lẫn thành phần, bỏ qua Edit file và hàng in", () => {
    const items = [
      {
        kind: "shoot_package",
        quantity: 1,
        components: [
          { kind: "edited_photo", quantity: 15 },
          { kind: "album_unedited", quantity: 2 },
          { kind: "print", quantity: 1 },
        ],
      },
      { kind: "album_unedited", quantity: 5 },
      { kind: "edited_photo", quantity: 5 },
    ];
    expect(soSuatAlbumKhongChinh(items)).toBe(7);
  });

  it("bộ không có dòng nào thì 0 suất (màn khách không hiện gì)", () => {
    expect(soSuatAlbumKhongChinh([{ kind: "edited_photo", quantity: 15 }])).toBe(0);
    expect(soSuatAlbumKhongChinh(null)).toBe(0);
  });
});

describe("BB-374 luật chọn tấm cho suất", () => {
  it("chọn được khi còn suất", () => {
    expect(kiemChonAlbumKhongChinh({ soSuat: 5, soDaChon: 4, daCoTamNay: false, laAnhChinhSua: false })).toBeNull();
  });
  it("đủ N tấm thì chặn tấm thứ N+1", () => {
    expect(kiemChonAlbumKhongChinh({ soSuat: 5, soDaChon: 5, daCoTamNay: false, laAnhChinhSua: false })).toBe("HET_SUAT");
  });
  it("tấm đang thả tim (ảnh chỉnh sửa) không vào được — một tấm không là cả hai", () => {
    expect(kiemChonAlbumKhongChinh({ soSuat: 5, soDaChon: 0, daCoTamNay: false, laAnhChinhSua: true })).toBe(
      "DANG_LA_ANH_CHINH",
    );
  });
  it("bộ không có suất thì không chọn được", () => {
    expect(kiemChonAlbumKhongChinh({ soSuat: 0, soDaChon: 0, daCoTamNay: false, laAnhChinhSua: false })).toBe(
      "KHONG_CO_SUAT",
    );
  });
  it("chọn lại đúng tấm đã có (bấm hai lần) thì không bị báo hết suất", () => {
    expect(kiemChonAlbumKhongChinh({ soSuat: 5, soDaChon: 5, daCoTamNay: true, laAnhChinhSua: false })).toBeNull();
  });
});

describe("BB-374 khách không tự cấp suất qua cửa hàng", () => {
  const sp = (material: string | null) => ({
    name: "Ảnh album không chỉnh sửa",
    isActive: true,
    kind: "album_unedited",
    material,
    size: null,
  });
  it("không bán sản phẩm album_unedited, kể cả khi chất liệu ghi 'Album (Ultra HD)'", () => {
    expect(sanPhamBanChoKhach(sp(null))).toBe(false);
    expect(sanPhamBanChoKhach(sp("Album (Ultra HD)"))).toBe(false);
  });
  it("đối chứng: album thật cùng chất liệu VẪN bán (phép thử không xanh vì hàm luôn trả false)", () => {
    expect(
      sanPhamBanChoKhach({ name: "Album (Ultra HD) 20x20", isActive: true, kind: "print", material: "Album (Ultra HD)", size: "20x20" }),
    ).toBe(true);
  });
});

describe("BB-374 đồng bộ danh mục Lark không tắt sản phẩm của app", () => {
  it("album_unedited không có mã Lark vẫn giữ; sản phẩm lạc khác vẫn bị tắt", () => {
    const hienCo = [
      { id: "app", name: "Ảnh album không chỉnh sửa", lark_record_id: null, is_active: true, kind: "album_unedited" },
      { id: "lac", name: "Fixture Gỗ 20x30", lark_record_id: null, is_active: true, kind: "print" },
    ];
    expect(sanPhamCanTat(hienCo, new Set()).map((p) => p.id)).toEqual(["lac"]);
  });
});

describe("BB-374 một tấm không nằm ở cả hai danh sách", () => {
  it("tấm vừa thả tim vừa còn sót trong danh sách không chỉnh → chỉ là ảnh chỉnh", () => {
    const { chinhSua, khongChinh } = tachAnhChinhVaKhongChinh(
      [{ photoId: "a" }, { photoId: "b" }],
      ["b", "c", "c", "d"],
    );
    expect(chinhSua.map((x) => x.photoId)).toEqual(["a", "b"]);
    expect(khongChinh).toEqual(["c", "d"]);
  });
});
