#!/usr/bin/env node
/**
 * verify-wired — tìm màn hình chỉ trông như đang chạy.
 *
 * OWNER: PM / cổng chấm bài. Agent chạy nó, không sửa nó.
 *
 * Vì sao có file này: ba màn hình đã được đánh dấu DONE mà không nối vào đâu.
 *
 *   create-gallery-wizard  setTimeout giả lập API, dán link Drive nào cũng ra
 *                          "862 ảnh", bấm tạo album trả link mock123 và không
 *                          ghi gì vào database
 *   gallery-list           const mockData cứng trong file
 *   gallery-filters        vỏ tĩnh, Select và Input không có onChange
 *
 * Cả ba đều qua typecheck, qua lint, qua build, qua `npm run verify`. Trình
 * biên dịch không phân biệt được dữ liệu thật với dữ liệu bịa, và cũng không
 * biết một cái nút không gắn với việc gì.
 *
 * Exit 0 = sạch.
 *
 * Cách dùng:  npm run verify:wired
 */

import fs from "node:fs";
import path from "node:path";

/** Nơi màn hình thật sống. Component thuần trình bày ở ui/ không bị soi. */
const SCAN_DIRS = ["src/components/features", "src/app"];

/**
 * Component thuần trình bày, cố ý không gọi API và cố ý không có handler.
 * Thêm vào đây là một quyết định, không phải một cách im lặng đi qua cổng.
 */
const ALLOW = new Set([
  "src/components/features/admin/field.tsx",
]);

const findings = [];
const report = (file, rule, detail) => findings.push({ file, rule, detail });

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap(walk).filter((f) => !ALLOW.has(f));

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // 1. Biến mang tên tự khai là dữ liệu bịa.
  const named = code.match(/\b(?:const|let|var)\s+(mock|fake|dummy|stub)[A-Za-z0-9_]*\s*[:=]/gi);
  if (named) report(file, "Dữ liệu bịa đặt tên rõ ràng", named.join(", "));

  // 2. setTimeout bên trong hàm xử lý — dấu hiệu giả vờ gọi mạng.
  //    Debounce và animation không nằm trong hàm tên handleSubmit.
  const handlers = [...code.matchAll(/(?:function\s+|const\s+)(handle[A-Z]\w*)[^{]*\{([\s\S]{0,900}?)\n\s{2}\}/g)];
  for (const [, name, body] of handlers) {
    if (/setTimeout\s*\(/.test(body) && !/fetch\s*\(/.test(body)) {
      report(file, "Hàm xử lý giả vờ gọi mạng", `${name}() dùng setTimeout mà không fetch`);
    }
  }

  // 3. Địa chỉ giữ chỗ lọt vào mã.
  const ph = code.match(/https?:\/\/[^"'` )]*(placehold|placeholder|example\.com|mock)[^"'` )]*/gi);
  if (ph) report(file, "Địa chỉ giữ chỗ", [...new Set(ph)].join(", "));

  // 4. Ô nhập và nút không gắn với việc gì.
  //    Một <Select> không onChange, không name, không value là ô chết: người
  //    dùng bấm vào và không có gì xảy ra, mà không có lỗi nào để lần ra.
  const controls = [...code.matchAll(/<(Select|Input|Textarea|Checkbox|Switch)\b([^>]*)>/g)];
  const dead = controls
    .filter(([, , attrs]) => !/\bon[A-Z]\w*=|(\s|^)name=|(\s|^)value=|defaultValue=|\{\.\.\./.test(attrs))
    .map(([, tag]) => tag);
  if (dead.length) {
    report(file, "Ô nhập không gắn với việc gì", `${dead.length} ô: ${[...new Set(dead)].join(", ")}`);
  }

  // 5. Component hiển thị danh sách nhưng không lấy dữ liệu từ đâu và cũng
  //    không nhận qua props.
  const showsList = /\.map\s*\(\s*\(?\s*\w+/.test(code) && /<(table|tbody|ul|DataTable)\b/i.test(code);
  const getsData = /fetch\s*\(|use[A-Z]\w*Query|props\.|\}\s*:\s*\{[^}]*\[\]/.test(code)
    || /\(\s*\{[^}]*\}\s*:\s*\{[\s\S]{0,400}\[\]/.test(code);
  if (showsList && !getsData) {
    report(file, "Hiển thị danh sách mà không có nguồn dữ liệu", "không fetch, không nhận qua props");
  }
}

console.info("\n=== verify:wired (màn hình có thật sự nối vào đâu không) ===\n");
console.info(`  Đã quét ${files.length} tệp trong ${SCAN_DIRS.join(", ")}\n`);

if (findings.length === 0) {
  console.info("  Sạch — không thấy màn hình giả nào.\n");
  process.exit(0);
}

const byFile = new Map();
for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

for (const [file, list] of byFile) {
  console.error(`  ${file}`);
  for (const f of list) console.error(`      ${f.rule}: ${f.detail}`);
  console.error("");
}

console.error(`${findings.length} dấu hiệu trên ${byFile.size} tệp.\n`);
console.error("Màn hình biên dịch được không có nghĩa là nó làm được việc gì.\n");
process.exit(1);
