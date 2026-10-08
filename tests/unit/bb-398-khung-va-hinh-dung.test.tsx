/**
 * BB-398 — phần bán hàng (anh 08/10/2026):
 *   1. Khung có HAI cách bán: khung lẻ (không ảnh) / khung gắn dòng in đã đặt.
 *   2. "Xem trên tường nhà" mở lại từ cửa hàng.
 *   3. "Xem album trên bàn" — đặt cuốn lên ảnh mặt bàn thật, đúng khổ cm.
 *   4. Số ảnh một cuốn THEO KHỔ.
 *
 * THUẦN: không cơ sở dữ liệu, không mạng thật. Component dựng thật bằng
 * renderToStaticMarkup (không giả lập hook React). Route dựng thật, chỉ giả lập
 * BIÊN NGOÀI: phiên khách và client Supabase (bảng trong bộ nhớ).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  batBuocChonAnh,
  chuanKhoIn,
  dongInChoDongKhung,
  kiemKhungGanIn,
  nhanKhungChoTho,
  type DongGioXetKhung,
} from "@/lib/products/khung-gan-anh-in";
import {
  SO_ANH_THEO_KHO_ALBUM,
  khoangSoAnhChung,
  nhanSoAnhAlbum,
  nhanSoAnhChoCacCuon,
  soAnhCuaKhoAlbum,
  type SanPhamAlbumTrongDanhMuc,
} from "@/lib/products/album-khai-niem";
import { CANH_BAN_ALBUM, VUNG_XEM_ALBUM, datAlbumTrenBan } from "@/lib/gallery/album-tren-ban";
import { CuaHang, type DongDaMua } from "@/components/features/gallery/cua-hang";
import { BanAlbum } from "@/components/features/gallery/ban-album";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";

const CHU = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/ /g, " ").replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// 1. Luật khung gắn dòng in (thuần)
// ---------------------------------------------------------------------------
const KHUNG_40x60 = { kind: "print", material: "Khung HQ", size: "40x60" };
const DONG_GO_40x60 = {
  id: "in-go",
  selectionId: "s1",
  photoId: "p1",
  quantity: 2,
  sanPham: { kind: "print", material: "Gỗ", size: "40x60" },
};

describe("BB-398 1. kiemKhungGanIn — luật khung gắn dòng in", () => {
  it("khung đúng khổ cho dòng in Gỗ cùng lượt chọn, trong số lượng → hợp lệ", () => {
    expect(kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: KHUNG_40x60, dongIn: DONG_GO_40x60, soLuong: 1 })).toEqual({ ok: true });
    expect(kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: KHUNG_40x60, dongIn: DONG_GO_40x60, soLuong: 2 })).toEqual({ ok: true });
  });
  it("UV là ảnh giấy → từ chối", () => {
    const uv = { ...DONG_GO_40x60, sanPham: { kind: "print", material: "UV", size: "20x30" } };
    const khung = { ...KHUNG_40x60, size: "20x30" };
    expect(kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: khung, dongIn: uv, soLuong: 1 })).toEqual({ ok: false, lyDo: "uv_khong_boc" });
  });
  it("khổ khung lệch khổ in → từ chối; khổ viết ngược (60x40) vẫn là cùng khổ", () => {
    expect(
      kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: { ...KHUNG_40x60, size: "50x75" }, dongIn: DONG_GO_40x60, soLuong: 1 }),
    ).toEqual({ ok: false, lyDo: "kho_lech" });
    expect(
      kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: { ...KHUNG_40x60, size: "60 x 40" }, dongIn: DONG_GO_40x60, soLuong: 1 }),
    ).toEqual({ ok: true });
  });
  it("nhiều khung hơn số tấm in → từ chối", () => {
    expect(kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: KHUNG_40x60, dongIn: DONG_GO_40x60, soLuong: 3 })).toEqual({
      ok: false,
      lyDo: "vuot_so_luong",
    });
  });
  it("dòng in của lượt chọn khác / không có → không thấy; sản phẩm không phải khung → từ chối", () => {
    expect(kiemKhungGanIn({ selectionId: "s2", sanPhamKhung: KHUNG_40x60, dongIn: DONG_GO_40x60, soLuong: 1 }).ok).toBe(false);
    expect(kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: KHUNG_40x60, dongIn: null, soLuong: 1 })).toEqual({
      ok: false,
      lyDo: "khong_thay_dong_in",
    });
    expect(
      kiemKhungGanIn({ selectionId: "s1", sanPhamKhung: { kind: "print", material: "Gỗ", size: "40x60" }, dongIn: DONG_GO_40x60, soLuong: 1 }),
    ).toEqual({ ok: false, lyDo: "khong_phai_khung" });
  });
  it("khung LẺ không cần ảnh: chỉ ảnh in bắt buộc chọn ảnh", () => {
    expect(batBuocChonAnh("khung")).toBe(false);
    expect(batBuocChonAnh("anh_in")).toBe(true);
    expect(batBuocChonAnh("album")).toBe(false);
  });
  it("chuanKhoIn: số nhỏ trước, đọc ×/x/cm", () => {
    expect(chuanKhoIn("60×40")).toBe("40x60");
    expect(chuanKhoIn("40X60 cm")).toBe("40x60");
    expect(chuanKhoIn("A4")).toBeNull();
  });
});

const GIO: DongGioXetKhung[] = [
  { id: "in-go", productId: "go-40x60", photoId: "p1", quantity: 1, ganVoiAddonId: null, kind: "print", material: "Gỗ", size: "40x60" },
  { id: "in-uv", productId: "uv-20x30", photoId: "p2", quantity: 1, ganVoiAddonId: null, kind: "print", material: "UV", size: "20x30" },
  { id: "in-tg", productId: "tg-30x45", photoId: "p3", quantity: 2, ganVoiAddonId: null, kind: "print", material: "Tráng gương", size: "30x45" },
  { id: "khung-tg", productId: "khung-30x45", photoId: "p3", quantity: 2, ganVoiAddonId: "in-tg", kind: "print", material: "Khung HQ", size: "30x45" },
  { id: "khung-le", productId: "khung-40x60", photoId: null, quantity: 1, ganVoiAddonId: null, kind: "print", material: "Khung HQ", size: "40x60" },
];
const DM_KHUNG = [
  { productId: "khung-40x60", name: "Khung HQ 40x60", material: "Khung HQ", size: "40x60", unitPrice: 450_000 },
  { productId: "khung-30x45", name: "Khung HQ 30x45", material: "Khung HQ", size: "30x45", unitPrice: 300_000 },
];

describe("BB-398 1. dongInChoDongKhung — danh sách 'Đóng khung ảnh đã đặt in'", () => {
  it("chỉ dòng in bọc được (bỏ UV, bỏ chính dòng khung), khung đúng khổ, đủ khung → daDuKhung", () => {
    const ds = dongInChoDongKhung(GIO, DM_KHUNG);
    expect(ds.map((d) => d.dongIn.id)).toEqual(["in-go", "in-tg"]);
    expect(ds[0]!.khungVua.map((k) => k.productId)).toEqual(["khung-40x60"]);
    expect(ds[0]!.daDuKhung).toBe(false);
    expect(ds[1]!.soKhungDaGan).toBe(2);
    expect(ds[1]!.daDuKhung).toBe(true);
  });
});

describe("BB-398 1. nhanKhungChoTho — màn quản trị / thợ", () => {
  const tep = (id: string) => ({ p1: "IMG_0101.jpg", p3: "IMG_0303.jpg" })[id] ?? null;
  const dong = GIO.map((d) => ({ id: d.id, photoId: d.photoId, ganVoiAddonId: d.ganVoiAddonId, kind: d.kind, material: d.material, size: d.size }));
  it("khung gắn in: tên tệp + chất liệu + khổ của dòng in; khung không ảnh: Khung lẻ; dòng in: null", () => {
    expect(nhanKhungChoTho(dong[3]!, dong, tep)).toBe("Khung cho: IMG_0303.jpg · Tráng gương 30x45");
    expect(nhanKhungChoTho(dong[4]!, dong, tep)).toBe("Khung lẻ");
    expect(nhanKhungChoTho(dong[0]!, dong, tep)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Số ảnh một cuốn theo khổ
// ---------------------------------------------------------------------------
describe("BB-398 4. số ảnh album theo khổ", () => {
  it("đúng bảng anh đưa (08/10)", () => {
    expect(soAnhCuaKhoAlbum("15x21")).toEqual({ min: 20, max: 25 });
    expect(soAnhCuaKhoAlbum("20x20")).toEqual({ min: 25, max: 30 });
    expect(soAnhCuaKhoAlbum("25×25")).toEqual({ min: 30, max: 35 });
    expect(soAnhCuaKhoAlbum("30x30")).toEqual({ min: 35, max: 40 });
    expect(soAnhCuaKhoAlbum("20x30")).toEqual({ min: 30, max: 35 });
    expect(soAnhCuaKhoAlbum("30x20")).toEqual({ min: 30, max: 35 });
    expect(Object.keys(SO_ANH_THEO_KHO_ALBUM)).toHaveLength(5);
  });
  it("khổ không có trong bảng → không hiện số", () => {
    expect(soAnhCuaKhoAlbum("40x40")).toBeNull();
    expect(nhanSoAnhAlbum("40x40")).toBeNull();
    expect(nhanSoAnhAlbum(null)).toBeNull();
  });
  it("nhãn: '25–30 ảnh'; nhiều cuốn khác khổ → nói chung suy từ bảng", () => {
    expect(nhanSoAnhAlbum("20x20")).toBe("25–30 ảnh");
    expect(nhanSoAnhChoCacCuon(["20x20", "20×20"])).toBe("25–30 ảnh");
    expect(khoangSoAnhChung()).toEqual({ min: 20, max: 40 });
    expect(nhanSoAnhChoCacCuon(["20x20", "30x30"])).toBe("20–40 ảnh tuỳ khổ");
  });
});

const DANH_MUC_ALBUM: SanPhamAlbumTrongDanhMuc[] = [
  { productId: "album-20x30", name: "Album (Ultra HD) 20x30", material: "Album (Ultra HD)", size: "20x30", unitPrice: 1_500_000, nhom: "album" },
  { productId: "album-20x20", name: "Album (Ultra HD) 20x20", material: "Album (Ultra HD)", size: "20x20", unitPrice: 1_200_000, nhom: "album" },
  { productId: "album-40x40", name: "Album (Ultra HD) 40x40", material: "Album (Ultra HD)", size: "40x40", unitPrice: 2_500_000, nhom: "album" },
];

describe("BB-398 4. màn bán album hiện số ảnh theo khổ từng dòng", () => {
  it("'Khổ 20×20 cm · 25–30 ảnh', 'Khổ 20×30 cm · 30–35 ảnh'; khổ ngoài bảng không có số; có nút 'Xem album trên bàn'", () => {
    const html = renderToStaticMarkup(
      React.createElement(BanAlbum, { danhMuc: DANH_MUC_ALBUM, daMua: [], donDaGui: false, khoa: false, daCoAlbum: false, onDat: () => true }),
    );
    const chu = CHU(html);
    expect(chu).toContain("Khổ 20×20 cm · 25–30 ảnh");
    expect(chu).toContain("Khổ 20×30 cm · 30–35 ảnh");
    expect(chu).toContain("40×40 cm");
    expect(chu).not.toMatch(/40×40 cm · \d/);
    // Mô tả + ô đặc điểm theo cuốn đang chọn (mặc định rẻ nhất = 20×20).
    expect(chu).toContain("in từ 25–30 ảnh của bé");
    expect(chu).not.toContain("20–30 tấm");
    expect(html).toContain('data-testid="nut-xem-album-tren-ban"');
  });
});

// ---------------------------------------------------------------------------
// 3. Album trên bàn — toán theo cm (dùng lại ban-uv.ts)
// ---------------------------------------------------------------------------
describe("BB-398 3. datAlbumTrenBan — đúng khổ cm trên mặt bàn", () => {
  const kq = (s: string) => {
    const r = datAlbumTrenBan(s);
    if (!r.vua) throw new Error(`không đặt được ${s}`);
    return r;
  };
  it("khổ vuông lớn hơn → to hơn ĐÚNG tỉ lệ cm (cùng pxMoiCm của ảnh bàn)", () => {
    const a20 = kq("20x20");
    const a25 = kq("25x25");
    const a30 = kq("30x30");
    expect(a20.hinh.rong).toBeCloseTo(20 * CANH_BAN_ALBUM.pxMoiCm, 5);
    expect(a25.hinh.rong / a20.hinh.rong).toBeCloseTo(25 / 20, 5);
    expect(a30.hinh.rong / a20.hinh.rong).toBeCloseTo(30 / 20, 5);
    for (const a of [a20, a25, a30]) {
      expect(a.huong).toBe("vuong");
      expect(a.hinh.cao).toBeCloseTo(a.hinh.rong, 5);
    }
  });
  it("khổ chữ nhật là cuốn ĐỨNG (cao > rộng), kể cả viết ngược 30x20", () => {
    for (const s of ["20x30", "30x20", "15x21"]) {
      const a = kq(s);
      expect(a.huong).toBe("doc");
      expect(a.hinh.cao).toBeGreaterThan(a.hinh.rong);
    }
    expect(kq("20x30").hinh.cao / kq("20x30").hinh.rong).toBeCloseTo(1.5, 5);
    expect(kq("15x21").hinh.rong).toBeCloseTo(15 * CANH_BAN_ALBUM.pxMoiCm, 5);
  });
  it("mọi khổ đang bán nằm gọn trong phần ảnh bày ra; khổ to dày hơn", () => {
    for (const s of Object.keys(SO_ANH_THEO_KHO_ALBUM)) {
      const a = kq(s);
      expect(a.hinh.x).toBeGreaterThanOrEqual(VUNG_XEM_ALBUM.x);
      expect(a.hinh.y).toBeGreaterThanOrEqual(VUNG_XEM_ALBUM.y);
      expect(a.hinh.x + a.hinh.rong).toBeLessThanOrEqual(VUNG_XEM_ALBUM.x + VUNG_XEM_ALBUM.rong);
      expect(a.hinh.y + a.hinh.cao).toBeLessThanOrEqual(VUNG_XEM_ALBUM.y + VUNG_XEM_ALBUM.cao);
    }
    expect(kq("30x30").dayPx).toBeGreaterThan(kq("15x21").dayPx);
  });
  it("khổ không đọc được → không vẽ", () => {
    expect(datAlbumTrenBan("A4")).toEqual({ vua: false, lyDo: "kho_khong_doc_duoc" });
  });
});

// ---------------------------------------------------------------------------
// 1 + 2. Cửa hàng dựng thật
// ---------------------------------------------------------------------------
const DANH_MUC: SanPhamCuaHang[] = [
  { productId: "go-40x60", name: "Gỗ 40x60", material: "Gỗ", size: "40x60", unitPrice: 600_000, nhom: "anh_in", canGanAnh: true },
  { productId: "uv-20x30", name: "UV 20x30", material: "UV", size: "20x30", unitPrice: 80_000, nhom: "anh_in", canGanAnh: true },
  { productId: "khung-40x60", name: "Khung HQ 40x60", material: "Khung HQ", size: "40x60", unitPrice: 450_000, nhom: "khung", canGanAnh: true },
  { productId: "khung-20x30", name: "Khung HQ 20x30", material: "Khung HQ", size: "20x30", unitPrice: 200_000, nhom: "khung", canGanAnh: true },
];
const dong = (d: Partial<DongDaMua> & Pick<DongDaMua, "id" | "productId">): DongDaMua => ({
  name: d.productId,
  quantity: 1,
  totalPrice: 0,
  photoId: null,
  ...d,
});
const GIO_CUA_HANG: DongDaMua[] = [
  dong({ id: "in-go", productId: "go-40x60", photoId: "p1", kind: "print", material: "Gỗ", size: "40x60", fileName: "IMG_0101.jpg" }),
  dong({ id: "in-uv", productId: "uv-20x30", photoId: "p2", kind: "print", material: "UV", size: "20x30", fileName: "IMG_0202.jpg" }),
];
const PROPS_CO_BAN = {
  mo: true,
  onDong: () => {},
  danhMuc: DANH_MUC,
  tongTien: 0,
  anhDaChon: [{ id: "p1", fileName: "IMG_0101.jpg" }],
  khoa: false,
  dangLuu: false,
  onMua: () => true,
};

describe("BB-398 2. cửa hàng có nút 'Xem trên tường nhà'", () => {
  it("tab Ảnh in, đã có chất liệu + khổ → có nút (UV mặc định đầu danh sách → 'Xem trên bàn nhà')", () => {
    const html = renderToStaticMarkup(
      React.createElement(CuaHang, { ...PROPS_CO_BAN, daMua: [], presetNhom: "anh_in", onXemTrenTuong: () => {} }),
    );
    expect(html).toContain('data-testid="nut-xem-tren-tuong-cua-hang"');
    expect(CHU(html)).toMatch(/Xem trên (tường|bàn) nhà/);
  });
  it("không truyền lối vào → không có nút (nút gắn với việc thật, không vẽ suông)", () => {
    const html = renderToStaticMarkup(React.createElement(CuaHang, { ...PROPS_CO_BAN, daMua: [], presetNhom: "anh_in" }));
    expect(html).not.toContain('data-testid="nut-xem-tren-tuong-cua-hang"');
  });
});

describe("BB-398 1. tab Khung — hai lối", () => {
  it("'Mua khung lẻ': không có bước chọn ảnh, nút 'Thêm vào giỏ', ghi chú khung lẻ", () => {
    const html = renderToStaticMarkup(
      React.createElement(CuaHang, { ...PROPS_CO_BAN, daMua: [], presetNhom: "khung", onDongKhung: () => true }),
    );
    const chu = CHU(html);
    expect(html).toContain('data-testid="loi-khung-le"');
    expect(html).toContain('data-testid="loi-khung-gan-in"');
    expect(html).not.toContain('aria-label="Thêm ảnh vào tấm này"');
    expect(chu).toContain("Thêm vào giỏ");
    expect(chu).not.toContain("Chọn ảnh");
    expect(html).toContain('data-testid="ghi-chu-khung-le"');
  });

  it("'Đóng khung ảnh đã đặt in': dòng Gỗ 40×60 có tên tệp + 'Thêm khung'; UV KHÔNG nằm trong danh sách", () => {
    const html = renderToStaticMarkup(
      React.createElement(CuaHang, {
        ...PROPS_CO_BAN,
        daMua: GIO_CUA_HANG,
        presetNhom: "khung",
        presetPhotoId: "p1",
        onDongKhung: () => true,
      }),
    );
    const chu = CHU(html);
    expect(html.match(/data-testid="dong-in-cho-khung"/g)?.length).toBe(1);
    expect(chu).toContain("IMG_0101.jpg");
    expect(chu).not.toContain("IMG_0202.jpg");
    expect(chu).toContain("Gỗ 40×60 cm");
    expect(html).toContain('data-testid="nut-them-khung-cho-dong"');
    expect(chu).toMatch(/Thêm khung · 450\.000/);
    expect(html).toContain('data-testid="khung-uv-khong-boc"');
  });

  it("dòng in đã đủ khung → 'Đã có khung', không còn nút thêm", () => {
    const html = renderToStaticMarkup(
      React.createElement(CuaHang, {
        ...PROPS_CO_BAN,
        // Dòng khung đặt trước: giỏ thu gọn chỉ hiện vài dòng đầu.
        daMua: [
          dong({ id: "khung-1", productId: "khung-40x60", photoId: "p1", ganVoiAddonId: "in-go", kind: "print", material: "Khung HQ", size: "40x60" }),
          ...GIO_CUA_HANG,
        ],
        presetNhom: "khung",
        presetPhotoId: "p1",
        onDongKhung: () => true,
      }),
    );
    expect(html).toContain('data-testid="khung-da-co"');
    expect(html).not.toContain('data-testid="nut-them-khung-cho-dong"');
    // Giỏ ghi rõ khung gắn tấm nào.
    expect(CHU(html)).toContain("Khung cho: IMG_0101.jpg");
  });

  it("chưa có dòng in nào bọc được (chỉ UV) → câu dẫn mời đặt in trước", () => {
    const html = renderToStaticMarkup(
      React.createElement(CuaHang, {
        ...PROPS_CO_BAN,
        daMua: [GIO_CUA_HANG[1]!],
        presetNhom: "khung",
        presetPhotoId: "p2",
        onDongKhung: () => true,
      }),
    );
    expect(html).toContain('data-testid="khung-chua-co-anh-in"');
    expect(html).not.toContain('data-testid="dong-in-cho-khung"');
  });
});

// ---------------------------------------------------------------------------
// 1. Route /api/g/addons — máy chủ kiểm lại (biên ngoài giả lập: phiên + bảng trong bộ nhớ)
// ---------------------------------------------------------------------------
type Hang = Record<string, unknown>;
const bang: Record<string, Hang[]> = {};

function taoBang() {
  bang.galleries = [{ id: "g1", status: "ready" }];
  const sp = (id: string, material: string, size: string, gia: number) => ({
    id,
    name: `${material} ${size}`,
    kind: "print",
    material,
    size,
    list_price: gia,
    price_confidence: 1,
    price_samples: 20,
    is_active: true,
  });
  bang.products = [
    sp("00000000-0000-4000-8000-0000000000a1", "Gỗ", "40x60", 600000),
    sp("00000000-0000-4000-8000-0000000000a2", "UV", "20x30", 80000),
    sp("00000000-0000-4000-8000-0000000000b1", "Khung HQ", "40x60", 450000),
    sp("00000000-0000-4000-8000-0000000000b2", "Khung HQ", "20x30", 200000),
    sp("00000000-0000-4000-8000-0000000000b3", "Khung HQ", "50x75", 550000),
  ];
  bang.selection_addons = [
    { id: "00000000-0000-4000-8000-0000000000c1", selection_id: "s1", product_id: "00000000-0000-4000-8000-0000000000a1", photo_id: "00000000-0000-4000-8000-0000000000d1", gan_voi_addon_id: null, quantity: 2, unit_price: 600000, dot: 1, created_at: "t" },
    { id: "00000000-0000-4000-8000-0000000000c2", selection_id: "s1", product_id: "00000000-0000-4000-8000-0000000000a2", photo_id: "00000000-0000-4000-8000-0000000000d2", gan_voi_addon_id: null, quantity: 1, unit_price: 80000, dot: 1, created_at: "t" },
    { id: "00000000-0000-4000-8000-0000000000c9", selection_id: "s-khac", product_id: "00000000-0000-4000-8000-0000000000a1", photo_id: "00000000-0000-4000-8000-0000000000d9", gan_voi_addon_id: null, quantity: 1, unit_price: 600000, dot: 1, created_at: "t" },
  ];
  bang.activity_logs = [];
  bang.photos = [];
  bang.selection_items = [];
}

/** Bộ dựng truy vấn tối giản kiểu supabase-js, chạy trên `bang` trong bộ nhớ. */
function truyVan(ten: string) {
  let loc: Array<(h: Hang) => boolean> = [];
  let viec: { loai: "select" } | { loai: "insert"; hang: Hang } | { loai: "update"; doi: Hang } | { loai: "delete" } = { loai: "select" };
  let ketQuaGhi: Hang[] | null = null;
  const chay = (): Hang[] => {
    const ds = bang[ten] ?? [];
    if (viec.loai === "insert") {
      const moi = { id: `00000000-0000-4000-8000-${String(ds.length + 100).padStart(12, "0")}`, created_at: "t", dot: 1, ...viec.hang };
      ds.push(moi);
      bang[ten] = ds;
      viec = { loai: "select" };
      return (ketQuaGhi = [moi]);
    }
    const trung = ds.filter((h) => loc.every((f) => f(h)));
    if (viec.loai === "update") {
      for (const h of trung) Object.assign(h, viec.doi);
      viec = { loai: "select" };
      return (ketQuaGhi = trung);
    }
    if (viec.loai === "delete") {
      bang[ten] = ds.filter((h) => !trung.includes(h));
      viec = { loai: "select" };
      return (ketQuaGhi = trung);
    }
    const nguon = ketQuaGhi ?? trung;
    // Nhúng `product:products(...)` cho selection_addons.
    return nguon.map((h) =>
      ten === "selection_addons" ? { ...h, product: (bang.products ?? []).find((p) => p.id === h.product_id) ?? null } : h,
    );
  };
  const b = {
    select: () => b,
    insert: (hang: Hang) => ((viec = { loai: "insert", hang }), b),
    update: (doi: Hang) => ((viec = { loai: "update", doi }), b),
    delete: () => ((viec = { loai: "delete" }), b),
    eq: (c: string, v: unknown) => (loc.push((h) => h[c] === v), b),
    is: (c: string, v: unknown) => (loc.push((h) => (h[c] ?? null) === v), b),
    in: (c: string, v: unknown[]) => (loc.push((h) => v.includes(h[c])), b),
    gt: (c: string, v: number) => (loc.push((h) => Number(h[c]) > v), b),
    neq: (c: string, v: unknown) => (loc.push((h) => h[c] !== v), b),
    order: () => b,
    single: async () => {
      const r = chay();
      return r[0] ? { data: r[0], error: null } : { data: null, error: { message: "không có" } };
    },
    maybeSingle: async () => ({ data: chay()[0] ?? null, error: null }),
    then: (ok: (v: { data: Hang[]; error: null }) => unknown, loi?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(ok({ data: chay(), error: null }));
      } catch (e) {
        return loi ? Promise.resolve(loi(e)) : Promise.reject(e);
      }
    },
  };
  // `loc` bị đặt lại cho mỗi lần `from()` mới (mỗi truy vấn là một builder riêng).
  loc = [];
  return b;
}

