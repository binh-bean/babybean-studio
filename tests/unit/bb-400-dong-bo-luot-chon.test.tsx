/**
 * BB-400 — mọi lượt chọn ảnh dùng CÙNG bộ công cụ (anh 08/10/2026: "lượt sau chỉ còn
 * thả tim, không còn đủ chức năng như lượt đầu").
 *
 * Không đọc mã nguồn, không giả lập hook (AGENTS §5a): dựng component THẬT bằng
 * `renderToStaticMarkup` (môi trường node, không jsdom) và kiểm nút theo vai trò /
 * aria-label / data-testid. `fetch` giả để chắc chắn không lượt dựng nào gọi mạng thật.
 *
 * Kiểm ngược (dán trong bàn giao): cho màn đợt N dùng lại bộ công cụ "chỉ có tim"
 * (ghi chú/so sánh/đặt in/tải/gia đình thích = false) → các ca "Đợt 2 …" đỏ.
 */

import React from "react";
import { afterAll, beforeAll, describe, expect, it, vi as viTest } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  cachDatTuManTreo,
  chipLocLuotChon,
  congCuLuotChon,
  datGhiChuNhap,
  duocGhiTimGiaDinh,
  ghiChuChoAnhMoi,
  ghiChuGuiKemDot,
  locAnhLuotChon,
  nguCanhTuVai,
  type NguCanhLuotChon,
} from "@/lib/gallery/luot-chon";
import { ManChonThemDot, type MonCatalogue } from "@/components/features/gallery/man-chon-them-dot";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { ManMuaGiaDinh, datDongGioGiaDinh } from "@/components/features/gallery/man-mua-gia-dinh";
import { DatInChoGiaDinh, propsCongCuXemLon } from "@/components/features/gallery/cong-cu-luot-chon";
import type { NhapDot, TrangThaiDotKhach } from "@/components/features/gallery/chon-them-anh";
import { XemLonDuyet } from "@/components/features/gallery/anh-chinh-sua-khach";
import { ManTreoTuong } from "@/components/features/gallery/man-treo-tuong";
import { demNhap } from "@/lib/anh-chinh-sua/duyet-tung-tam";
import type { PhotoPublic } from "@/types/domain";

const fetchGia = viTest.fn(async () => new Response(JSON.stringify({ data: null }), { status: 200 }));
const fetchCu = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = fetchGia as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = fetchCu;
});

// ---------------------------------------------------------------------------
// Dữ liệu giả (AGENTS §6): id rõ ràng là giả, không tên khách thật.
// ---------------------------------------------------------------------------

