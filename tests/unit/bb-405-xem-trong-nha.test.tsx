/**
 * BB-405 — "Xem trong nhà" + đầu trang màn khách.
 *
 * Anh 08/10/2026: (A) "bỏ tên và mã hóa đơn ngay dưới tên và logo chuyển sang bên dưới từ
 * Album gia đình"; (B) "ảnh trên tường anh muốn hiển thị như phần chọn ảnh thả tim là vào
 * xem được ở tất cả các màn không phải cái dấu # như thế, cả album cũng vậy đồng nhất với
 * ảnh in".
 *
 * Dựng THẬT bằng `renderToStaticMarkup` (không giả lập hook — AGENTS.md §5a); `fetch` giả
 * ở biên. Dữ liệu giả (AGENTS §6).
 */
import React from "react";
import { afterAll, beforeAll, describe, expect, it, vi as viTest } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LuoiAnh } from "@/components/features/gallery/luoi-anh";
import { ManChonThemDot, type MonCatalogue } from "@/components/features/gallery/man-chon-them-dot";
import { ManMuaGiaDinh } from "@/components/features/gallery/man-mua-gia-dinh";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { ManTreoTuong } from "@/components/features/gallery/man-treo-tuong";
import { albumXemTrongNha, duocDatAlbumThang } from "@/components/features/gallery/xem-trong-nha";
import { propsCongCuXemLon } from "@/components/features/gallery/cong-cu-luot-chon";
import type { TrangThaiDotKhach } from "@/components/features/gallery/chon-them-anh";
import { TrinhThietKeBia, type ChiTietBia } from "@/components/features/admin/bia-bo-anh-editor";
import { congCuLuotChon } from "@/lib/gallery/luot-chon";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";

// Vài component dùng chung viết cho JSX tự động của Next (không import React).
(globalThis as { React?: typeof React }).React = React;

const fetchGia = viTest.fn(async () => new Response(JSON.stringify({ data: null }), { status: 200 }));
const fetchCu = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = fetchGia as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = fetchCu;
});

function anh(id: string, mark: PhotoPublic["mark"] = null): PhotoPublic {
  return {
    id,
    fileName: `BB_${id}.jpg`,
    width: 4000,
    height: 6000,
    subfolder: null,
    sortIndex: 0,
    isFavorite: false,
    mark,
    orderIndex: null,
    retouchNote: null,
    noteTags: [],
    suggestedBy: [],
    status: "active",
  } as unknown as PhotoPublic;
}

const NUT_O = 'data-testid="nut-xem-trong-nha"';
const dem = (html: string, chuoi: string) => html.split(chuoi).length - 1;

const CATALOGUE: MonCatalogue[] = [
  { productId: "sp-in", name: "Gỗ 40x60", kind: "print", material: "Gỗ", size: "40x60", unitPrice: 500_000, nhom: "anh_in", canGanAnh: true },
  { productId: "sp-album", name: "Album 20x20", kind: "print", material: null, size: "20x20", unitPrice: 250_000, nhom: "album", canGanAnh: false },
];

// ---------------------------------------------------------------------------
// (B1) Nút trên TỪNG Ô ẢNH — cùng kiểu nút tim, đối xứng tim, biểu tượng ngôi nhà
// ---------------------------------------------------------------------------

