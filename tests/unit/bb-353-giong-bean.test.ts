/**
 * BB-353 mục 3 — giọng Bean trên chuỗi khách thấy (người chấm vòng 7: ~20 chỗ
 * xưng "studio", "bên mình", "em", và nhiều câu thiếu "ạ").
 *
 * Kiểm trên CHÍNH dữ liệu `vi` (đối tượng i18n lúc chạy), không đọc tệp nguồn
 * (AGENTS.md §5a). Luật:
 *   1. Studio tự xưng "Bean": không "studio" (trừ tên thương hiệu "Baby Bean
 *      Studio"/"BabyBean Studio"), không "bên mình", không "em" (trừ "em bé").
 *   2. Mọi câu kết bằng "ạ" ("nhé ạ" cũng là kết bằng "ạ").
 *
 * "Câu" = chuỗi kết bằng . ! ? …, hoặc có gọi "ba mẹ"/"gia đình", hoặc dài từ
 * 7 chữ; dòng số liệu ghép bằng " · " thì không. Nhãn nút/tiêu đề ngắn ("Xem bộ ảnh", "Tất cả") không phải câu.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "@/i18n/vi";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { TRANG_THAI_BO_ANH, TAM_KHOA_KHACH, BUOC_KHACH } from "@/lib/lark/trang-thai-app-lark";
import { NOI_DUNG_MOC } from "@/lib/thong-bao/moc-khach";

/** Phần `vi` khách thấy. `admin`/`ui` là màn nhân viên — không thuộc luật này. */
const PHAN_KHACH = {
  gallery: vi.gallery,
  landing: vi.landing,
  errorPages: vi.errorPages,
  "common.offline": vi.common.offline,
  // Nhãn trạng thái khách (bìa, thẻ tiến trình, dải khoá, màn cảm ơn) — BB-353 P0.
  trangThaiKhach: Object.fromEntries(
    Object.entries(TRANG_THAI_BO_ANH).map(([ma, d]) => [ma, { khach: d.khach, bia: d.bia }]),
  ),
  tamKhoa: TAM_KHOA_KHACH,
  buocKhach: [...BUOC_KHACH],
  // Thông báo đẩy gửi khách (chuông + điện thoại).
  thongBaoMoc: NOI_DUNG_MOC,
};

/**
 * Không phải lời Bean nói — có lý do riêng từng khoá:
 *   · submitAgree: lời CỦA BA MẸ tự xác nhận ("Tôi xác nhận…"), trích nguyên.
 *   · notePlaceholder / parentNamePlaceholder / noteHint: chữ gợi ý trong ô nhập.
 *   · quotaWarningDontAsk: nhãn ô tích ba mẹ tự chọn ("Không hỏi lại…").
 */
const KHONG_PHAI_LOI_BEAN = new Set([
  "gallery.submitAgree",
  "gallery.notePlaceholder",
  "gallery.parentNamePlaceholder",
  "gallery.noteHint",
  "gallery.quotaWarningDontAsk",
  // BB-355 — câu anh duyệt NGUYÊN VĂN 01/10/2026 (BB-338 mục 2b, giữ "ạ!" ở cuối), nay
  // dời từ JSX vào `loiBean` để bìa người được mời dùng; câu đầu không thêm "ạ" theo duyệt.
  "gallery.loiBean.nguoiThanGiaiThich",
  // BB-334B — NHÃN/TIÊU ĐỀ theo bản vẽ đã duyệt (BB-334/ban-ve 01–04), không phải câu:
  // dòng nhãn hoa, tiêu đề lớn, nút "Về trang album gia đình", tiêu đề tấm chuyển bộ.
  "gallery.giaDinh.nhanTrang",
  "gallery.giaDinh.chao",
  "gallery.giaDinh.chaoChung",
  "gallery.giaDinh.cacBuoiCuaGiaDinh",
  "gallery.giaDinh.veTrangGiaDinh",
  "gallery.giaDinh.albumGiaDinh",
  // BB-378 — TIÊU ĐỀ lời mời lưu app (nói lợi ích), không phải câu; câu đi kèm (`luuApp.loiIch`) kết "ạ".
  "gallery.luuApp.tieuDe",
]);

function phang(obj: unknown, tien = ""): [string, string][] {
  if (typeof obj === "string") return [[tien, obj]];
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => phang(v, tien ? `${tien}.${k}` : k));
  }
  return [];
}

const CHUOI = Object.entries(PHAN_KHACH)
  .flatMap(([k, v]) => phang(v, k))
  .filter(([k]) => !KHONG_PHAI_LOI_BEAN.has(k));

const BO_THUONG_HIEU = /baby ?bean studio/gi;

function xungStudio(s: string): boolean {
  const t = s.replace(BO_THUONG_HIEU, "");
  // BB-358 — "Baby Bean giữ trọn…" (bìa Đã giao): trong câu, studio tự xưng "Bean", không "Baby Bean".
  return /studio/i.test(t) || /bên mình/i.test(t) || /\bem\b(?! bé)/i.test(t) || /baby ?bean/i.test(t);
}

function laCau(s: string): boolean {
  const t = s.trim();
  if (/[.!?…]$/.test(t)) return true;
  // Dòng số liệu ghép bằng " · " (vd "{count} ảnh đã chọn · …") không phải câu.
  if (/ · /.test(t)) return false;
  if (/ba mẹ|gia đình/i.test(t)) return true;
  return t.split(/\s+/).length >= 7;
}

/** Tách câu; bỏ mảnh chỉ có dấu câu (vd chuỗi bắt đầu bằng ". "). */
function cacCau(s: string): string[] {
  return s
    .split(/(?<=[.!?…])\s+/)
    .map((c) => c.trim())
    .filter((c) => /[\p{L}\p{N}]/u.test(c));
}

