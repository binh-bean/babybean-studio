#!/usr/bin/env node
/**
 * verify-ownership — checks that changed files fall inside one agent's lane.
 *
 * OWNER: PM. Agents run it, they do not edit it.
 *
 * Why this exists: AGENTS.md §3 has had a file-ownership matrix from day one,
 * and it did not stop SEC-ARCH from editing scripts/db-seed.mjs six times
 * while DEV-BE was live in the same file. A rule nothing enforces is a
 * suggestion. This turns the matrix into a command that fails.
 *
 * Usage:
 *   npm run verify:own -- SEC-ARCH                 judge every pending change
 *   npm run verify:own                             report who owns each file
 *   npm run verify:own -- SEC-ARCH --base main     only what this branch changed
 *   npm run verify:own -- SEC-ARCH --only a.ts b.ts   only the files named
 *
 * Exit 0 = clean. Exit 1 = something is outside the lane.
 *
 * One thing this tool cannot solve by itself: when several agents share a
 * working directory, git cannot tell whose edit is whose, so each agent sees
 * the others' files as violations. Give every agent its own worktree and pass
 * --base, or pass --only with the files that agent actually touched.
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import { AGENT_NAMES, ownersOf, isCommon, isProtected } from "./ownership.mjs";

const argv = process.argv.slice(2);
const agent = argv.find((a) => !a.startsWith("--"));

const baseIndex = argv.indexOf("--base");
const base = baseIndex !== -1 ? argv[baseIndex + 1] : null;

const onlyIndex = argv.indexOf("--only");
const only = onlyIndex !== -1
  ? argv.slice(onlyIndex + 1).filter((a) => !a.startsWith("--"))
  : null;

if (agent && !AGENT_NAMES.includes(agent)) {
  console.error(`Không biết agent "${agent}".`);
  console.error(`Tên hợp lệ: ${AGENT_NAMES.join(", ")}`);
  process.exit(2);
}

/**
 * The files to judge.
 *
 *   --only   an explicit list, for when the caller knows what it touched
 *   --base   everything this branch changed since <base> — the right answer
 *            once each agent has its own worktree
 *   default  working tree + staged + untracked, which is all git can offer
 *            while several agents share one directory
 */
function changedFiles() {
  if (only) return [...new Set(only)].sort();

  const spec = base ? `git diff --name-only ${base}...HEAD` : "git diff --name-only HEAD";
  const tracked = execSync(spec, { encoding: "utf8" });
  const untracked = base
    ? ""
    : execSync("git ls-files --others --exclude-standard", { encoding: "utf8" });

  const split = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [...new Set([...split(tracked), ...split(untracked)])].sort();
}

const files = changedFiles();

if (files.length === 0) {
  console.info("\nKhông có file nào thay đổi.\n");
  process.exit(0);
}

const scope = only ? "danh sách chỉ định" : base ? `so với ${base}` : "toàn bộ cây làm việc";

// --- report mode: who owns what -------------------------------------------

if (!agent) {
  console.info(`\n=== ${files.length} file đang thay đổi (${scope}) ===\n`);
  for (const f of files) {
    const owners = isProtected(f) ? ["PM (bảo vệ)"] : isCommon(f) ? ["mọi agent"] : ownersOf(f);
    console.info(`  ${f.padEnd(46)} ${owners.length ? owners.join(", ") : "KHÔNG AI SỞ HỮU"}`);
  }
  console.info("\nChạy kèm tên agent để kiểm, ví dụ: npm run verify:own -- SEC-ARCH\n");
  process.exit(0);
}

// --- gate mode ------------------------------------------------------------

const violations = [];
const orphans = [];
const allowed = [];

for (const f of files) {
  // PM owns everything, including the rules and the gates themselves.
  if (agent === "PM") {
    allowed.push(f);
  } else if (isProtected(f)) {
    violations.push({ file: f, owners: ["PM"], why: "file được bảo vệ, chỉ PM sửa" });
  } else if (isCommon(f)) {
    allowed.push(f);
  } else {
    const owners = ownersOf(f);
    if (owners.length === 0) {
      // Not a violation on its own — but nobody has been made responsible for
      // it, so the matrix needs a line before this file grows a history.
      orphans.push(f);
    } else if (owners.includes(agent)) {
      allowed.push(f);
    } else {
      violations.push({ file: f, owners, why: `thuộc ${owners.join(", ")}` });
    }
  }
}