describe("BB-405 — nút 'Xem trong nhà' trên từng ô ảnh (LuoiAnh dùng chung)", () => {
  const luoi = (p: Partial<React.ComponentProps<typeof LuoiAnh>> = {}) =>
    renderToStaticMarkup(
      <LuoiAnh
        photos={[anh("a1", "selected"), anh("a2"), anh("a3")]}
        mutatingIds={new Set()}
        khoa={false}
        soSanPhamTheoAnh={new Map()}
        soSanhBat={false}
        soSanhTheoAnh={new Map()}
        onToggle={() => {}}
        onOpen={() => {}}
        onToggleSoSanh={() => {}}
        {...p}
      />,
    );

  it("mỗi ô một nút, góc DƯỚI TRÁI (tim ở dưới phải), vùng chạm 48px, nhãn tiếng Việt có số ảnh", () => {
    const html = luoi({ onXemTrongNha: () => {} });
    expect(dem(html, NUT_O)).toBe(3);
    expect(html).toContain('aria-label="Xem trong nhà — ảnh 2"');
    const the = html.slice(html.lastIndexOf("<", html.indexOf(NUT_O)), html.indexOf(">", html.indexOf(NUT_O)) + 1);
    expect(the).toContain("bottom-0 left-0");
    expect(the).toContain("h-12 w-12");
    // Biểu tượng ngôi nhà của lucide, không phải `Frame` (trông như dấu "#").
    expect(html).toContain("lucide-house");
    expect(html).not.toContain("lucide-frame");
  });

  it("bộ đã khoá: tim ẩn ở tấm chưa chọn nhưng 'Xem trong nhà' VẪN có (xem không đòi đã chọn)", () => {
    const html = luoi({ khoa: true, onXemTrongNha: () => {} });
    expect(dem(html, NUT_O)).toBe(3);
  });

  it("đang chọn tấm để so sánh: không có nút (một chạm một nghĩa); màn không nối hàm: không có nút", () => {
    expect(dem(luoi({ soSanhBat: true, onXemTrongNha: () => {} }), NUT_O)).toBe(0);
    expect(dem(luoi(), NUT_O)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (B2) Có ở TỪNG MÀN: đợt N (ba mẹ + người gợi ý), gia đình mua lần hai
// ---------------------------------------------------------------------------

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

function dungManDot(p: Partial<React.ComponentProps<typeof ManChonThemDot>> = {}) {
  return renderToStaticMarkup(
    <ManChonThemDot
      photos={[anh("k1", "selected"), anh("m1"), anh("c1")]}
      subfolders={[]}
      tenBe="Bé Na"
      tenKhach="Nguyễn Thị Mai"
      catalogue={CATALOGUE}
      tt={TT}
      nhap={{ anh: [], gio: [], ghiChu: {} }}
      anhNhap={[]}
      setNhap={() => {}}
      onDong={() => {}}
      onDaChot={() => {}}
      onCanTaiLai={() => {}}
      {...p}
    />,
  );
}

describe("BB-405 — nút trên ô ở mọi màn chọn", () => {
  it("đợt mua thêm (ba mẹ): mỗi ô một nút", () => {
    expect(dem(dungManDot(), NUT_O)).toBe(3);
  });

  it("đợt mua thêm (người gợi ý): vẫn có nút trên mọi ô", () => {
    const goiY = { timCuaToi: new Set<string>(), doiTim: () => {} } as unknown as React.ComponentProps<typeof ManChonThemDot>["goiY"];
    expect(dem(dungManDot({ goiY }), NUT_O)).toBe(3);
  });

  it("đợt mua thêm KHÔNG có ảnh in trong danh mục (không có gì để ướm): không có nút", () => {
    expect(dem(dungManDot({ catalogue: CATALOGUE.filter((sp) => sp.nhom !== "anh_in") }), NUT_O)).toBe(0);
  });

  it("gia đình mua lần hai: mỗi ô một nút", () => {
    const html = renderToStaticMarkup(
      <ManMuaGiaDinh
        photos={[anh("g1", "selected"), anh("g2"), anh("g3")]}
        subfolders={[]}
        tenBe="Bé Na"
        danhMuc={CATALOGUE.map(({ productId, name, material, size, unitPrice, nhom, canGanAnh }) => ({
          productId,
          name,
          material,
          size,
          unitPrice,
          nhom: nhom as "anh_in" | "album",
          canGanAnh,
        }))}
        gio={[]}
        setGio={() => {}}
        onToggleHeart={() => {}}
        onDong={() => {}}
        onDaGui={() => {}}
      />,
    );
    expect(dem(html, NUT_O)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// (B3) Màn xem lớn: nút cũ "Trên tường" (Frame "#") → ngôi nhà, cùng trình xem chung
// ---------------------------------------------------------------------------

describe("BB-405 — màn xem lớn: cùng biểu tượng ngôi nhà", () => {
  it("nút đầu màn có biểu tượng ngôi nhà, chữ 'Trong nhà', không còn Frame", () => {
    const cc = congCuLuotChon("dot1", { choPhepTai: false });
    const html = renderToStaticMarkup(
      <PhotoLightbox
        photos={[anh("p1", "selected")]}
        initialIndex={0}
        onClose={() => {}}
        onToggleHeart={() => {}}
        mutatingIds={new Set()}
        isLocked={false}
        {...propsCongCuXemLon(cc, { xemTuong: () => {}, bangSanPham: () => <div /> })}
      />,
    );
    const i = html.indexOf('data-testid="nut-xem-tuong"');
    expect(i).toBeGreaterThan(-1);
    const nut = html.slice(i, html.indexOf("</button>", i));
    expect(nut).toContain("lucide-house");
    expect(nut).toContain(vi.gallery.xemTrongNha.ngan);
    expect(html).not.toContain("lucide-frame");
  });
});

// ---------------------------------------------------------------------------
// (B4) Trình xem CHUNG: hai lựa chọn ngang hàng; album theo đúng quyền vai
// ---------------------------------------------------------------------------

describe("BB-405 — trình xem chung 'Xem trong nhà' (ManTreoTuong + album trên bàn)", () => {
  const DM_ALBUM = CATALOGUE.map(({ productId, name, material, size, unitPrice, nhom }) => ({
    productId,
    name,
    material,
    size,
    unitPrice,
    nhom: nhom as NhomSanPham,
  }));
  const album = albumXemTrongNha(DM_ALBUM, { nguCanh: "dot1", onDat: () => true });
  const dung = (p: Partial<React.ComponentProps<typeof ManTreoTuong>>) =>
    renderToStaticMarkup(
      <ManTreoTuong
        mo
        onDong={() => {}}
        anh={[{ id: "g1", fileName: "BB_g1.jpg", width: 4000, height: 6000 }]}
        chiSoBanDau={0}
        danhMuc={[{ productId: "sp-in", name: "Gỗ 40x60", material: "Gỗ", size: "40x60", unitPrice: 500_000, nhom: "anh_in" }]}
        suatTrongGoi={[]}
        placements={[]}
        addonsDaDat={[]}
        khoa={false}
        duocChon
        dangLuu={false}
        onDatVaoGoi={() => {}}
        onDatMuaThem={() => {}}
        album={album}
        {...p}
      />,
    );

  it("albumXemTrongNha: chỉ cuốn album đang bán; không có cuốn nào → null", () => {
    expect(album?.cuon.map((c) => c.productId)).toEqual(["sp-album"]);
    const khongAlbum = CATALOGUE.filter((sp) => sp.nhom !== "album").map((sp) => ({ ...sp, nhom: sp.nhom as NhomSanPham }));
    expect(albumXemTrongNha(khongAlbum, { nguCanh: "dot1" })).toBeNull();
  });

  it("mở ở 'Trên tường': có HAI lựa chọn ngang hàng, 'Trên tường' đang chọn", () => {
    const html = dung({});
    expect(html).toContain('data-testid="chon-cach-xem-trong-nha"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="cach-xem-tuong"/);
    expect(html).toMatch(/aria-checked="false"[^>]*data-testid="cach-xem-ban"/);
    expect(html).toContain(vi.gallery.xemTrongNha.albumTrenBan);
    expect(html).not.toContain('data-testid="xem-album-tren-ban"');
  });

  it("chọn 'Album trên bàn': dùng lại màn album, CÙNG hai lựa chọn ở đầu, ba mẹ đặt được", () => {
    const html = dung({ cachBanDau: "ban" });
    expect(html).toContain('data-testid="xem-album-tren-ban"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="cach-xem-ban"/);
    expect(html).toContain('data-testid="nut-dat-album-kho-nay"');
  });

  it("vai không đặt thẳng (người gợi ý / gia đình được mời): nút dẫn sang lối của vai, KHÔNG đặt album", () => {
    const html = dung({ cachBanDau: "ban", duocChon: false, loiDatKhac: { nhan: "Gợi ý tấm này", onBam: () => {} } });
    expect(html).toContain('data-testid="nut-dat-loi-khac-album-tren-ban"');
    expect(html).not.toContain('data-testid="nut-dat-album-kho-nay"');
  });

  it("bộ đã khoá, không lối nào: chỉ xem (không nút giả)", () => {
    const html = dung({ cachBanDau: "ban", khoa: true });
    expect(html).toContain('data-testid="album-tren-ban-chi-xem"');
    expect(html).not.toContain('data-testid="nut-dat-album-kho-nay"');
  });

  it("vòng 2 — ở 'Album trên bàn' chỉ MỘT công tắc nhìn thấy; cảnh tường (Ẩn bảng, phòng, bảng giá) không chồng phía sau", () => {
    const html = dung({ cachBanDau: "ban" });
    expect(dem(html, 'data-testid="chon-cach-xem-trong-nha"')).toBe(1);
    expect(html).not.toContain(vi.gallery.treoTuong.anBang);
    expect(html).not.toContain('data-testid="bang-treo-tuong"');
    expect(html).not.toContain('aria-label="Xem ảnh trên tường"');
  });

  it("vòng 2 — bìa cuốn album dùng CÙNG đường ảnh ô lưới, cỡ hợp lệ (không còn w=640 bị route từ chối)", () => {
    const coMa = dung({
      cachBanDau: "ban",
      anh: [{ id: "g1", fileName: "BB_g1.jpg", width: 4000, height: 6000, maTepDrive: "MA_TEP_GIA_0405_abcdef" }],
    });
    expect(coMa).toMatch(/data-testid="bia-cuon-album" src="https:\/\/lh3\.googleusercontent\.com\/d\/MA_TEP_GIA_0405_abcdef=w800"/);
    const khongMa = dung({ cachBanDau: "ban" });
    expect(khongMa).toContain('data-testid="bia-cuon-album" src="/api/img/g1?w=800"');
    expect(khongMa).not.toContain("w=640");
  });

  it("không có cuốn album nào đang bán: chỉ 'Trên tường' như cũ (không có công tắc)", () => {
    expect(dung({ album: null })).not.toContain('data-testid="chon-cach-xem-trong-nha"');
  });
});

// ---------------------------------------------------------------------------
// (A) Đầu trang: tên bộ KHÔNG còn dưới logo; nằm ngay dưới "Album gia đình"
// ---------------------------------------------------------------------------

const DETAIL: ChiTietBia = {
  coverPhotoId: "aaaaaaaa-0000-4000-8000-000000000405",
  coverHeadline: null,
  welcomeMessage: null,
  coverLayout: null,
  babyNickname: "Bơ",
  babyFullName: "Nguyễn Fixture Bơ",
  branchName: "Chi nhánh Thử",
  shootDate: "2026-09-13",
  sessionType: "Thôi nôi",
  title: "HD_FIXTURE_405",
  status: "ready",
  photoCount: 12,
  includedQuota: 10,
  selectedCount: 0,
} as ChiTietBia;

describe("BB-405 (A) — đầu trang trong khung xem trước bìa (khớp màn khách)", () => {
  viTest.stubGlobal("fetch", viTest.fn(() => new Promise(() => {})));
  const html = renderToStaticMarkup(
    <TrinhThietKeBia
      detail={DETAIL}
      busy={false}
      luoi={[{ id: "bbbbbbbb-0000-4000-8000-000000000001", fileName: "BB_001.jpg", width: 3000, height: 2000 }]}
      dangTaiLuoi={false}
      conTiep={false}
      onTaiThem={() => {}}
      onDong={() => {}}
      onSave={() => {}}
    />,
  );
  viTest.unstubAllGlobals();

  it("có đầu trang xem trước, tên bộ là tên thân thiện (không phải mã hoá đơn)", () => {
    expect(html).toContain('data-testid="dau-trang-xem-truoc"');
    expect(html).not.toMatch(/data-testid="ten-bo-xem-truoc"[^<]*<span[^>]*>HD_FIXTURE_405/);
  });

  it("tên bộ KHÔNG đứng ngay dưới logo + chữ Baby Bean", () => {
    expect(html).not.toMatch(/Baby Bean<\/span><\/span><span[^>]*data-testid="ten-bo-xem-truoc"/);
  });

  it("tên bộ nằm NGAY DƯỚI dòng 'Album gia đình', cùng một khối", () => {
    const khoi = html.indexOf('data-testid="khoi-album-gia-dinh-xem-truoc"');
    expect(khoi).toBeGreaterThan(-1);
    const chu = html.indexOf("Album gia đình", khoi);
    const ten = html.indexOf('data-testid="ten-bo-xem-truoc"', khoi);
    expect(chu).toBeGreaterThan(khoi);
    expect(ten).toBeGreaterThan(chu);
    // Giữa chữ "Album gia đình" và tên bộ không có khối nào khác (logo, chuông…).
    expect(html.slice(chu, ten)).not.toContain("ten-thuong-hieu");
  });
});

// ---------------------------------------------------------------------------
// Vòng 2 (B2 đỏ) — người gợi ý KHÔNG đặt album; gia đình được mời ở trang chính cũng không
// ---------------------------------------------------------------------------

describe("BB-405 vòng 2 — quyền đặt album theo vai", () => {
  const DM = CATALOGUE.map(({ productId, name, material, size, unitPrice, nhom }) => ({
    productId,
    name,
    material,
    size,
    unitPrice,
    nhom: nhom as NhomSanPham,
  }));
  /**
   * Dựng ĐÚNG như gallery-app dựng cho người gợi ý ở đợt 1: màn treo cho "Thêm vào giỏ" ảnh in
   * (cachDat "gio" → duocChon), album qua `albumXemTrongNha` với ngữ cảnh của vai.
   */
  const dungTheoVai = (nguCanh: "dot1" | "goiY" | "cungChon" | "giaDinh", trongManGio = false) =>
    renderToStaticMarkup(
      <ManTreoTuong
        mo
        onDong={() => {}}
        anh={[{ id: "g1", fileName: "BB_g1.jpg", width: 4000, height: 6000 }]}
        chiSoBanDau={0}
        danhMuc={[{ productId: "sp-in", name: "Gỗ 40x60", material: "Gỗ", size: "40x60", unitPrice: 500_000, nhom: "anh_in" }]}
        suatTrongGoi={[]}
        placements={[]}
        addonsDaDat={[]}
        khoa={false}
        duocChon
        dangLuu={false}
        onDatVaoGoi={() => {}}
        onDatMuaThem={() => {}}
        cachBanDau="ban"
        album={albumXemTrongNha(DM, {
          nguCanh,
          trongManGio,
          onDat: () => true,
          loiDatKhac: nguCanh === "goiY" ? { nhan: vi.gallery.datLoiGoiY, onBam: () => {} } : null,
        })}
      />,
    );

  it("duocDatAlbumThang: ba mẹ + người cùng chọn có; người gợi ý không; gia đình chỉ trong màn mua (giỏ yêu cầu)", () => {
    expect(duocDatAlbumThang("dot1")).toBe(true);
    expect(duocDatAlbumThang("dotThem")).toBe(true);
    expect(duocDatAlbumThang("cungChon")).toBe(true);
    expect(duocDatAlbumThang("goiY")).toBe(false);
    expect(duocDatAlbumThang("goiY", { trongManGio: true })).toBe(false);
    expect(duocDatAlbumThang("giaDinh")).toBe(false);
    expect(duocDatAlbumThang("giaDinh", { trongManGio: true })).toBe(true);
  });

  it("người gợi ý (đợt 1, màn tường cho chọn): KHÔNG có 'Đặt album khổ này'; nút là 'Gợi ý tấm này'", () => {
    const html = dungTheoVai("goiY");
    expect(html).toContain('data-testid="xem-album-tren-ban"');
    expect(html).not.toContain('data-testid="nut-dat-album-kho-nay"');
    expect(html).toContain('data-testid="nut-dat-loi-khac-album-tren-ban"');
    expect(html).toContain(vi.gallery.datLoiGoiY);
  });

  it("gia đình được mời ở trang chính: không đặt album thẳng", () => {
    expect(dungTheoVai("giaDinh")).not.toContain('data-testid="nut-dat-album-kho-nay"');
  });

  it("ba mẹ: vẫn đặt được", () => {
    expect(dungTheoVai("dot1")).toContain('data-testid="nut-dat-album-kho-nay"');
  });
});
