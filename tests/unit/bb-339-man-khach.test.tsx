/**
 * BB-339 — màn khách: ảnh nét trong lưới chọn (mục 1), món trong gói bấm vào
 * chọn ảnh được (mục 3), cửa hàng báo "Trong gói: x/y ảnh" + xem/đổi ảnh dòng
 * giỏ (mục 4), Kim Tuyến hiện đúng tên (mục 6).
 *
 * Dựng bằng `renderToStaticMarkup` (không giả lập hook — AGENTS.md §5a), dữ
 * liệu giả hoàn toàn.
 *
 * Kiểm ngược: hoàn nguyên `?w=200` trong `chon-anh-nhieu-tam.tsx` → ca mục 1
 * đỏ; bỏ nút `onChonAnh` của `tom-tat-san-pham-in.tsx` → ca mục 3 đỏ; bỏ khối
 * `trongGoi` / nút "Xem" ở `cua-hang.tsx` → ca mục 4 đỏ (kết quả trong bàn giao).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChonAnhNhieuTam } from "@/components/features/gallery/chon-anh-nhieu-tam";
import { TomTatSanPhamIn } from "@/components/features/gallery/tom-tat-san-pham-in";
import { CuaHang } from "@/components/features/gallery/cua-hang";
import { formatKichThuoc, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";

vi.mock("@/lib/utils/khoa-cuon-trang", () => ({ khoaCuonTrang: () => () => {} }));

const anh = [
  { id: "11111111-1111-4111-8111-111111111111", fileName: "Fixture BB-339 a.jpg" },
  { id: "22222222-2222-4222-8222-222222222222", fileName: "Fixture BB-339 b.jpg" },
];

describe("BB-339 mục 1 — lưới chọn ảnh dùng ảnh nét theo srcset", () => {
  it("không còn ảnh ?w=200; có srcset 400w/800w và sizes", () => {
    const html = renderToStaticMarkup(
      <ChonAnhNhieuTam mo onDong={() => {}} anhDaThaTim={anh} tatCaAnh={anh} dangLuu={false} onXacNhan={() => {}} />,
    );
    expect(html).not.toContain("?w=200");
    expect(html).toContain(`/api/img/${anh[0]!.id}?w=800 800w`);
    expect(html).toMatch(/sizes="[^"]*vw"/);
  });

  it("có toiDa thì đếm 'Đã chọn x/y tấm' và tiêu đề riêng", () => {
    const html = renderToStaticMarkup(
      <ChonAnhNhieuTam
        mo
        onDong={() => {}}
        anhDaThaTim={anh}
        tatCaAnh={anh}
        daChonSan={[anh[0]!.id]}
        dangLuu={false}
        onXacNhan={() => {}}
        tieuDe="Ảnh cho Gỗ 40×60"
        toiDa={1}
      />,
    );
    expect(html).toContain("Ảnh cho Gỗ 40×60");
    expect(html).toContain("Đã chọn 1 / 1 tấm"); // BB-362: một kiểu "x / y"
  });
});

describe("BB-339 mục 3 — món trong gói bấm vào chọn ảnh được", () => {
  const dong = [
    { galleryItemId: "gi-1", name: "Gỗ 40x60", quantity: 1, nhom: "anh_in" as const, anh: [] },
    { galleryItemId: "gi-2", name: "Album (Ultra HD) 20x20", quantity: 1, nhom: "album" as const, anh: [] },
  ];

  it("chưa khoá + có onChonAnh: mỗi món một nút chọn ảnh", () => {
    const html = renderToStaticMarkup(<TomTatSanPhamIn dong={dong} onMoAnh={() => {}} onChonAnh={() => {}} />);
    expect(html.match(/data-testid="chon-anh-mon-trong-goi"/g)?.length).toBe(2);
    expect(html).toContain("Chọn ảnh cho Ảnh in Gỗ 40×60"); // BB-362: cùng tên với giỏ
  });

  it("đã khoá: không có nút chọn ảnh", () => {
    const html = renderToStaticMarkup(<TomTatSanPhamIn dong={dong} onMoAnh={() => {}} onChonAnh={() => {}} khoa />);
    expect(html).not.toContain("chon-anh-mon-trong-goi");
  });
});

describe("BB-339 mục 4 — cửa hàng: Trong gói x/y ảnh, xem/đổi ảnh dòng giỏ", () => {
  const html = renderToStaticMarkup(
    <CuaHang
      mo
      onDong={() => {}}
      danhMuc={[
        { productId: "p-uv", name: "UV 10x15", material: "UV", size: "10x15", unitPrice: 20000, nhom: "anh_in", canGanAnh: true },
      ]}
      daMua={[
        { id: "d1", productId: "p-uv", name: "UV 10x15", quantity: 2, totalPrice: 40000, photoId: anh[0]!.id },
      ]}
      tongTien={40000}
      anhDaChon={anh}
      khoa={false}
      dangLuu={false}
      onMua={() => {}}
      trongGoi={{
        hanMuc: 15,
        daChon: 4,
        mon: [{ galleryItemId: "gi-1", name: "Gỗ 40x60", quantity: 1, laAlbum: false, soAnh: 0 }],
        onChonAnh: () => {},
      }}
    />,
  );

  it("báo 'Trong gói: 4/15 ảnh' và từng món trong gói có nút chọn", () => {
    expect(html).toContain("4 / 15 tấm");
    expect(html).toContain("Chọn ảnh trong gói cho Gỗ 40×60");
    expect(html).toContain("0 / 1 tấm");
  });

  it("dòng giỏ có ảnh là nút bấm để xem lớn", () => {
    expect(html).toContain("Xem ảnh của Ảnh in UV 10×15");
  });

  it("UV có câu giải thích ảnh giấy (BB-358: không cán gỗ, không khung)", () => {
    expect(html).toContain("In trên giấy ảnh, để gài album hoặc cất hộp ảnh gia đình ạ.");
    expect(html).not.toMatch(/cán (lên )?gỗ/);
  });
});

describe("BB-339 mục 6 — Kim Tuyến hiện đúng tên cho khách", () => {
  it("không lộ chữ Cavas", () => {
    expect(formatKichThuoc("Cavas/Kim tuyến 40x60")).toBe("Kim Tuyến 40×60");
    expect(
      tenSanPhamChoKhach({ name: "Cavas/Kim tuyến 40x60", nhom: "anh_in", material: "Cavas/Kim tuyến", size: "40x60" }),
    ).toBe("Ảnh in Kim Tuyến 40×60");
  });
});
