/**
 * BB-358 — người chấm vòng 8:
 *   A4 — giỏ/hộp chốt đếm ba kiểu ("Trong giỏ · 6", "4 món", "1 món") và dòng
 *        "Còn 4 sản phẩm in chưa có ảnh" đếm luôn album đang thiếu bìa (album bị
 *        nhắc hai lần: một lần ở dòng "chọn ảnh bìa" ngay trên).
 *   A2 — "ạ." đứng một mình một dòng ở bìa và thông báo.
 *
 * Kiểm trên hàm thật mà màn khách gọi (`demMon`, `demMonInChuaAnhHienThi`, `giuA`)
 * và trên đúng hàm máy chủ đếm (`demSanPhamInChuaAnh`) — không đọc tệp nguồn,
 * không giả lập hook (AGENTS.md §5a). Dữ liệu là bản dựng lại đúng giỏ người chấm chụp (K06/K07).
 */
import { describe, it, expect } from "vitest";
import { demMon, demMonCuaSanPham, demMonInChuaAnhHienThi } from "@/lib/gallery/dem-mon";
import { demSanPhamInChuaAnh } from "@/lib/gallery/dot-chon";
import { giuA, KHOANG_KHONG_NGAT } from "@/lib/utils/giu-a";
import { vi } from "@/i18n/vi";

// Giỏ K06: MỘT sản phẩm UV 10×15 tách 4 dòng ×3 (chưa có ảnh) / ×1 / ×1 / ×1 (có ảnh).
const GIO_K06 = [
  { productId: "uv-10x15", quantity: 3, photoId: null },
  { productId: "uv-10x15", quantity: 1, photoId: "p1" },
  { productId: "uv-10x15", quantity: 1, photoId: "p2" },
  { productId: "uv-10x15", quantity: 1, photoId: "p3" },
];

describe("A4 — MỘT luật đếm món cho thẻ sản phẩm, viên giỏ, huy hiệu, hộp chốt", () => {
  it("thẻ 'Trong giỏ · N' và viên 'Giỏ · N món' ra cùng một số (cộng số lượng, không đếm dòng)", () => {
    const theSanPham = demMonCuaSanPham(GIO_K06, "uv-10x15");
    const vienGio = demMon(GIO_K06);
    expect(theSanPham).toBe(6);
    expect(vienGio).toBe(theSanPham);
    // Kiểm ngược: cách đếm cũ (số dòng) ra 4 — lệch với thẻ.
    expect(GIO_K06.length).not.toBe(vienGio);
  });

  it("số âm/hỏng không làm sai tổng", () => {
    expect(demMon([{ quantity: 2 }, { quantity: -1 }, { quantity: Number.NaN }])).toBe(2);
  });

  it("album trong gói thiếu bìa KHÔNG bị đếm hai lần trong dòng 'món in chưa có ảnh'", () => {
    // Đúng dữ liệu K07: album trong gói chưa có tấm nào (chưa có bìa) + dòng mua thêm ×3 chưa có ảnh.
    const soMayChu = demSanPhamInChuaAnh({
      hangTrongGoi: [{ galleryItemId: "album-20x20", quantity: 1, nhom: "album" }],
      soXepTheoHang: new Map(),
      muaThem: GIO_K06.map((d) => ({ soLuong: d.quantity, daCoAnh: d.photoId !== null })),
    });
    expect(soMayChu).toBe(4); // máy chủ (ô tick) vẫn tính album — không đổi luật chặn chốt.
    const hienThi = demMonInChuaAnhHienThi(soMayChu, [{ quantity: 1 }]);
    expect(hienThi).toBe(3);
    // Câu hiện ra khớp đúng số món in chưa có ảnh, không nhắc lại album.
    expect(vi.gallery.loiBean.spInChuaCoAnh.replace("{n}", String(hienThi))).toBe("Còn 3 món in chưa có ảnh ạ.");
  });

  it("album đã có bìa (máy chủ không còn tính) → không trừ thêm", () => {
    const soMayChu = demSanPhamInChuaAnh({
      hangTrongGoi: [{ galleryItemId: "album-20x20", quantity: 1, nhom: "album" }],
      soXepTheoHang: new Map([["album-20x20", 1]]),
      muaThem: [{ soLuong: 3, daCoAnh: false }],
    });
    expect(demMonInChuaAnhHienThi(soMayChu, [])).toBe(3);
  });

  it("chỉ còn album thiếu bìa → 0 (dòng 'món in' không hiện, dòng bìa đã nhắc)", () => {
    expect(demMonInChuaAnhHienThi(1, [{ quantity: 1 }])).toBe(0);
  });
});

describe("A2 — 'ạ' không đứng một mình ở dòng cuối", () => {
  const CAU_NGUOI_CHAM = [
    vi.gallery.loiBean.sanSangChon.replace("{n}", "400"), // bìa máy tính K01
    "Bean đang xác nhận danh sách ảnh của Bé Bơ ạ.", // bìa sau chốt V7-K09b
    vi.gallery.loiBean.chuaCoHanMuc, // thông báo nền mực K12
  ];

  for (const cau of CAU_NGUOI_CHAM) {
    it(`gắn 'ạ' vào chữ trước: «${cau}»`, () => {
      const kq = giuA(cau);
      expect(kq).toContain(`${KHOANG_KHONG_NGAT}ạ`);
      // Không còn khoảng trắng THƯỜNG (chỗ trình duyệt được ngắt dòng) ngay trước "ạ".
      expect(kq).not.toMatch(/[ \t\n]ạ(?=$|[\s.,!?…])/u);
      // Chữ người đọc thấy không đổi.
      expect(kq.replace(/ /g, " ")).toBe(cau);
    });
  }

  it("không đụng chữ có 'ạ' ở giữa từ ('mạnh', 'hạn')", () => {
    expect(giuA("Bean in mạnh tay hạn chót")).toBe("Bean in mạnh tay hạn chót");
  });

  it("null/undefined đi qua nguyên vẹn", () => {
    expect(giuA(null)).toBeNull();
    expect(giuA(undefined)).toBeUndefined();
  });
});
