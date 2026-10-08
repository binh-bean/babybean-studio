/**
 * BB-406 — khối "Đợt chọn" phía trên trang chi tiết bộ ảnh KHÔNG in tên tệp ảnh nữa
 * (anh 08/10/2026: "mã chọn ảnh theo lần chuyển xuống phía dưới bên phải, không để tràn lan phía trên").
 * Tên tệp xem/chép ở khối "Xuất danh sách" (`DanhSachAnhChon`).
 *
 * Thuần: `renderToStaticMarkup`, không cơ sở dữ liệu, không đọc mã nguồn, không giả lập hook (AGENTS §5a).
 *
 * Kiểm ngược: khôi phục `d.anh.map((a) => <li>{a.fileName}</li>)` trong `DotChonQuanTri` → ca đầu đỏ.
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));

import { DotChonQuanTri, type DotQuanTriView } from "@/components/features/admin/dot-chon-admin";

const GID = "11111111-1111-4111-8111-111111111111";

// Dữ liệu giả (AGENTS §6): tên tệp trung tính, đủ nhiều để nếu in ra thì lộ ngay.
const anh = (dot: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ photoId: `p-${dot}-${i}`, fileName: `IMG_${dot}${String(i).padStart(3, "0")}.jpg` }));

const dot = (soDot: number, soAnh: number, o: Partial<DotQuanTriView> = {}): DotQuanTriView => ({
  soDot,
  laDot1: soDot === 1,
  trangThai: soDot === 1 ? null : "cho_xac_nhan",
  soAnh,
  soAnhTinhTien: soAnh,
  giaMoiAnh: 30000,
  tienAnh: 30000 * soAnh,
  tienSanPham: 0,
  tong: 30000 * soAnh,
  lyDoTuChoi: null,
  lyDoMoLai: null,
  submittedAt: null,
  submittedByName: null,
  confirmedAt: null,
  xuLyAt: null,
  anh: anh(soDot, soAnh),
  sanPham: [],
  ...o,
});

describe("BB-406: khối 'Đợt chọn' không in tên tệp", () => {
  const render = (dotChon: DotQuanTriView[]) =>
    renderToStaticMarkup(<DotChonQuanTri galleryId={GID} dotChon={dotChon} canConfirm onDone={() => {}} />);

  it("bộ nhiều ảnh: không một tên tệp nào xuất hiện, vẫn có nút 'Xem danh sách đợt N' cho mỗi đợt", () => {
    const dotChon = [dot(1, 40), dot(2, 12), dot(3, 5, { trangThai: "da_xac_nhan" })];
    const html = render(dotChon);

    for (const d of dotChon) for (const a of d.anh) expect(html).not.toContain(a.fileName);
    expect(html).not.toMatch(/IMG_\d+\.jpg/);

    for (const n of [1, 2, 3]) {
      expect(html).toContain(`data-testid="xem-danh-sach-dot-${n}"`);
      expect(html).toContain(`Xem danh sách đợt ${n}`);
    }
  });

  it("vẫn giữ dòng gọn mỗi đợt: tên đợt, số ảnh, tiền, sản phẩm, lý do từ chối", () => {
    const html = render([
      dot(1, 40),
      dot(2, 12, { trangThai: "tu_choi", lyDoTuChoi: "Trùng đợt trước", sanPham: [{ ten: "UV 10×15", soLuong: 2, photoId: null }] }),
    ]);
    expect(html).toContain("Đợt 1 · ảnh trong gói");
    expect(html).toContain("Đợt 2 · mua thêm");
    expect(html).toContain("40 ảnh");
    expect(html).toContain("12 ảnh");
    expect(html).toContain("Lý do từ chối: Trùng đợt trước");
    expect(html).toContain("Sản phẩm: UV 10×15 ×2");
  });

  it("câu mô tả chỉ người dùng sang khối 'Xuất danh sách' ở dưới", () => {
    const html = render([dot(1, 3), dot(2, 2)]);
    expect(html).toContain("Xuất danh sách");
  });

  it("đợt chờ xác nhận vẫn có thẻ xử lý (Xác nhận / Từ chối) — không bị ảnh hưởng", () => {
    const html = render([dot(1, 3), dot(2, 2)]);
    expect(html).toContain('data-testid="the-dot-2"');
    expect(html).toContain("Xác nhận");
    expect(html).toContain("Từ chối (lý do)");
  });
});
