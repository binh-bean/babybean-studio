import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("=== THIẾT LẬP CƠ SỞ DỮ LIỆU bb-prod ===");

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("❌ SUPABASE_DB_URL không tìm thấy trong biến môi trường.");
    console.error("Vui lòng chạy lệnh: node --env-file=.env.prod scripts/setup-prod.mjs");
    process.exit(1);
  }

  // 1. Run schema and policies push
  console.log("\n--- 1. Đẩy cấu trúc (schema) và phân quyền (policies) ---");
  try {
    // We pass ALLOW_PROD_PUSH=1 so db-push.mjs allows applying to prod.
    execSync('node scripts/db-push.mjs', {
      stdio: 'inherit',
      env: {
        ...process.env,
        ALLOW_PROD_PUSH: '1'
      }
    });
  } catch (e) {
    console.error("❌ Thất bại khi đẩy schema:", e.message);
    process.exit(1);
  }

  // 2. Seed operational constants
  console.log("\n--- 2. Gieo dữ liệu vận hành gốc (branches, packages, settings) ---");
  
  const { Client } = pg;
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    const seedSqlPath = path.resolve(__dirname, '../db/seed-prod.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
    
    await client.query('BEGIN');
    try {
      await client.query(seedSql);
      await client.query('COMMIT');
      console.log("✅ Đã nạp thành công db/seed-prod.sql.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("❌ Lỗi khi nạp db/seed-prod.sql:", e.message);
      process.exit(1);
    }
    
    console.log("\n============================================================");
    console.log("🎉 HOÀN TẤT THIẾT LẬP BB-PROD.");
    console.log("Cơ sở dữ liệu đã sẵn sàng để nhận dữ liệu thật từ Lark.");
    console.log("Vui lòng xem docs/17-bang-kiem-bb-prod.md để thực hiện các bước tiếp theo.");
    console.log("============================================================\n");
  } catch (err) {
    console.error("❌ Lỗi kết nối CSDL:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