console.info(`\n=== verify:own — kiểm cho ${agent} (${scope}) ===\n`);
console.info(`  Trong vùng      : ${allowed.length} file`);
console.info(`  Ngoài vùng      : ${violations.length} file`);
console.info(`  Chưa ai sở hữu  : ${orphans.length} file\n`);

if (violations.length) {
  console.error("  NGOÀI VÙNG SỞ HỮU:");
  for (const v of violations) {
    console.error(`    ${v.file}`);
    console.error(`      -> ${v.why}`);
  }
  console.error("");
}

if (orphans.length) {
  console.warn("  CHƯA CÓ CHỦ (thêm vào scripts/ownership.mjs và AGENTS.md §3):");
  for (const f of orphans) console.warn(`    ${f}`);
  console.warn("");
}

// --- semantic collisions the path matrix cannot see ------------------------

/**
 * Three agents now write db/migrations/. Two of them working in separate
 * worktrees will happily both pick 0003 and neither git nor the path matrix
 * will notice, because no file is edited twice — two different files simply
 * claim the same position in the order.
 */
function duplicateMigrationNumbers() {
  let entries;
  try {
    entries = fs.readdirSync("db/migrations").filter((f) => f.endsWith(".sql"));
  } catch {
    return [];
  }
  const byNumber = new Map();
  for (const f of entries) {
    const n = f.match(/^(\d{4})-/)?.[1];
    if (!n) continue;
    byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
  }
  return [...byNumber.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([n, list]) => `số ${n} bị dùng ${list.length} lần: ${list.join(", ")}`);
}

/**
 * db/policies.sql is a snapshot; production only ever replays db/migrations/.
 * A policy fixed in the snapshot alone reaches bb-dev and stops there. That is
 * how the "accountant can see photos" fix nearly shipped without shipping —
 * it lived in policies.sql and on bb-dev, and in no migration at all.
 */
function policyChangeWithoutMigration() {
  const touchedPolicies = files.includes("db/policies.sql");
  if (!touchedPolicies) return null;
  const addedMigration = files.some((f) => /^db\/migrations\/\d{4}-.+\.sql$/.test(f));
  if (addedMigration) return null;
  return (
    "db/policies.sql đổi nhưng không có file db/migrations/NNNN-*.sql nào kèm theo.\n" +
    "      policies.sql chỉ là ảnh chụp để dựng môi trường mới; production chỉ chạy\n" +
    "      lại migrations. Không có migration thì bản vá này dừng ở bb-dev."
  );
}

const semantic = [];
for (const d of duplicateMigrationNumbers()) {
  semantic.push({ what: "Trùng số migration", detail: d });
}
const orphanPolicy = policyChangeWithoutMigration();
if (orphanPolicy) semantic.push({ what: "Sửa policy mà thiếu migration", detail: orphanPolicy });

if (semantic.length) {
  console.error("  SAI QUY TRÌNH:");
  for (const s of semantic) {
    console.error(`    ${s.what}`);
    console.error(`      -> ${s.detail}`);
  }
  console.error("");
}

if (violations.length && !only && !base) {
  console.error(
    "Lưu ý: đang xét TOÀN BỘ cây làm việc. Nếu có agent khác cùng chạy trong\n" +
    "thư mục này thì file của họ cũng bị tính vào đây. Dùng --only hoặc --base\n" +
    "để chỉ xét đúng phần của bạn.\n",
  );
}

if (violations.length) {
  console.error(
    "Hoàn nguyên các file ngoài vùng, hoặc mở ADR xin đổi ma trận sở hữu.\n" +
    "Sửa file của agent khác trong lúc họ đang làm sẽ ghi đè lên nhau.\n",
  );
}

if (violations.length || semantic.length) process.exit(1);

console.info("Sạch — mọi thay đổi đều trong vùng sở hữu.\n");
