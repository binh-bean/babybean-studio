/**
 * BB-378 — luật và component THẬT của ba yêu cầu màn khách (không đọc mã nguồn,
 * không giả lập hook — AGENTS §5a; dựng bằng renderToStaticMarkup).
 *
 *  1. Lời mời lưu app hiện ĐÚNG LÚC (`nenHienGoiYLuuApp`) và tấm hướng dẫn nói
 *     LỢI ÍCH trước, có hình cho từng bước, đúng máy.
 *  2. Xem lớn cả cảnh: phép kẹp/phóng quanh điểm không cho cảnh trôi khỏi khung.
 *  3. Màn link hết hạn / không tìm thấy (thu hồi) LUÔN có nút Nhắn Bean.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { nenHienGoiYLuuApp, NGAY_AN, type DauVaoGoiYLuuApp } from "@/lib/utils/luu-app-dung-luc";
import { HuongDanThemManHinh, buocTheoNhom, nhomTheoLoai } from "@/components/features/gallery/huong-dan-them-man-hinh";
import { ManLoiLink, loaiLoiTuMa } from "@/components/features/gallery/man-loi-link";
import { kepBienDoi, phongQuanhDiem } from "@/components/features/gallery/xem-lon-canh";

const NGAY = 86_400_000;
const goc: DauVaoGoiYLuuApp = {
  dangLaApp: false,
  lucDaAn: null,
  bayGio: 1_800_000_000_000,
  soLanMo: 1,
  daChonLucMo: 0,
  tinHieuTrongPhien: 0,
};

describe("nenHienGoiYLuuApp — mời đúng lúc", () => {
  it("lần mở đầu, chưa làm gì: chưa mời", () => {
    expect(nenHienGoiYLuuApp(goc)).toBe(false);
  });
  it("đã xem/chọn 2 tấm: chưa; 3 tấm: mời", () => {
    expect(nenHienGoiYLuuApp({ ...goc, tinHieuTrongPhien: 2 })).toBe(false);
    expect(nenHienGoiYLuuApp({ ...goc, tinHieuTrongPhien: 3 })).toBe(true);
  });
  it("lần mở thứ 2: mời ngay", () => {
    expect(nenHienGoiYLuuApp({ ...goc, soLanMo: 2 })).toBe(true);
  });
  it("BB-289: mở link cũ đã có tim từ trước: mời ngay", () => {
    expect(nenHienGoiYLuuApp({ ...goc, daChonLucMo: 4 })).toBe(true);
  });
  it("đang chạy dạng app: KHÔNG BAO GIỜ mời, dù đủ mọi tín hiệu", () => {
    expect(nenHienGoiYLuuApp({ ...goc, dangLaApp: true, soLanMo: 9, daChonLucMo: 9, tinHieuTrongPhien: 9 })).toBe(false);
  });
  it(`đã bỏ qua: im trong ${NGAY_AN} ngày, sau đó mời lại`, () => {
    const v = { ...goc, soLanMo: 5 };
    expect(nenHienGoiYLuuApp({ ...v, lucDaAn: goc.bayGio - 1 * NGAY })).toBe(false);
    expect(nenHienGoiYLuuApp({ ...v, lucDaAn: goc.bayGio - (NGAY_AN - 1) * NGAY })).toBe(false);
    expect(nenHienGoiYLuuApp({ ...v, lucDaAn: goc.bayGio - (NGAY_AN + 1) * NGAY })).toBe(true);
  });
});

describe("HuongDanThemManHinh — lợi ích trước, rồi bước đúng máy có hình", () => {
  const html = renderToStaticMarkup(<HuongDanThemManHinh mo onDong={() => {}} />).split(String.fromCharCode(160)).join(" ");
  it("tiêu đề là lợi ích, câu mô tả nói vì sao (không phải tìm lại tin nhắn)", () => {
    const h3 = html.indexOf("Mở ảnh của bé chỉ bằng một chạm");
    const buoc = html.indexOf('data-testid="buoc-luu-app"');
    expect(h3).toBeGreaterThan(-1);
    expect(html).toContain("không phải tìm lại tin nhắn");
    expect(h3, "lợi ích phải đứng TRƯỚC các bước").toBeLessThan(buoc);
  });
  it("mỗi bước một hình minh hoạ SVG (không ảnh chụp)", () => {
    const soBuoc = (html.match(/<li /g) ?? []).length;
    expect(soBuoc).toBe(3);
    expect((html.match(/data-minh-hoa="/g) ?? []).length).toBe(soBuoc);
    expect(html).not.toMatch(/<img[^>]+(png|jpe?g|webp)/);
  });
  it("người được mời: không gọi 'ba mẹ'", () => {
    const h = renderToStaticMarkup(<HuongDanThemManHinh mo laNguoiXem onDong={() => {}} />).split(String.fromCharCode(160)).join(" ");
    expect(h).toContain("lần sau gia đình không phải tìm lại tin nhắn");
    expect(h.toLowerCase()).not.toContain("ba mẹ");
  });
  it("đúng máy: iPhone Safari → Chia sẻ; Android Chrome → ⋮ + Cài đặt ứng dụng; Zalo → mở trình duyệt", () => {
    expect(nhomTheoLoai("ios-safari")).toBe("iphone");
    expect(buocTheoNhom("iphone")[0]!.chu).toContain("Chia sẻ");
    expect(buocTheoNhom("iphone")[0]!.hinh).toBe("safari-chia-se");
    expect(nhomTheoLoai("android-chrome")).toBe("android");
    expect(buocTheoNhom("android")[0]!.chu).toContain("⋮");
    expect(buocTheoNhom("android")[1]!.chu).toContain("Cài đặt ứng dụng");
    expect(nhomTheoLoai("zalo-app")).toBe("trong-app");
    expect(buocTheoNhom("trong-app")[1]!.chu).toContain("Mở bằng trình duyệt");
    expect(nhomTheoLoai("may-tinh")).toBe("may-tinh");
    expect(buocTheoNhom("may-tinh")[0]!.hinh).toBe("may-tinh-cai");
    expect(buocTheoNhom("may-tinh")[0]!.chu).toContain("thanh địa chỉ");
  });
});

describe("ManLoiLink — màn link hết hạn / không tìm thấy luôn có lối ra", () => {
  it("mã máy chủ → loại màn (thu hồi trả NOT_FOUND)", () => {
    expect(loaiLoiTuMa("LINK_EXPIRED")).toBe("het-han");
    expect(loaiLoiTuMa("NOT_FOUND")).toBe("khong-thay");
    expect(loaiLoiTuMa("NETWORK_ERROR")).toBe("loi");
  });
  it("có địa chỉ nhắn: nút Nhắn Bean trỏ đúng địa chỉ, mở tab mới", () => {
    const h = renderToStaticMarkup(<ManLoiLink loai="het-han" chatUrl="https://m.me/fixture-bean" />);
    expect(h).toMatch(/<a[^>]*data-testid="man-loi-nhan-bean"[^>]*href="https:\/\/m\.me\/fixture-bean"/);
    expect(h).toContain("Nhắn Bean");
    expect(h).toContain("Link này đã hết hạn");
    expect(h).not.toContain("Thử lại");
  });
  it("chưa cấu hình địa chỉ nhắn: vẫn có lối ra về trang chủ (chi nhánh + số gọi)", () => {
    const h = renderToStaticMarkup(<ManLoiLink loai="khong-thay" chatUrl={null} />);
    expect(h).toMatch(/<a[^>]*data-testid="man-loi-nhan-bean"[^>]*href="\/"/);
    expect(h).toContain("Liên hệ Bean");
  });
  it("địa chỉ không phải http(s) không được thành link", () => {
    const h = renderToStaticMarkup(<ManLoiLink loai="khong-thay" chatUrl="javascript:alert(1)" />);
    expect(h).not.toContain("javascript:");
  });
  it("lỗi mở (mạng): có Thử lại", () => {
    const h = renderToStaticMarkup(<ManLoiLink loai="loi" chatUrl={null} onThuLai={() => {}} />);
    expect(h).toContain("Thử lại");
  });
});

describe("xem lớn cả cảnh — phóng quanh điểm, kẹp trong khung", () => {
  const sanKhau = { w: 400, h: 500 };
  const khung = { w: 400, h: 800 };
  it("không phóng nhỏ hơn 1, không quá 4", () => {
    expect(kepBienDoi({ s: 0.3, x: 0, y: 0 }, sanKhau, khung).s).toBe(1);
    expect(kepBienDoi({ s: 9, x: 0, y: 0 }, sanKhau, khung).s).toBe(4);
  });
  it("ở 1x không kéo trôi được", () => {
    const b = kepBienDoi({ s: 1, x: 120, y: -80 }, sanKhau, khung);
    expect([b.s, Math.abs(b.x), Math.abs(b.y)]).toEqual([1, 0, 0]);
  });
  it("ở 2x chỉ kéo trong phần vượt khung", () => {
    const b = kepBienDoi({ s: 2, x: 999, y: 999 }, sanKhau, khung);
    expect(b.x).toBe(200); // (400*2-400)/2
    expect(b.y).toBe(100); // (500*2-800)/2
  });
  it("điểm dưới ngón tay đứng yên khi phóng", () => {
    const truoc = { s: 1, x: 0, y: 0 };
    const p = { x: 80, y: -40 };
    const sau = phongQuanhDiem(truoc, 2.5, p.x, p.y);
    // điểm nội dung dưới p: (p - t)/s phải giữ nguyên
    expect((p.x - sau.x) / sau.s).toBeCloseTo((p.x - truoc.x) / truoc.s);
    expect((p.y - sau.y) / sau.s).toBeCloseTo((p.y - truoc.y) / truoc.s);
  });
});
