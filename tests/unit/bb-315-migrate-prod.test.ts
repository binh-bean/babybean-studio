// BB-315 — migrate-prod.mjs không còn giữ một mảng DAY gõ tay: dãy tệp áp
// đọc thẳng từ db/migrations/ mỗi lượt chạy. Phép thử ở đây dựng một thư mục
// migrations GIẢ (fixture tạm trên đĩa) để không phụ thuộc vào việc kho thật
// có bao nhiêu tệp hôm nay — thêm một migration mới vào kho không được làm
// phép thử này đỏ hay xanh giả.
//
// KHÔNG kết nối cơ sở dữ liệu thật — danhSachMigrationCanAp() chỉ đọc hệ
// thống tệp.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { danhSachMigrationCanAp, MOC } from "../../scripts/migrate-prod.mjs";

describe("danhSachMigrationCanAp — đọc động từ db/migrations/, không phải mảng gõ tay", () => {
  let gocGia: string;

  beforeEach(() => {
    gocGia = fs.mkdtempSync(path.join(os.tmpdir(), "bb315-migrations-goc-"));
    fs.mkdirSync(path.join(gocGia, "db", "migrations"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(gocGia, { recursive: true, force: true });
  });

  function taoTep(...ten: string[]) {
    for (const t of ten) fs.writeFileSync(path.join(gocGia, "db", "migrations", t), "-- fixture\n");
  }

  it("bỏ qua tệp TRƯỚC mốc bắt đầu (0044 trở xuống)", () => {
    taoTep("0043-a.sql", "0044-b.sql", "0045-c.sql");
    const ds = danhSachMigrationCanAp(gocGia);
    expect(ds).toEqual(["0045-c.sql"]);
  });

  it("lấy ĐỦ mọi tệp từ mốc bắt đầu trở lên, kể cả tệp mới chưa từng có hôm nay (BB-31x sau này)", () => {
    taoTep("0045-a.sql", "0074-b.sql", "0075-c.sql", "0099-tuong-lai.sql");
    const ds = danhSachMigrationCanAp(gocGia);
    expect(ds).toEqual(["0045-a.sql", "0074-b.sql", "0075-c.sql", "0099-tuong-lai.sql"]);
  });

  it("sắp xếp đúng thứ tự số (đệm 4 số nên sort chuỗi = sort số)", () => {
    taoTep("0060-x.sql", "0045-a.sql", "0052-m.sql");
    const ds = danhSachMigrationCanAp(gocGia);
    expect(ds).toEqual(["0045-a.sql", "0052-m.sql", "0060-x.sql"]);
  });

  it("bỏ qua tệp không phải .sql (README.md trong thư mục migrations)", () => {
    taoTep("0045-a.sql");
    fs.writeFileSync(path.join(gocGia, "db", "migrations", "README.md"), "# ghi chú\n");
    const ds = danhSachMigrationCanAp(gocGia);
    expect(ds).toEqual(["0045-a.sql"]);
  });

  it("thư mục rỗng -> mảng rỗng, không ném lỗi", () => {
    expect(danhSachMigrationCanAp(gocGia)).toEqual([]);
  });

  it("chạy trên KHO THẬT (không tham số): mọi tệp trả về đều thoả mốc bắt đầu 0045", () => {
    // Phép thử duy nhất trong tệp này chạm kho thật — chỉ ĐỌC tên tệp, không
    // đọc nội dung, không kết nối gì. Mục đích: bắt lỗi off-by-one trong so
    // sánh chuỗi (`>= "0045-"`) trên đúng dữ liệu thật, không chỉ trên fixture.
    const ds = danhSachMigrationCanAp();
    expect(ds.length).toBeGreaterThan(0);
    for (const t of ds) {
      expect(t >= "0045-").toBe(true);
      expect(t.endsWith(".sql")).toBe(true);
    }
    // Thứ tự phải đã sắp — so với bản đã .sort().
    expect(ds).toEqual([...ds].sort());
  });
});

describe("MOC vẫn xuất đủ 9 mốc sau khi tách khỏi main() (BB-315 export lại để so-sanh-migration.mjs dùng)", () => {
  it("có đúng 9 mốc, mỗi mốc có ten/sql/doc/dat", () => {
    expect(MOC).toHaveLength(9);
    for (const m of MOC) {
      expect(typeof m.ten).toBe("string");
      expect(typeof m.sql).toBe("string");
      expect(typeof m.doc).toBe("function");
      expect(typeof m.dat).toBe("function");
    }
  });
});
