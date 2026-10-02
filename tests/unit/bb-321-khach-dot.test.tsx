/**
 * BB-321 (phía khách) — luật hiển thị của "đợt chọn": khoá theo đợt, con số của
 * đợt, danh mục bán trong đợt, ô tick hộp chốt đợt 1, và hai component dựng thật
 * (`LuoiAnh` với huy hiệu khoá, thẻ trạng thái đợt trên màn chính).
 *
 * Không đọc mã nguồn, không giả lập hook (AGENTS §5a): gọi đúng hàm màn hình dùng,
 * và dựng component bằng `renderToStaticMarkup` (không cần jsdom).
 *
 * Ba lý do anh bác bản đầu, mỗi lý do có ít nhất một ca canh:
 *   1. sản phẩm bày lưới thẻ   → lưới ảnh dùng lại LuoiAnh (ca "LuoiAnh — khoá theo đợt")
 *   2. "Edit file" bị bán      → `sanPhamBanTrongDot`
 *   3. chữ tự mâu thuẫn        → `tomTatDot`: một câu, số trong câu = số của đợt,
 *                                 không còn vế "trong gói" (đợt 2 tính tiền từ ảnh đầu).
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cauConThieuTrongGoi,
  coGuiChotDot1,
  cumTenBe,
  doiAnhTrongNhap,
  dotKhoaCuaAnh,
  duOTickChotDot1,
  locNhapConChonDuoc,
  oTickChotDot1,
  sanPhamBanTrongDot,
  soMonChuaCoAnhTrongGio,
  tieuDeHopChotDot,
  tomTatDot,
} from "@/components/features/gallery/dot-chon-khach";
import { LuoiAnh } from "@/components/features/gallery/luoi-anh";
import { DotChonTrenManChinh, type TrangThaiDotKhach } from "@/components/features/gallery/chon-them-anh";
import type { PhotoPublic } from "@/types/domain";

/** "90.000 ₫" có khoảng trắng hẹp của Intl — so bằng chữ số thôi. */
const chiSo = (s: string) => s.replace(/[^\d]/g, "");

// ---------------------------------------------------------------------------
// Khoá theo đợt
// ---------------------------------------------------------------------------

describe("dotKhoaCuaAnh — tấm đã chốt ở đợt nào", () => {
  it("tấm đã chọn mà máy chủ không ghi đợt ≥ 2 là đợt 1", () => {
    expect(dotKhoaCuaAnh({ id: "a", mark: "selected" }, {})).toBe(1);
  });
  it("tấm có trong dotTheoAnh lấy đúng số đợt đó", () => {
    expect(dotKhoaCuaAnh({ id: "a", mark: "selected" }, { a: 3 })).toBe(3);
  });
  it("tấm chưa chọn thì không khoá (0), kể cả khi bảng lỡ có tên nó", () => {
    expect(dotKhoaCuaAnh({ id: "a", mark: null }, { a: 2 })).toBe(0);
    expect(dotKhoaCuaAnh({ id: "a", mark: "favorite" }, {})).toBe(0);
  });
});

describe("doiAnhTrongNhap — tick/bỏ tick trong nháp đợt mới", () => {
  it("tấm chưa khoá: bấm lần một thêm, lần hai bỏ", () => {
    const mot = doiAnhTrongNhap([], "x", 0);
    expect(mot).toEqual(["x"]);
    expect(doiAnhTrongNhap(mot, "x", 0)).toEqual([]);
  });
  it("tấm đã khoá theo đợt: KHÔNG đổi gì (không bỏ chọn được, không thêm được)", () => {
    expect(doiAnhTrongNhap(["y"], "x", 1)).toEqual(["y"]);
    expect(doiAnhTrongNhap(["x"], "x", 2)).toEqual(["x"]);
  });
});

describe("locNhapConChonDuoc — nháp cũ trong máy gặp dữ liệu mới", () => {
  const anh = [
    { id: "a", mark: "selected" }, // đợt 1
    { id: "b", mark: "selected" }, // đợt 2 (vừa được xác nhận)
    { id: "c", mark: null },
  ];
  it("bỏ tấm nay đã khoá, bỏ tấm không còn trong bộ, bỏ trùng", () => {
    expect(locNhapConChonDuoc(["a", "b", "c", "c", "z"], anh, { b: 2 })).toEqual(["c"]);
  });
});

// ---------------------------------------------------------------------------
// Danh mục bán trong đợt (lý do bác #2)
// ---------------------------------------------------------------------------

