#!/usr/bin/env node
/**
 * verify-build — asserts that the FILES the build produced are actually right.
 *
 * OWNER: PM / reviewer gate. Agents run it, they do not edit it.
 *
 * Why this exists: `next build` exiting 0 only means the compiler was happy.
 * On 2026-09-10 the build was green, every test passed, and production was
 * serving `font-family: "Be Vietnam Pro"` while never fetching a single font
 * file — the CSS optimizer had silently dropped the @import. Nothing failed.
 * A gate that reads the compiler's opinion is not a gate; this one reads the
 * output.
 *
 * Two questions it answers:
 *   1. Did any secret get baked into a file the browser downloads?
 *   2. Does the CSS name fonts that are never actually loaded?
 *
 * Exit code 0 = every check passed.
 *
 * Usage:  npm run verify:build     (run `npm run build` first)
 */

import fs from "node:fs";
import path from "node:path";

const NEXT_DIR = ".next";
const CLIENT_DIR = path.join(NEXT_DIR, "static");
const TOKENS_CSS = "src/styles/tokens.css";

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

/** Never print a secret. Enough to identify which variable, nothing more. */
const mask = (name) => name;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Secret = any variable in the environment contract that is not NEXT_PUBLIC_.
 * Reading the list from .env.example rather than hardcoding it means a new
 * secret added later is covered without anyone remembering to update this file.
 */
function secretVarNames() {
  if (!fs.existsSync(".env.example")) return [];
  return fs
    .readFileSync(".env.example", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter(Boolean)
    .filter((n) => !n.startsWith("NEXT_PUBLIC_"));
}

function main() {
  // --- the build actually ran ---------------------------------------------

  const hasBuild = fs.existsSync(path.join(NEXT_DIR, "BUILD_ID"));
  check("Có sản phẩm build", hasBuild, hasBuild ? ".next/BUILD_ID" : "chạy `npm run build` trước");
  if (!hasBuild) return report();

  const clientFiles = walk(CLIENT_DIR);
  check("Có file gửi xuống trình duyệt", clientFiles.length > 0, `${clientFiles.length} file`);

  // --- 1. no secret reaches the browser -----------------------------------

  const names = secretVarNames();
  const secrets = names
    .map((name) => ({ name, value: process.env[name] }))
    // Short values are words, not keys; matching them would cry wolf forever.
    .filter((s) => s.value && s.value.length >= 12);

  check(
    "Đọc được danh sách biến bí mật",
    names.length > 0,
    `${names.length} biến trong .env.example, ${secrets.length} biến có giá trị để đối chiếu`,
  );

  const pubIsLegacyJwt = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").startsWith("eyJ");

  const leaked = [];
  for (const file of clientFiles) {
    if (!/\.(js|css|json|map|txt|html)$/i.test(file)) continue;
    const body = fs.readFileSync(file, "utf8");
    for (const s of secrets) {
      if (body.includes(s.value)) leaked.push(`${mask(s.name)} → ${file}`);
    }
  }
  check(
    "Không có bí mật nào lọt vào bundle trình duyệt",
    leaked.length === 0,
    leaked.length ? leaked.join(" | ") : `đã quét ${clientFiles.length} file`,
  );

  // Values only catch secrets this machine happens to hold — locally that is a
  // handful of the seventeen. Shapes catch the rest, including a key pasted in
  // by hand that never had an environment variable at all.
  const SECRET_SHAPES = [
    [/sb_secret_[A-Za-z0-9_-]{10,}/, "khoá secret Supabase (sb_secret_…)"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key PEM"],
    [/postgres(?:ql)?:\/\/[^\s"']*:[^\s"'@]+@/, "chuỗi kết nối Postgres kèm mật khẩu"],
    [/AIza[A-Za-z0-9_-]{30,}/, "khoá API Google (AIza…)"],
    [/service_role/, 'chuỗi "service_role"'],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT ba đoạn"],
  ];

  const shapeHits = [];
  for (const file of clientFiles) {
    if (!/\.(js|css|json|map|txt|html)$/i.test(file)) continue;
    const body = fs.readFileSync(file, "utf8");
    for (const [re, label] of SECRET_SHAPES) {
      // The publishable key is a JWT under the legacy naming scheme and is
      // supposed to ship; do not report the thing we deliberately send.
      if (re.source.startsWith("eyJ") && pubIsLegacyJwt) continue;
      if (re.test(body)) shapeHits.push(`${label} → ${file}`);
    }
  }
  check(
    "Không có chuỗi mang hình dạng bí mật",
    shapeHits.length === 0,
    shapeHits.length ? shapeHits.join(" | ") : `${SECRET_SHAPES.length} mẫu, sạch`,
  );

  // The one key that IS meant to be public must be the publishable kind.
  // A service_role key here would hand every visitor the whole database.
  const pub = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  check(
    "Khoá Supabase công khai đúng loại publishable",
    pub.startsWith("sb_publishable_") || pub.startsWith("eyJ"),
    pub ? `bắt đầu bằng "${pub.slice(0, 15)}…"` : "chưa đặt biến",
  );
  check(
    "Khoá công khai KHÔNG phải khoá bí mật",
    !pub.startsWith("sb_secret_") && !pub.includes("service_role"),
    "",
  );

  // --- 2. fonts that are named must also be loaded ------------------------

  const cssFiles = clientFiles.filter((f) => f.endsWith(".css"));
  const css = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  check("Có file CSS đã build", cssFiles.length > 0, `${cssFiles.length} file`);

  // Families the design system asks for, read from the source of truth so this
  // keeps working when DEV-UI changes the typeface.
  const declared = fs.existsSync(TOKENS_CSS)
    ? [...new Set(
        [...fs.readFileSync(TOKENS_CSS, "utf8").matchAll(/["']([A-Z][A-Za-z ]{3,30})["']/g)]
          .map((m) => m[1])
          .filter((f) => /[a-z]/.test(f) && f.includes(" ")),
      )]
    : [];

  const unloadable = [];
  for (const family of declared) {
    if (!css.includes(family)) continue; // not shipped at all — nothing to check
    const hasFontFace = new RegExp(`@font-face[^}]*${family}`, "s").test(css);
    const hasImport = /@import[^;]*fonts\.googleapis\.com/.test(css);
    if (!hasFontFace && !hasImport) unloadable.push(family);
  }
  check(
    "Font được khai báo đều thật sự được nạp",
    unloadable.length === 0,
    unloadable.length
      ? `KHAI MÀ KHÔNG NẠP: ${unloadable.join(", ")} — khách sẽ thấy font hệ thống`
      : declared.length
        ? `đã đối chiếu ${declared.length} font`
        : "không tìm thấy font tuỳ chỉnh nào trong tokens.css",
  );

  report();
}

function report() {
  const failed = results.filter((r) => !r.pass);
  console.info("\n=== verify:build (đọc sản phẩm build, không đọc lời trình biên dịch) ===\n");
  for (const r of results) {
    console.info(`  ${r.pass ? "ĐẠT " : "HỎNG"}  ${r.name.padEnd(46)} ${r.detail}`);
  }
  console.info(`\n${results.length - failed.length}/${results.length} đạt\n`);
  if (failed.length) {
    console.error("Chưa đạt. Build xanh không có nghĩa là kết quả đúng.\n");
    process.exit(1);
  }
}

main();
