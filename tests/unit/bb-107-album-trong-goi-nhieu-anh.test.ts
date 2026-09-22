/**
 * Album trong gói ăn NHIỀU ảnh, ảnh in ăn MỘT ảnh một suất.
 *
 * Chủ studio 22/09/2026, sau khi xem màn khách thật:
 *
 *     "Tư duy lại các luồng của việc bán hàng đi. **Album không phải là một
 *      ảnh**, và ảnh ở trong gói đã mua rồi — đâu, khách chọn thế nào?"
 *
 * Lỗi cũ rất dễ tái phát vì nó KHÔNG làm gì đổ vỡ: màn khách lấy mọi dòng
 * `kind='print'` rồi hiện "đã xếp x/số lượng". Với "Gỗ 40x60 ×2" thì đúng; với
 * "Album (Ultra HD) ×1" thì số 1 là MỘT CUỐN chứ không phải một tấm — ba mẹ đưa
 * tấm đầu vào là app báo đủ, tấm thứ hai hết đường vào.
 *
 * Phép thử này giữ đúng một câu: dòng nào ăn ảnh kiểu nào.
 */

import { describe, it, expect } from "vitest";
import { locHangInTrongGoi, conThieuAnh } from "@/lib/products/hang-in-trong-goi";

/** Hợp đồng thật của một buổi chụp: gói chụp có ảnh phóng + album, mua lẻ khung. */
const hopDong = [
  {
    id: "goi-1",
    name: "Gói chụp bé yêu",
    kind: "shoot_package",
    material: null,
    quantity: 1,
    components: [
      { id: "tp-go", name: "Gỗ 40x60", kind: "print", material: "Gỗ", quantity: 2 },
      {
        id: "tp-album",
        name: "Album (Ultra HD) 15x21",
        kind: "print",
        material: "Album (Ultra HD)",
        quantity: 1,
      },
      // Ruột album: 20 TỜ trong một cuốn. Dòng này là chỗ hai cách đếm tách
      // hẳn nhau — xem ca 3.
      {
        id: "tp-to-album",
        name: "tờ Album (Ultra HD) 15x21",
        kind: "print",
        material: "tờ Album (Ultra HD)",
        quantity: 20,
      },
      // Bánh sinh nhật đi kèm buổi chụp — không gắn với tấm ảnh nào.
      { id: "tp-banh", name: "Bánh sinh nhật", kind: "addon", material: null, quantity: 1 },
    ],
  },
  {
    id: "le-khung",
    name: "Khung HQ 40x60",
    kind: "print",
    material: "Khung HQ",
    quantity: 1,
    components: [],
  },
];

describe("Hàng in trong gói", () => {
  const dong = locHangInTrongGoi(hopDong);
  const tim = (id: string) => dong.find((d) => d.galleryItemId === id)!;

  it("1. Lấy đủ cả hai tầng, và bỏ thứ không gắn với ảnh", () => {
    expect(dong.map((d) => d.galleryItemId).sort()).toEqual(
      ["le-khung", "tp-album", "tp-go", "tp-to-album"].sort(),
    );
    // Gói chụp không phải hàng in; bánh sinh nhật không gắn với tấm nào.
    expect(dong.some((d) => d.galleryItemId === "goi-1")).toBe(false);
    expect(dong.some((d) => d.galleryItemId === "tp-banh")).toBe(false);
  });

  it("2. Album trong gói được xếp vào nhóm album, không phải ảnh in", () => {
    // Đây là cái sai gốc: chất liệu "Album (Ultra HD)" đi cùng kind 'print',
    // nên nếu chỉ nhìn `kind` thì album thành một tấm ảnh phóng.
    expect(tim("tp-album").nhom).toBe("album");
    expect(tim("tp-go").nhom).toBe("anh_in");
    expect(tim("le-khung").nhom).toBe("khung");
  });

  it("3. Album đếm theo CUỐN, không theo suất — và đây là chỗ hai luật tách nhau", () => {
    const album = tim("tp-album");
    expect(album.quantity).toBe(1); // một CUỐN, không phải một tấm
    expect(conThieuAnh(album, 0)).toBe(true); // cuốn rỗng thì nhắc
    expect(conThieuAnh(album, 1)).toBe(false);
    expect(conThieuAnh(album, 12)).toBe(false);

    /*
      Dòng "tờ Album ×20" mới là ca phân biệt thật.

      Với `quantity = 1`, luật cũ (`daXep < quantity`) và luật đúng (`daXep
      === 0`) cho cùng kết quả ở mọi con số — nên một phép thử chỉ có cuốn
      album ×1 KHÔNG chứng minh được gì cả: lộn về luật cũ nó vẫn xanh.

      Với 20 tờ ruột thì khác hẳn: luật cũ đòi đủ 20 tấm mới thôi kêu "còn
      thiếu", trong khi ruột album ghép mấy tấm một tờ là việc của studio.
    */
    const toAlbum = tim("tp-to-album");
    expect(toAlbum.nhom).toBe("album");
    expect(toAlbum.quantity).toBe(20);
    expect(conThieuAnh(toAlbum, 0)).toBe(true);
    expect(conThieuAnh(toAlbum, 1)).toBe(false); // luật cũ trả về true ở đây
    expect(conThieuAnh(toAlbum, 19)).toBe(false);
  });

  it("4. Ảnh in thì ngược lại: đếm từng suất một", () => {
    const go = tim("tp-go"); // Gỗ 40x60 ×2
    expect(conThieuAnh(go, 0)).toBe(true);
    expect(conThieuAnh(go, 1)).toBe(true); // mới một tấm, còn một suất trống
    expect(conThieuAnh(go, 2)).toBe(false);
  });

  it("5. Khung cũng đếm theo suất — khung bọc quanh ĐÚNG một tấm", () => {
    const khung = tim("le-khung");
    expect(khung.nhom).toBe("khung");
    expect(conThieuAnh(khung, 0)).toBe(true);
    expect(conThieuAnh(khung, 1)).toBe(false);
  });

  it("6. Hợp đồng chỉ có gói chụp thì không có dòng nào để chọn ảnh", () => {
    // Không được bịa ra ô chọn cho thứ khách chưa mua (docs/16 mục 3.3).
    const chiGoi = locHangInTrongGoi([
      { id: "g", name: "Gói chụp", kind: "shoot_package", material: null, quantity: 1 },
    ]);
    expect(chiGoi).toEqual([]);
  });
});
