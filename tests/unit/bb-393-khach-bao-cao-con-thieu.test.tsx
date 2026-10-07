/**
 * BB-393 — ba việc còn thiếu từ yêu cầu anh 01/10 + 06/10 (thuần, không cơ sở dữ liệu,
 * không đọc mã nguồn, không giả lập hook — AGENTS §5a).
 *
 *  1. Xem lớn CẢNH treo tường: máy tính NHẤP MỘT LẦN là phóng (trước phải nhấp đúp);
 *     cùng luật `laNhapChuot` với màn xem lớn ảnh chính (BB-370). Chạm hai lần trên
 *     điện thoại giữ nguyên.
 *  2. Báo cáo "Mời người thân": thêm DOANH THU (đ) từ người được mời, tách đã thanh
 *     toán / chưa, có cột đ theo chi nhánh; ẩn tiền với người không có quyền doanh thu.
 *  3. Nút "Tên file" ở danh sách ảnh chọn đổi thành "Danh sách".
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { hanhDongKhiTha } from "@/components/features/gallery/xem-lon-canh";
import { laNhapChuot, NGUONG_KEO_PX } from "@/lib/gallery/phong-anh";
import {
  tinhMoiNguoiThan,
  tienCuaYeuCau,
  dungKetQua,
  moiNguoiThan,
} from "@/lib/bao-cao/cac-bao-cao/moi-nguoi-than";
import type { NguCanhBaoCao } from "@/lib/bao-cao/loai";
import { DanhSachAnhChon } from "@/components/features/admin/danh-sach-anh-chon";
import { taoFakeSupabase } from "./bao-cao/fake-supabase";

// ---------------------------------------------------------------------------
// 1. Nhấp một lần để phóng (cảnh treo tường)
// ---------------------------------------------------------------------------
describe("BB-393 #1: xem lớn cảnh — nhấc chuột/ngón tay thì làm gì", () => {
  const goc = { quangDuong: 0, thoiGianNhan: 120, chamTruoc: null, bayGio: 10_000, x: 200, y: 150 };

  it("chuột: NHẤP MỘT LẦN (không đi) là đổi phóng ngay — không cần nhấp đúp", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse" })).toBe("doi-phong");
  });

  it("chuột: rung tay trong ngưỡng vẫn là nhấp; giữ lâu rồi thả cũng là nhấp", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse", quangDuong: NGUONG_KEO_PX })).toBe("doi-phong");
    expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse", thoiGianNhan: 900 })).toBe("doi-phong");
  });

  it("chuột: kéo quá ngưỡng là KÉO (di ảnh), thả ra không đổi phóng", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse", quangDuong: NGUONG_KEO_PX + 1 })).toBe("khong");
    expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse", quangDuong: 40 })).toBe("khong");
  });

  it("cùng một luật với màn xem lớn ảnh chính (laNhapChuot, BB-370)", () => {
    for (const d of [0, 2, NGUONG_KEO_PX, NGUONG_KEO_PX + 0.5, 12]) {
      expect(hanhDongKhiTha({ ...goc, loaiTro: "mouse", quangDuong: d }) === "doi-phong").toBe(laNhapChuot(d));
    }
  });

  it("ngón tay: chạm MỘT lần chỉ ghi nhớ, không phóng (giữ chạm hai lần)", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch" })).toBe("nho-cham");
  });

  it("ngón tay: chạm lần hai gần chỗ cũ, trong 320ms → đổi phóng", () => {
    const truoc = { luc: goc.bayGio - 200, x: 205, y: 148 };
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", chamTruoc: truoc })).toBe("doi-phong");
  });

  it("ngón tay: lần hai quá muộn hoặc quá xa → chỉ là một chạm mới", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", chamTruoc: { luc: goc.bayGio - 500, x: 200, y: 150 } })).toBe("nho-cham");
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", chamTruoc: { luc: goc.bayGio - 100, x: 290, y: 150 } })).toBe("nho-cham");
  });

  it("ngón tay: vuốt / chụm / giữ lâu không phải chạm", () => {
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", quangDuong: 20 })).toBe("khong");
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", quangDuong: 99 })).toBe("khong");
    expect(hanhDongKhiTha({ ...goc, loaiTro: "touch", thoiGianNhan: 600 })).toBe("khong");
  });
});

// ---------------------------------------------------------------------------
// 2. Doanh thu từ người được mời
// ---------------------------------------------------------------------------
describe("BB-393 #2: tiền một yêu cầu mua thêm — dùng đúng cách app đang tính", () => {
  it("sản phẩm: số lượng × giá niêm yết; chưa có giá thì 0 (không bịa giá)", () => {
    expect(tienCuaYeuCau({ loai: "san_pham", soLuong: 2, listPrice: 150_000 })).toBe(300_000);
    expect(tienCuaYeuCau({ loai: null, soLuong: 3, listPrice: 90_000 })).toBe(270_000);
    expect(tienCuaYeuCau({ loai: "san_pham", soLuong: 2, listPrice: null })).toBe(0);
  });
  it("đặt chỉnh sửa: lấy tạm tính đã lưu lúc gửi, không nhân lại", () => {
    expect(tienCuaYeuCau({ loai: "chinh_sua", soLuong: 4, listPrice: null, tamTinh: 200_000 })).toBe(200_000);
  });
});

describe("BB-393 #2: tinhMoiNguoiThan — doanh thu tách đã thanh toán / chưa", () => {
  const moi = new Set(["l1", "l2"]);
  const yc = [
    { linkId: "l1", branchId: "b1", tien: 300_000, trangThai: "da_thanh_toan" },
    { linkId: "l1", branchId: "b1", tien: 120_000, trangThai: "moi" },
    { linkId: "l2", branchId: "b2", tien: 500_000, trangThai: "da_chot" },
    { linkId: "l2", branchId: "b2", tien: 999_000, trangThai: "huy" }, // huỷ: đếm yêu cầu, không tính tiền
    { linkId: null, branchId: "b1", tien: 777_000, trangThai: "da_thanh_toan" }, // ba mẹ
    { linkId: "owner-link", branchId: "b1", tien: 888_000, trangThai: "da_thanh_toan" }, // không phải link mời
  ];

  it("tổng, đã thanh toán, chưa thanh toán — chỉ tiền của người được mời", () => {
    const tk = tinhMoiNguoiThan([], yc, moi);
    expect(tk.soYeuCau).toBe(4);
    expect(tk.doanhThu).toEqual({ daThanhToan: 300_000, chuaThanhToan: 620_000, tong: 920_000 });
  });

  it("theo chi nhánh", () => {
    const tk = tinhMoiNguoiThan([], yc, moi);
    expect(tk.theoChiNhanh.get("b1")!.doanhThu).toEqual({ daThanhToan: 300_000, chuaThanhToan: 120_000, tong: 420_000 });
    expect(tk.theoChiNhanh.get("b2")!.doanhThu).toEqual({ daThanhToan: 0, chuaThanhToan: 500_000, tong: 500_000 });
  });

  it("rỗng ra 0", () => {
    expect(tinhMoiNguoiThan([], [], new Set()).doanhThu).toEqual({ daThanhToan: 0, chuaThanhToan: 0, tong: 0 });
  });
});

describe("BB-393 #2: bảng theo chi nhánh có cột đ; ẩn tiền khi không có quyền", () => {
  const tk = tinhMoiNguoiThan(
    [
      { linkId: "l1", customerId: "k1", branchId: "b1", soLanMo: 2 },
      { linkId: "l2", customerId: "k2", branchId: "b2", soLanMo: 0 },
    ],
    [
      { linkId: "l1", branchId: "b1", tien: 300_000, trangThai: "da_thanh_toan" },
      { linkId: "l2", branchId: "b2", tien: 500_000, trangThai: "moi" },
    ],
    new Set(["l1", "l2"]),
  );
  const ten = new Map([["b1", "Chi nhánh A"], ["b2", "Chi nhánh B"]]);

  it("có quyền: thẻ số + cột tiền đúng, có dòng TỔNG", () => {
    const kq = dungKetQua(tk, ten, { tien: true });
    const so = (nhan: string) => kq.theSo.find((t) => t.nhan === nhan);
    expect(so("Doanh thu từ người được mời")).toMatchObject({ giaTri: 800_000, donVi: "đ" });
    expect(so("Đã thanh toán")).toMatchObject({ giaTri: 300_000, donVi: "đ" });
    expect(so("Chưa thanh toán")).toMatchObject({ giaTri: 500_000, donVi: "đ" });
    expect(kq.bang!.cot.slice(-3)).toEqual(["Đã thanh toán (đ)", "Chưa thanh toán (đ)", "Doanh thu (đ)"]);
    expect(kq.bang!.dong).toEqual([
      ["Chi nhánh A", 1, 1, 1, 1, 300_000, 0, 300_000],
      ["Chi nhánh B", 1, 1, 0, 1, 0, 500_000, 500_000],
      ["TỔNG", 2, 2, 1, 2, 300_000, 500_000, 800_000],
    ]);
  });

  it("không có quyền doanh thu: số đếm vẫn hiện, tiền thành —", () => {
    const kq = dungKetQua(tk, ten, { tien: false });
    expect(kq.theSo.find((t) => t.nhan === "Doanh thu từ người được mời")!.giaTri).toBe("—");
    expect(kq.theSo.find((t) => t.nhan === "Yêu cầu mua thêm từ người được mời")!.giaTri).toBe(2);
    expect(kq.bang!.dong[0]).toEqual(["Chi nhánh A", 1, 1, 1, 1, "—", "—", "—"]);
    expect(JSON.stringify(kq)).not.toContain("300000");
  });
});

describe("BB-393 #2: chạy cả báo cáo trên máy khách Supabase GIẢ (đọc đúng cột tiền)", () => {
  const TRONG_KY = "2026-10-03T10:00:00+07:00";
  const bo = (branch_id: string) => ({ branch_id, title: "Bé Mai", status: "published", customer_id: "k1" });
  const duLieu = () => ({
    branches: [{ id: "b1", name: "Chi nhánh A" }],
    share_links: [
      { id: "l1", role: "viewer", created_at: TRONG_KY, view_count: 3, customer: { id: "k1", branch_id: "b1", full_name: "Nguyễn Thị Mai" }, gallery: bo("b1") },
      { id: "lo", role: "owner", created_at: TRONG_KY, view_count: 9, customer: { id: "k1", branch_id: "b1", full_name: "Nguyễn Thị Mai" }, gallery: bo("b1") },
    ],
    yeu_cau_mua_them: [
      // Ông bà mua 2 khung 150.000đ — đã thanh toán.
      { share_link_id: "l1", created_at: TRONG_KY, so_luong: 2, trang_thai: "da_thanh_toan", loai: "san_pham", tam_tinh: null, products: { list_price: 150_000 }, gallery: bo("b1") },
      // Ông bà đặt chỉnh sửa 4 tấm, tạm tính (numeric về dạng chuỗi) — chưa thanh toán.
      { share_link_id: "l1", created_at: TRONG_KY, so_luong: 4, trang_thai: "moi", loai: "chinh_sua", tam_tinh: "200000", products: null, gallery: bo("b1") },
      // Ba mẹ (link owner) — không tính.
      { share_link_id: "lo", created_at: TRONG_KY, so_luong: 1, trang_thai: "da_thanh_toan", loai: "san_pham", tam_tinh: null, products: { list_price: 1_000_000 }, gallery: bo("b1") },
      // Ngoài kỳ — không tính.
      { share_link_id: "l1", created_at: "2026-09-20T10:00:00+07:00", so_luong: 1, trang_thai: "moi", loai: "san_pham", tam_tinh: null, products: { list_price: 50_000 }, gallery: bo("b1") },
    ],
  });
  const ctx = (quyen?: string[]): NguCanhBaoCao => ({
    client: taoFakeSupabase(duLieu()) as unknown as NguCanhBaoCao["client"],
    chiNhanhIds: null,
    tu: new Date("2026-10-01T00:00:00+07:00"),
    den: new Date("2026-10-07T00:00:00+07:00"),
    nhom: "ngay",
    quyen,
  });

  it("doanh thu = 300.000 đã thanh toán + 200.000 chưa", async () => {
    const kq = await moiNguoiThan.chay(ctx(["reports:operations", "reports:financial"]));
    const so = (nhan: string) => kq.theSo.find((t) => t.nhan === nhan)?.giaTri;
    expect(so("Yêu cầu mua thêm từ người được mời")).toBe(2);
    expect(so("Doanh thu từ người được mời")).toBe(500_000);
    expect(so("Đã thanh toán")).toBe(300_000);
    expect(so("Chưa thanh toán")).toBe(200_000);
    expect(kq.bang!.dong).toEqual([["Chi nhánh A", 1, 1, 1, 2, 300_000, 200_000, 500_000]]);
  });

  it("vai chỉ có reports:operations không thấy tiền", async () => {
    const kq = await moiNguoiThan.chay(ctx(["reports:operations"]));
    expect(kq.theSo.find((t) => t.nhan === "Doanh thu từ người được mời")!.giaTri).toBe("—");
    expect(kq.bang!.dong[0]!.slice(-3)).toEqual(["—", "—", "—"]);
  });
});

// ---------------------------------------------------------------------------
// 3. "Tên file" → "Danh sách"
// ---------------------------------------------------------------------------
describe("BB-393 #3: danh sách ảnh chọn — nút đổi tên", () => {
  const html = renderToStaticMarkup(<DanhSachAnhChon galleryId="g-1" soAnh={3} />);
  it("nút định dạng mặc định (đang bật) tên là \"Danh sách\", không còn \"Tên file\"", () => {
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Danh sách<\/button>/);
    expect(html).not.toContain("Tên file");
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Thông tin chi tiết<\/button>/);
  });
});
