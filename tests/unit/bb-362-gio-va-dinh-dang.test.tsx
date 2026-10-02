/**
 * BB-362 — người chấm vòng 10 (khách 8,0 sát nút; quản trị 7,5).
 *
 * 1. Giỏ máy tính: tiêu đề "Giỏ · 6 món · 120.000 ₫" nhưng chỉ hiện 2 dòng
 *    (80.000 ₫); phần còn lại nấp sau "Xem cả giỏ ›" không có số nào. Nay có
 *    dòng "+N món khác · X ₫" để các dòng đang hiện CỘNG RA ĐÚNG tiêu đề.
 * 2. Tên món trong gói cùng định dạng với giỏ: "Ảnh in UV 10×15".
 * 3. Quản trị: "tờ Album (Ultra HD) 20x20" → "Tờ Album (Ultra HD) 20×20".
 * 4. "chậm / hơn": hai chữ cuối dính nhau. 5. "Bé Mít" như bìa.
 *
 * Dựng bằng `renderToStaticMarkup`, không giả lập hook (AGENTS.md §5a); dữ liệu giả.
 *
 * Kiểm ngược: hoàn nguyên `cua-hang.tsx` về `daMua.slice(0, 2)` + nút "Xem cả giỏ ›"
 * trơn → ca giỏ đỏ (không có "+2 món khác", tổng đang hiện ≠ tiêu đề).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CuaHang } from "@/components/features/gallery/cua-hang";
import { chiaDongGio, demMon } from "@/lib/gallery/dem-mon";
import { tenDongTrongGoiChoKhach, tenHienThiSanPham, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { giuCuoi, KHOANG_KHONG_NGAT } from "@/lib/utils/giu-a";
import { cumTenBe } from "@/components/features/gallery/dot-chon-khach";

vi.mock("@/lib/utils/khoa-cuon-trang", () => ({ khoaCuonTrang: () => () => {} }));

const chuan = (s: string) => s.replace(/\s/g, " ");
const so = (s: string) => Number(s.replace(/\D/g, ""));

const gio = [
  { id: "d1", productId: "p-uv", name: "UV 10x15", quantity: 3, totalPrice: 60000, photoId: null },
  { id: "d2", productId: "p-uv", name: "UV 10x15", quantity: 1, totalPrice: 20000, photoId: null },
  { id: "d3", productId: "p-uv", name: "UV 10x15", quantity: 2, totalPrice: 40000, photoId: null },
];

describe("BB-362 mục 5 — giỏ: tổng tiêu đề = các dòng đang hiện + phần ẩn", () => {
  it("chiaDongGio: hiện 2 dòng, phần ẩn mang đúng số món và tiền còn lại", () => {
    const { hien, an } = chiaDongGio(gio, false);
    expect(hien.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(an).toEqual({ soDong: 1, soMon: 2, tien: 40000 });
    expect(hien.reduce((t, d) => t + d.totalPrice, 0) + an.tien).toBe(120000);
    expect(demMon(hien) + an.soMon).toBe(demMon(gio));
    expect(chiaDongGio(gio, true).an).toEqual({ soDong: 0, soMon: 0, tien: 0 });
  });

  it("cửa hàng: viên giỏ máy tính có '+2 món khác · 40.000 ₫', cộng với 2 dòng hiện ra đúng 120.000 ₫", () => {
    const html = chuan(
      renderToStaticMarkup(
        <CuaHang
          mo
          onDong={() => {}}
          danhMuc={[
            { productId: "p-uv", name: "UV 10x15", material: "UV", size: "10x15", unitPrice: 20000, nhom: "anh_in", canGanAnh: true },
          ]}
          daMua={gio}
          tongTien={120000}
          anhDaChon={[]}
          khoa={false}
          dangLuu={false}
          onMua={() => {}}
        />,
      ),
    );
    expect(html).toContain("Giỏ · 6 món · 120.000 ₫");
    const phanAn = /data-testid="gio-phan-an"[^>]*>.*?\+(\d+) món khác · <span[^>]*>([\d.]+ ₫)<\/span>/.exec(html);
    expect(phanAn, "thiếu dòng '+N món khác'").not.toBeNull();
    expect(phanAn![1]).toBe("2");
    // Hai dòng đang hiện: 60.000 + 20.000; phần ẩn 40.000 → đúng 120.000 ở tiêu đề.
    const dongHien = [...html.matchAll(/<li[^>]*>.*?<span class="shrink-0 text-\[14px\] font-medium">([\d.]+ ₫)<\/span>/g)].map((m) => so(m[1]!));
    expect(dongHien).toEqual([60000, 20000]);
    expect(dongHien.reduce((a, b) => a + b, 0) + so(phanAn![2]!)).toBe(120000);
  });
});

describe("BB-362 mục 7 — một tên sản phẩm, một kiểu đếm", () => {
  it("món trong gói 'UV 10x15' đọc như giỏ: 'Ảnh in UV 10×15'", () => {
    expect(tenDongTrongGoiChoKhach("UV 10x15", "anh_in")).toBe("Ảnh in UV 10×15");
    expect(tenDongTrongGoiChoKhach("UV 10x15", "anh_in")).toBe(
      tenSanPhamChoKhach({ name: "UV 10x15", nhom: "anh_in", material: "UV", size: "10x15" }),
    );
    expect(tenDongTrongGoiChoKhach("tờ Album (Ultra HD) 20x20", "album")).toBe("Tờ Album (Ultra HD) 20×20");
    expect(tenDongTrongGoiChoKhach("Ảnh phóng 30x45", "anh_in")).toBe("Ảnh phóng 30×45");
  });
});

describe("BB-362 mục 2 — quản trị: tên dòng hợp đồng viết hoa chữ đầu", () => {
  it("'tờ Album (Ultra HD) 20x20' → 'Tờ Album (Ultra HD) 20×20'; 'Edit file' giữ nguyên", () => {
    expect(tenHienThiSanPham("tờ Album (Ultra HD) 20x20")).toBe("Tờ Album (Ultra HD) 20×20");
    expect(tenHienThiSanPham("Edit file")).toBe("Edit file");
  });
});

describe("BB-362 mục 8 — chữ cuối không rơi một mình, 'Bé' viết hoa như bìa", () => {
  it("giuCuoi gắn hai chữ cuối bằng khoảng không ngắt", () => {
    expect(giuCuoi("Tôi biết chưa chọn ảnh in thì nhận ảnh chậm hơn")).toBe(
      `Tôi biết chưa chọn ảnh in thì nhận ảnh chậm${KHOANG_KHONG_NGAT}hơn`,
    );
    expect(giuCuoi("Một")).toBe("Một");
  });

  it("cumTenBe: 'Bé Mít', không 'bé Mít' và không 'Bé Bé'", () => {
    expect(cumTenBe("Mít")).toBe("Bé Mít");
    expect(cumTenBe("Bé Mít")).toBe("Bé Mít");
  });
});
