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
 *   npm run verify:own -- SEC-ARCH     check changes belong to SEC-ARCH
 *   npm run verify:own                 report who owns each changed file
 *
 * Exit 0 = clean. Exit 1 = something is outside the lane.
 */

import { execSync } from "node:child_process";
import { AGENT_NAMES, ownersOf, isCommon, isProtected } from "./ownership.mjs";

const agent = process.argv[2];

if (agent && !AGENT_NAMES.includes(agent)) {
  console.error(`Không biết agent "${agent}".`);
  console.error(`Tên hợp lệ: ${AGENT_NAMES.join(", ")}`);
  process.exit(2);
}

/** Working-tree and staged changes against HEAD, plus untracked files. */
function changedFiles() {
  const tracked = execSync("git diff --name-only HEAD", { encoding: "utf8" });
  const untracked = execSync("git ls-files --others --exclude-standard", { encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.split("\n").map((s) => s.trim()).filter(Boolean))]
    .sort();
}

const files = changedFiles();

if (files.length === 0) {
  console.info("\nKhông có file nào thay đổi.\n");
  process.exit(0);
}

// --- report mode: who owns what -------------------------------------------

if (!agent) {
  console.info(`\n=== ${files.length} file đang thay đổi ===\n`);
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

console.info(`\n=== verify:own — kiểm cho ${agent} ===\n`);
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

if (violations.length) {
  console.error(
    "Hoàn nguyên các file ngoài vùng, hoặc mở ADR xin đổi ma trận sở hữu.\n" +
    "Sửa file của agent khác trong lúc họ đang làm sẽ ghi đè lên nhau.\n",
  );
  process.exit(1);
}

console.info("Sạch — mọi thay đổi đều trong vùng sở hữu.\n");
