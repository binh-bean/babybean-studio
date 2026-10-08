/**
 * BB-390 — khái niệm "album" đúng lời anh: album là SẢN PHẨM in (quyển 20–30 tấm,
 * một ảnh bìa). Hai việc: (1) gói có album → bước chọn ảnh bìa, Bean gợi ý 3–6 tấm;
 * (2) bán album → màn bán hàng, KHÔNG đòi chọn tấm.
 *
 * THUẦN: không cơ sở dữ liệu, không mạng. Component dựng thật bằng renderToStaticMarkup.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  coBuocChonBiaAlbum,
  huongAnh,
  huongBiaTuKhoAlbum,
  khoTrongTen,
  cuonAlbumDangBan,
  donDatAlbum,
  banAlbumCanChonAnh,
  laToRuotAlbum,
  type SanPhamAlbumTrongDanhMuc,
} from "@/lib/products/album-khai-niem";
import { goiYBiaAlbum, type UngVienBiaAlbum } from "@/lib/products/goi-y-bia-album";
import { BanAlbum } from "@/components/features/gallery/ban-album";
import { ChonBiaAlbum } from "@/components/features/gallery/chon-bia-album";

const CHU = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/ /g, " ").replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// 1. Khi nào hiện bước "Chọn ảnh bìa album"
// ---------------------------------------------------------------------------
describe("BB-390 1. coBuocChonBiaAlbum", () => {
  it("gói KHÔNG có album → không hiện bước chọn bìa (kể cả chủ link)", () => {
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 0, khoa: false, vaiTro: "owner" })).toBe(false);
  });
  it("gói có album, bộ còn mở, chủ link / người cùng chọn → hiện", () => {
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 1, khoa: false, vaiTro: "owner" })).toBe(true);
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 2, khoa: false, vaiTro: "co_editor" })).toBe(true);
  });
  it("đã chốt/đã giao → không hiện", () => {
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 1, khoa: true, vaiTro: "owner" })).toBe(false);
  });
  it("người thân chỉ xem / chỉ gợi ý → không hiện nút chọn bìa", () => {
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 1, khoa: false, vaiTro: "viewer" })).toBe(false);
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 1, khoa: false, vaiTro: "suggester" })).toBe(false);
    expect(coBuocChonBiaAlbum({ soAlbumTrongGoi: 1, khoa: false, vaiTro: undefined })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Gợi ý bìa
// ---------------------------------------------------------------------------
const u = (p: Partial<UngVienBiaAlbum> & { photoId: string }): UngVienBiaAlbum => ({
  selectionItemId: `si-${p.photoId}`,
  fileName: `${p.photoId}.jpg`,
  retouchNote: null,
  orderIndex: null,
  sortIndex: 0,
  ...p,
});

describe("BB-390 2. gợi ý bìa 3–6 tấm, hợp khổ bìa theo số đo thật", () => {
  it("mặc định tối đa 6 tấm; ít hơn thì đúng số đang có, không độn", () => {
    const nhieu = Array.from({ length: 12 }, (_, i) => u({ photoId: `p${i}`, sortIndex: i }));
    expect(goiYBiaAlbum(nhieu, null)).toHaveLength(6);
    const it3 = nhieu.slice(0, 3);
    expect(goiYBiaAlbum(it3, null).map((x) => x.photoId)).toEqual(["p0", "p1", "p2"]);
  });

  it("không tấm nào thả tim → không bịa gợi ý", () => {
    expect(goiYBiaAlbum([], null, 6, "vuong")).toEqual([]);
  });

  it("bìa vuông: cùng hạng thì tấm VUÔNG (theo width/height) lên trước tấm dọc/ngang", () => {
    const ds = [
      u({ photoId: "doc", sortIndex: 1, width: 4000, height: 6000 }),
      u({ photoId: "ngang", sortIndex: 2, width: 6000, height: 4000 }),
      u({ photoId: "vuong", sortIndex: 3, width: 3000, height: 3000 }),
    ];
    expect(goiYBiaAlbum(ds, null, 6, "vuong").map((x) => x.photoId)).toEqual(["vuong", "doc", "ngang"]);
    // Không biết hướng bìa (không đọc được khổ) → giữ thứ tự thả tim, không đoán.
    expect(goiYBiaAlbum(ds, null, 6, null).map((x) => x.photoId)).toEqual(["doc", "ngang", "vuong"]);
  });

  it("BB-391 cuốn 20x30 (cuốn đứng, bìa dọc): cùng hạng thì tấm DỌC lên trước", () => {
    const ds = [
      u({ photoId: "ngang", sortIndex: 1, width: 6000, height: 4000 }),
      u({ photoId: "vuong", sortIndex: 2, width: 3000, height: 3000 }),
      u({ photoId: "doc", sortIndex: 3, width: 4000, height: 6000 }),
    ];
    const huongBia = huongBiaTuKhoAlbum(khoTrongTen("Album (Ultra HD) 20x30"));
    expect(huongBia).toBe("doc");
    expect(goiYBiaAlbum(ds, null, 6, huongBia).map((x) => x.photoId)).toEqual(["doc", "ngang", "vuong"]);
  });

  it("hợp khổ KHÔNG vượt mặt tấm ba mẹ đã ghi chú (ưu tiên tim/chọn chỉnh kỹ trước)", () => {
    const ds = [
      u({ photoId: "vuong", sortIndex: 1, width: 3000, height: 3000 }),
      u({ photoId: "co-ghi-chu", sortIndex: 2, width: 4000, height: 6000, retouchNote: "Làm sáng giúp Bean" }),
    ];
    expect(goiYBiaAlbum(ds, null, 6, "vuong").map((x) => x.photoId)).toEqual(["co-ghi-chu", "vuong"]);
  });

  it("tấm thiếu số đo → trung tính, không bị loại", () => {
    const ds = [u({ photoId: "khong-so-do", sortIndex: 1 }), u({ photoId: "vuong", sortIndex: 2, width: 10, height: 10 })];
    const kq = goiYBiaAlbum(ds, null, 6, "vuong").map((x) => x.photoId);
    expect(kq).toEqual(["vuong", "khong-so-do"]);
  });

  it("hướng ảnh và khổ bìa đọc từ dữ liệu, không đoán", () => {
    expect(huongAnh(6000, 4000)).toBe("ngang");
    expect(huongAnh(4000, 6000)).toBe("doc");
    expect(huongAnh(3000, 3020)).toBe("vuong");
    expect(huongAnh(null, 4000)).toBeNull();
    expect(huongBiaTuKhoAlbum("20x20")).toBe("vuong");
    expect(huongBiaTuKhoAlbum("25×25")).toBe("vuong");
    // BB-391 — anh chốt: album khổ chữ nhật là cuốn ĐỨNG → bìa dọc, ghi xuôi hay ngược.
    expect(huongBiaTuKhoAlbum("20x30")).toBe("doc");
    expect(huongBiaTuKhoAlbum("15x21")).toBe("doc");
    expect(huongBiaTuKhoAlbum("30x20")).toBe("doc");
    expect(huongBiaTuKhoAlbum("không rõ")).toBeNull();
    expect(huongBiaTuKhoAlbum(null)).toBeNull();
    expect(khoTrongTen("Album (Ultra HD) 25x25 ×1")).toBe("25x25");
    expect(khoTrongTen("Album (Ultra HD)")).toBeNull();
  });

  it("màn khách dựng thật: hiện lời Bean gợi ý + ô gợi ý; gói có 2 album thì 2 khối", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChonBiaAlbum, {
        albums: [
          { galleryItemId: "a1", name: "Album (Ultra HD) 20x20", coverPhotoId: null, coverFileName: null },
          { galleryItemId: "a2", name: "Album (Ultra HD) 20x30", coverPhotoId: null, coverFileName: null },
        ],
        anhDaThaTim: Array.from({ length: 8 }, (_, i) => u({ photoId: `p${i}`, sortIndex: i })),
        coverPhotoIdBoAnh: null,
        khoa: false,
        dangLuu: false,
        onChonBia: () => {},
      }),
    );
    expect(html).toContain('data-testid="buoc-chon-bia-album"');
    expect(html).toContain("chon-bia-album-a1");
    expect(html).toContain("chon-bia-album-a2");
    // 6 gợi ý mỗi cuốn × 2 cuốn.
    expect(html.match(/data-testid="o-goi-y-bia"/g)?.length).toBe(12);
    expect(CHU(html)).toContain("Bean gợi ý những tấm hợp làm bìa");
  });
});

// ---------------------------------------------------------------------------
// 3. Bán album — màn bán hàng, không đòi chọn tấm
// ---------------------------------------------------------------------------
const DANH_MUC: SanPhamAlbumTrongDanhMuc[] = [
  { productId: "album-20x30", name: "Album (Ultra HD) 20x30", material: "Album (Ultra HD)", size: "20x30", unitPrice: 1_500_000, nhom: "album" },
  { productId: "album-20x20", name: "Album (Ultra HD) 20x20", material: "Album (Ultra HD)", size: "20x20", unitPrice: 1_200_000, nhom: "album" },
  { productId: "to-20x20", name: "tờ Album (Ultra HD) 20x20", material: "tờ Album (Ultra HD)", size: "20x20", unitPrice: 90_000, nhom: "album" },
  { productId: "album-chua-gia", name: "Album (Ultra HD) 30x30", material: "Album (Ultra HD)", size: "30x30", unitPrice: 0, nhom: "album" },
  { productId: "uv-10x15", name: "UV 10x15", material: "UV", size: "10x15", unitPrice: 15_000, nhom: "anh_in" },
];

describe("BB-390 3. bán album", () => {
  it("chỉ bày CUỐN album có giá trong danh mục (bỏ tờ ruột, bỏ chưa có giá, bỏ nhóm khác), giá tăng dần", () => {
    expect(cuonAlbumDangBan(DANH_MUC).map((s) => s.productId)).toEqual(["album-20x20", "album-20x30"]);
    expect(laToRuotAlbum({ name: "tờ Album (Ultra HD) 20x20", material: "tờ Album (Ultra HD)" })).toBe(true);
    expect(laToRuotAlbum({ name: "Album (Ultra HD) 20x20", material: "Album (Ultra HD)" })).toBe(false);
  });

  it("lệnh đặt album KHÔNG kèm ảnh, số lượng tuyệt đối = đã đặt + 1", () => {
    expect(donDatAlbum("album-20x20", 0)).toEqual({ productId: "album-20x20", soLuong: 1, photoId: null });
    expect(donDatAlbum("album-20x20", 2)).toEqual({ productId: "album-20x20", soLuong: 3, photoId: null });
    expect(banAlbumCanChonAnh()).toBe(false);
  });

  // BB-398 — số tấm THEO KHỔ (20×20: 25–30 ảnh), không còn "20–30 tấm" chung.
  it("màn bán dựng thật: giới thiệu số ảnh theo khổ + 1 bìa, giá từ danh mục, nút Đặt album — không lưới chọn ảnh", () => {
    const html = renderToStaticMarkup(
      React.createElement(BanAlbum, {
        danhMuc: DANH_MUC,
        daMua: [],
        donDaGui: false,
        khoa: false,
        daCoAlbum: false,
        onDat: () => true,
      }),
    );
    const chu = CHU(html);
    expect(html).toContain('data-testid="man-ban-album"');
    expect(chu).toContain("25–30 ảnh");
    expect(chu).toContain("Khổ 20×20 cm · 25–30 ảnh");
    expect(chu).toContain("Một ảnh bìa riêng");
    expect(html.match(/data-testid="lua-chon-album"/g)?.length).toBe(2);
    expect(html).toContain('data-testid="nut-dat-album"');
    expect(chu).toContain("Đặt album");
    // Giá đúng của mục rẻ nhất (mặc định chọn) lấy từ danh mục.
    expect(chu).toMatch(/1\.200\.000/);
    // Không có ảnh của bé, không có bước chọn tấm.
    expect(html).not.toContain("/api/img/");
    expect(chu).not.toContain("Chọn ảnh");
    // Tờ ruột không bị bán như một cuốn.
    expect(chu).not.toMatch(/90\.000/);
  });

  it("gói đã có album → nút đổi thành 'Đặt thêm một cuốn'", () => {
    const chu = CHU(
      renderToStaticMarkup(
        React.createElement(BanAlbum, {
          danhMuc: DANH_MUC,
          daMua: [],
          donDaGui: false,
          khoa: false,
          daCoAlbum: true,
          onDat: () => true,
        }),
      ),
    );
    expect(chu).toContain("Đặt thêm một cuốn");
  });

  it("danh mục không có album → không bịa giá, Bean mời nhắn tư vấn", () => {
    const html = renderToStaticMarkup(
      React.createElement(BanAlbum, {
        danhMuc: DANH_MUC.filter((s) => s.nhom !== "album"),
        daMua: [],
        donDaGui: false,
        khoa: false,
        daCoAlbum: false,
        onDat: () => true,
      }),
    );
    expect(html).toContain('data-testid="ban-album-chua-mo-ban"');
    expect(html).not.toContain('data-testid="nut-dat-album"');
  });
});
