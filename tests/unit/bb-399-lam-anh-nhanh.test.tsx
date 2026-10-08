/**
 * BB-399 — dịch vụ "Làm ảnh nhanh" (anh chốt 08/10/2026: tiêu chuẩn 14 ngày, làm nhanh 5 ngày,
 * giá lấy từ Lark).
 *
 * THUẦN: không chạm cơ sở dữ liệu, không gọi Lark. Route mua sau chốt chạy trên một kho giả
 * trong bộ nhớ (`@/lib/supabase/admin` giả lập — biên giới ra ngoài), phiên khách giả. Component
 * dựng THẬT bằng `renderToStaticMarkup` từ dữ liệu (không giả lập hook nào).
 *
 * Kiểm ngược (AGENTS.md §5a) — dán trong bàn giao.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const phien = vi.hoisted(() => ({ role: "owner" as string }));
const nhanVien = vi.hoisted(() => ({ role: "admin", quyen: ["settings:system", "galleries:read"] as string[] }));
vi.mock("@/lib/auth/phien-bo-anh", () => ({
  requirePhienBoAnh: async () => ({
    galleryId: "11111111-1111-4111-8111-111111111111",
    selectionId: "22222222-2222-4222-8222-222222222222",
    shareLinkId: "33333333-3333-4333-8333-333333333333",
    role: phien.role,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/staff", () => {
  class AuthError extends Error {
    code = "FORBIDDEN";
  }
  return {
    AuthError,
    requireStaff: async () => ({ staffId: "s1", role: nhanVien.role, branchIds: ["b1"], permissions: nhanVien.quyen }),
    requirePermission: () => {},
  };
});
vi.mock("@/lib/nhat-ky", () => ({ ghiNhatKy: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/tuc-thi", () => ({ phatSuKienBoAnh: vi.fn(async () => true) }));
const daGuiLark = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/lark/notify", async (goc) => {
  const that = await goc<typeof import("@/lib/lark/notify")>();
  return { ...that, enqueueLarkNotification: vi.fn(async (tin: unknown) => void daGuiLark.push(tin)) };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { POST as muaSauChot } from "@/app/api/g/lam-anh-nhanh/route";
import {
  chonSanPhamLamNhanh,
  chuanHoaSoNgayTra,
  laSanPhamLamNhanh,
  laTenLamNhanh,
  tamTinhHopChot,
  tinhHanTra,
  xetMuaSauChot,
  xepLamNhanhLenDau,
  type LamAnhNhanhKhach,
  type SanPhamDichVu,
} from "@/lib/dich-vu/lam-anh-nhanh";
import { OLamAnhNhanh, TheLamAnhNhanhSauChot } from "@/components/features/gallery/lam-anh-nhanh-khach";
import { CamOnSauChot } from "@/components/features/gallery/cam-on-sau-chot";
import { doiChieuHoaDon } from "@/lib/hoa-don/doi-chieu-hoa-don";
import type { HoaDonChuan } from "@/lib/hoa-don/nguon-hoa-don";
import { dungThe, locBoAnh } from "@/lib/lark/notify";
import { cauTrangThaiSanPhamLamNhanh, doiDongLamNhanhThanhSanPham } from "@/lib/dich-vu/lam-anh-nhanh";
import { GET as docCaiDat } from "@/app/api/admin/settings/route";

const NGAY = 24 * 60 * 60 * 1000;
const sp = (p: Partial<SanPhamDichVu> & { id: string }): SanPhamDichVu => ({
  name: "Làm ảnh nhanh",
  kind: "addon",
  lark_record_id: null,
  list_price: 500_000,
  is_active: true,
  ...p,
});

// ---------------------------------------------------------------------------
// 1. Nhận diện sản phẩm
// ---------------------------------------------------------------------------
describe("BB-399 · nhận diện sản phẩm Làm ảnh nhanh", () => {
  it("tên chuẩn hoá: bỏ dấu, hoa/thường, khoảng trắng thừa", () => {
    expect(laTenLamNhanh("Làm ảnh nhanh")).toBe(true);
    expect(laTenLamNhanh("  LÀM  ẢNH   NHANH ")).toBe(true);
    expect(laTenLamNhanh("Làm ảnh nhanh 2")).toBe(false);
    expect(laTenLamNhanh("Ảnh in nhanh")).toBe(false);
  });

  it("chưa ghim: chọn theo tên, loại hàng thử/ngừng bán/không giá/sai loại", () => {
    const ds = [
      sp({ id: "a", name: "Fixture Làm ảnh nhanh" }),
      sp({ id: "b", is_active: false }),
      sp({ id: "c", list_price: null }),
      sp({ id: "d", kind: "print" }),
      sp({ id: "e", lark_record_id: "recTHAT" }),
    ];
    expect(chonSanPhamLamNhanh(ds, null)?.id).toBe("e");
    expect(chonSanPhamLamNhanh(ds.slice(0, 4), null)).toBeNull();
  });

  it("có ghim: CHỈ tin ghim — Lark đổi tên vẫn nhận; ghim ngừng bán thì null (không rơi về tên)", () => {
    const doiTen = sp({ id: "x", name: "Làm hình siêu tốc", lark_record_id: "recRUSH" });
    const cungTen = sp({ id: "y", lark_record_id: "recKHAC" });
    expect(chonSanPhamLamNhanh([doiTen, cungTen], "recRUSH")?.id).toBe("x");
    expect(chonSanPhamLamNhanh([{ ...doiTen, is_active: false }, cungTen], "recRUSH")).toBeNull();
  });

  it("dòng đã mua: nhận theo mọi ghim hoặc theo tên", () => {
    const ghim = new Set(["recRUSH"]);
    expect(laSanPhamLamNhanh({ name: "Tên mới", lark_record_id: "recRUSH" }, ghim)).toBe(true);
    expect(laSanPhamLamNhanh({ name: "Làm ảnh nhanh", lark_record_id: null }, ghim)).toBe(true);
    expect(laSanPhamLamNhanh({ name: "Album 20x20", lark_record_id: "recALB" }, ghim)).toBe(false);
  });

  it("số ngày: 1..60 nguyên giữ, còn lại về mặc định", () => {
    expect(chuanHoaSoNgayTra(7, 14)).toBe(7);
    expect(chuanHoaSoNgayTra("7", 14)).toBe(14);
    expect(chuanHoaSoNgayTra(0, 5)).toBe(5);
    expect(chuanHoaSoNgayTra(2.5, 5)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. Hạn trả = chốt + 14 hoặc + 5
// ---------------------------------------------------------------------------
describe("BB-399 · hạn trả ảnh chỉnh", () => {
  const chot = "2026-10-08T03:00:00.000Z";
  const t0 = Date.parse(chot);
  it("không làm nhanh: chốt + 14", () => {
    const h = tinhHanTra({ chotLuc: chot, lamNhanh: false, soNgayTieuChuan: 14, soNgayNhanh: 5 });
    expect(h.soNgay).toBe(14);
    expect(Date.parse(h.hanTra!) - t0).toBe(14 * NGAY);
  });
  it("làm nhanh lúc chốt: chốt + 5", () => {
    const h = tinhHanTra({ chotLuc: chot, lamNhanh: true, muaNhanhLuc: chot, soNgayTieuChuan: 14, soNgayNhanh: 5 });
    expect(h.soNgay).toBe(5);
    expect(Date.parse(h.hanTra!) - t0).toBe(5 * NGAY);
  });
  it("mua sau chốt: tính từ lúc mua, không muộn hơn hạn tiêu chuẩn", () => {
    const mua2 = new Date(t0 + 2 * NGAY).toISOString();
    expect(Date.parse(tinhHanTra({ chotLuc: chot, lamNhanh: true, muaNhanhLuc: mua2, soNgayTieuChuan: 14, soNgayNhanh: 5 }).hanTra!) - t0).toBe(7 * NGAY);
    const mua12 = new Date(t0 + 12 * NGAY).toISOString();
    expect(Date.parse(tinhHanTra({ chotLuc: chot, lamNhanh: true, muaNhanhLuc: mua12, soNgayTieuChuan: 14, soNgayNhanh: 5 }).hanTra!) - t0).toBe(14 * NGAY);
  });
  it("chưa chốt: không có hạn", () => {
    expect(tinhHanTra({ chotLuc: null, lamNhanh: false, soNgayTieuChuan: 14, soNgayNhanh: 5 }).hanTra).toBeNull();
  });
  it("luật mua sau chốt + tạm tính + xếp lên đầu", () => {
    expect(xetMuaSauChot({ coSanPham: false, daMua: false, trangThaiBo: "submitted" })).toEqual({ ok: false, lyDo: "khong_co_san_pham" });
    expect(xetMuaSauChot({ coSanPham: true, daMua: true, trangThaiBo: "submitted" })).toEqual({ ok: false, lyDo: "da_mua" });
    expect(xetMuaSauChot({ coSanPham: true, daMua: false, trangThaiBo: "awaiting_approval" })).toEqual({ ok: false, lyDo: "qua_giai_doan" });
    expect(xetMuaSauChot({ coSanPham: true, daMua: false, trangThaiBo: "in_retouch" })).toEqual({ ok: true });
    expect(tamTinhHopChot({ tienAnhThem: 100_000, tienMuaThem: 40_000, giaLamNhanh: 500_000, chonLamNhanh: true })).toBe(640_000);
    expect(tamTinhHopChot({ tienAnhThem: 100_000, tienMuaThem: 40_000, giaLamNhanh: 500_000, chonLamNhanh: false })).toBe(140_000);
    expect(xepLamNhanhLenDau([{ id: 1 }, { id: 2, n: 1 }, { id: 3 }], (x) => "n" in x).map((x) => x.id)).toEqual([2, 1, 3]);
  });
});

// ---------------------------------------------------------------------------
// 3. Màn khách — dựng thật từ dữ liệu
// ---------------------------------------------------------------------------
const tt = (p: Partial<LamAnhNhanhKhach> = {}): LamAnhNhanhKhach => ({
  coBan: true,
  gia: 123_000,
  soNgayNhanh: 6,
  soNgayTieuChuan: 21,
  daMua: false,
  muaSauChot: false,
  hanTra: null,
  ...p,
});
const chuThuan = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

describe("BB-399 · ô Làm ảnh nhanh ở hộp chốt", () => {
  it("giá + số ngày lấy từ dữ liệu, không tích sẵn", () => {
    const html = renderToStaticMarkup(<OLamAnhNhanh thongTin={tt()} chon={false} onChon={() => {}} />);
    const chu = chuThuan(html);
    expect(html).toContain('data-testid="o-lam-anh-nhanh"');
    expect(chu).toContain("Làm ảnh nhanh");
    expect(chu).toMatch(/123\.000\s*₫/);
    expect(chu).toContain("khoảng 6 ngày thay vì 21 ngày tiêu chuẩn ạ");
    expect(html).not.toMatch(/<input[^>]*checked/);
  });
  it("không có sản phẩm đang bán → không hiện gì", () => {
    expect(renderToStaticMarkup(<OLamAnhNhanh thongTin={tt({ coBan: false })} chon={false} onChon={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<OLamAnhNhanh thongTin={null} chon={false} onChon={() => {}} />)).toBe("");
  });
  it("đã mua → 'Đã chọn làm ảnh nhanh', không có ô bán lần hai", () => {
    const html = renderToStaticMarkup(<OLamAnhNhanh thongTin={tt({ daMua: true })} chon={false} onChon={() => {}} />);
    expect(html).toContain('data-testid="lam-nhanh-da-chon"');
    expect(chuThuan(html)).toContain("Đã chọn làm ảnh nhanh");
    expect(html).not.toContain('data-testid="o-lam-anh-nhanh"');
  });
});

describe("BB-399 · màn sau chốt nói đúng số ngày", () => {
  const hanNhanh = { soNgay: 6, lamNhanh: true, hanTra: "2026-10-14T03:00:00.000Z" };
  it("bộ làm nhanh: 'trong khoảng 6 ngày'; bộ thường: 'trong khoảng 21 ngày'", () => {
    const nhanh = chuThuan(renderToStaticMarkup(<TheLamAnhNhanhSauChot thongTin={tt({ daMua: true, hanTra: hanNhanh })} laChuBo />));
    expect(nhanh).toContain("Bean trả ảnh chỉnh trong khoảng 6 ngày");
    const thuong = chuThuan(
      renderToStaticMarkup(
        <TheLamAnhNhanhSauChot thongTin={tt({ hanTra: { soNgay: 21, lamNhanh: false, hanTra: null } })} laChuBo={false} />,
      ),
    );
    expect(thuong).toContain("Bean trả ảnh chỉnh trong khoảng 21 ngày ạ");
  });
  it("nút mua sau chốt chỉ cho người nhận link chính, khi còn mua được", () => {
    const thongTin = tt({ muaSauChot: true, hanTra: { soNgay: 21, lamNhanh: false, hanTra: null } });
    expect(renderToStaticMarkup(<TheLamAnhNhanhSauChot thongTin={thongTin} laChuBo />)).toContain("nut-mua-lam-anh-nhanh");
    expect(renderToStaticMarkup(<TheLamAnhNhanhSauChot thongTin={thongTin} laChuBo={false} />)).not.toContain("nut-mua-lam-anh-nhanh");
  });
  it("màn cảm ơn mang khối hạn trả", () => {
    const html = renderToStaticMarkup(
      <CamOnSauChot
        tenBe="Bin"
        chotLuc={new Date("2026-10-08T03:00:00.000Z")}
        soTamDaChon={10}
        hanMuc={10}
        coBia={null}
        soMonMuaThem={0}
        tienMuaThem={0}
        onXemTienDo={() => {}}
        lamAnhNhanh={<TheLamAnhNhanhSauChot thongTin={tt({ daMua: true, hanTra: hanNhanh })} laChuBo />}
      />,
    );
    expect(chuThuan(html)).toContain("Bean trả ảnh chỉnh trong khoảng 6 ngày");
  });
});

// ---------------------------------------------------------------------------
// 4. Route mua sau chốt — kho giả trong bộ nhớ
// ---------------------------------------------------------------------------
type Dong = Record<string, unknown>;
function khoGia(bang: Record<string, Dong[]>) {
  const ghi: { bang: string; du: Dong }[] = [];
  function from(ten: string) {
    const loc: ((r: Dong) => boolean)[] = [];
    let duChen: Dong | null = null;
    let capNhat: Dong | null = null;
    const dong = () => (bang[ten] ?? []).filter((r) => loc.every((f) => f(r)));
    const chuoi: Record<string, unknown> = {
      select: () => chuoi,
      eq: (k: string, v: unknown) => (loc.push((r) => r[k] === v), chuoi),
      is: (k: string, v: unknown) => (loc.push((r) => (r[k] ?? null) === v), chuoi),
      in: (k: string, vs: unknown[]) => (loc.push((r) => vs.includes(r[k])), chuoi),
      ilike: (k: string, mau: string) => {
        const m = mau.replace(/%/g, "").toLowerCase();
        loc.push((r) => String(r[k] ?? "").toLowerCase().includes(m));
        return chuoi;
      },
      order: () => chuoi,
      insert: (du: Dong) => {
        duChen = { id: `moi-${ghi.length + 1}`, created_at: new Date().toISOString(), ...du };
        ghi.push({ bang: ten, du });
        (bang[ten] ??= []).push(duChen);
        return chuoi;
      },
      single: async () => (duChen ? { data: duChen, error: null } : { data: dong()[0] ?? null, error: dong()[0] ? null : { message: "0 rows" } }),
      maybeSingle: async () => ({ data: dong()[0] ?? null, error: null }),
      update: (du: Dong) => ((capNhat = du), chuoi),
      then: (giai: (v: unknown) => unknown) => {
        if (capNhat) {
          const trung = dong();
          for (const r of trung) Object.assign(r, capNhat);
          ghi.push({ bang: ten, du: { ...capNhat, _capNhat: true } });
          return Promise.resolve({ data: trung, error: null }).then(giai);
        }
        return Promise.resolve({ data: dong(), error: null }).then(giai);
      },
    };
    return chuoi;
  }
  return { client: { from } as unknown as never, ghi };
}

const GALLERY = "11111111-1111-4111-8111-111111111111";
const SEL = "22222222-2222-4222-8222-222222222222";
const SP_NHANH = { id: "sp-nhanh", name: "Làm ảnh nhanh", kind: "addon", lark_record_id: "recRUSH", list_price: 480_000, is_active: true };

function nen(p: { trangThai?: string; coSanPham?: boolean; daMua?: boolean; chot?: boolean } = {}) {
  return {
    galleries: [{ id: GALLERY, branch_id: "b1", title: "HD_20990101#9001", status: p.trangThai ?? "submitted" }],
    selections: [{ id: SEL, gallery_id: GALLERY, is_primary: true, submitted_at: p.chot === false ? null : "2026-10-08T03:00:00.000Z" }],
    settings: [{ key: "hau_ky.so_ngay_lam_nhanh", value: 5, branch_id: null }],
    products: p.coSanPham === false ? [] : [SP_NHANH],
    selection_addons: p.daMua
      ? [{ id: "cu", selection_id: SEL, product_id: SP_NHANH.id, photo_id: null, dot: 1, created_at: "2026-10-08T03:00:00.000Z", products: { name: SP_NHANH.name, lark_record_id: SP_NHANH.lark_record_id } }]
      : [],
  } as Record<string, Dong[]>;
}
const goi = () => muaSauChot(new Request("http://localhost/api/g/lam-anh-nhanh", { method: "POST" }));

describe("BB-399 · POST /api/g/lam-anh-nhanh (mua sau chốt)", () => {
  beforeEach(() => {
    phien.role = "owner";
    daGuiLark.length = 0;
  });

  it("có sản phẩm, chưa mua → ghi MỘT dòng (đợt 1, không ảnh, giá từ products), hạn = chốt-hoặc-mua + 5", async () => {
    const kho = khoGia(nen());
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await goi();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.soNgay).toBe(5);
    expect(json.data.gia).toBe(480_000);
    const dongMoi = kho.ghi.filter((g) => g.bang === "selection_addons");
    expect(dongMoi).toHaveLength(1);
    expect(dongMoi[0]!.du).toMatchObject({ selection_id: SEL, product_id: "sp-nhanh", photo_id: null, quantity: 1, unit_price: 480_000, dot: 1 });
    // Thẻ Lark: dựng từ payload đã qua locBoAnh — có dòng "Làm ảnh nhanh (5 ngày)" (không gửi Lark thật: đã giả lập).
    const tin = daGuiLark[0] as { event: string; payload: Record<string, unknown> };
    expect(tin.event).toBe("dich_vu.lam_nhanh");
    expect(JSON.stringify(dungThe("dich_vu.lam_nhanh", locBoAnh(tin.payload), null))).toContain("Làm ảnh nhanh (5 ngày)");
  });

  it("đã mua → 409, không bán lần hai", async () => {
    const kho = khoGia(nen({ daMua: true }));
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await goi();
    expect(res.status).toBe(409);
    expect((await res.json()).error.details.lyDo).toBe("da_mua");
    expect(kho.ghi).toHaveLength(0);
  });

  it("không có sản phẩm đang bán → 409, không ghi gì", async () => {
    const kho = khoGia(nen({ coSanPham: false }));
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await goi();
    expect(res.status).toBe(409);
    expect(kho.ghi).toHaveLength(0);
  });

  it("studio đã gửi ảnh chỉnh (awaiting_approval) → 409; người xem (viewer) → 403", async () => {
    const kho = khoGia(nen({ trangThai: "awaiting_approval" }));
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    expect((await goi()).status).toBe(409);
    expect(kho.ghi).toHaveLength(0);
    phien.role = "viewer";
    expect((await goi()).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. Thẻ Lark lúc chốt + đối chiếu hoá đơn BB-395
// ---------------------------------------------------------------------------
describe("BB-399 · thẻ Lark lúc khách chốt", () => {
  it("payload `lamGapNgay` qua được locBoAnh và thành dòng 'Làm ảnh nhanh (5 ngày)'", () => {
    const the = dungThe("selection.submitted", locBoAnh({ galleryTitle: "X", selectedCount: 10, includedQuota: 10, lamGapNgay: 5 }), null);
    expect(JSON.stringify(the)).toContain("Làm ảnh nhanh (5 ngày)");
    const khong = dungThe("selection.submitted", locBoAnh({ galleryTitle: "X", selectedCount: 10, includedQuota: 10 }), null);
    expect(JSON.stringify(khong)).not.toContain("Làm ảnh nhanh");
  });
});

describe("BB-399 · đối chiếu hoá đơn có dòng Làm ảnh nhanh", () => {
  const hd = (dongNhanh: boolean): HoaDonChuan => ({
    ma: "HD_20990101#9399",
    nguon: "fixture",
    tongPhaiThu: 500_000,
    daThu: 500_000,
    conLai: 0,
    trangThai: "Đã thu hết",
    phieuThu: [{ ma: "THU-1", soTien: 500_000, phuongThuc: "chuyen_khoan", phuongThucGoc: "Chuyển Khoản", ngay: null }],
    dong: dongNhanh
      ? [{ maDong: "d1", loai: "san_pham", idSanPhamNguon: "recRUSH", tenSanPham: "Làm ảnh nhanh", soLuong: 1, thanhTien: 500_000 }]
      : [],
    khoaKhachNguon: "k",
    maHauKyNguon: [],
  });
  const appCoNhanh = {
    fileVuot: 0,
    fileMuaThem: 0,
    giaMotFile: 50_000,
    sanPham: [{ productId: "sp-nhanh", idSanPhamNguon: "recRUSH", ten: "Làm ảnh nhanh", soLuong: 1, donGia: 500_000 }],
  };
  it("hoá đơn có dòng + app có addon → khớp", () => {
    const kq = doiChieuHoaDon([hd(true)], appCoNhanh);
    expect(kq.trangThai).toBe("khop");
    expect(kq.sanPhamDot1DaTra).toContain("sp-nhanh");
  });
  it("app có addon, hoá đơn thiếu dòng → thiếu 500.000", () => {
    const kq = doiChieuHoaDon([hd(false)], appCoNhanh);
    expect(kq.trangThai).toBe("thieu");
    expect(kq.tienThieu).toBe(500_000);
  });
  it("hoá đơn có dòng, app chưa có → app tự thêm vào bộ", () => {
    const kq = doiChieuHoaDon([hd(true)], { ...appCoNhanh, sanPham: [] });
    expect(kq.sanPhamThemVao).toEqual([{ idSanPhamNguon: "recRUSH", ten: "Làm ảnh nhanh", soLuong: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// 6. Vòng 2 — studio TẶNG làm nhanh: dòng 0đ trên hoá đơn Lark
// ---------------------------------------------------------------------------
describe("BB-399 vòng 2 · dòng 'Làm ảnh nhanh' 0đ đối chiếu như sản phẩm", () => {
  // Nguồn Lark xếp mọi dòng 0đ là `dich_vu` (nguon-hoa-don-lark.ts) — đúng hình dạng nó trả.
  const hdTang = (tenNhanh: string, idNhanh: string): HoaDonChuan => ({
    ma: "HD_20990101#9398",
    nguon: "fixture",
    tongPhaiThu: 0,
    daThu: 0,
    conLai: 0,
    trangThai: "Đã thu hết",
    phieuThu: [{ ma: "THU-2", soTien: 0, phuongThuc: "chuyen_khoan", phuongThucGoc: "Chuyển Khoản", ngay: null }],
    dong: [
      { maDong: "d1", loai: "dich_vu", idSanPhamNguon: idNhanh, tenSanPham: tenNhanh, soLuong: 1, thanhTien: 0 },
      { maDong: "d2", loai: "dich_vu", idSanPhamNguon: "recDVHK", tenSanPham: "Dịch vụ Hậu Kỳ", soLuong: 1, thanhTien: 0 },
    ],
    khoaKhachNguon: "k",
    maHauKyNguon: [],
  });
  const app = {
    fileVuot: 0,
    fileMuaThem: 0,
    giaMotFile: 50_000,
    sanPham: [{ productId: "sp-nhanh", idSanPhamNguon: "recRUSH", ten: "Làm ảnh nhanh", soLuong: 1, donGia: 500_000 }],
  };

  it("HĐ có 'Làm ảnh nhanh' 0đ + app có addon làm nhanh → khớp; 'Dịch vụ Hậu Kỳ' 0đ vẫn bỏ qua", () => {
    const ds = doiDongLamNhanhThanhSanPham([hdTang("Làm ảnh nhanh", "recRUSH")], new Set<string>());
    expect(ds[0]!.dong.map((d) => d.loai)).toEqual(["san_pham", "dich_vu"]);
    const kq = doiChieuHoaDon(ds, app);
    expect(kq.trangThai).toBe("khop");
    expect(kq.tienThieu).toBe(0);
    expect(kq.muc.map((m) => m.khoa)).toEqual(["sp:recRUSH"]);
    expect(kq.sanPhamDot1DaTra).toEqual(["sp-nhanh"]);
  });

  it("Lark đổi tên dòng nhưng record id là ghim → vẫn nhận ra", () => {
    const ds = doiDongLamNhanhThanhSanPham([hdTang("Làm hình siêu tốc", "recRUSH")], new Set(["recRUSH"]));
    expect(doiChieuHoaDon(ds, app).trangThai).toBe("khop");
  });

  it("không có ngoại lệ (luật cũ) thì dòng tặng bị bỏ qua → app báo 'thiếu' — đúng lỗi vòng 2 sửa", () => {
    expect(doiChieuHoaDon([hdTang("Làm ảnh nhanh", "recRUSH")], app).trangThai).toBe("thieu");
  });
});

describe("BB-399 vòng 2 · màn Cài đặt: trạng thái sản phẩm Làm ảnh nhanh", () => {
  it("câu trạng thái", () => {
    expect(cauTrangThaiSanPhamLamNhanh({ name: "Làm ảnh nhanh", list_price: 500_000 })).toBe("Đang dùng: Làm ảnh nhanh · 500.000 ₫");
    expect(cauTrangThaiSanPhamLamNhanh(null)).toMatch(/^Chưa tìm thấy sản phẩm/);
  });

  it("GET /api/admin/settings: dòng trạng thái theo ghim (đổi tên vẫn đúng); ghim sai → chưa tìm thấy", async () => {
    const lay = async (ghim: string) => {
      const kho = khoGia({
        settings: [{ key: "dich_vu.lam_anh_nhanh_lark_id", value: ghim, branch_id: null }],
        products: [{ id: "p1", name: "Làm hình siêu tốc", kind: "addon", lark_record_id: "recRUSH", list_price: 480_000, is_active: true }],
      });
      vi.mocked(createAdminClient).mockReturnValue(kho.client);
      const json = await (await docCaiDat()).json();
      return (json.data.items as { key: string; trangThai?: string }[]).find((i) => i.key === "dich_vu.lam_anh_nhanh_lark_id")?.trangThai;
    };
    expect(await lay("recRUSH")).toBe("Đang dùng: Làm hình siêu tốc · 480.000 ₫");
    expect(await lay("recKHAC")).toMatch(/^Chưa tìm thấy sản phẩm/);
  });
});

// ---------------------------------------------------------------------------
// 7. Vòng 3 — công tắc nhận làm nhanh + ưu tiên cho nhân viên
// ---------------------------------------------------------------------------
import {
  duocDoiCongTacLamNhanh,
  ghepTrangUuTien,
  laBatLamNhanh,
  laUuTienLamNhanh,
} from "@/lib/dich-vu/lam-anh-nhanh";
import { thongTinLamNhanhChoKhach } from "@/lib/dich-vu/lam-anh-nhanh-server";
import { GET as docCongTac, PATCH as doiCongTac } from "@/app/api/admin/lam-anh-nhanh/route";

const TAT = { key: "dich_vu.lam_anh_nhanh_bat", value: false, branch_id: null };
const vaoKhach = { galleryId: GALLERY, branchId: "b1", selectionId: SEL, chotLuc: "2026-10-08T03:00:00.000Z" };

describe("BB-399 vòng 3 · công tắc (luật thuần)", () => {
  it("mặc định BẬT: thiếu dòng / giá trị lạ đều bật, chỉ `false` mới tắt", () => {
    expect(laBatLamNhanh(undefined)).toBe(true);
    expect(laBatLamNhanh(null)).toBe(true);
    expect(laBatLamNhanh("false")).toBe(true);
    expect(laBatLamNhanh(false)).toBe(false);
  });
  it("tắt → mua sau chốt bị từ chối 'tam_dung'; bộ đã mua vẫn là 'da_mua'", () => {
    expect(xetMuaSauChot({ coSanPham: true, daMua: false, trangThaiBo: "submitted", bat: false })).toEqual({ ok: false, lyDo: "tam_dung" });
    expect(xetMuaSauChot({ coSanPham: true, daMua: true, trangThaiBo: "submitted", bat: false })).toEqual({ ok: false, lyDo: "da_mua" });
  });
  it("quyền đổi: Admin (settings:system) + Quản lý (settings:branch:write); CSKH không", () => {
    expect(duocDoiCongTacLamNhanh(["settings:system"])).toBe(true);
    expect(duocDoiCongTacLamNhanh(["settings:branch:write"])).toBe(true);
    expect(duocDoiCongTacLamNhanh(["settings:branch:read", "galleries:write"])).toBe(false);
  });
});

describe("BB-399 vòng 3 · công tắc tắt → khách không thấy ô/thẻ, API từ chối", () => {
  beforeEach(() => {
    phien.role = "owner";
  });
  it("màn khách: tắt → coBan=false, muaSauChot=false (ô + nút mua ẩn); bật → hiện", async () => {
    const goc = nen();
    const tat = await thongTinLamNhanhChoKhach(khoGia({ ...goc, settings: [...goc.settings!, TAT] }).client, { ...vaoKhach, trangThai: "submitted" });
    expect(tat).toMatchObject({ coBan: false, muaSauChot: false, daMua: false });
    expect(renderToStaticMarkup(<OLamAnhNhanh thongTin={tat} chon={false} onChon={() => {}} />)).toBe("");
    expect(renderToStaticMarkup(<TheLamAnhNhanhSauChot thongTin={tat} laChuBo />)).not.toContain("nut-mua-lam-anh-nhanh");
    const bat = await thongTinLamNhanhChoKhach(khoGia(nen()).client, { ...vaoKhach, trangThai: "submitted" });
    expect(bat).toMatchObject({ coBan: true, muaSauChot: true });
  });
  it("bộ ĐÃ mua: tắt vẫn 'Đã chọn' + hạn 5 ngày", async () => {
    const goc = nen({ daMua: true });
    const tt2 = await thongTinLamNhanhChoKhach(khoGia({ ...goc, settings: [...goc.settings!, TAT] }).client, { ...vaoKhach, trangThai: "in_retouch" });
    expect(tt2).toMatchObject({ daMua: true, coBan: false });
    expect(tt2?.hanTra?.soNgay).toBe(5);
    expect(renderToStaticMarkup(<OLamAnhNhanh thongTin={tt2} chon={false} onChon={() => {}} />)).toContain("lam-nhanh-da-chon");
  });
  it("POST /api/g/lam-anh-nhanh khi tắt → 409 'tam_dung', câu nhã nhặn, không ghi gì", async () => {
    const goc = nen();
    const kho = khoGia({ ...goc, settings: [...goc.settings!, TAT] });
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await goi();
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.details.lyDo).toBe("tam_dung");
    expect(json.error.message).toContain("tạm ngưng");
    expect(kho.ghi).toHaveLength(0);
  });
});

describe("BB-399 vòng 3 · công tắc nhanh cho quản trị", () => {
  beforeEach(() => {
    nhanVien.role = "admin";
    nhanVien.quyen = ["settings:system", "galleries:read"];
  });
  const patch = (bat: boolean) =>
    doiCongTac(
      new Request("http://localhost/api/admin/lam-anh-nhanh", {
        method: "PATCH",
        body: JSON.stringify({ bat }),
        headers: { "content-type": "application/json" },
      }),
    );

  it("Admin tắt → ghi settings=false + nhật ký ai/cũ/mới; CSKH → 403, không ghi", async () => {
    const kho = khoGia({ settings: [{ id: "st1", key: "dich_vu.lam_anh_nhanh_bat", value: true, branch_id: null }], activity_logs: [] });
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    expect((await patch(false)).status).toBe(200);
    expect(kho.ghi.find((g) => g.bang === "settings")?.du).toMatchObject({ value: false });
    expect(kho.ghi.find((g) => g.bang === "activity_logs")?.du).toMatchObject({
      actor_id: "s1",
      action: "settings.update",
      metadata: { key: "dich_vu.lam_anh_nhanh_bat", cu: true, moi: false },
    });

    nhanVien.role = "cs";
    nhanVien.quyen = ["settings:branch:read", "galleries:read"];
    const kho2 = khoGia({ settings: [], activity_logs: [] });
    vi.mocked(createAdminClient).mockReturnValue(kho2.client);
    expect((await patch(false)).status).toBe(403);
    expect(kho2.ghi).toHaveLength(0);
  });

  it("GET: bộ làm nhanh đang chờ — chỉ bộ đã mua + còn chờ trả ảnh (bộ đã giao không tính)", async () => {
    const G2 = "44444444-4444-4444-8444-444444444444";
    const S2 = "55555555-5555-4555-8555-555555555555";
    const goc = nen({ daMua: true });
    const kho = khoGia({
      ...goc,
      galleries: [...goc.galleries!, { id: G2, branch_id: "b1", title: "Đã giao", status: "delivered" }],
      selections: [...goc.selections!, { id: S2, gallery_id: G2, is_primary: true, submitted_at: "2026-10-01T03:00:00.000Z" }],
      selection_addons: [
        ...goc.selection_addons!,
        { id: "c2", selection_id: S2, product_id: SP_NHANH.id, photo_id: null, created_at: "2026-10-01T03:00:00.000Z" },
      ],
    });
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const json = await (await docCongTac()).json();
    expect(json.data.bat).toBe(true);
    expect(json.data.coTheDoi).toBe(true);
    expect(json.data.dsCho.map((b: { galleryId: string }) => b.galleryId)).toEqual([GALLERY]);
  });
});

describe("BB-399 vòng 3 · thứ tự: bộ ưu tiên lên đầu", () => {
  it("chỉ ưu tiên khi còn chờ trả ảnh chỉnh", () => {
    expect(laUuTienLamNhanh(true, "submitted")).toBe(true);
    expect(laUuTienLamNhanh(true, "in_retouch")).toBe(true);
    expect(laUuTienLamNhanh(true, "delivered")).toBe(false);
    expect(laUuTienLamNhanh(false, "submitted")).toBe(false);
  });
  it("phân trang máy chủ: trang đầu ghép bộ ưu tiên lên đầu, không lặp; trang sau bỏ bộ ưu tiên", () => {
    const uu = new Set(["u1", "u2"]);
    const trang0 = [{ id: "a" }, { id: "u2" }, { id: "b" }];
    const hangUu = [{ id: "u1" }, { id: "u2" }, { id: "x-khong-uu-tien" }];
    expect(ghepTrangUuTien(trang0, hangUu, uu, 0).map((r) => r.id)).toEqual(["u1", "u2", "a", "b"]);
    expect(ghepTrangUuTien([{ id: "c" }, { id: "u1" }], hangUu, uu, 20).map((r) => r.id)).toEqual(["c"]);
  });
});