function cauThieuA(s: string): string[] {
  if (!laCau(s)) return [];
  return cacCau(s).filter((c) => !/ạ[\s.!?…"”'»)]*$/.test(c));
}

describe("BB-353 — giọng Bean trên chuỗi khách (vi.ts)", () => {
  it("có dữ liệu để kiểm (phép thử không rỗng)", () => {
    expect(CHUOI.length).toBeGreaterThan(150);
    // Lời Bean gom về một chỗ (vi.gallery.loiBean) — có mặt trong dữ liệu kiểm.
    expect(CHUOI.some(([k]) => k.startsWith("gallery.loiBean."))).toBe(true);
    expect(CHUOI.some(([k]) => k.startsWith("trangThaiKhach."))).toBe(true);
  });

  it("không chuỗi nào xưng studio / bên mình / em", () => {
    const sai = CHUOI.filter(([, s]) => xungStudio(s)).map(([k, s]) => `${k}: ${s}`);
    expect(sai).toEqual([]);
  });

  it("mọi câu kết bằng 'ạ'", () => {
    const sai = CHUOI.flatMap(([k, s]) => cauThieuA(s).map((c) => `${k}: «${c}»`));
    expect(sai).toEqual([]);
  });

  it("tên thương hiệu vẫn được giữ (không bị luật bắt nhầm)", () => {
    expect(xungStudio(vi.landing.studioName)).toBe(false);
    expect(xungStudio(vi.landing.tagline)).toBe(false);
    // Bộ lọc thật sự bắt câu sai — tránh phép thử luôn xanh.
    expect(xungStudio("Studio đang chỉnh ảnh của bé.")).toBe(true);
    expect(xungStudio("Ba mẹ nhắn giúp em nhé")).toBe(true);
    expect(cauThieuA("Ba mẹ thong thả chọn nhé.")).toEqual(["Ba mẹ thong thả chọn nhé."]);
    expect(cauThieuA("Ba mẹ thong thả chọn nhé ạ.")).toEqual([]);
  });
});

/**
 * BB-358 — người chấm vòng 8 (A3): câu bìa "Đã giao" viết thẳng trong bia-bo-anh.tsx
 * ("Cảm ơn ba mẹ. … Baby Bean giữ trọn ở đây.") nên phép thử trên `vi` không thấy.
 * Nay câu đó và các câu khách thấy từng viết thẳng trong components/features/gallery
 * nằm ở `vi.gallery.loiBean`; phép thử dưới đây (1) đòi các khoá đó CÓ MẶT trong dữ liệu
 * được quét ở trên, (2) dựng THẬT bìa Đã giao và đòi chữ hiện ra đúng là câu trong `vi`.
 */
describe("BB-358 — câu từng viết thẳng trong gallery nay nằm trong vi và đúng giọng", () => {
  const KHOA_BB358 = [
    "camOnDaGiao",
    "thaTimTruocKhiDatIn",
    "khongBatDuocThongBao",
    "khongTatDuocThongBao",
    "boAnhChuaCoTam",
    "thaTimVaiTamTruoc",
    "thaTimTruocChonBia",
    "chonBiaAlbumMoTa",
    "luuAppNhanTinMoi",
    "moTaSanPhamMacDinh",
    "chuaMoDuocDanhSachBuoi",
    "kiemTraMangThuLai",
    "chuaMoDuocBuoi",
    "linkKhongHetHan",
    "chonBuoiChupMoTa",
    "phongChuaVuaTuong",
    "dangChiXemChuaDat",
    "moiMuaTieuDe",
    "chuaCoTamDeVuot",
    "luuAppMoTrinhDuyet",
    "luuAppMoNhanhAnhBe",
    "luuAppIphone",
    "luuAppNhuAppRieng",
    "luuAppMayTinh",
    "luuAppCanSafari",
  ];

  it("mọi khoá BB-358 nằm trong dữ liệu phép thử giọng quét", () => {
    const coMat = new Set(CHUOI.map(([k]) => k));
    expect(KHOA_BB358.filter((k) => !coMat.has(`gallery.loiBean.${k}`))).toEqual([]);
  });

  it("luật bắt đúng câu bìa cũ (không 'ạ', tự xưng 'Baby Bean')", () => {
    const cu = "Cảm ơn ba mẹ. Năm đầu đời của Bé Xoài, Baby Bean giữ trọn ở đây.";
    expect(xungStudio(cu)).toBe(true);
    expect(cauThieuA(cu).length).toBe(2);
  });

  it("bìa Đã giao dựng thật hiện đúng câu trong vi (giọng Bean, kết 'ạ')", () => {
    const html = renderToStaticMarkup(
      React.createElement(BiaBoAnh, {
        anhBia: null,
        coverHeadline: null,
        tenBe: "Bé Fixture",
        ngayChup: null,
        chiNhanh: "Chi nhánh Fixture",
        loiChao: null,
        soAnh: 40,
        hanMuc: 20,
        daChon: 20,
        hanChot: null,
        khoa: true,
        trangThai: "delivered",
        giaiDoanTienDo: null,
        onBatDau: () => {},
      } as React.ComponentProps<typeof BiaBoAnh>),
    );
    const chu = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/\u00A0/g, " ");
    const mong = vi.gallery.loiBean.camOnDaGiao.replace("{ten}", "Bé Fixture");
    expect(chu).toContain(mong);
    expect(chu).not.toMatch(/Baby Bean giữ trọn/);
    expect(xungStudio(mong)).toBe(false);
    expect(cauThieuA(mong)).toEqual([]);
  });
});
