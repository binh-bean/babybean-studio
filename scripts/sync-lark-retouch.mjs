#!/usr/bin/env node
/**
 * Đồng bộ bảng Hậu Kỳ từ Lark Base xuống bảng galleries (BB-111).
 * OWNER: DEV-INT. Task BB-111.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §2 & §7, docs/15-doi-chieu-lark.md §9
 *
 * MỘT CHIỀU. Lark là nguồn sự thật ở chặng này; script KHÔNG bao giờ ghi
 * ngược lên Lark. Nhân viên copy link app và dán tay vào cột "Link app" bên Lark.
 *
 * Chạy:  node --env-file-if-exists=.env.local --import tsx scripts/sync-lark-retouch.mjs            xem trước
 *        node --env-file-if-exists=.env.local --import tsx scripts/sync-lark-retouch.mjs -- --write ghi thật
 *
 * ---------------------------------------------------------------------------
 * Bộ lọc đợt này (docs/16 §7.1 - chủ studio chốt):
 * ---------------------------------------------------------------------------
 * Bỏ 5 trạng thái đã qua khâu in:
 *   "Đã chốt chưa in" · "Đã gửi In" · "Hình đã về" · "Đã Giao" · "Đã CSKH"
 * Dự kiến: 3.177 tổng -> loại 2.680 -> còn 497 -> 443 có "Link ảnh gửi khách".
 *
 * ---------------------------------------------------------------------------
 * Che dữ liệu cá nhân (docs/16 §7.3):
 * ---------------------------------------------------------------------------
 *   customers.full_name        "KH · HD_20250722#572" (chính mã hợp đồng)
 *   customers.phone            null
 *   customers.phone_normalized null
 *   customers.facebook         CHỈ phần URL của ô "Chat với khách" (bỏ text)
 *   customers.zalo             null
 *   customers.note             null
 *   galleries.lark_contract_code  GIỮ NGUYÊN THẬT
 */

import pg from "pg";
import {
  larkAuth,
  readLarkTable,
  checkRetouchTrigger,
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
    const { rows: branchRows } = await client.query(
      `select id, code, name from branches where is_active = true`,
    );
    if (!branchRows.length) {
      throw new Error("Không có chi nhánh nào trong database!");
    }
    console.log(`Chi nhánh hệ thống: ${branchRows.map((b) => b.name).join(", ")}`);

    // 2. Nạp nhân sự từ DB
    const { rows: staffRows } = await client.query(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`,
    );
    console.log(`Nhân sự hệ thống: ${staffRows.length} người.`);

    // 3. Đọc bảng Hậu Kỳ từ Lark Base
    const auth = await larkAuth(need("LARK_APP_ID"), need("LARK_APP_SECRET"));
    console.log("Đã xác thực với Lark API thành công.");

    const { tableName, records } = await readLarkTable(auth, baseToken, /h[aậ]u\s*k[yỳ]/i);
    console.log(`\nĐã đọc bảng "${tableName}": tổng cộng ${records.length} bản ghi.`);

    // 4. Đối chiếu số đo theo docs/16 §7.2
    let excludedStatusCount = 0;
    let remainingCount = 0;
    let hasLinkCount = 0;
    let missingLinkCount = 0;

    const qualifiedRecords = [];

    for (const record of records) {
      const trigger = checkRetouchTrigger(record.fields);
      if (trigger.isStatusExcluded) {
        excludedStatusCount++;
      } else {
        remainingCount++;
        if (trigger.triggered) {
          hasLinkCount++;
          qualifiedRecords.push(record);
        } else {
          missingLinkCount++;
        }
      }
    }

    console.log("\n--- Đối chiếu số liệu theo docs/16 §7.2 ---");
    console.log(`  Tổng bản ghi đọc được       : ${records.length} (kỳ vọng ~3.177)`);
    console.log(`  Bị loại (5 trạng thái qua in): ${excludedStatusCount} (kỳ vọng ~2.680)`);
    console.log(`  Bản ghi còn lại             : ${remainingCount} (kỳ vọng ~497)`);
    console.log(`  CÓ "Link ảnh gửi khách"     : ${hasLinkCount} (kỳ vọng ~443)`);
    console.log(`  Chưa có link ảnh            : ${missingLinkCount} (kỳ vọng ~54)`);

    // Cảnh báo nếu lệch nhiều
    if (Math.abs(hasLinkCount - 443) > 30) {
      console.warn(
        `\n[CẢNH BÁO] Số bản ghi có link ảnh (${hasLinkCount}) lệch nhiều so với con số chốt (443)!`,
      );
    } else {
      console.log(`\n[XÁC NHẬN] Con số khớp với kiểm kê của chủ studio (443 album).`);
    }

    let createdCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    const targetRecords = limit ? qualifiedRecords.slice(0, limit) : qualifiedRecords;
    console.log(`\nBắt đầu xử lý ${targetRecords.length} album...`);

    for (let i = 0; i < targetRecords.length; i++) {
      const record = targetRecords[i];
      try {
        const res = await syncSingleRetouchRecord({
          client,
          record,
          branches: branchRows,
          staffList: staffRows,
          write,
          index: i,
        });

        if (res.action === "created") {
          createdCount++;
          if (createdCount <= 10 || createdCount % 50 === 0 || createdCount === targetRecords.length) {
            console.log(`  [${write ? "ĐÃ TẠO" : "SẼ TẠO"}] ${res.title} (HĐ: ${res.contractCode || "—"})`);
          }
        } else if (res.action === "already_exists") {
          existingCount++;
        }
      } catch (err) {
        errorCount++;
        console.error(`  [LỖI] Bản ghi ${record.record_id}: ${err.message}`);
      }
    }

    console.log("\n=== KẾT QUẢ ĐỒNG BỘ ===");
    console.log(`Bản ghi đủ điều kiện  : ${targetRecords.length}`);
    console.log(`Album mới (${write ? "đã tạo" : "sẽ tạo"}): ${createdCount}`);
    console.log(`Đã tồn tại trước đó   : ${existingCount}`);
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
