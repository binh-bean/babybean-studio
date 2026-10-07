/**
 * BB-380 — bộ báo cáo điều hành: công thức với số liệu biết trước, cách ly chi
 * nhánh, loại Fixture, ẩn tiền khi thiếu quyền, và ghi lượt tải ảnh không phình.
 *
 * Dữ liệu chạy trong bộ nhớ (tests/unit/bao-cao/fake-supabase.ts) — không ghi bb-dev.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  tachTien,
  tongPhatSinh,
  tinhTiLeMoLink,
  tinhTrungViNgayGuiDenChot,
  tinhTiLeChotTrong7Ngay,
  tinhAnhChonThemMoiBo,
  tinhDoanhThuMuaThemMoiBo,
  tinhTiLeTaiTruocChot,
  demPheu,
  buocCua,
  tinhBoKet,
  tongHopChinhSua,
  gopSanPhamBanChay,
  tongHopMuaThem,
  type BoAnhDieuHanh,
} from "@/lib/bao-cao/dieu-hanh/cong-thuc";
import { sauConSo } from "@/lib/bao-cao/cac-bao-cao/sau-con-so";
import { pheuKhach } from "@/lib/bao-cao/cac-bao-cao/pheu-khach";
import { salesMuaThem } from "@/lib/bao-cao/cac-bao-cao/sales-mua-them";
import { ghiLuotTaiAnh } from "@/lib/bao-cao/dieu-hanh/ghi-luot-tai";
import type { NguCanhBaoCao } from "@/lib/bao-cao/loai";
import { taoFakeSupabase } from "./fake-supabase";
import * as staffAuth from "@/lib/auth/staff";
import { GET as GET_BAO_CAO } from "@/app/api/admin/bao-cao/[ma]/route";
import { phienGiaLap } from "../../fixtures/phien-nhan-su";

function bo(p: Partial<BoAnhDieuHanh> = {}): BoAnhDieuHanh {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    branchId: "cn-a",
    status: "in_review",
    sentAt: null,
    submittedAt: null,
    larkTrangThai: null,
    larkTrangThaiTu: null,
    moLanDauLuc: null,
    linkCoLuotXem: false,
    coAnhChon: false,
    anhChonThem: 0,
    tien: null,
    taiAnhLanDauLuc: null,
    guiDuyetLuc: null,
    nguoiChinhSua: null,
    ...p,
  };
}

const NOW = new Date("2026-10-06T05:00:00Z");

describe("BB-380 công thức — số liệu biết trước", () => {
  it("1. tỉ lệ mở link: mở = có lượt chọn / link có lượt xem / đã chốt → 3 trên 4 = 75%", () => {
    const kq = tinhTiLeMoLink([
      bo({ moLanDauLuc: "2026-10-01T00:00:00Z" }),
      bo({ linkCoLuotXem: true }),
      bo({ submittedAt: "2026-10-02T00:00:00Z" }),
      bo(),
    ]);
    expect(kq).toEqual({ tu: 3, mau: 4, phanTram: 75 });
    expect(tinhTiLeMoLink([]).phanTram).toBeNull();
  });

  it("2. gửi → chốt: trung vị 1, 2, 10 ngày = 2; bộ thiếu mốc gửi không vào mẫu", () => {
    const g = "2026-09-01T00:00:00Z";
    expect(
      tinhTrungViNgayGuiDenChot([
        bo({ sentAt: g, submittedAt: "2026-09-02T00:00:00Z" }),
        bo({ sentAt: g, submittedAt: "2026-09-03T00:00:00Z" }),
        bo({ sentAt: g, submittedAt: "2026-09-11T00:00:00Z" }),
        bo({ sentAt: null, submittedAt: "2026-09-30T00:00:00Z" }),
      ]),
    ).toBe(2);
    expect(tinhTrungViNgayGuiDenChot([])).toBeNull();
  });

  it("3. chốt trong 7 ngày: bộ gửi chưa đủ 7 ngày mà chưa chốt KHÔNG vào mẫu → 1/3", () => {
    const kq = tinhTiLeChotTrong7Ngay(
      [
        bo({ sentAt: "2026-09-20T00:00:00Z", submittedAt: "2026-09-22T00:00:00Z" }), // chốt trong 7
        bo({ sentAt: "2026-09-20T00:00:00Z", submittedAt: "2026-10-01T00:00:00Z" }), // chốt ngày 11
        bo({ sentAt: "2026-10-04T00:00:00Z" }), // mới gửi 2 ngày → chưa biết
        bo({ sentAt: "2026-09-25T00:00:00Z" }), // 11 ngày chưa chốt
      ],
      NOW,
    );
    expect(kq).toEqual({ tu: 1, mau: 3, phanTram: 33.3 });
  });

  it("4. ảnh chọn thêm mỗi bộ: (3 + 0 + 5) / 3 = 2,7", () => {
    expect(tinhAnhChonThemMoiBo([bo({ anhChonThem: 3 }), bo(), bo({ anhChonThem: 5 })])).toBe(2.7);
    expect(tinhAnhChonThemMoiBo([])).toBeNull();
  });

  it("5. tiền: tách đúng từ kết quả công thức Phải thu, gồm phần sản phẩm qua Lark", () => {
    // Cờ thu sản phẩm qua app TẮT: tongPhaiThu = vượt 250k + ảnh mua thêm 50k; sản phẩm 200k qua Lark.
    const tat = tachTien({ tongPhaiThu: 300_000, tienDotMuaThem: 50_000, tienSanPham: 200_000, tienSanPhamQuaLark: 200_000 });
    expect(tat).toEqual({ anhVuot: 250_000, anhMuaThem: 50_000, sanPhamTrongApp: 0, sanPhamQuaLark: 200_000 });
    // Cờ BẬT: sản phẩm đã nằm trong tongPhaiThu → không đếm hai lần.
    const bat = tachTien({ tongPhaiThu: 500_000, tienDotMuaThem: 50_000, tienSanPham: 200_000, tienSanPhamQuaLark: 0 });
    expect(bat).toEqual({ anhVuot: 250_000, anhMuaThem: 50_000, sanPhamTrongApp: 200_000, sanPhamQuaLark: 0 });
    expect(tongPhatSinh(tat)).toBe(500_000);
    expect(tongPhatSinh(bat)).toBe(500_000);
    // Doanh thu mỗi bộ: (500k + 0) / 2 bộ chốt.
    expect(tinhDoanhThuMuaThemMoiBo([bo({ tien: tat }), bo()])).toBe(250_000);
  });

  it("6. tải ảnh trước khi chốt: chỉ bộ chốt TỪ mốc bắt đầu đo; tải sau lúc chốt không tính → 1/2", () => {
    const moc = "2026-10-01T00:00:00Z";
    const kq = tinhTiLeTaiTruocChot(
      [
        bo({ submittedAt: "2026-10-03T00:00:00Z", taiAnhLanDauLuc: "2026-10-02T00:00:00Z" }),
        bo({ submittedAt: "2026-10-04T00:00:00Z", taiAnhLanDauLuc: "2026-10-05T00:00:00Z" }),
        bo({ submittedAt: "2026-09-28T00:00:00Z", taiAnhLanDauLuc: "2026-09-27T00:00:00Z" }),
      ],
      moc,
    );
    expect(kq).toEqual({ tu: 1, mau: 2, phanTram: 50 });
    expect(tinhTiLeTaiTruocChot([bo()], null)).toBeNull();
  });

  it("7. phễu: bước theo app tới lúc chốt, sau đó theo Lark; phễu đơn điệu", () => {
    const ds = [
      bo({ sentAt: "x" }), // gửi
      bo({ moLanDauLuc: "2026-10-01T00:00:00Z" }), // mở
      bo({ moLanDauLuc: "2026-10-01T00:00:00Z", coAnhChon: true }), // chọn
      bo({ submittedAt: "2026-10-02T00:00:00Z", status: "submitted" }), // chốt
      bo({ submittedAt: "2026-10-02T00:00:00Z", larkTrangThai: "optmhzW4sL" }), // Lark "Đang làm" → chỉnh
      bo({ submittedAt: "2026-10-02T00:00:00Z", larkTrangThai: "optjJ9MNLL" }), // "Đã gửi duyệt"
      bo({ submittedAt: "2026-10-02T00:00:00Z", larkTrangThai: "opttHXFpgy" }), // "Đã giao"
    ];
    expect(ds.map(buocCua)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(demPheu(ds)).toEqual([7, 6, 5, 4, 3, 2, 1]);
  });

  it("8. bộ kẹt: đếm theo bước hiện tại, quá ngưỡng ngày; bộ đã giao không tính", () => {
    const ket = tinhBoKet(
      [
        bo({ sentAt: "2026-09-30T00:00:00Z" }), // gửi chưa mở 6,2 ngày > 3 → kẹt
        bo({ sentAt: "2026-10-05T00:00:00Z" }), // gửi 1,2 ngày → chưa
        bo({ submittedAt: "2026-10-05T00:00:00Z", larkTrangThai: "optjJ9MNLL", larkTrangThaiTu: "2026-09-20T00:00:00Z" }), // gửi duyệt 16 ngày > 7
        bo({ submittedAt: "2026-09-01T00:00:00Z", larkTrangThai: "opttHXFpgy" }), // đã giao
      ],
      NOW,
    );
    expect(ket[0]).toMatchObject({ dangO: 2, quaNguong: 1 });
    expect(ket[5]).toMatchObject({ dangO: 1, quaNguong: 1 });
    expect(ket.reduce((t, d) => t + d.dangO, 0)).toBe(3);
  });

  it("9. chỉnh sửa: số lần sửa TB = trung bình vòng cao nhất trên bộ có sửa", () => {
    expect(
      tongHopChinhSua([
        { galleryId: "a", vong: 1 },
        { galleryId: "a", vong: 2 },
        { galleryId: "a", vong: 3 },
        { galleryId: "b", vong: 1 },
      ]),
    ).toEqual({ soYeuCau: 4, soBoCoSua: 2, tbLanSua: 2 });
  });

  it("10. sales: tỉ lệ bộ có mua, TB trên bộ có mua; sản phẩm bán chạy xếp theo tiền", () => {
    const t = tachTien({ tongPhaiThu: 100_000, tienDotMuaThem: 0, tienSanPham: 0, tienSanPhamQuaLark: 0 });
    const m = tongHopMuaThem([bo({ tien: t }), bo({ tien: tachTien({ tongPhaiThu: 0, tienDotMuaThem: 0, tienSanPham: 300_000, tienSanPhamQuaLark: 300_000 }) }), bo()]);
    expect(m.soBoCoMua).toBe(2);
    expect(m.tiLeCoMua.phanTram).toBe(66.7);
    expect(m.tbTrenBoCoMua).toBe(200_000);
    const ban = gopSanPhamBanChay([
      { galleryId: "a", dot: 1, productId: "uv", ten: "UV 20x30", nhom: "Ảnh in", soLuong: 2, tien: 200_000 },
      { galleryId: "b", dot: 2, productId: "uv", ten: "UV 20x30", nhom: "Ảnh in", soLuong: 1, tien: 100_000 },
      { galleryId: "a", dot: 1, productId: "khung", ten: "Khung HQ", nhom: "Khung", soLuong: 1, tien: 250_000 },
    ]);
    expect(ban[0]).toEqual({ ten: "UV 20x30", nhom: "Ảnh in", soLuong: 3, tien: 300_000, soBo: 2 });
    expect(ban[1]?.ten).toBe("Khung HQ");
  });
});

// ---------------------------------------------------------------------------
// Chạy báo cáo thật trên dữ liệu trong bộ nhớ: chi nhánh + Fixture + quyền tiền
// ---------------------------------------------------------------------------

function duLieu() {
  const g = (id: string, branch: string, p: Record<string, unknown> = {}) => ({
    id,
    branch_id: branch,
    title: `Bộ ${id}`,
    status: "in_review",
    sent_at: "2026-10-02T03:00:00Z",
    submitted_at: null,
    lark_trang_thai: null,
    lark_trang_thai_tu: null,
    lark_nguoi_photoshop: null,
    extra_photo_price: 50_000,
    ...p,
  });
  return {
    branches: [
      { id: "cn-a", name: "Chi nhánh A" },
      { id: "cn-b", name: "Chi nhánh B" },
    ],
    galleries: [
      g("a1", "cn-a", { status: "submitted", submitted_at: "2026-10-03T03:00:00Z" }),
      g("a2", "cn-a"), // chưa mở
      g("b1", "cn-b"),
      g("b2", "cn-b"),
      g("b3", "cn-b"),
      g("fx", "cn-a", { title: "Fixture BB-380" }),
    ],
    selections: [
      { id: "s-a1", gallery_id: "a1", created_at: "2026-10-02T05:00:00Z", is_primary: true, submitted_at: "2026-10-03T03:00:00Z", snapshot_extra_count: 4, snapshot_extra_amount: 200_000 },
      { id: "s-b1", gallery_id: "b1", created_at: "2026-10-02T05:00:00Z", is_primary: true, submitted_at: null, snapshot_extra_count: null },
      { id: "s-b2", gallery_id: "b2", created_at: "2026-10-02T05:00:00Z", is_primary: true, submitted_at: null, snapshot_extra_count: null },
      { id: "s-b3", gallery_id: "b3", created_at: "2026-10-02T05:00:00Z", is_primary: true, submitted_at: null, snapshot_extra_count: null },
      { id: "s-fx", gallery_id: "fx", created_at: "2026-10-02T05:00:00Z", is_primary: true, submitted_at: null, snapshot_extra_count: null },
    ],
  };
}

function ctx(client: unknown, chiNhanhIds: string[] | null, quyen?: string[]): NguCanhBaoCao {
  return {
    client: client as NguCanhBaoCao["client"],
    chiNhanhIds,
    tu: new Date("2026-10-01T00:00:00+07:00"),
    den: new Date("2026-10-07T00:00:00+07:00"),
    nhom: "ngay",
    quyen,
  };
}

const giaTri = (theSo: { nhan: string; giaTri: unknown }[], nhan: string) => theSo.find((t) => t.nhan === nhan)?.giaTri;

describe("BB-380 an ninh — vai chi nhánh không thấy số chi nhánh khác", () => {
  it("11. Sáu con số của chi nhánh A chỉ tính bộ A (B mở 3/3, Fixture loại) → 50%", async () => {
    const chiA = await sauConSo.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"]));
    expect(giaTri(chiA.theSo, "Tỉ lệ mở link")).toBe(50);
    const tatCa = await sauConSo.chay(ctx(taoFakeSupabase(duLieu()), null));
    // Admin (không lọc): a1 + 3 bộ B đã mở / 5 bộ thật (Fixture loại) = 80%.
    expect(giaTri(tatCa.theSo, "Tỉ lệ mở link")).toBe(80);
  });

  it("12. Phễu chi nhánh A: bảng 'Gửi link' = 2 bộ, không lẫn bộ B", async () => {
    const kq = await pheuKhach.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"]));
    expect(kq.bang?.dong[0]?.slice(0, 2)).toEqual(["Gửi link", 2]);
    expect(kq.bang?.dong[3]?.slice(0, 2)).toEqual(["Chốt", 1]);
  });

  it("13. Sales: bảng theo chi nhánh chỉ có chi nhánh được xem", async () => {
    const kq = await salesMuaThem.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"], ["reports:operations", "reports:financial"]));
    expect(kq.bang?.dong.map((d) => d[0])).toEqual(["Chi nhánh A"]);
  });

  it("14. Thiếu reports:financial: số tiền hiện '—', không lộ", async () => {
    const kq = await sauConSo.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"], ["reports:operations"]));
    expect(giaTri(kq.theSo, "Mua thêm mỗi bộ")).toBe("—");
    const coQuyen = await sauConSo.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"], ["reports:operations", "reports:financial"]));
    // a1 chốt: snapshot 200k (công thức Phải thu: số lúc chốt) / 1 bộ chốt.
    expect(giaTri(coQuyen.theSo, "Mua thêm mỗi bộ")).toBe(200_000);
  });

  it("15. Ảnh chọn thêm lấy snapshot lúc chốt: a1 vượt 4 ảnh", async () => {
    const kq = await sauConSo.chay(ctx(taoFakeSupabase(duLieu()), ["cn-a"]));
    expect(giaTri(kq.theSo, "Ảnh chọn thêm mỗi bộ")).toBe(4);
  });
});

describe("BB-380 ghi lượt tải ảnh — một dòng / bộ / link / 30 phút", () => {
  it("16. tải liên tiếp trong 30 phút chỉ ghi một dòng; quá 30 phút ghi dòng mới", async () => {
    const db = taoFakeSupabase({ activity_logs: [] });
    const p = { galleryId: "g1", branchId: "cn-a", shareLinkId: "l1" };
    // Dòng đã chèn mang `created_at` = giờ thật, nên đặt `now` theo giờ thật.
    expect(await ghiLuotTaiAnh(db as never, { ...p, now: new Date() })).toBe("da-ghi");
    expect(await ghiLuotTaiAnh(db as never, { ...p, now: new Date() })).toBe("da-co");
    expect(db.daChen.activity_logs).toHaveLength(1);
    expect(db.daChen.activity_logs?.[0]).toMatchObject({ action: "gallery.tai_anh", entity_type: "gallery", entity_id: "g1", actor_type: "customer" });
    expect(await ghiLuotTaiAnh(db as never, { ...p, now: new Date(Date.now() + 31 * 60_000) })).toBe("da-ghi");
  });
});

// ---------------------------------------------------------------------------
// Route: vai chi nhánh xin số của chi nhánh khác → 403 (trước khi chạm cơ sở dữ liệu)
// ---------------------------------------------------------------------------

describe("BB-380 route — cách ly chi nhánh", () => {
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  for (const ma of ["sau-con-so", "pheu-khach", "sales-mua-them", "van-hanh-chinh-sua", "doanh-thu-mua-them"]) {
    it(`17. ${ma}: quản lý chi nhánh A xin chiNhanh=B → 403`, async () => {
      vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("branch_manager", [A]));
      const res = await GET_BAO_CAO(new Request(`http://localhost/api/admin/bao-cao/${ma}?chiNhanh=${B}`), {
        params: Promise.resolve({ ma }),
      });
      expect(res.status).toBe(403);
    });
  }

  it("18. CSKH (không có reports:financial) không mở được Doanh thu mua thêm", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("cs", [A]));
    const res = await GET_BAO_CAO(new Request(`http://localhost/api/admin/bao-cao/doanh-thu-mua-them`), {
      params: Promise.resolve({ ma: "doanh-thu-mua-them" }),
    });
    expect(res.status).toBe(403);
  });
});
