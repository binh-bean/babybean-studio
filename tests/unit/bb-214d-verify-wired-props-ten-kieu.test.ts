/**
 * BB-214(d) — verify:wired không được báo nhầm component nhận mảng qua props
 * khi cả tham số được gõ thẳng bằng MỘT KIỂU ĐẶT TÊN (`}: FooProps)`), và vẫn
 * phải báo đúng khi danh sách hiển thị là hằng số không đến từ đâu.
 *
 * OWNER: DEV-BE/DEV-FE. Task BB-214(d).
 * Spec: scripts/verify-wired.mjs, rule 5 ("Hiển thị danh sách mà không có
 * nguồn dữ liệu").
 *
 * ---------------------------------------------------------------------------
 * Vì sao chạy script thật bằng subprocess, không import hàm
 * ---------------------------------------------------------------------------
 * `scripts/verify-wired.mjs` chạy toàn bộ logic ngay khi được import (không
 * export gì) và quét CỐ ĐỊNH `src/components/features` + `src/app` — đúng
 * hành vi cần canh là "chạy `npm run verify:wired` trên cây thư mục thật".
 * Ghi file fixture thật vào đúng cây đó rồi gọi script bằng subprocess là
 * cách duy nhất kiểm được đúng hành vi, không phải đọc mã nguồn làm dữ liệu
 * thử (khác với AGENTS.md §5a cấm — ở đây file fixture LÀ input thật của
 * script, không phải bị đọc để so khớp chuỗi).
 *
 * ---------------------------------------------------------------------------
 * Thước đo của AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên bản vá (bỏ nhánh `mangQuaThamSoDatTenKieu` khỏi verify-wired.mjs)
 * thì ca 1 phải ĐỎ: ba màn hình thật (và fixture mô phỏng đúng hình dạng của
 * chúng) bị báo nhầm "không có nguồn dữ liệu" dù nhận đủ qua props.
 */

import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const goc = path.resolve(__dirname, "../..");
const thuMucFixture = path.join(goc, "src/components/features/_bb214d_tmp_kiemtra");

function chayVerifyWired(): { code: number; out: string } {
  const r = spawnSync(process.execPath, [path.join(goc, "scripts/verify-wired.mjs")], {
    cwd: goc,
    encoding: "utf8",
  });
  return { code: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

function donDep() {
  if (fs.existsSync(thuMucFixture)) fs.rmSync(thuMucFixture, { recursive: true, force: true });
}

describe("BB-214d · verify:wired không báo nhầm props gõ bằng tên kiểu riêng", () => {
  afterEach(donDep);

  it("1. Component nhận mảng qua props typed bằng tên kiểu riêng (}: FooProps)) không bị báo", () => {
    donDep();
    fs.mkdirSync(thuMucFixture, { recursive: true });
    fs.writeFileSync(
      path.join(thuMucFixture, "that.tsx"),
      `interface ThatProps {
  monHang: string[];
  onClick: () => void;
}

export function That({ monHang, onClick }: ThatProps) {
  return (
    <table>
      <tbody>
        {monHang.map((m) => (
          <tr key={m} onClick={onClick}>
            <td>{m}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`,
    );

    const { code, out } = chayVerifyWired();
    expect(out, "component nhận đủ qua props vẫn bị báo nhầm").not.toContain(
      "_bb214d_tmp_kiemtra/that.tsx",
    );
    expect(code).toBe(0);
  });

  it("2. Component giả — danh sách hằng số, props không có mảng — vẫn phải bị báo", () => {
    donDep();
    fs.mkdirSync(thuMucFixture, { recursive: true });
    fs.writeFileSync(
      path.join(thuMucFixture, "gia.tsx"),
      `interface GiaProps {
  onClick: () => void;
}

export function Gia({ onClick }: GiaProps) {
  const hangGia = ["a", "b", "c"];
  return (
    <table>
      <tbody>
        {hangGia.map((x) => (
          <tr key={x} onClick={onClick}>
            <td>{x}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`,
    );

    const { code, out } = chayVerifyWired();
    expect(code).toBe(1);
    expect(out).toContain("_bb214d_tmp_kiemtra/gia.tsx");
    expect(out).toContain("Hiển thị danh sách mà không có nguồn dữ liệu");
  });
});
