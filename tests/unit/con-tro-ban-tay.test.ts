/**
 * BB-211 — Phép thử canh con trỏ bàn tay trên mọi phần tử bấm được.
 *
 * OWNER: DEV-FE. Task BB-211.
 *
 * Bối cảnh: chủ studio báo LẦN THỨ HAI (24/09/2026) rằng nhiều chỗ bấm được
 * vẫn không hiện bàn tay. Luật chung thêm ngày 22/09/2026 trong
 * src/app/globals.css chỉ phủ <button>, [role=button], <a href>, <summary>,
 * <label for>, <select>, checkbox/radio — không phủ những phần tử KHÔNG dùng
 * thẻ ngữ nghĩa mà tự gắn onClick (div/main/img/aside/footer làm lớp phủ
 * đóng lightbox, khung ảnh trong lưới…) và các role ARIA tương tác khác
 * (tab, menuitem, option, switch, treeitem, link, combobox, slider).
 *
 * Phép thử này quét TOÀN BỘ .tsx trong src/app và src/components bằng chính
 * trình phân tích cú pháp TypeScript (không regex mù trên văn bản, không giả
 * lập hook React — đây là kiểm tra cấu trúc JSX tĩnh, không phải hành vi
 * runtime, nên không vi phạm điều cấm "không đọc mã nguồn làm dữ liệu thử"
 * của AGENTS.md §5a, vốn nói về việc giả hành vi bằng regex thay vì thử
 * logic thật — ở đây bản thân quy tắc CẦN kiểm là một quy tắc tĩnh về mã
 * nguồn (mọi onClick phải có lối thoát ra bàn tay), không phải hành vi).
 *
 * QUY TẮC: mọi phần tử JSX gốc HTML (tên thẻ viết thường — component tự viết
 * hoa như <Button> tự chịu trách nhiệm cursor bên trong nó, ví dụ
 * src/components/ui/button.tsx luôn render ra <button>) có onClick, mà
 * KHÔNG PHẢI button/a/Link/input/select/summary/label[htmlFor], thì phải:
 *   - có "cursor-pointer" trong className, HOẶC
 *   - có role nằm trong danh sách role đã được cấp cursor:pointer chung
 *     trong globals.css (kiểm tra chéo bằng cách đọc chính globals.css).
 *
 * KIỂM NGƯỢC (chạy tay trước khi nộp, kết quả dán vào commit):
 *   1. Gỡ "cursor-pointer" khỏi className của lớp phủ đóng ảnh lớn
 *      (src/components/features/gallery/photo-lightbox.tsx, div role="dialog"
 *      dòng ~267) → test "1." phải ĐỎ, nêu đúng photo-lightbox.tsx:267.
 *   2. Gỡ role "tab" khỏi danh sách OK trong src/app/globals.css → test "2."
 *      phải ĐỎ vì globals.css thiếu role đang được dùng thật
 *      (src/components/ui/tabs.tsx).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src/app", "src/components"];
const GLOBALS_CSS_PATH = path.join(ROOT, "src/app/globals.css");

// Thẻ HTML coi như đã tự hiện bàn tay (qua luật chung trong globals.css),
// không cần cursor-pointer riêng.
const EXEMPT_NATIVE_TAGS = new Set(["button", "a", "input", "select", "summary"]);
// Component tự viết hoa nhưng CHẮC CHẮN render ra <button>/<a> nên tự có
// bàn tay — không phải quét lại onClick trên chính nó.
const EXEMPT_COMPONENTS = new Set(["Link", "Button"]);

interface JsxOnClickSite {
  file: string;
  line: number;
  tagName: string;
  hasCursorPointer: boolean;
  role: string | undefined;
}

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function getJsxAttr(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const p of node.attributes.properties) {
    if (ts.isJsxAttribute(p) && p.name.getText() === name) return p;
  }
  return undefined;
}

function staticAttrText(attr: ts.JsxAttribute | undefined): string {
  if (!attr || !attr.initializer) return "";
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    // Biểu thức động (cn(...), template literal...) — lấy text thô để dò
    // chuỗi con "cursor-pointer". Đủ cho việc canh lint tĩnh này.
    return attr.initializer.expression.getText();
  }
  return "";
}

/**
 * onClick chỉ gọi `e.stopPropagation()` — phần tử đó KHÔNG bấm được gì.
 *
 * Soát khi gộp (Claude Opus, 24/09/2026): bản đầu của phép thử này đòi bàn
 * tay cho cả cột phải, thanh đáy và tấm ảnh trong màn xem lớn, chỉ vì chúng
 * có onClick để chặn cú bấm nổi lên nền (nền mà bấm thì đóng màn). Mà con trỏ
 * được KẾ THỪA xuống phần tử con — gắn bàn tay lên cột phải là cả ô ghi chú,
 * cả chữ trong đó đều hiện bàn tay, tức hứa "bấm được" ở chỗ không bấm được.
 * Đúng thứ luật 22/09 đã viết: "hứa sai còn tệ hơn không hứa".
 */
function chiChanSuKien(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
  const fn = init.expression;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  const cacLenh = ts.isBlock(fn.body) ? fn.body.statements.map((s) => s.getText()) : [fn.body.getText()];
  return (
    cacLenh.length > 0 &&
    cacLenh.every((t) => /^\w+\.stopPropagation\(\);?$/.test(t.trim()))
  );
}

