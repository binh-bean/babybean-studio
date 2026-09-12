#!/usr/bin/env node
/**
 * Đồng bộ bảng Hậu Kỳ từ Lark Base xuống bảng galleries (BB-111).
 * OWNER: DEV-INT. Task BB-111.
 *
 * MỘT CHIỀU. Lark là nguồn sự thật ở chặng này; script KHÔNG bao giờ ghi
 * ngược lên Lark. Nhân viên copy link app và dán tay vào cột "Link app" bên Lark.
 *
 * Chạy:  npm run sync:retouch              xem trước, không ghi gì
 *        npm run sync:retouch -- --write   ghi thật
 *
 * ---------------------------------------------------------------------------
 * Điều kiện kích hoạt:
 * ---------------------------------------------------------------------------
 *   1. Có bản ghi trong bảng Hậu Kỳ
 *   2. Cột "Link ảnh gửi khách" CÓ NỘI DUNG
 *   Khi đó album hiện trong màn quản lý của app (status = 'draft').
 *
 * ---------------------------------------------------------------------------
 * Hai cột mới bên Lark:
 * ---------------------------------------------------------------------------
 *   "Lấy link app"  ô tích  — nhân viên tích để báo app dựng link
 *   "Link app"      chữ     — nhân viên DÁN TAY link đã tạo vào
 *
 * ---------------------------------------------------------------------------
 * An toàn dữ liệu:
 * ---------------------------------------------------------------------------
 *   Repo công khai. Bảng được tìm theo TÊN lúc chạy, không hardcode table_id.
 *   Không import tên, SĐT thật của khách hàng vào bb-dev.
 */

import pg from "pg";
import {
  larkAuth,
  readLarkTable,
  syncSingleRetouchRecord,
} from "../src/lib/lark/sync-retouch.ts";

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`Thiếu biến môi trường ${n}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  return v;
};

async function main() {
  const write = process.argv.includes("--write");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) || 50 : null;

  const baseToken = need("LARK_BASE_APP_TOKEN");
  const dbUrl = need("SUPABASE_DB_URL");
  const isProduction = /prod/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

  console.log("=== ĐỒNG BỘ BẢNG HẬU KỲ TỪ LARK SANG APP (BB-111) ===");
  console.log(`Chế độ: ${write ? "GHI THẬT (--write)" : "XEM TRƯỚC (dry-run)"}`);
  console.log(`Môi trường: ${isProduction ? "PRODUCTION" : "DEV / STAGING"}\n`);

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // 1. Nạp danh mục chi nhánh từ DB
    const { rows: branchRows } = await client.query(`select id, code, name from branches where is_active = true`);
    if (!branchRows.length) {
      throw new Error("Không có chi nhánh nào trong database!");
    }
    console.log(`Chi nhánh hệ thống: ${branchRows.map((b) => b.name).join(", ")}`);

    // 2. Nạp nhân sự từ DB để gán thợ ảnh / CSKH / editor nếu có
    const { rows: staffRows } = await client.query(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`,
    );
    console.log(`Nhân sự hệ thống: ${staffRows.length} người.`);

    // 3. Đọc bảng Hậu Kỳ từ Lark Base
    const auth = await larkAuth(need("LARK_APP_ID"), need("LARK_APP_SECRET"));
    console.log("Đã xác thực với Lark API thành công.");

    const { tableName, records } = await readLarkTable(auth, baseToken, /h[aậ]u\s*k[yỳ]/i);
    console.log(`Đã đọc bảng "${tableName}": ${records.length} bản ghi.\n`);

    let createdCount = 0;
    let skippedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    const targetRecords = limit ? records.slice(0, limit) : records;

    for (let i = 0; i < targetRecords.length; i++) {
      const record = targetRecords[i];
      try {
        const res = await syncSingleRetouchRecord({
          client,
          record,
          branches: branchRows,
          staffList: staffRows,
          isProduction,
          write,
          index: i,
        });

        if (res.action === "created") {
          createdCount++;
          console.log(`  [TẠO ALBUM] ${res.title}`);
          console.log(`              Drive Folder ID: ${res.driveFolderId}`);
          console.log(`              Chi tiết: ${res.reason}`);
        } else if (res.action === "already_exists") {
          existingCount++;
        } else if (res.action === "skipped") {
          skippedCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`  [LỖI] Bản ghi ${record.record_id}: ${err.message}`);
      }
    }

    console.log("\n=== TỔNG KẾT ===");
    console.log(`Tổng số bản ghi xử lý : ${targetRecords.length}`);
    console.log(`Tạo mới album nháp    : ${createdCount}`);
    console.log(`Đã tồn tại trước đó   : ${existingCount}`);
    console.log(`Bỏ qua (chưa có ảnh)  : ${skippedCount}`);
    console.log(`Lỗi                   : ${errorCount}`);

    if (!write && createdCount > 0) {
      console.log("\n-> Thêm cờ -- --write để thực hiện ghi thật vào database.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Lỗi thực thi:", err.message);
  process.exit(1);
});