describe("sanPhamBanTrongDot — không bao giờ bán 'Edit file'", () => {
  const danhMuc = [
    { productId: "1", name: "UV 10x15", kind: "print" },
    { productId: "2", name: "Edit file", kind: "edited_photo" },
    { productId: "3", name: "Album (Ultra HD) 20x20", kind: "print" },
    { productId: "4", name: "edit file", kind: "print" }, // tên lệch hoa/thường, kind sai
  ];
  it("loại theo kind edited_photo và theo tên", () => {
    expect(sanPhamBanTrongDot(danhMuc).map((s) => s.productId)).toEqual(["1", "3"]);
  });
});

// ---------------------------------------------------------------------------
// Con số của đợt (lý do bác #3)
// ---------------------------------------------------------------------------

describe("tomTatDot — MỘT câu, không tự mâu thuẫn", () => {
  const donGia = (id: string) => ({ in: 20_000, album: 250_000 })[id as "in" | "album"] ?? 0;

  it("3 ảnh mới × 30.000 → '3 ảnh mới · 90.000 ₫' — đợt 2 tính tiền từ ảnh đầu tiên, không có vế 'trong gói'", () => {
    const t = tomTatDot({ soAnhMoi: 3, giaMoiAnh: 30_000, gio: [], donGia });
    expect(t.soAnhTinhTien).toBe(3);
    expect(t.tong).toBe(90_000);
    expect(t.cau.startsWith("3 tấm mới · ")).toBe(true); // BB-358: đơn vị đếm ảnh là "tấm"
    expect(chiSo(t.cau.split(" · ")[1]!)).toBe("90000");
    expect(t.cau).not.toContain("trong gói");
    expect(t.cau).not.toContain("tính tiền");
  });

  it("có sản phẩm: chen số món trước tiền, tiền = ảnh + sản phẩm", () => {
    const t = tomTatDot({
      soAnhMoi: 3,
      giaMoiAnh: 30_000,
      gio: [
        { productId: "in", photoId: "p1", soLuong: 2 },
        { productId: "album", photoId: null, soLuong: 1 },
      ],
      donGia,
    });
    expect(t.soSanPham).toBe(3);
    expect(t.tienSanPham).toBe(290_000);
    expect(t.tong).toBe(380_000);
    const phan = t.cau.split(" · ");
    expect(phan.slice(0, 2)).toEqual(["3 tấm mới", "3 món"]);
    expect(chiSo(phan[2]!)).toBe(String(t.tong));
  });

  it("số tiền trong câu luôn bằng đúng `tong` (thanh đáy và hộp xác nhận đọc cùng object)", () => {
    for (const [soAnh, gia] of [
      [1, 30_000],
      [7, 45_000],
      [0, 30_000],
    ] as const) {
      const t = tomTatDot({ soAnhMoi: soAnh, giaMoiAnh: gia, gio: [{ productId: "in", photoId: "x", soLuong: 1 }], donGia });
      expect(chiSo(t.cau.split(" · ").at(-1)!)).toBe(String(t.tong));
      expect(t.tong).toBe(soAnh * gia + 20_000);
    }
  });

  it("chưa chọn gì: 'Chưa chọn ảnh mới', không in '0 ₫'", () => {
    const t = tomTatDot({ soAnhMoi: 0, giaMoiAnh: 30_000, gio: [], donGia });
    expect(t.cau).toBe("Chưa chọn ảnh mới");
    expect(t.tong).toBe(0);
  });
});

