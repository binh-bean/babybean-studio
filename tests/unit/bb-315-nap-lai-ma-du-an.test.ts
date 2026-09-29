// BB-315 (cố vấn CV-01, lỗi S4) — tệp mốc sao lưu phải ghi mã dự án; --xoa
// phải từ chối khi bản sao lưu gần nhất là của MỘT MÔI TRƯỜNG KHÁC. Đúng
// kịch bản docs/26 §13: dọn bb-dev vài ngày sau khi cắt sang bb-prod — cả
// hai môi trường đều có bản sao lưu "trẻ" trong cùng khung giờ, và trước khi
// vá, --xoa chỉ kiểm "có bản sao lưu < 24 giờ", không kiểm ĐÚNG MÔI TRƯỜNG.
//
// Client pg ở đây là GIẢ (giống bb-300) — không kết nối gì thật.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { xuatSaoLuu, kiemTraDieuKienXoa, taoMaXacNhan } from "../../scripts/nap-lai-tu-lark.mjs";

// scripts/nap-lai-tu-lark.mjs không có tệp .d.ts (allowJs:false — xem
// scripts/mjs-modules.d.ts), nhưng TypeScript vẫn suy luận được một phần kiểu
// từ chính mã nguồn .mjs cho MỘT SỐ tệp (không rõ cơ chế, đã xác nhận qua thử
// nghiệm — không phải hành vi cố ý của kho này). Suy luận đó KHÔNG thấy tham
// số thứ tư mới của `xuatSaoLuu` (`maDuAnHienTai`) hay trường `maDuAn` mới
// trong tham số của `kiemTraDieuKienXoa` — cả hai đều CÓ THẬT trong mã nguồn
// (xem scripts/nap-lai-tu-lark.mjs), phép thử này gọi qua các hàm `any` bên
// dưới để không bị chặn bởi một suy luận kiểu không đầy đủ.
const xuatSaoLuuAny = xuatSaoLuu as (...args: unknown[]) => Promise<unknown>;
const kiemTraDieuKienXoaAny = kiemTraDieuKienXoa as (args: Record<string, unknown>) => { choPhep: boolean; loi: string[] };
import { MA_BB_DEV, MA_BB_PROD } from "../../scripts/lib/moi-truong.mjs";

function taoClientGia(duLieuTheoBang: Record<string, Array<Record<string, unknown>>> = {}) {
  return {
    async query(sql: string) {
      const m = /from "([^"]+)"/.exec(sql);
      const bang = m?.[1] ?? "?";
      return { rows: duLieuTheoBang[bang] ?? [] };
    },
  };
}

const urlBbDev = `postgresql://postgres.${MA_BB_DEV}:x@aws.pooler.supabase.com/postgres`;
const urlBbProd = `postgresql://postgres.${MA_BB_PROD}:x@aws.pooler.supabase.com/postgres`;

describe("xuatSaoLuu — ghi mã dự án vào tong-so-dong.json", () => {
  it("có maDuAn -> ghi vào tệp", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb315-sao-luu-ma-"));
    try {
      const client = taoClientGia({ customers: [{ id: 1 }] });
      await xuatSaoLuuAny(client, ["customers"], thuMuc, MA_BB_PROD);
      const tong = JSON.parse(fs.readFileSync(path.join(thuMuc, "tong-so-dong.json"), "utf8"));
      expect(tong.maDuAn).toBe(MA_BB_PROD);
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });

  it("KHÔNG truyền maDuAn (lời gọi kiểu cũ) -> tệp không có trường này, không lỗi (tương thích ngược)", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb315-sao-luu-cu-"));
    try {
      const client = taoClientGia({ customers: [{ id: 1 }] });
      await xuatSaoLuuAny(client, ["customers"], thuMuc);
      const tong = JSON.parse(fs.readFileSync(path.join(thuMuc, "tong-so-dong.json"), "utf8"));
      expect("maDuAn" in tong).toBe(false);
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });
});

describe("kiemTraDieuKienXoa — TỪ CHỐI khi bản sao lưu là của MÔI TRƯỜNG KHÁC (lỗi S4)", () => {
  const demHienTai = { customers: 5 };
  const ngay = "2026-09-28";
  const maDung = taoMaXacNhan(demHienTai, ngay);

  it("ĐANG XOÁ bb-prod, nhưng bản sao lưu gần nhất là của bb-dev -> từ chối", () => {
    const kt = kiemTraDieuKienXoaAny({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: { thoiDiem: new Date().toISOString(), maDuAn: MA_BB_DEV },
      urlKetNoi: urlBbProd,
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /môi trường khác/.test(l))).toBe(true);
  });

  it("ĐANG XOÁ bb-dev, nhưng bản sao lưu gần nhất là của bb-prod -> từ chối (đúng kịch bản docs/26 §13 làm ngược)", () => {
    const kt = kiemTraDieuKienXoaAny({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: { thoiDiem: new Date().toISOString(), maDuAn: MA_BB_PROD },
      urlKetNoi: urlBbDev,
      coCoThatSuLaBbDev: true,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /môi trường khác/.test(l))).toBe(true);
  });

  it("bản sao lưu ĐÚNG môi trường -> cho phép (cùng mã dự án)", () => {
    const kt = kiemTraDieuKienXoaAny({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: { thoiDiem: new Date().toISOString(), maDuAn: MA_BB_PROD },
      urlKetNoi: urlBbProd,
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(true);
  });

  it("bản sao lưu KIỂU CŨ (không có trường maDuAn) -> KHÔNG chặn (tương thích ngược, không phạt bản sao lưu tạo trước BB-315)", () => {
    const kt = kiemTraDieuKienXoaAny({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: { thoiDiem: new Date().toISOString() }, // không có maDuAn
      urlKetNoi: urlBbProd,
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(true);
  });
});
