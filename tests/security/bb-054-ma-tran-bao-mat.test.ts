/**
 * BB-054 — ma trận nghiệm thu bảo mật phải luôn khớp với phép thử có thật.
 *
 * ---------------------------------------------------------------------------
 * Bệnh mà tệp này chữa
 * ---------------------------------------------------------------------------
 * `docs/05-rbac.md` mục 6 liệt kê 14 kịch bản và viết: "Mỗi dòng phải có một
 * test tự động trong `tests/security/`". Rà soát ngày 22/09/2026 đếm thật:
 *
 *   · 7 dòng là `it.todo` trong `rbac.test.ts`, mỗi dòng ghi "Chờ BB-0xx" cho
 *     một task đã xong hàng tuần trước.
 *   · Trong 7 dòng đó, **4 ca thật ra ĐÃ có phép thử** — ở tệp khác, dưới tên
 *     khác, nên không ai đối chiếu ra.
 *   · 2 ca chưa có gì (nay nằm ở `bb-054-vai-cua-link-khach.test.ts`).
 *   · 1 ca đã hết nghĩa: mã PIN bị bỏ hẳn ở migration 0045.
 *
 * `it.todo` được Vitest đếm là "đã lên kế hoạch", không phải "đang hỏng". Nên
 * bộ phép thử báo xanh suốt, và ma trận nghiệm thu trông như đã đủ.
 *
 * ---------------------------------------------------------------------------
 * Cách canh
 * ---------------------------------------------------------------------------
 * Bảng dưới đây là bản sao của ma trận, và mỗi dòng phải trỏ tới một tệp CÓ
 * THẬT, chứa một chuỗi neo CÓ THẬT. Đổi tên tệp, xoá một ca, hay sửa tiêu đề
 * ca đó thì phép thử này đỏ — thay vì ma trận âm thầm rỗng ruột.
 *
 * Đây là phép thử về TÀI LIỆU, không thay thế phép thử về hành vi. Nó chỉ trả
 * lời đúng một câu: "cái bảng kia còn đúng không".
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface Ca {
  so: number;
  mo: string;
  /** Tệp trong tests/security (hoặc tests/unit) chứa phép thử thật. */
  tep: string;
  /** Chuỗi phải xuất hiện trong tệp đó — neo để đổi tên là biết. */
  neo: string;
}

const MA_TRAN: Ca[] = [
  { so: 1, mo: "cs chi nhánh A đọc album chi nhánh B", tep: "security/rbac.test.ts", neo: "Ca 1:" },
  {
    so: 2,
    mo: "photographer sửa album",
    tep: "security/rbac.test.ts",
    neo: "Ca 2 (Lỗ hổng 0001)",
  },
  { so: 3, mo: "cs mở lại album", tep: "security/rbac.test.ts", neo: "Ca 3:" },
  { so: 4, mo: "nhân viên UPDATE selection_items", tep: "security/rbac.test.ts", neo: "Ca 4:" },
  { so: 5, mo: "nhân viên tự đổi vai của mình", tep: "security/rbac.test.ts", neo: "Ca 5:" },
  { so: 6, mo: "anon SELECT bảng bất kỳ", tep: "security/rbac.test.ts", neo: "Ca 6:" },
  {
    so: 7,
    mo: "cookie trỏ album A thì không lấy được ảnh album B",
    tep: "security/khach-xem-duoc-anh.test.ts",
    neo: "KHÔNG xem được ảnh của nhà khác",
  },
  {
    so: 8,
    mo: "link vai viewer không sửa được lựa chọn",
    tep: "security/bb-054-vai-cua-link-khach.test.ts",
    neo: "Ca 8a",
  },
  {
    so: 9,
    mo: "suggester gửi 'selected' thì lưu thành 'suggested'",
    tep: "security/bb-054-vai-cua-link-khach.test.ts",
    neo: "Ca 9:",
  },
  {
    so: 10,
    mo: "chốt hai lần thì lần hai GALLERY_LOCKED",
    tep: "unit/submit-and-confirm.test.ts",
    neo: "GALLERY_LOCKED",
  },
  // Ca 11 (sai PIN 6 lần) đã bỏ — xem phép thử "ca 11 đã hết nghĩa" bên dưới.
  {
    so: 12,
    mo: "lấy ảnh của album khác qua /api/img",
    tep: "security/khach-xem-duoc-anh.test.ts",
    neo: "Cổng khách: KHÔNG xem được ảnh của khách khác",
  },
  {
    so: 13,
    mo: "accountant không thấy ảnh",
    tep: "security/rbac.test.ts",
    neo: "Ca 13:",
  },
  {
    so: 14,
    mo: "token đã thu hồi",
    tep: "security/gallery-auth.test.ts",
    neo: "thu hồi link khi phiên đang mở",
  },
];

