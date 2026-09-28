// BB-315 — chốt "biết đang nối vào đâu, chặn ghi nhầm chỗ" dùng chung cho
// nap-lai-tu-lark.mjs, migrate-prod.mjs, chep-cau-hinh.mjs, so-sanh-migration.mjs.
//
// KHÔNG kết nối cơ sở dữ liệu thật ở đây — mọi hàm kiểm là logic thuần, nhận
// một chuỗi kết nối GIẢ và trả object {choPhep, ly_do}.

import { describe, it, expect } from "vitest";
import {
  MA_BB_DEV,
  MA_BB_PROD,
  tenMoiTruong,
  kiemTraMoiTruongChoPhep,
  kiemTraCoBbProd,
  maDuAn,
} from "../../scripts/lib/moi-truong.mjs";

const urlBbDev = `postgresql://postgres.${MA_BB_DEV}:x@aws.pooler.supabase.com/postgres`;
const urlBbProd = `postgresql://postgres.${MA_BB_PROD}:x@aws.pooler.supabase.com/postgres`;
const urlLa = "postgresql://postgres.mabatkylaaaaaaaaaaaaaaaa:x@aws.pooler.supabase.com/postgres";

describe("maDuAn / tenMoiTruong", () => {
  it("bóc đúng mã dự án từ chuỗi pooler", () => {
    expect(maDuAn(urlBbDev)).toBe(MA_BB_DEV);
    expect(maDuAn(urlBbProd)).toBe(MA_BB_PROD);
  });

  it("đặt đúng tên bb-dev / bb-prod / không rõ", () => {
    expect(tenMoiTruong(MA_BB_DEV)).toBe("bb-dev");
    expect(tenMoiTruong(MA_BB_PROD)).toBe("bb-prod");
    expect(tenMoiTruong("mabatky")).toBe("không rõ");
  });
});

describe("kiemTraMoiTruongChoPhep — chặn mã dự án lạ", () => {
  it("cho phép bb-dev", () => {
    expect(kiemTraMoiTruongChoPhep(urlBbDev).choPhep).toBe(true);
  });

  it("cho phép bb-prod", () => {
    expect(kiemTraMoiTruongChoPhep(urlBbProd).choPhep).toBe(true);
  });

  it("TỪ CHỐI một mã lạ không nằm trong danh sách cho phép", () => {
    const kt = kiemTraMoiTruongChoPhep(urlLa);
    expect(kt.choPhep).toBe(false);
    expect(kt.ly_do).toMatch(/không nằm trong danh sách cho phép/);
  });

  it("TỪ CHỐI khi không bóc được mã nào (chuỗi rỗng/hỏng)", () => {
    expect(kiemTraMoiTruongChoPhep("").choPhep).toBe(false);
    expect(kiemTraMoiTruongChoPhep(undefined as unknown as string).choPhep).toBe(false);
  });
});

describe("kiemTraCoBbProd — đòi cờ --that-su-la-bb-prod cho MỌI thao tác ghi lên bb-prod", () => {
  it("bb-dev không cần cờ này (dù có hay không)", () => {
    expect(kiemTraCoBbProd(urlBbDev, false).choPhep).toBe(true);
    expect(kiemTraCoBbProd(urlBbDev, true).choPhep).toBe(true);
  });

  it("bb-prod THIẾU cờ -> từ chối", () => {
    const kt = kiemTraCoBbProd(urlBbProd, false);
    expect(kt.choPhep).toBe(false);
    expect(kt.ly_do).toMatch(/--that-su-la-bb-prod/);
  });

  it("bb-prod CÓ cờ -> cho phép", () => {
    expect(kiemTraCoBbProd(urlBbProd, true).choPhep).toBe(true);
  });

  it("mã lạ không phải bb-prod -> không đòi cờ này (kiemTraMoiTruongChoPhep lo phần chặn mã lạ)", () => {
    expect(kiemTraCoBbProd(urlLa, false).choPhep).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Kiểm ngược (AGENTS.md §5a): nếu bỏ điều kiện `ma === MA_BB_PROD` trong
// kiemTraCoBbProd, ca "bb-prod THIẾU cờ -> từ chối" phải ĐỎ. Đã thử thật bằng
// tay: đổi tạm `ma === MA_BB_PROD` thành `false` trong
// scripts/lib/moi-truong.mjs rồi chạy lại đúng tệp phép thử này — ca đó
// chuyển ĐỎ (choPhep trả về true thay vì false), sau đó phục hồi lại dòng gốc,
// chạy lại toàn bộ tệp — XANH. Không để lại mã giả lập trong tệp phép thử vì
// đó là hoàn nguyên MÃ NGUỒN, không phải một nhánh test riêng.
// ---------------------------------------------------------------------------
