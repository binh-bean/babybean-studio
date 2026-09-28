#!/usr/bin/env node
/**
 * kiem-ban-sao-luu — kiểm một bản sao lưu đã mã hoá (.sql.enc) mở được và đủ
 * dữ liệu, KHÔNG để lộ dữ liệu khách.
 *
 * Giải mã ra một tệp tạm trong thư mục tạm của hệ điều hành, chỉ ĐẾM số dòng
 * `insert into public."<bảng>"` theo từng bảng, in số đếm, rồi xoá tệp tạm
 * ngay (kể cả khi lỗi). Không in tên, số điện thoại hay nội dung nào.
 *
 *   PowerShell:  $env:BACKUP_PASSPHRASE = "<mật khẩu>"; npm run db:kiem-sao-luu -- "D:\tai-ve\sao-luu-....sql.enc"
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const vao = process.argv[2];
if (!vao) {
  console.error('Thiếu đường dẫn tệp. Ví dụ: npm run db:kiem-sao-luu -- "D:\\tai-ve\\sao-luu-2026-09-29.sql.enc"');
  process.exit(1);
}
if (!process.env.BACKUP_PASSPHRASE) {
  console.error('Thiếu mật khẩu. PowerShell: $env:BACKUP_PASSPHRASE = "<mật khẩu>" rồi chạy lại.');
  process.exit(1);
}

const tam = path.join(os.tmpdir(), `bb-kiem-sao-luu-${process.pid}-${Date.now()}.sql`);
try {
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, "ma-hoa-sao-luu.mjs"), "giai-ma", vao, tam], {
    stdio: ["ignore", "ignore", "pipe"],
    env: process.env,
  });
  if (r.status !== 0) {
    console.error("KHÔNG mở được bản sao lưu:");
    console.error(String(r.stderr || "").trim());
    process.exit(1);
  }
  const dem = new Map();
  const noiDung = fs.readFileSync(tam, "utf8");
  for (const m of noiDung.matchAll(/^insert into public\."([a-z_0-9]+)"/gim)) {
    dem.set(m[1], (dem.get(m[1]) || 0) + 1);
  }
  const tongByte = Buffer.byteLength(noiDung);
  console.log(`\nMở được bản sao lưu: ${path.basename(vao)} (${(tongByte / 1024 / 1024).toFixed(1)} MB sau giải mã)\n`);
  const bang = [...dem.entries()].sort((a, b) => b[1] - a[1]);
  for (const [ten, n] of bang) console.log(`   ${String(n).padStart(7)}  ${ten}`);
  console.log(`\n   ${bang.length} bảng có dữ liệu.`);
  const canCo = ["customers", "galleries", "photos", "branches", "staff_profiles", "products"];
  const thieu = canCo.filter((b) => !dem.get(b));
  if (thieu.length) {
    console.log(`\nCẢNH BÁO: không thấy dòng nào của bảng ${thieu.join(", ")} — báo Claude kiểm lại.`);
    process.exitCode = 2;
  } else {
    console.log("\nĐẠT: có đủ các bảng chính (khách, bộ ảnh, ảnh, chi nhánh, nhân sự, sản phẩm).");
  }
} finally {
  try { fs.rmSync(tam, { force: true }); } catch { /* tệp tạm đã không có */ }
}
