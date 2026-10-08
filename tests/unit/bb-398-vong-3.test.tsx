/**
 * BB-398 vòng 3 — đóng khung trong ĐỢT MUA THÊM (đợt ≥ 2) cho tấm in ĐÃ LƯU.
 *
 * Thuần: luật (`dotDuocDongKhung`, `kiemKhungGanInTrongDot`), khâu kiểm sản phẩm của đợt
 * (`chuanBiSanPham` dựng thật, client Supabase trong bộ nhớ — biên ngoài), giỏ đợt (`datDong`)
 * và cửa hàng dựng thật bằng renderToStaticMarkup. Không giả lập hook React.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dotDuocDongKhung, kiemKhungGanInTrongDot } from "@/lib/products/khung-gan-anh-in";
import { chuanBiSanPham } from "@/lib/gallery/dot-chon-server";
import { datDong } from "@/components/features/gallery/man-chon-them-dot";
import { CuaHang, type DongDaMua } from "@/components/features/gallery/cua-hang";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";
import type { SupabaseClient } from "@supabase/supabase-js";

const CAC_DOT = [
  { soDot: 2, trangThai: "da_xac_nhan" },
  { soDot: 3, trangThai: "cho_xac_nhan" },
];

describe("BB-398 v3 · luật đóng khung trong đợt", () => {
  it("đợt 1 và đợt đã xác nhận được; đợt còn chờ thì chưa", () => {
    expect(dotDuocDongKhung(1, CAC_DOT)).toBe(true);
    expect(dotDuocDongKhung(2, CAC_DOT)).toBe(true);
    expect(dotDuocDongKhung(3, CAC_DOT)).toBe(false);
    expect(dotDuocDongKhung(4, CAC_DOT)).toBe(false);
  });

  const KHUNG = { kind: "print", material: "Khung HQ", size: "40x60" };
  const IN = (dot: number, material = "Gỗ", size = "40x60") => ({
    id: "in1",
    selectionId: "s1",
    photoId: "p1",
    quantity: 2,
    dot,
    sanPham: { kind: "print", material, size },
  });
  const kiem = (o: { dot?: number; material?: string; size?: string; daGan?: number; moi?: number }) =>
    kiemKhungGanInTrongDot({
      selectionId: "s1",
      dongMoi: [{ productId: "k40", ganVoiAddonId: "in1", soLuong: o.moi ?? 1 }],
      sanPham: new Map([["k40", KHUNG]]),
      dongIn: new Map([["in1", IN(o.dot ?? 1, o.material, o.size)]]),
      daGan: new Map([["in1", o.daGan ?? 0]]),
      dotDuoc: (d) => dotDuocDongKhung(d, CAC_DOT),
    });

  it("đếm cả khung đã gắn ở đợt trước: in 2 bản, đã gắn 1 → thêm 1 được, thêm 2 vượt", () => {
    expect(kiem({ daGan: 1, moi: 1 })).toEqual({ ok: true });
    expect(kiem({ daGan: 1, moi: 2 })).toEqual({ ok: false, lyDo: "vuot_so_luong" });
  });
  it("UV, khổ lệch, đợt chưa xác nhận → từ chối", () => {
    expect(kiem({ material: "UV", size: "40x60" })).toEqual({ ok: false, lyDo: "uv_khong_boc" });
    expect(kiem({ size: "50x75" })).toEqual({ ok: false, lyDo: "kho_lech" });
    expect(kiem({ dot: 3 })).toEqual({ ok: false, lyDo: "dot_chua_xac_nhan" });
  });
});

// ---------------------------------------------------------------------------
// chuanBiSanPham — khâu kiểm sản phẩm của lượt chốt đợt (máy chủ)
// ---------------------------------------------------------------------------
type Hang = Record<string, unknown>;
const SP = (id: string, material: string, size: string) => ({
  id,
  name: `${material} ${size}`,
  kind: "print",
  material,
  size,
  list_price: 450000,
  price_confidence: 1,
  price_samples: 20,
  is_active: true,
});
const K40 = "00000000-0000-4000-8000-0000000000b1";
const bang: Record<string, Hang[]> = {
  products: [SP(K40, "Khung HQ", "40x60"), SP("go40", "Gỗ", "40x60"), SP("uv20", "UV", "20x30")],
  selection_addons: [
    { id: "in-go", selection_id: "s1", product_id: "go40", photo_id: "p1", quantity: 2, dot: 1, gan_voi_addon_id: null },
    { id: "in-uv", selection_id: "s1", product_id: "uv20", photo_id: "p2", quantity: 1, dot: 1, gan_voi_addon_id: null },
    { id: "in-go-dot3", selection_id: "s1", product_id: "go40", photo_id: "p3", quantity: 1, dot: 3, gan_voi_addon_id: null },
    { id: "in-khac", selection_id: "s-khac", product_id: "go40", photo_id: "p9", quantity: 1, dot: 1, gan_voi_addon_id: null },
    { id: "khung-cu", selection_id: "s1", product_id: K40, photo_id: "p1", quantity: 1, dot: 1, gan_voi_addon_id: "in-go" },
  ],
};
const admin = {
  from(ten: string) {
    const loc: Array<(h: Hang) => boolean> = [];
    const b = {
      select: () => b,
      in: (c: string, v: unknown[]) => (loc.push((h) => v.includes(h[c])), b),
      eq: (c: string, v: unknown) => (loc.push((h) => h[c] === v), b),
      then: (ok: (v: { data: Hang[]; error: null }) => unknown) =>
        Promise.resolve(
          ok({
            data: (bang[ten] ?? [])
              .filter((h) => loc.every((f) => f(h)))
              .map((h) => (ten === "selection_addons" ? { ...h, product: bang.products!.find((p) => p.id === h.product_id) } : h)),
            error: null,
          }),
        ),
    };
    return b;
  },
} as unknown as SupabaseClient;
const NGOAI = { selectionId: "s1", cacDot: CAC_DOT };

describe("BB-398 v3 · chuanBiSanPham — khung gắn dòng in đã lưu", () => {
  it("hợp lệ: khung 40×60 cho tấm Gỗ 40×60 đợt 1 (đã có 1/2 khung) → ảnh lấy từ dòng in, giữ ganVoiAddonId", async () => {
    const kq = await chuanBiSanPham(admin, [{ productId: K40, photoId: null, soLuong: 1, ganVoiAddonId: "in-go" }], new Set(), NGOAI);
    expect(kq.ok).toBe(true);
    if (kq.ok) {
      expect(kq.dong[0]).toMatchObject({ productId: K40, photoId: "p1", soLuong: 1, ganVoiAddonId: "in-go" });
      expect(kq.soChuaAnh).toBe(0);
    }
  });
  it("vượt số tấm in khi cộng khung đợt trước → từ chối", async () => {
    const kq = await chuanBiSanPham(admin, [{ productId: K40, photoId: null, soLuong: 2, ganVoiAddonId: "in-go" }], new Set(), NGOAI);
    expect(kq).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
  it("UV → từ chối; dòng in của lượt chọn khác → không thấy; tấm in đợt chưa xác nhận → từ chối", async () => {
    expect(
      await chuanBiSanPham(admin, [{ productId: K40, photoId: null, soLuong: 1, ganVoiAddonId: "in-uv" }], new Set(), NGOAI),
    ).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(
      await chuanBiSanPham(admin, [{ productId: K40, photoId: null, soLuong: 1, ganVoiAddonId: "in-khac" }], new Set(), NGOAI),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const kq3 = await chuanBiSanPham(admin, [{ productId: K40, photoId: null, soLuong: 1, ganVoiAddonId: "in-go-dot3" }], new Set(), NGOAI);
    expect(kq3).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    if (!kq3.ok) expect(kq3.message).toContain("chưa xác nhận");
  });
});

// ---------------------------------------------------------------------------
// Giỏ đợt + cửa hàng dựng thật
// ---------------------------------------------------------------------------
describe("BB-398 v3 · giỏ đợt (datDong)", () => {
  it("khung gắn in là dòng RIÊNG (không gộp với khung lẻ cùng sản phẩm); số lượng tuyệt đối; 0 là bỏ", () => {
    // Khung theo ẢNH kiểu cũ (cùng sản phẩm, CÙNG tấm p1) và khung GẮN dòng in phải là hai dòng.
    let g = datDong([], "k40", "p1", 1);
    g = datDong(g, "k40", "p1", 1, "in-go");
    expect(g).toHaveLength(2);
    g = datDong(g, "k40", "p1", 2, "in-go");
    expect(g.find((d) => d.ganVoiAddonId === "in-go")?.soLuong).toBe(2);
    expect(g.find((d) => !d.ganVoiAddonId)?.soLuong).toBe(1);
    g = datDong(g, "k40", "p1", 0, "in-go");
    expect(g).toEqual([{ productId: "k40", photoId: "p1", soLuong: 1 }]);
  });
});

const DANH_MUC: SanPhamCuaHang[] = [
  { productId: "go40", name: "Gỗ 40x60", material: "Gỗ", size: "40x60", unitPrice: 600_000, nhom: "anh_in", canGanAnh: true },
  { productId: "k40", name: "Khung HQ 40x60", material: "Khung HQ", size: "40x60", unitPrice: 450_000, nhom: "khung", canGanAnh: true },
];
const luu = (d: Partial<DongDaMua> & Pick<DongDaMua, "id" | "productId">): DongDaMua => ({
  name: d.productId,
  quantity: 1,
  totalPrice: 0,
  photoId: null,
  ...d,
});
const HTML = (dongDaLuu: DongDaMua[], daMua: DongDaMua[] = []) =>
  renderToStaticMarkup(
    React.createElement(CuaHang, {
      mo: true,
      onDong: () => {},
      danhMuc: DANH_MUC,
      daMua,
      tongTien: 0,
      anhDaChon: [],
      khoa: false,
      dangLuu: false,
      onMua: () => true,
      presetNhom: "khung",
      presetPhotoId: "p1",
      onDongKhung: () => true,
      dongDaLuu,
    }),
  );

describe("BB-398 v3 · cửa hàng của đợt: dòng in ĐÃ LƯU hiện ở 'Đóng khung ảnh đã đặt in'", () => {
  const IN_GO = luu({ id: "in-go", productId: "go40", photoId: "p1", kind: "print", material: "Gỗ", size: "40x60", fileName: "BB398_1.jpg" });
  it("giỏ đợt trống, tấm in Gỗ đợt 1 đã lưu → có dòng + nút 'Thêm khung'", () => {
    const html = HTML([IN_GO]);
    expect(html.match(/data-testid="dong-in-cho-khung"/g)?.length).toBe(1);
    expect(html).toContain("BB398_1.jpg");
    expect(html).toContain('data-testid="nut-them-khung-cho-dong"');
  });
  it("khung đã gắn ở đợt trước + khung trong giỏ đợt = số in → 'Đã có khung'", () => {
    const html = HTML(
      [{ ...IN_GO, quantity: 2 }, luu({ id: "k-cu", productId: "k40", photoId: "p1", ganVoiAddonId: "in-go", kind: "print", material: "Khung HQ", size: "40x60" })],
      [luu({ id: "k40::gan::in-go", productId: "k40", photoId: "p1", ganVoiAddonId: "in-go", kind: "print", material: "Khung HQ", size: "40x60" })],
    );
    expect(html).toContain('data-testid="khung-da-co"');
    expect(html).not.toContain('data-testid="nut-them-khung-cho-dong"');
  });
});
