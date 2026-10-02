/**
 * BB-319 (báo cáo thẩm mỹ vòng 6) — hai luật hiển thị cho màn khách:
 *
 *  K-D1  Nhãn giỏ phải khớp trạng thái THẬT: món mới thêm vào giỏ = "Trong giỏ";
 *        chỉ khi đơn đã gửi mới được nói "Đã đặt mua". Món đặt cả lô không phải
 *        album ("UV 10×15 ×3") không được nằm dưới nhãn ALBUM.
 *  K-N1  Một ký hiệu kích thước "×": tên sản phẩm từ Lark ("10x15") được chuẩn
 *        hoá cho mọi chỗ hiển thị, dữ liệu gốc (cột `size`) giữ nguyên.
 *
 * Dựng bằng `renderToStaticMarkup` (không giả lập hook): xem
 * tests/unit/sheet-trigger-aschild.test.tsx.
 *
 * Kiểm ngược (AGENTS.md §5a): hoàn nguyên `donDaGui` (luôn nói "Đã đặt mua") thì
 * ca "chưa gửi" ĐỎ; bỏ `laAlbum` khỏi bộ lọc thì ca "không nằm dưới ALBUM" ĐỎ;
 * bỏ chuẩn hoá `name` thì ca "10x15 -> 10×15" ĐỎ.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BangSanPhamCuaAnh } from "@/components/features/gallery/bang-san-pham-cua-anh";
import { chuanHoaKyHieuKichThuocTrongGallery, formatKichThuoc } from "@/lib/utils/dinh-dang";

const monLe = { addonId: "a1", name: "UV 10×15 ×3", coAnhNay: false, soAnh: 0, laAlbum: false };
const albumMua = { addonId: "a2", name: "Album (Ultra HD) 15×21", coAnhNay: false, soAnh: 0, laAlbum: true };

function dung(donDaGui: boolean, albumDaMua: typeof monLe[]) {
  return renderToStaticMarkup(
    <BangSanPhamCuaAnh
      suatTrongGoi={[]}
      albumTrongGoi={[]}
      albumDaMua={albumDaMua}
      monMuaThem={[]}
      albumBanDuoc={[]}
      donDaGui={donDaGui}
      anhDaChon
      khoa={false}
      dangLuu={false}
      onDatVaoGoi={() => {}}
      onDatVaoAlbum={() => {}}
      onDatMuaThem={() => {}}
      onMuaAlbum={() => {}}
    />,
  );
}

describe("K-D1: nhãn giỏ khớp trạng thái", () => {
  it("đơn CHƯA gửi: dòng lẻ ghi 'Trong giỏ', không có 'Đã đặt mua'", () => {
    const html = dung(false, [monLe]);
    expect(html).toContain("Trong giỏ");
    expect(html).toContain("UV 10×15 ×3");
    expect(html).not.toContain("Đã đặt mua");
  });

  it("đơn ĐÃ gửi: dòng lẻ ghi 'Đã đặt mua', không còn 'Trong giỏ'", () => {
    const html = dung(true, [monLe]);
    expect(html).toContain("Đã đặt mua");
    expect(html).not.toContain("Trong giỏ");
  });

  it("dòng không phải album KHÔNG nằm dưới nhãn ALBUM; nằm ở mục Mua thêm", () => {
    const html = dung(false, [monLe]);
    expect(html).not.toMatch(/>Album<\/h3>/);
    expect(html.indexOf("Mua thêm cho tấm này")).toBeLessThan(html.indexOf("UV 10×15 ×3"));
  });

  it("album mua thêm vẫn nằm dưới nhãn Album, nhãn theo trạng thái", () => {
    const chua = dung(false, [albumMua as typeof monLe]);
    expect(chua).toMatch(/>Album<\/h3>/);
    expect(chua).toContain("Trong giỏ");
    expect(chua).not.toContain("Đã đặt mua");
    expect(dung(true, [albumMua as typeof monLe])).toContain("Đã đặt mua");
  });
});

describe("K-N1: một ký hiệu kích thước ×", () => {
  it("10x15 / 10 x 15 / 10X15 -> 10×15; chữ x trong từ khác giữ nguyên", () => {
    expect(formatKichThuoc("UV 10x15")).toBe("UV 10×15");
    expect(formatKichThuoc("Album (Ultra HD) 15x21")).toBe("Album (Ultra HD) 15×21");
    expect(formatKichThuoc("10 x 15")).toBe("10×15");
    expect(formatKichThuoc("10X15")).toBe("10×15");
    expect(formatKichThuoc("Xoài Extra 10×15")).toBe("Xoài Extra 10×15");
  });

  it("chuẩn hoá MỌI mảng tên sản phẩm của bộ ảnh, giữ nguyên cột size (khoá so khớp)", () => {
    const g = chuanHoaKyHieuKichThuocTrongGallery({
      contract: { items: [{ name: "Album (Ultra HD) 15x21", components: [{ name: "tờ 15x21" }] }] },
      albumBia: [{ name: "Album (Ultra HD) 15x21" }],
      addons: {
        items: [{ name: "UV 10x15", size: "10x15" }],
        catalogue: [{ name: "UV 10x15", size: "10x15" }],
      },
    });
    expect(g.contract!.items[0]!.name).toBe("Album (Ultra HD) 15×21");
    // BB-361 — tên hiển thị cho khách viết hoa chữ đầu ("tờ" → "Tờ"); dữ liệu gốc không đổi.
    expect(g.contract!.items[0]!.components[0]!.name).toBe("Tờ 15×21");
    expect(g.albumBia![0]!.name).toBe("Album (Ultra HD) 15×21");
    expect(g.addons!.items[0]!.name).toBe("UV 10×15");
    expect(g.addons!.catalogue![0]!.name).toBe("UV 10×15");
    expect(g.addons!.items[0]!.size).toBe("10x15");
    expect(g.addons!.catalogue![0]!.size).toBe("10x15");
  });

  it("bộ ảnh không có hợp đồng/giỏ không làm vỡ", () => {
    expect(chuanHoaKyHieuKichThuocTrongGallery({})).toEqual({ contract: undefined, albumBia: undefined, addons: undefined });
  });
});