function anh(id: string, mark: PhotoPublic["mark"], subfolder: string | null = null): PhotoPublic {
  return {
    id,
    fileName: `BB_${id}.jpg`,
    width: 4000,
    height: 6000,
    subfolder,
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

const CATALOGUE: MonCatalogue[] = [
  { productId: "sp-in", name: "UV 10x15", kind: "print", material: "UV", size: "10x15", unitPrice: 20_000, nhom: "anh_in", canGanAnh: true },
  { productId: "sp-album", name: "Album 20x20", kind: "print", material: null, size: "20x20", unitPrice: 250_000, nhom: "album", canGanAnh: false },
];

const TT: TrangThaiDotKhach = {
  cheDoChonThem: true,
  coTheChot: true,
  giaMoiAnh: 30_000,
  hanMuc: 10,
  daChonTruoc: 1,
  cacDot: [{ soDot: 1, trangThai: "da_xac_nhan", soAnh: 1, tienAnh: 0, tienSanPham: 0, tong: 0, lyDoTuChoi: null, sanPham: [] }],
  dotTheoAnh: {},
  banNhap: null,
};

/** "khoa1" đã chốt đợt 1; "moi" trong nháp đợt 2 (có ghi chú); "chua" chưa chọn. */
const ANH = [anh("khoa1", "selected", "Studio"), anh("moi", null, "Studio"), anh("chua", null, "Ngoài trời")];
const NHAP: NhapDot = { anh: ["moi"], gio: [], ghiChu: { moi: "Làm mịn da nhẹ" } };

function dungManDot(p: Partial<React.ComponentProps<typeof ManChonThemDot>> = {}) {
  return renderToStaticMarkup(
    <ManChonThemDot
      photos={ANH}
      subfolders={["Studio", "Ngoài trời"]}
      tenBe="Bé Na"
      tenKhach="Nguyễn Thị Mai"
      catalogue={CATALOGUE}
      tt={TT}
      nhap={NHAP}
      anhNhap={["moi"]}
      setNhap={() => {}}
      onDong={() => {}}
      onDaChot={() => {}}
      onCanTaiLai={() => {}}
      giaDinhThich={new Set(["chua"])}
      taiAnh={{ onTaiAnh: () => {}, menuTai: null }}
      chatUrl="https://example.test/chat"
      {...p}
    />,
  );
}

/** Đếm số lần một chuỗi (thuộc tính cụ thể, không phải chữ chung chung) xuất hiện. */
const dem = (html: string, chuoi: string) => html.split(chuoi).length - 1;

const NUT_GHI_CHU = 'aria-label="Ghi chú cho thợ chỉnh ảnh"';
const NUT_DAT_IN = 'aria-label="Sản phẩm cho tấm ảnh này"';
const NUT_TAI = 'aria-label="Tải ảnh này về máy"';
const NUT_SO_SANH = 'aria-label="So sánh"';

// ---------------------------------------------------------------------------
// 1. Luật thuần: lượt nào có công cụ nào
// ---------------------------------------------------------------------------

describe("congCuLuotChon — một luật cho mọi lượt, đúng quyền máy chủ", () => {
  const cc = (nc: NguCanhLuotChon) => congCuLuotChon(nc, { choPhepTai: true });

  it("đợt mua thêm có ĐỦ công cụ của đợt 1 (trừ ảnh album không chỉnh — chỉ đợt 1)", () => {
    const d1 = cc("dot1");
    const dN = cc("dotThem");
    for (const k of ["tim", "ghiChu", "xemLon", "soSanh", "sanPhamTheoAnh", "xemTuong", "tai", "giaDinhThich", "chot"] as const) {
      expect([k, dN[k]]).toEqual([k, d1[k]]);
    }
    expect(d1.albumKhongChinh).toBe(true);
    expect(dN.albumKhongChinh).toBe(false);
  });

  it("người gợi ý / người cùng chọn: đủ công cụ chọn, KHÔNG chốt; người gợi ý không quyết ảnh album", () => {
    for (const nc of ["goiY", "cungChon"] as const) {
      const c = cc(nc);
      expect(c.tim && c.ghiChu && c.soSanh && c.sanPhamTheoAnh && c.xemTuong).toBe(true);
      expect(c.chot).toBe(false);
    }
    expect(cc("goiY").albumKhongChinh).toBe(false);
    expect(cc("cungChon").albumKhongChinh).toBe(true);
  });

  it("gia đình được mời: tim + so sánh + đặt in qua yêu cầu; không ghi chú, không giỏ ba mẹ, không chốt", () => {
    const c = cc("giaDinh");
    expect(c.tim && c.soSanh && c.sanPhamTheoAnh && c.muaQuaYeuCau).toBe(true);
    expect(c.ghiChu || c.chot || c.albumKhongChinh || c.giaDinhThich).toBe(false);
    expect(c.xemTuong).toBe(true); // BB-400 vòng 4 — gia đình cũng xem trên tường
  });

  it("tải ảnh theo cài đặt bộ ảnh, ở MỌI lượt như nhau", () => {
    for (const nc of ["dot1", "dotThem", "goiY", "cungChon", "giaDinh"] as const) {
      expect(congCuLuotChon(nc, { choPhepTai: false }).tai).toBe(false);
      expect(congCuLuotChon(nc, { choPhepTai: true }).tai).toBe(true);
    }
  });

  it("nguCanhTuVai — vai máy chủ → lượt", () => {
    expect(nguCanhTuVai("owner")).toBe("dot1");
    expect(nguCanhTuVai(undefined, { dotThem: true })).toBe("dotThem");
    expect(nguCanhTuVai("suggester")).toBe("goiY");
    expect(nguCanhTuVai("co_editor")).toBe("cungChon");
    expect(nguCanhTuVai("viewer")).toBe("giaDinh");
  });
});

describe("chipLocLuotChon — cùng tên, cùng thứ tự ở đợt 1 và đợt N", () => {
  const so = { tong: 10, daChon: 3, giaDinhThich: 2, khoa: false };
  it("đợt 1 và đợt N ra đúng một hàng chip", () => {
    expect(chipLocLuotChon("dotThem", so)).toEqual(chipLocLuotChon("dot1", so));
    expect(chipLocLuotChon("dot1", so).map((c) => `${c.loai}:${c.nhan}:${c.so}`)).toEqual([
      "all:Tất cả:10",
      "selected:Đã chọn:3",
      "unselected:Chưa chọn:7",
      "giaDinh:Gia đình thích:2",
    ]);
  });
  it("gia đình: Tất cả + tim của chính họ", () => {
    expect(chipLocLuotChon("giaDinh", so).map((c) => c.nhan)).toEqual(["Tất cả", "Gia đình thích"]);
  });
  it("locAnhLuotChon lọc theo chip + nhóm", () => {
    const ds = [anh("a", "selected", "X"), anh("b", null, "X"), anh("c", null, "Y")];
    expect(locAnhLuotChon(ds, "selected", "", new Set()).map((p) => p.id)).toEqual(["a"]);
    expect(locAnhLuotChon(ds, "unselected", "X", new Set()).map((p) => p.id)).toEqual(["b"]);
    expect(locAnhLuotChon(ds, "giaDinh", "", new Set(["c"])).map((p) => p.id)).toEqual(["c"]);
  });
});

describe("ghi chú của đợt N — nháp → gửi kèm lúc chốt → máy chủ chỉ ghi tấm mới", () => {
  it("datGhiChuNhap: đặt, cắt trắng, chữ trống thì xoá", () => {
    const g = datGhiChuNhap(undefined, "p1", "  sáng hơn  ");
    expect(g).toEqual({ p1: "sáng hơn" });
    expect(datGhiChuNhap(g, "p1", "   ")).toEqual({});
  });
  it("ghiChuGuiKemDot: chỉ tấm còn trong nháp, đúng thứ tự đợt", () => {
    expect(ghiChuGuiKemDot(["b", "a"], { a: "A", b: "B", bo: "tấm đã bỏ tim" })).toEqual([
      { photoId: "b", ghiChu: "B" },
      { photoId: "a", ghiChu: "A" },
    ]);
  });
  it("ghiChuChoAnhMoi: máy chủ bỏ ghi chú của tấm không thuộc đợt (tấm đã chốt đợt trước)", () => {
    const m = ghiChuChoAnhMoi([{ photoId: "moi", ghiChu: " x " }, { photoId: "khoa1", ghiChu: "đổi ghi chú cũ" }], ["moi"]);
    expect([...m.entries()]).toEqual([["moi", "x"]]);
  });
});

// ---------------------------------------------------------------------------
// 2. Màn đợt N dựng thật: lưới + đầu màn có đủ công cụ như đợt 1
// ---------------------------------------------------------------------------

describe("Đợt 2 — lưới và đầu màn", () => {
  const html = dungManDot();

  it("hàng chip lọc giống đợt 1 (Tất cả · Đã chọn · Chưa chọn · Gia đình thích)", () => {
    for (const loai of ["all", "selected", "unselected", "giaDinh"]) {
      expect(html).toContain(`data-testid="chip-loc-${loai}"`);
    }
  });

  it("có nút So sánh (biểu tượng điện thoại) như đợt 1", () => {
    expect(dem(html, NUT_SO_SANH)).toBeGreaterThanOrEqual(1);
  });

  it("thẻ ảnh: tấm đã chốt đợt 1 có huy hiệu khoá (không tim), tấm khác có tim; dấu gia đình + dấu ghi chú", () => {
    expect(dem(html, 'data-testid="the-anh"')).toBe(3);
    expect(dem(html, 'data-testid="huy-hieu-khoa"')).toBe(1);
    expect(dem(html, 'aria-pressed="true" class="absolute bottom-0 right-0')).toBe(1); // tim tấm nháp
    expect(html).toContain('data-testid="dau-gia-dinh-thich"');
    expect(html).toContain('data-testid="dau-co-ghi-chu"'); // ghi chú của nháp hiện trên thẻ
  });

  it("nhóm ảnh có số đếm như đợt 1", () => {
    expect(html).toMatch(/Studio<span class="ml-1\.5 opacity-60">2<\/span>/);
  });
});

describe("Đợt 2 — màn xem lớn có đủ nút như đợt 1", () => {
  it("tấm mới: Tim · Ghi chú · Đặt in + tải + tên bé", () => {
    // Lưới đang lọc "Tất cả": thứ tự khoa1, moi, chua → tấm mới ở chỉ số 1.
    const html = dungManDot({ xemLonBanDau: 1 });
    expect(html).toContain('data-testid="thanh-day-3-cot"');
    expect(dem(html, NUT_GHI_CHU)).toBeGreaterThanOrEqual(1);
    expect(dem(html, NUT_DAT_IN)).toBeGreaterThanOrEqual(1);
    expect(html).toContain(NUT_TAI);
    expect(html).toContain('data-testid="xem-lon-ten-be"');
    // Ghi chú của nháp nằm sẵn trong ô (sửa được, không phải bản chỉ đọc).
    expect(html).not.toContain('data-testid="ghi-chu-chi-doc"');
  });

  it("tấm đã chốt đợt trước: ghi chú CHỈ ĐỌC, tim khoá", () => {
    const html = dungManDot({ xemLonBanDau: 0 });
    expect(html).toContain('data-testid="ghi-chu-chi-doc"');
    expect(html).toMatch(/<button type="button" disabled="" aria-label="Bỏ chọn" aria-pressed="true"/);
  });

  it("bộ không cho tải → không có nút tải (cùng luật đợt 1)", () => {
    expect(dungManDot({ xemLonBanDau: 1, taiAnh: null })).not.toContain(NUT_TAI);
  });
});

// ---------------------------------------------------------------------------
// 3. Màn xem lớn theo từng vai (đợt 1, gợi ý, cùng chọn, gia đình) — cùng hàm cắt nút
// ---------------------------------------------------------------------------

function xemLonTheoVai(nc: NguCanhLuotChon) {
  const cc = congCuLuotChon(nc, { choPhepTai: true });
  return renderToStaticMarkup(
    <PhotoLightbox
      photos={[anh("p1", "selected")]}
      initialIndex={0}
      onClose={() => {}}
      onToggleHeart={() => {}}
      mutatingIds={new Set()}
      isLocked={false}
      {...propsCongCuXemLon(cc, {
        luuGhiChu: async () => true,
        taiAnh: { onTaiAnh: () => {}, menuTai: null },
        xemTuong: () => {},
        bangSanPham: cc.muaQuaYeuCau
          ? () => <DatInChoGiaDinh onDatIn={() => {}} />
          : () => <div data-testid="bang-san-pham-gia" />,
      })}
    />,
  );
}

// ---------------------------------------------------------------------------
// 4. Vòng 2 — người cùng chọn / người gợi ý GỢI Ý ở đợt N
// ---------------------------------------------------------------------------

describe("duocGhiTimGiaDinh — ai được ghi tim gia đình / gợi ý (cùng hàm với route)", () => {
  it("viewer luôn được; co_editor/suggester CHỈ ở đợt N; owner không bao giờ", () => {
    expect(duocGhiTimGiaDinh("viewer", false)).toBe(true);
    expect(duocGhiTimGiaDinh("viewer", true)).toBe(true);
    for (const vai of ["co_editor", "suggester"]) {
      expect([vai, duocGhiTimGiaDinh(vai, false)]).toEqual([vai, false]);
      expect([vai, duocGhiTimGiaDinh(vai, true)]).toEqual([vai, true]);
    }
    expect(duocGhiTimGiaDinh("owner", true)).toBe(false);
    expect(duocGhiTimGiaDinh("owner", false)).toBe(false);
  });

  it("công cụ đợt N của người gợi ý: tim + so sánh + xem lớn; KHÔNG ghi chú/giỏ/chốt (của nháp ba mẹ)", () => {
    for (const nc of ["goiY", "cungChon"] as const) {
      const c = congCuLuotChon(nc, { choPhepTai: false, dotThem: true });
      expect(c.tim && c.soSanh && c.xemLon).toBe(true);
      expect(c.ghiChu || c.sanPhamTheoAnh || c.chot || c.albumKhongChinh).toBe(false);
      expect(c.xemTuong).toBe(true); // BB-400 vòng 4 — xem trên tường ở mọi vai
    }
    // Đợt 1 không đổi: người cùng chọn vẫn đủ công cụ.
    expect(congCuLuotChon("cungChon", { choPhepTai: false }).ghiChu).toBe(true);
  });
});

describe("Đợt 2 — người gợi ý dùng CÙNG màn đợt", () => {
  const goiY = { timCuaToi: new Set(["chua"]), doiTim: () => {} };

  it("lưới: tấm đã chốt giữ huy hiệu khoá; tim = gợi ý của chính họ; không nút chốt, có câu gợi ý", () => {
    const html = dungManDot({ goiY, anhNhap: [] });
    expect(dem(html, 'data-testid="huy-hieu-khoa"')).toBe(1);
    expect(dem(html, 'aria-pressed="true" class="absolute bottom-0 right-0')).toBe(1); // "chua" được gợi ý
    expect(html).not.toContain('data-testid="nut-chot-dot"');
    expect(html).toContain('data-testid="thanh-day-goi-y"');
    expect(dem(html, NUT_SO_SANH)).toBeGreaterThanOrEqual(1);
  });

  it("xem lớn: Tim, KHÔNG ghi chú, KHÔNG đặt in (nháp + tiền là của ba mẹ)", () => {
    const html = dungManDot({ goiY, anhNhap: [], xemLonBanDau: 2 });
    expect(html).toContain('data-testid="thanh-day-3-cot"');
    expect(html).not.toContain(NUT_GHI_CHU);
    expect(html).not.toContain(NUT_DAT_IN);
  });

  it("ba mẹ thấy gợi ý trên lưới đợt: dấu + chip 'Gia đình thích'", () => {
    const html = dungManDot({ giaDinhThich: new Set(["chua"]) });
    expect(html).toContain('data-testid="dau-gia-dinh-thich"');
    expect(html).toContain('data-testid="chip-loc-giaDinh"');
  });
});

// ---------------------------------------------------------------------------
// 5. Vòng 2 — màn mua của gia đình (thay cả trang) dùng lưới + xem lớn chung
// ---------------------------------------------------------------------------

const DANH_MUC_GD = CATALOGUE.map(({ productId, name, material, size, unitPrice, nhom, canGanAnh }) => ({
  productId,
  name,
  material,
  size,
  unitPrice,
  nhom: nhom as "anh_in" | "album",
  canGanAnh,
}));

function dungManMua(p: Partial<React.ComponentProps<typeof ManMuaGiaDinh>> = {}) {
  return renderToStaticMarkup(
    <ManMuaGiaDinh
      photos={[anh("g1", "selected", "Studio"), anh("g2", null, "Studio"), anh("g3", null, "Ngoài trời")]}
      subfolders={["Studio", "Ngoài trời"]}
      tenBe="Bé Na"
      danhMuc={DANH_MUC_GD}
      gio={[]}
      setGio={() => {}}
      onToggleHeart={() => {}}
      onDong={() => {}}
      onDaGui={() => {}}
      {...p}
    />,
  );
}

describe("Gia đình mua lần hai — màn thay cả trang, CÙNG lưới/xem lớn", () => {
  it("lưới chung (thẻ the-anh + tim), chip Tất cả · Gia đình thích, So sánh; không còn tấm chọn ảnh riêng", () => {
    const html = dungManMua();
    expect(html).toContain('data-testid="man-mua-gia-dinh"');
    expect(dem(html, 'data-testid="the-anh"')).toBe(3);
    expect(dem(html, 'aria-pressed="true" class="absolute bottom-0 right-0')).toBe(1);
    expect(html).toContain('data-testid="chip-loc-all"');
    expect(html).toContain('data-testid="chip-loc-selected"');
    expect(dem(html, NUT_SO_SANH)).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain('data-testid="o-anh-mua-them"');
    expect(html).not.toContain('data-testid="tam-chon-anh-mua-them"');
  });

  it("thanh đáy: giỏ trống thì 'Gửi yêu cầu' khoá; có món thì câu đếm món", () => {
    expect(dungManMua()).toMatch(/data-testid="nut-gui-mua-gia-dinh" disabled=""/);
    const coMon = dungManMua({ gio: [{ productId: "sp-in", photoId: "g1", soLuong: 2 }] });
    expect(coMon).not.toMatch(/data-testid="nut-gui-mua-gia-dinh" disabled=""/);
    expect(coMon).toContain("2 món · tạm tính");
  });

  it("xem lớn: Tim · Đặt in (bảng sản phẩm chung) — KHÔNG ghi chú", () => {
    const html = dungManMua({ xemLonBanDau: 0 });
    expect(html).toContain('data-testid="thanh-day-3-cot"');
    expect(dem(html, NUT_DAT_IN)).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain(NUT_GHI_CHU);
  });

  it("datDongGioGiaDinh: đặt / đổi / bỏ dòng, trần 20", () => {
    let g = datDongGioGiaDinh([], "sp", "a", 2);
    g = datDongGioGiaDinh(g, "sp", "a", 99);
    expect(g).toEqual([{ productId: "sp", photoId: "a", soLuong: 20 }]);
    expect(datDongGioGiaDinh(g, "sp", "a", 0)).toEqual([]);
  });
});

describe("Màn xem lớn theo vai — đủ nút vai được phép, không có nút vai bị cấm", () => {
  for (const nc of ["dot1", "goiY", "cungChon"] as const) {
    it(`${nc}: Tim · Ghi chú · Đặt in · Tải`, () => {
      const html = xemLonTheoVai(nc);
      expect(dem(html, NUT_GHI_CHU)).toBeGreaterThanOrEqual(1);
      expect(dem(html, NUT_DAT_IN)).toBeGreaterThanOrEqual(1);
      expect(html).toContain(NUT_TAI);
    });
  }

  it("giaDinh: Tim · Đặt in (gửi yêu cầu) · Tải — KHÔNG có ghi chú", () => {
    const html = xemLonTheoVai("giaDinh");
    expect(html).not.toContain(NUT_GHI_CHU);
    expect(dem(html, NUT_DAT_IN)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('data-testid="dat-in-gia-dinh"');
    expect(html).toContain(NUT_TAI);
  });
});

// ---------------------------------------------------------------------------
// 6. Vòng 4 — "Xem trên tường / bàn nhà" ở MỌI màn, MỌI vai; ĐẶT theo quyền
// ---------------------------------------------------------------------------

const NUT_TUONG = 'data-testid="nut-xem-tuong"';
const TAT_CA_NGU_CANH = ["dot1", "dotThem", "goiY", "cungChon", "giaDinh"] as const;

describe("Vòng 4 — xem trên tường: mọi vai × mọi ngữ cảnh", () => {
  it("congCuLuotChon: xemTuong bật cho MỌI vai, cả đợt 1 lẫn đợt N", () => {
    for (const nc of TAT_CA_NGU_CANH) {
      for (const dotThem of [false, true]) {
        expect([nc, dotThem, congCuLuotChon(nc, { choPhepTai: false, dotThem }).xemTuong]).toEqual([nc, dotThem, true]);
      }
    }
  });

  for (const nc of TAT_CA_NGU_CANH) {
    it(`màn xem lớn (${nc}): có nút cố định "Trên tường"`, () => {
      expect(xemLonTheoVai(nc)).toContain(NUT_TUONG);
    });
  }

  it("màn đợt N — ba mẹ và người gợi ý: có nút 'Trên tường' ở màn xem lớn (tấm CHƯA chọn)", () => {
    expect(dungManDot({ xemLonBanDau: 2 })).toContain(NUT_TUONG);
    const goiY = { timCuaToi: new Set<string>(), doiTim: () => {} };
    expect(dungManDot({ goiY, anhNhap: [], xemLonBanDau: 2 })).toContain(NUT_TUONG);
  });

  it("màn mua của gia đình: có nút 'Trên tường' ở màn xem lớn (tấm chưa thả tim)", () => {
    expect(dungManMua({ xemLonBanDau: 1 })).toContain(NUT_TUONG);
  });

  it("màn ảnh đã chỉnh: có nút 'Trên tường' khi màn cha nối `xemTuong`", () => {
    expect(renderToStaticMarkup(<XemLonDuyet {...propsXemLonChinh(() => {})} />)).toContain(NUT_TUONG);
    expect(renderToStaticMarkup(<XemLonDuyet {...propsXemLonChinh(undefined)} />)).not.toContain(NUT_TUONG);
  });
});

describe("Vòng 4 — ĐẶT ở màn treo tường theo quyền vai/trạng thái (`cachDatTuManTreo`)", () => {
  const c = (p: Partial<Parameters<typeof cachDatTuManTreo>[0]> & { nguCanh: NguCanhLuotChon }) =>
    cachDatTuManTreo({ khoa: false, dotMoiMo: false, moChoGiaDinh: true, ...p });

  it("đợt 1 còn mở: ba mẹ / người cùng chọn / người gợi ý đặt thẳng vào giỏ", () => {
    for (const nguCanh of ["dot1", "cungChon", "goiY"] as const) expect(c({ nguCanh })).toBe("gio");
  });
  it("bộ đã khoá + đợt N mở: ba mẹ → 'Chọn thêm ảnh'; người cùng chọn/gợi ý → gợi ý", () => {
    expect(c({ nguCanh: "dot1", khoa: true, dotMoiMo: true })).toBe("dotMoi");
    expect(c({ nguCanh: "cungChon", khoa: true, dotMoiMo: true })).toBe("goiY");
    expect(c({ nguCanh: "goiY", khoa: true, dotMoiMo: true })).toBe("goiY");
  });
  it("bộ đã khoá, chưa tới đợt N: chỉ xem (không nút đặt giả)", () => {
    expect(c({ nguCanh: "dot1", khoa: true })).toBe("chiXem");
  });
  it("gia đình: dẫn sang màn mua của gia đình khi bộ còn mở; bộ đóng thì chỉ xem; KHÔNG vào giỏ ba mẹ", () => {
    expect(c({ nguCanh: "giaDinh" })).toBe("giaDinh");
    expect(c({ nguCanh: "giaDinh", moChoGiaDinh: false })).toBe("chiXem");
    expect(c({ nguCanh: "giaDinh", khoa: true, dotMoiMo: true })).not.toBe("gio");
  });
  it("màn có giỏ riêng: ba mẹ đợt N + gia đình (giỏ yêu cầu) → giỏ; người gợi ý → gợi ý", () => {
    expect(c({ nguCanh: "dotThem", trongManGio: true })).toBe("gio");
    expect(c({ nguCanh: "giaDinh", trongManGio: true })).toBe("gio");
    expect(c({ nguCanh: "goiY", trongManGio: true })).toBe("goiY");
  });
});

describe("Vòng 4 — màn treo tường: xem luôn được; nút đặt theo quyền", () => {
  const dung = (p: Partial<React.ComponentProps<typeof ManTreoTuong>>) =>
    renderToStaticMarkup(
      <ManTreoTuong
        mo
        onDong={() => {}}
        anh={[{ id: "g1", fileName: "BB_g1.jpg", width: 4000, height: 6000 }]}
        chiSoBanDau={0}
        danhMuc={[{ productId: "sp-go", name: "Gỗ 40x60", material: "Gỗ", size: "40x60", unitPrice: 500_000, nhom: "anh_in" }]}
        suatTrongGoi={[]}
        placements={[]}
        addonsDaDat={[]}
        khoa={false}
        duocChon
        dangLuu={false}
        onDatVaoGoi={() => {}}
        onDatMuaThem={() => {}}
        {...p}
      />,
    );

  it("được đặt: 'Thêm vào giỏ'", () => {
    const html = dung({});
    expect(html).toContain("Thêm vào giỏ");
    expect(html).not.toContain('data-testid="nut-dat-loi-khac-treo-tuong"');
  });
  it("không đặt thẳng được + có lối của vai: nút dẫn sang lối đó, KHÔNG có 'Thêm vào giỏ'", () => {
    const html = dung({ duocChon: false, loiDatKhac: { nhan: "Đặt in tấm này", onBam: () => {} } });
    expect(html).toContain('data-testid="nut-dat-loi-khac-treo-tuong"');
    expect(html).not.toContain("Thêm vào giỏ");
  });
  it("không có lối nào: chỉ xem (không nút giả)", () => {
    const html = dung({ khoa: true });
    expect(html).not.toContain("Thêm vào giỏ");
    expect(html).not.toContain('data-testid="nut-dat-loi-khac-treo-tuong"');
  });
});

/** Màn lớn ảnh đã chỉnh — component thuần (không hook), dựng với dữ liệu giả tối thiểu. */
function propsXemLonChinh(xemTuong: React.ComponentProps<typeof XemLonDuyet>["xemTuong"]) {
  const khong = () => {};
  const anhChinh = [{ id: "c1", fileName: "BB_c1.jpg", width: 4000, height: 6000, maTepDrive: null, goc: null, khoa: "goc" }];
  return {
    anh: anhChinh,
    viTriMo: 0,
    nhap: {},
    daXem: new Set(["c1"]),
    dem: demNhap(["c1"], {}, new Set()),
    moVong: true,
    trangThaiVong: "cho_duyet",
    laChu: true,
    tinhNang: { vungKhoanh: false, anhMau: false },
    nhanDot: null,
    lichSuTam: [],
    soSanh: false,
    viTriSoSanh: 50,
    dangGhiChu: false,
    dangKhoanh: false,
    dangTaiAnh: false,
    ban: false,
    loi: null,
    hanh: {
      dong: khong, diToi: khong, batTatSoSanh: khong, datViTriSoSanh: khong, duyetTam: khong, canSuaTam: khong,
      duyetCaBo: khong, guiYeuCau: khong, ghiChu: khong, batTatKhoanh: khong, themVung: khong, boVung: khong,
      chonAnhMinhHoa: khong, boAnhMinhHoa: khong, boYeuCauSua: khong, xongGhiChu: khong,
    },
    xemTuong,
  } as React.ComponentProps<typeof XemLonDuyet>;
}