describe("soMonChuaCoAnhTrongGio — món cần ảnh mà chưa có (đòi ô tick 'nhận ảnh chậm hơn')", () => {
  const nhom = (id: string) => (({ in: "anh_in", khung: "khung", album: "album" }) as const)[id as "in"] ?? null;
  it("album đặt mua (chưa có ảnh) được đếm theo số lượng; ảnh in đã gắn tấm thì không", () => {
    expect(
      soMonChuaCoAnhTrongGio(
        [
          { productId: "in", photoId: "p1", soLuong: 3 },
          { productId: "album", photoId: null, soLuong: 2 },
        ],
        nhom,
      ),
    ).toBe(2);
  });
  it("giỏ toàn món đã gắn ảnh → 0 (không hiện khối nhắc)", () => {
    expect(soMonChuaCoAnhTrongGio([{ productId: "khung", photoId: "p", soLuong: 1 }], nhom)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hộp chốt đợt 1 — hai ô tick mới
// ---------------------------------------------------------------------------

describe("oTickChotDot1 / duOTickChotDot1 / coGuiChotDot1", () => {
  it("chọn thiếu 3 so với hạn mức 15 → khối 'nhờ studio chọn giúp', câu ≤ 12 chữ", () => {
    const can = oTickChotDot1({ hanMuc: 15, daChon: 12, soSanPhamInChuaAnh: 0 });
    expect(can).toEqual({ soThieu: 3, canDongYStudioChon: true, canBietAnhInCham: false });
    const cau = cauConThieuTrongGoi(can.soThieu);
    expect(cau).toBe("Còn 3 tấm trong gói, ba mẹ nhờ Bean chọn giúp ạ");
    expect(cau.split(/\s+/).filter((w) => w !== "—").length).toBeLessThanOrEqual(12);
  });
  it("đủ hoặc vượt hạn mức, hay chưa biết hạn mức → không hỏi", () => {
    expect(oTickChotDot1({ hanMuc: 15, daChon: 17, soSanPhamInChuaAnh: 0 }).canDongYStudioChon).toBe(false);
    expect(oTickChotDot1({ hanMuc: null, daChon: 0, soSanPhamInChuaAnh: 0 }).canDongYStudioChon).toBe(false);
  });
  it("chọn thiếu: ô đồng ý studio chọn dùm BẮT BUỘC (không có đường thứ ba); ô ảnh in cũng bắt buộc", () => {
    const can = oTickChotDot1({ hanMuc: 15, daChon: 12, soSanPhamInChuaAnh: 1 });
    expect(duOTickChotDot1(can, { dongYStudioChon: false, bietAnhInCham: false })).toBe(false);
    expect(duOTickChotDot1(can, { dongYStudioChon: true, bietAnhInCham: false })).toBe(false);
    expect(duOTickChotDot1(can, { dongYStudioChon: false, bietAnhInCham: true })).toBe(false);
    expect(duOTickChotDot1(can, { dongYStudioChon: true, bietAnhInCham: true })).toBe(true);
    const chiThieu = oTickChotDot1({ hanMuc: 15, daChon: 14, soSanPhamInChuaAnh: 0 });
    expect(duOTickChotDot1(chiThieu, { dongYStudioChon: false, bietAnhInCham: false })).toBe(false);
  });
  it("gửi đúng tên trường của /api/g/submit", () => {
    const can = oTickChotDot1({ hanMuc: 15, daChon: 12, soSanPhamInChuaAnh: 1 });
    expect(coGuiChotDot1(can, { dongYStudioChon: true, bietAnhInCham: true })).toEqual({
      nhoStudioChonThem: true,
      dongYAnhStudioChon: true,
      bietAnhInChamHon: true,
    });
    const du = oTickChotDot1({ hanMuc: 15, daChon: 15, soSanPhamInChuaAnh: 0 });
    expect(coGuiChotDot1(du, { dongYStudioChon: true, bietAnhInCham: true })).toEqual({});
  });
  it("không có khối nào thì không gửi cờ nào (chốt bình thường không đụng cột mới)", () => {
    const can = oTickChotDot1({ hanMuc: 15, daChon: 15, soSanPhamInChuaAnh: 0 });
    expect(duOTickChotDot1(can, { dongYStudioChon: false, bietAnhInCham: false })).toBe(true);
    expect(coGuiChotDot1(can, { dongYStudioChon: false, bietAnhInCham: false })).toEqual({});
  });
});

describe("chữ tên bé", () => {
  it("không lặp 'bé'", () => {
    expect(cumTenBe("Mít")).toBe("Bé Mít");
    expect(cumTenBe("bé Na")).toBe("Bé Na"); // BB-362: viết hoa "Bé" như bìa, không lặp "Bé Bé"
    expect(tieuDeHopChotDot(2, "Bé Mít")).toBe("Chốt đợt 2 cho Bé Mít");
    expect(tieuDeHopChotDot(2, "Mít")).toBe("Chốt đợt 2 cho Bé Mít");
    expect(tieuDeHopChotDot(3, null)).toBe("Chốt đợt 3");
  });
});

// ---------------------------------------------------------------------------
// Component dựng thật
// ---------------------------------------------------------------------------

function anhMau(id: string, mark: PhotoPublic["mark"]): PhotoPublic {
  return {
    id,
    fileName: `${id}.jpg`,
    width: 1000,
    height: 1500,
    subfolder: null,
    sortIndex: 0,
    status: "active" as PhotoPublic["status"],
    isFavorite: false,
    mark,
    orderIndex: null,
    retouchNote: null,
    noteTags: [],
    suggestedBy: [],
  };
}

describe("LuoiAnh — khoá theo đợt (lưới DÙNG LẠI của màn chính, lý do bác #1)", () => {
  const html = renderToStaticMarkup(
    <LuoiAnh
      photos={[anhMau("khoa1", "selected"), anhMau("moi", "selected"), anhMau("chua", null)]}
      mutatingIds={new Set()}
      khoa={false}
      soSanPhamTheoAnh={new Map()}
      soSanhBat={false}
      soSanhTheoAnh={new Map()}
      dotKhoaTheoAnh={new Map([["khoa1", 1]])}
      onToggle={() => {}}
      onOpen={() => {}}
      onToggleSoSanh={() => {}}
    />,
  );
  // Tách theo thẻ ảnh để kiểm TỪNG ô.
  const o = html.split('data-testid="the-anh"').slice(1);

  it("tấm đợt 1 có huy hiệu khoá 'Đợt 1' và KHÔNG có nút tim (không có nút bấm giả)", () => {
    expect(o[0]).toContain('data-testid="huy-hieu-khoa"');
    expect(o[0]).toMatch(/Đợt (<!-- -->)?1<\/span>/);
    expect(o[0]).not.toContain("aria-pressed");
  });
  it("tấm mới chọn có tim đang bật, tấm chưa chọn có tim tắt — không huy hiệu", () => {
    expect(o[1]).toContain('aria-pressed="true"');
    expect(o[1]).not.toContain("huy-hieu-khoa");
    expect(o[2]).toContain('aria-pressed="false"');
    expect(o[2]).not.toContain("huy-hieu-khoa");
  });
  it("lưới chính (không truyền dotKhoaTheoAnh) giữ nguyên hành vi: tấm đã chọn vẫn có tim", () => {
    const chinh = renderToStaticMarkup(
      <LuoiAnh
        photos={[anhMau("a", "selected")]}
        mutatingIds={new Set()}
        khoa={false}
        soSanPhamTheoAnh={new Map()}
        soSanhBat={false}
        soSanhTheoAnh={new Map()}
        onToggle={() => {}}
        onOpen={() => {}}
        onToggleSoSanh={() => {}}
      />,
    );
    expect(chinh).toContain('aria-pressed="true"');
    expect(chinh).not.toContain("huy-hieu-khoa");
  });
});

describe("DotChonTrenManChinh — MỘT thẻ trạng thái đợt + lối vào", () => {
  const tt: TrangThaiDotKhach = {
    cheDoChonThem: true,
    coTheChot: true,
    giaMoiAnh: 30_000,
    hanMuc: 12,
    daChonTruoc: 15,
    dotTheoAnh: {},
    banNhap: null,
    cacDot: [
      { soDot: 2, trangThai: "da_xac_nhan", soAnh: 3, tienAnh: 90_000, tienSanPham: 40_000, tong: 130_000, lyDoTuChoi: null, sanPham: [{ ten: "UV 10x15", soLuong: 2 }] },
      { soDot: 3, trangThai: "tu_choi", soAnh: 1, tienAnh: 30_000, tienSanPham: 0, tong: 30_000, lyDoTuChoi: "Tấm này trùng đợt trước.", sanPham: [] },
      { soDot: 4, trangThai: "cho_xac_nhan", soAnh: 2, tienAnh: 60_000, tienSanPham: 0, tong: 60_000, lyDoTuChoi: null, sanPham: [] },
    ],
  };
  const dung = (p: Partial<React.ComponentProps<typeof DotChonTrenManChinh>> = {}) =>
    renderToStaticMarkup(
      <DotChonTrenManChinh tt={tt} tenBe="Mít" soAnhNhap={0} soMonNhap={0} onMo={() => {}} {...p} />,
    );

  it("ba trạng thái, đợt mới nhất trên cùng, lý do từ chối, kích thước dùng dấu ×", () => {
    const html = dung();
    const i4 = html.indexOf('data-testid="trang-thai-dot-4"');
    const i3 = html.indexOf('data-testid="trang-thai-dot-3"');
    const i2 = html.indexOf('data-testid="trang-thai-dot-2"');
    expect(i4).toBeGreaterThan(-1);
    expect(i4).toBeLessThan(i3);
    expect(i3).toBeLessThan(i2);
    expect(html).toContain("Bean đang xác nhận đợt này ạ");
    expect(html).toContain("Bean chưa nhận đợt này");
    expect(html).toMatch(/Lý do: (<!-- -->)?Tấm này trùng đợt trước\./);
    expect(html).toContain("Bean đã xác nhận đợt này ạ");
    expect(html).toContain("UV 10×15 ×2");
    expect(html).not.toContain("10x15");
  });

  it("lối vào: 'Chọn thêm ảnh'; có nháp dở thì 'Tiếp tục đợt 5'", () => {
    expect(dung()).toContain(">Chọn thêm ảnh</button>");
    expect(dung({ soAnhNhap: 2 })).toContain(">Tiếp tục đợt 5</button>");
  });

  it("máy chủ nói chưa tới giai đoạn chọn thêm → không vẽ gì", () => {
    expect(dung({ tt: { ...tt, cheDoChonThem: false } })).toBe("");
  });

  it("không phải ba mẹ đứng tên: chỉ xem trạng thái, không có nút chốt", () => {
    const html = dung({ tt: { ...tt, coTheChot: false } });
    expect(html).toContain('data-testid="trang-thai-dot-4"');
    expect(html).not.toContain("<button");
  });
});