/*
 * `data-con-tro="…"` — phần tử CỐ Ý để con trỏ thường dù có onClick, kèm lý
 * do viết ngay tại chỗ. Ví dụ nền màn xem ảnh lớn: bấm chỗ trống thì đóng,
 * nhưng vùng đó phần lớn là tấm ảnh — hiện bàn tay trên cả tấm ảnh là nói
 * sai rằng bấm vào ảnh sẽ làm gì đó. Có thuộc tính này là một quyết định đã
 * được viết ra, không phải một chỗ bị bỏ sót.
 */

function scanOnClickSites(): JsxOnClickSite[] {
  const sites: JsxOnClickSite[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of listTsxFiles(path.join(ROOT, dir))) {
      const text = fs.readFileSync(file, "utf-8");
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const relFile = path.relative(ROOT, file).replace(/\\/g, "/");

      function visit(node: ts.Node) {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
          const tagName = node.tagName.getText();
          const isNativeDom = /^[a-z]/.test(tagName);
          const onClickAttr = getJsxAttr(node, "onClick");

          if (onClickAttr && isNativeDom && !EXEMPT_COMPONENTS.has(tagName)) {
            const htmlForAttr = getJsxAttr(node, "htmlFor");
            const isExempt =
              EXEMPT_NATIVE_TAGS.has(tagName) ||
              (tagName === "label" && !!htmlForAttr) ||
              chiChanSuKien(onClickAttr) ||
              !!getJsxAttr(node, "data-con-tro");

            if (!isExempt) {
              const classAttr = getJsxAttr(node, "className");
              const classText = staticAttrText(classAttr);
              const roleAttr = getJsxAttr(node, "role");
              const roleText = staticAttrText(roleAttr) || undefined;
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart());

              sites.push({
                file: relFile,
                line: line + 1,
                tagName,
                hasCursorPointer: /cursor-pointer/.test(classText),
                role: roleText,
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);
    }
  }

  return sites;
}

function readGlobalsCssRoles(): Set<string> {
  const css = fs.readFileSync(GLOBALS_CSS_PATH, "utf-8");
  // Chỉ lấy các selector trong khối cấp cursor: pointer (khối đầu tiên chứa
  // "cursor: pointer;"), tránh ăn nhầm role trong khối cursor: not-allowed.
  const pointerBlockMatch = css.match(/\{[^}]*cursor:\s*pointer;[^}]*\}/s);
  const scope = pointerBlockMatch ? css.slice(0, pointerBlockMatch.index! + pointerBlockMatch[0].length) : css;
  const roleMatches = [...scope.matchAll(/\[role="([a-z]+)"\]/g)];
  const roles = roleMatches.map((m) => m[1]).filter((r): r is string => !!r);
  return new Set(roles);
}

describe("BB-211: Con trỏ bàn tay trên mọi chỗ bấm được", () => {
  const sites = scanOnClickSites();
  const globalsCssRoles = readGlobalsCssRoles();

  it("1. Mọi onClick trên thẻ HTML không-ngữ-nghĩa phải có cursor-pointer hoặc role đã được cấp bàn tay chung", () => {
    const violations = sites.filter((s) => {
      const roleOk = s.role ? globalsCssRoles.has(s.role) : false;
      return !s.hasCursorPointer && !roleOk;
    });

    if (violations.length > 0) {
      const list = violations
        .map((v) => `${v.file}:${v.line}\t<${v.tagName}>\trole=${v.role ?? "-"}`)
        .join("\n");
      throw new Error(
        `${violations.length} phần tử có onClick nhưng không hiện bàn tay:\n${list}`,
      );
    }

    // Bằng chứng thử thật có quét được gì không (tránh thử rỗng canh rỗng).
    expect(sites.length).toBeGreaterThan(0);
  });

  it("2. globals.css phải cấp cursor:pointer cho mọi role tương tác đang thật sự dùng trong mã nguồn", () => {
    // Role ARIA nào đang được gán tĩnh cho phần tử JSX trong toàn bộ
    // src/app + src/components (kể cả trên <button>) đều phải nằm trong
    // danh sách role hợp lệ của globals.css — nếu không thì role đó, khi
    // vô tình rơi vào một phần tử không phải <button>, sẽ không hiện bàn tay.
    const rolesInUse = new Set<string>();
    for (const dir of SCAN_DIRS) {
      for (const file of listTsxFiles(path.join(ROOT, dir))) {
        const text = fs.readFileSync(file, "utf-8");
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        function visit(node: ts.Node) {
          if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const roleAttr = getJsxAttr(node, "role");
            const roleText = staticAttrText(roleAttr);
            const interactiveRoles = [
              "tab",
              "menuitem",
              "menuitemcheckbox",
              "menuitemradio",
              "option",
              "switch",
              "checkbox",
              "radio",
              "treeitem",
              "link",
              "combobox",
              "slider",
              "button",
            ];
            if (roleText.length > 0 && interactiveRoles.includes(roleText)) {
              rolesInUse.add(roleText);
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(sf);
      }
    }

    const missing = [...rolesInUse].filter((r) => !globalsCssRoles.has(r));
    expect(missing, `Thiếu role trong globals.css: ${missing.join(", ")}`).toEqual([]);
  });
});
