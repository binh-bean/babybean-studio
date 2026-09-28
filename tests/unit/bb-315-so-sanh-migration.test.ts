// BB-315 — logic thuần của so-sanh-migration.mjs (db:so-migration): so hai bộ
// kết quả doMoc() đã đo sẵn, và so hai danh sách tên (bucket/policy). Không
// kết nối cơ sở dữ liệu hay Storage thật — mọi input ở đây là BỊA.

import { describe, it, expect } from "vitest";
import { soSanhMoc, soSanhTenDanhSach, tenChinhSach } from "../../scripts/so-sanh-migration.mjs";
import { MOC } from "../../scripts/migrate-prod.mjs";

function moc(dat: boolean, so = dat ? "có" : "THIẾU") {
  return { so, dat };
}

describe("soSanhMoc — cờ dichThieu chỉ bật khi NGUỒN đạt mà ĐÍCH chưa đạt", () => {
  it("nguồn đạt, đích cũng đạt -> không thiếu", () => {
    const nguon = MOC.map(() => moc(true));
    const dich = MOC.map(() => moc(true));
    const kq: Array<{ dichThieu: boolean }> = soSanhMoc(nguon, dich);
    expect(kq.every((k) => !k.dichThieu)).toBe(true);
  });

  it("nguồn đạt, đích CHƯA đạt -> dichThieu = true đúng mốc đó", () => {
    const nguon = MOC.map(() => moc(true));
    const dich = MOC.map((_unused: unknown, i: number) => moc(i !== 2));
    const kq: Array<{ dichThieu: boolean }> = soSanhMoc(nguon, dich);
    expect(kq[2]?.dichThieu).toBe(true);
    expect(kq.filter((k) => k.dichThieu)).toHaveLength(1);
  });

  it("nguồn CHƯA đạt (vd bb-dev cũng đang thiếu mốc đó) -> không gọi là 'đích thiếu', vì đích không thua kém nguồn", () => {
    const nguon = MOC.map(() => moc(false));
    const dich = MOC.map(() => moc(false));
    const kq: Array<{ dichThieu: boolean }> = soSanhMoc(nguon, dich);
    expect(kq.every((k) => !k.dichThieu)).toBe(true);
  });

  it("giữ nguyên nhãn 'so' để in ra người đọc được (vd '457 dòng' hay 'THIẾU')", () => {
    const nguon = MOC.map(() => moc(true, "có"));
    const dich = MOC.map(() => moc(false, "THIẾU"));
    const kq = soSanhMoc(nguon, dich);
    expect(kq[0].nguon).toBe("có");
    expect(kq[0].dich).toBe("THIẾU");
  });
});

describe("soSanhTenDanhSach — đích thiếu / đích thừa, dùng chung cho bucket và policy", () => {
  it("đích thiếu đúng những tên có ở nguồn mà đích không có", () => {
    const kq = soSanhTenDanhSach(["thumbnails", "avatars"], ["thumbnails"]);
    expect(kq.thieuODich).toEqual(["avatars"]);
    expect(kq.thuaODich).toEqual([]);
  });

  it("đích thừa đúng những tên đích có mà nguồn không có", () => {
    const kq = soSanhTenDanhSach(["thumbnails"], ["thumbnails", "rac-cu"]);
    expect(kq.thuaODich).toEqual(["rac-cu"]);
    expect(kq.thieuODich).toEqual([]);
  });

  it("khớp hoàn toàn -> hai mảng đều rỗng", () => {
    const kq = soSanhTenDanhSach(["a", "b"], ["b", "a"]);
    expect(kq.thieuODich).toEqual([]);
    expect(kq.thuaODich).toEqual([]);
  });
});

describe("tenChinhSach — ghép bảng.policy để so bằng soSanhTenDanhSach", () => {
  it("ghép đúng dạng 'tablename.policyname'", () => {
    const rows = [
      { tablename: "objects", policyname: "cho_service_role_doc_ghi", cmd: "ALL", roles: ["service_role"] },
      { tablename: "buckets", policyname: "cho_doc", cmd: "SELECT", roles: ["authenticated"] },
    ];
    expect(tenChinhSach(rows)).toEqual(["objects.cho_service_role_doc_ghi", "buckets.cho_doc"]);
  });

  it("mảng rỗng -> mảng rỗng", () => {
    expect(tenChinhSach([])).toEqual([]);
  });
});