const GOC = join(process.cwd(), "tests");

describe("BB-054: ma trận nghiệm thu bảo mật", () => {
  it("1. Mỗi ca trong ma trận trỏ tới một phép thử CÓ THẬT", () => {
    const hong: string[] = [];
    for (const ca of MA_TRAN) {
      const duong = join(GOC, ca.tep);
      if (!existsSync(duong)) {
        hong.push(`Ca ${ca.so}: không có tệp ${ca.tep}`);
        continue;
      }
      if (!readFileSync(duong, "utf8").includes(ca.neo)) {
        hong.push(`Ca ${ca.so} (${ca.mo}): không tìm thấy "${ca.neo}" trong ${ca.tep}`);
      }
    }
    expect(hong, hong.join(" | ")).toEqual([]);
  });

  it("2. Ma trận phải phủ đúng 13 ca còn hiệu lực, không thiếu số nào", () => {
    const so = MA_TRAN.map((c) => c.so).sort((a, b) => a - b);
    // 1..14, bỏ 11 (mã PIN đã gỡ ở migration 0045).
    const mongDoi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14];
    expect(so).toEqual(mongDoi);
  });

  it("3. Không còn it.todo nào trong tests/security", () => {
    // `it.todo` là chỗ một yêu cầu bảo mật nằm chờ mà bộ phép thử vẫn báo xanh.
    // Muốn hoãn thì hoãn ở sổ việc, đừng hoãn trong tệp phép thử.
    const tep = [
      "security/rbac.test.ts",
      "security/gallery-auth.test.ts",
      "security/khach-xem-duoc-anh.test.ts",
      "security/cai-dat-nhay-cam.test.ts",
      "security/ctv-chi-thay-viec-cua-minh.test.ts",
      "security/ctv-khong-thay-link-giao.test.ts",
      "security/rpc.test.ts",
      "security/bb-171-xoa-nhan-su.test.ts",
      "security/bb-054-vai-cua-link-khach.test.ts",
    ];
    // Bỏ ghi chú trước khi tìm: tệp bb-054-vai-cua-link-khach TRÍCH DẪN hai
    // dòng `it.todo` cũ ở phần đầu để kể lại chuyện, và một trích dẫn thì
    // không phải là một dòng todo đang sống.
    const boGhiChu = (ma: string) =>
      ma.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

    const conTodo = tep.filter(
      (t) =>
        existsSync(join(GOC, t)) &&
        /\b(it|test)\.todo\(/.test(boGhiChu(readFileSync(join(GOC, t), "utf8"))),
    );
    expect(conTodo, `Còn it.todo ở: ${conTodo.join(", ")}`).toEqual([]);
  });

  it("4. Ca 11 đã hết nghĩa: mã PIN không còn trong mã nguồn", () => {
    /*
      Migration 0045 bỏ hẳn mã PIN. Nếu ai đó dựng lại cơ chế PIN thì ca 11
      phải sống lại trong ma trận — nên phép thử này canh đúng điều đó, thay vì
      im lặng xoá một dòng khỏi bảng.
    */
    const duongAuth = join(process.cwd(), "src", "lib", "auth", "gallery-session.ts");
    const noiDung = readFileSync(duongAuth, "utf8");
    expect(/PIN_LOCKED|pin_hash|pinAttempts/i.test(noiDung)).toBe(false);
  });
});