vi.mock("@/lib/auth/phien-bo-anh", () => ({
  requirePhienBoAnh: vi.fn(async () => ({ galleryId: "g1", selectionId: "s1", role: "owner" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (ten: string) => truyVan(ten) }),
}));

async function goiAddons(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/g/addons/route");
  const res = await POST(
    new Request("http://localhost/api/g/addons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: { addon?: Hang }; error?: { message?: string } } };
}

describe("BB-398 1. /api/g/addons — máy chủ kiểm khung gắn in + khung lẻ", () => {
  beforeEach(() => taoBang());
  const IN_GO = "00000000-0000-4000-8000-0000000000c1";
  const IN_UV = "00000000-0000-4000-8000-0000000000c2";
  const KHUNG40 = "00000000-0000-4000-8000-0000000000b1";

  it("khung 40×60 gắn dòng in Gỗ 40×60 → ghi gan_voi_addon_id + photo_id của dòng in", async () => {
    const r = await goiAddons({ productId: KHUNG40, quantity: 1, ganVoiAddonId: IN_GO });
    expect(r.status).toBe(200);
    const moi = bang.selection_addons!.find((h) => h.gan_voi_addon_id === IN_GO);
    expect(moi).toMatchObject({ product_id: KHUNG40, photo_id: "00000000-0000-4000-8000-0000000000d1", quantity: 1 });
  });
  it("UV → từ chối 400, không ghi", async () => {
    const r = await goiAddons({ productId: "00000000-0000-4000-8000-0000000000b2", quantity: 1, ganVoiAddonId: IN_UV });
    expect(r.status).toBe(400);
    expect(r.json.error?.message).toContain("UV");
    expect(bang.selection_addons!.some((h) => h.gan_voi_addon_id)).toBe(false);
  });
  it("khổ lệch → từ chối 400", async () => {
    const r = await goiAddons({ productId: "00000000-0000-4000-8000-0000000000b3", quantity: 1, ganVoiAddonId: IN_GO });
    expect(r.status).toBe(400);
    expect(bang.selection_addons!.some((h) => h.gan_voi_addon_id)).toBe(false);
  });
  it("vượt số lượng in (2) → từ chối 400", async () => {
    const r = await goiAddons({ productId: KHUNG40, quantity: 3, ganVoiAddonId: IN_GO });
    expect(r.status).toBe(400);
    expect(bang.selection_addons!.some((h) => h.gan_voi_addon_id)).toBe(false);
  });
  it("dòng in của lượt chọn khác → 404", async () => {
    const r = await goiAddons({ productId: KHUNG40, quantity: 1, ganVoiAddonId: "00000000-0000-4000-8000-0000000000c9" });
    expect(r.status).toBe(404);
  });
  it("khung LẺ không ảnh → 200, một dòng không photo_id, không gắn in; ảnh in không ảnh vẫn bị từ chối", async () => {
    const r = await goiAddons({ productId: KHUNG40, quantity: 2 });
    expect(r.status).toBe(200);
    const le = bang.selection_addons!.filter((h) => h.product_id === KHUNG40);
    expect(le).toHaveLength(1);
    expect(le[0]).toMatchObject({ photo_id: null, quantity: 2 });
    expect(le[0]!.gan_voi_addon_id ?? null).toBeNull();
    const rIn = await goiAddons({ productId: "00000000-0000-4000-8000-0000000000a1", quantity: 1 });
    expect(rIn.status).toBe(400);
  });
});
