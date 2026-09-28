// BB-315 — logic thuần của chep-cau-hinh.mjs: so khớp theo khoá tự nhiên, nắn
// branch_id, mã xác nhận, chốt "không phải bb-dev". Dữ liệu ở đây toàn BỊA
// (AGENTS.md §6) — không đọc/ghi cơ sở dữ liệu thật.

import { describe, it, expect } from "vitest";
import {
  soSanhTheoKhoa,
  soSanhCotDonGian,
  xayBanDoBranch,
  nanBranchId,
  taoMaXacNhanChep,
  kiemTraDichKhongPhaiBbDev,
  matKhauNgauNhienKhongLuu,
} from "../../scripts/chep-cau-hinh.mjs";
import { MA_BB_DEV, MA_BB_PROD } from "../../scripts/lib/moi-truong.mjs";

type Dong = Record<string, unknown>;
const khoaCode = (r: Dong) => r.code as string;

describe("soSanhTheoKhoa — thêm / sửa / không đổi / chỉ-có-ở-đích", () => {
  const soSanh = soSanhCotDonGian(["ten", "gia"]);

  it("dòng chỉ có ở nguồn -> themMoi, GIỮ nguyên id nguồn", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha", gia: 100 }];
    const { themMoi, capNhat, khongDoi, xoaODich } = soSanhTheoKhoa(nguon, [], khoaCode, soSanh);
    expect(themMoi).toEqual(nguon);
    expect(capNhat).toEqual([]);
    expect(khongDoi).toEqual([]);
    expect(xoaODich).toEqual([]);
  });

  it("dòng có ở cả hai, cột khác nhau -> capNhat, báo đúng cột đổi, GIỮ id đích", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha mới", gia: 100 }];
    const dich = [{ id: "d9", code: "A", ten: "Alpha cũ", gia: 100 }];
    const { capNhat } = soSanhTheoKhoa(nguon, dich, khoaCode, soSanh);
    expect(capNhat).toHaveLength(1);
    expect(capNhat[0].dich.id).toBe("d9"); // id đích được GIỮ, không đổi thành n1
    expect(capNhat[0].cotKhac).toEqual(["ten"]);
  });

  it("dòng khớp mọi cột -> khongDoi, không nằm trong themMoi/capNhat", () => {
    const nguon = [{ id: "n1", code: "A", ten: "Alpha", gia: 100 }];
    const dich = [{ id: "d9", code: "A", ten: "Alpha", gia: 100 }];
    const kq = soSanhTheoKhoa(nguon, dich, khoaCode, soSanh);
    expect(kq.khongDoi).toHaveLength(1);
    expect(kq.themMoi).toEqual([]);
    expect(kq.capNhat).toEqual([]);
  });

  it("dòng chỉ có ở đích (nguồn không còn) -> xoaODich, KHÔNG lẫn vào nhóm khác", () => {
    const dich = [{ id: "d9", code: "CU", ten: "Đã bỏ", gia: 0 }];
    const kq = soSanhTheoKhoa([], dich, khoaCode, soSanh);
    expect(kq.xoaODich).toEqual(dich);
    expect(kq.themMoi).toEqual([]);
  });
});

describe("xayBanDoBranch / nanBranchId — nắn branch_id khi đích đã có chi nhánh với id khác", () => {
  it("chi nhánh đã có ở đích (khớp code) -> bản đồ trỏ về id ĐÍCH", () => {
    const nguon = [{ id: "n-hcm", code: "BB-Q1" }];
    const dich = [{ id: "d-hcm", code: "BB-Q1" }];
    const banDo = xayBanDoBranch(nguon, dich);
    expect(nanBranchId(banDo, "n-hcm")).toBe("d-hcm");
  });

  it("chi nhánh CHƯA có ở đích -> bản đồ trỏ về CHÍNH id nguồn (sẽ chèn mới bằng id đó)", () => {
    const nguon = [{ id: "n-moi", code: "BB-MOI" }];
    const banDo = xayBanDoBranch(nguon, []);
    expect(nanBranchId(banDo, "n-moi")).toBe("n-moi");
  });

  it("branch_id null/undefined (áp dụng mọi chi nhánh) -> giữ null, không tra bản đồ", () => {
    const banDo = xayBanDoBranch([], []);
    expect(nanBranchId(banDo, null)).toBeNull();
    expect(nanBranchId(banDo, undefined)).toBeNull();
  });
});

describe("taoMaXacNhanChep — mã đổi khi số dòng sẽ ghi đổi, để không dùng mã cũ trên số liệu mới", () => {
  it("cùng tổng kết, cùng ngày -> cùng mã", () => {
    const tk = { branches: { themMoi: 1, capNhat: 0 } };
    expect(taoMaXacNhanChep(tk, "2026-09-28")).toBe(taoMaXacNhanChep(tk, "2026-09-28"));
  });

  it("số dòng đổi -> mã đổi", () => {
    const ma1 = taoMaXacNhanChep({ branches: { themMoi: 1, capNhat: 0 } }, "2026-09-28");
    const ma2 = taoMaXacNhanChep({ branches: { themMoi: 2, capNhat: 0 } }, "2026-09-28");
    expect(ma1).not.toBe(ma2);
  });
});

describe("kiemTraDichKhongPhaiBbDev — không cho chép cấu hình ĐÈ lên bb-dev", () => {
  it("từ chối khi đích là bb-dev", () => {
    const url = `postgresql://postgres.${MA_BB_DEV}:x@aws.pooler.supabase.com/postgres`;
    const kt = kiemTraDichKhongPhaiBbDev(url);
    expect(kt.choPhep).toBe(false);
    expect(kt.ly_do).toMatch(/bb-dev/);
  });

  it("cho phép khi đích là bb-prod", () => {
    const url = `postgresql://postgres.${MA_BB_PROD}:x@aws.pooler.supabase.com/postgres`;
    expect(kiemTraDichKhongPhaiBbDev(url).choPhep).toBe(true);
  });
});

describe("matKhauNgauNhienKhongLuu — mật khẩu tạm cho tài khoản vừa tạo, không ai đọc lại được", () => {
  it("đủ dài (thoả MIN_PASSWORD_LENGTH=10 của app) và KHÁC nhau mỗi lần gọi", () => {
    const a = matKhauNgauNhienKhongLuu();
    const b = matKhauNgauNhienKhongLuu();
    expect(a.length).toBeGreaterThanOrEqual(10);
    expect(a).not.toBe(b);
    expect(/^\d+$/.test(a)).toBe(false); // không được chỉ toàn chữ số (passwordProblem() cấm)
  });
});
