#!/usr/bin/env node
/**
 * so-sanh-migration — CHỈ ĐỌC. So hai môi trường (nguồn/đích) xem đích đang
 * thiếu gì: chín mốc migration của `migrate-prod.mjs`, danh sách tệp migration
 * ứng viên, và cấu trúc Storage (bucket + policy) — không đọc dữ liệu.
 *
 * OWNER: DEV-OPS. Task BB-315.
 *
 * ---------------------------------------------------------------------------
 * Dùng lại logic của migrate-prod.mjs, không viết lại
 * ---------------------------------------------------------------------------
 * `MOC` (chín mốc) và `doMoc()` import thẳng từ `migrate-prod.mjs` — một nguồn
 * sự thật cho "cái gì gọi là đã vá xong". `danhSachMigrationCanAp()` cũng vậy:
 * migrate-prod áp đúng dãy tệp mà công cụ này liệt kê, không còn một danh sách
 * gõ tay nào có thể lệch khỏi danh sách kia.
 *
 * migrate-prod.mjs được IMPORT ở đây, không CHẠY — tệp đó tự chặn việc main()
 * chạy khi bị import (xem cuối tệp đó), nên import an toàn.
 *
 * ---------------------------------------------------------------------------
 * Vì sao thêm phần Storage vào một công cụ tên "migration"
 * ---------------------------------------------------------------------------
 * Bucket `thumbnails` và các policy Storage của nó không nằm trong
 * `db/migrations/` — bucket tạo qua Admin API (tự tạo lười khi có ảnh đầu tiên
 * cần đệm, xem `src/lib/drive/lam-nong-cache.ts`), còn policy Storage là RLS
 * trên `storage.objects`, không phải một bảng `public.*` mà các mốc kia đọc
 * được. bb-prod hôm nay 0 ảnh, 0 lượt ghi đệm — nghĩa là bucket đó CHƯA từng
 * được tạo ở bb-prod. Runbook `docs/26` cần một cách ĐO việc này thay vì đoán,
 * nên gộp vào đây — cùng hai kết nối (nguồn/đích) đã mở sẵn cho phần migration.
 *
 * ---------------------------------------------------------------------------
 * Cách chạy
 * ---------------------------------------------------------------------------
 *   node --import tsx scripts/so-sanh-migration.mjs --dich .env.prod.local
 *   node --import tsx scripts/so-sanh-migration.mjs --nguon .env.local --dich .env.prod.local
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { docTepEnv } from "./lib/doc-tep-env.mjs";
import { inMoiTruong, kiemTraMoiTruongChoPhep } from "./lib/moi-truong.mjs";
import { MOC, doMoc, danhSachMigrationCanAp } from "./migrate-prod.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = path.resolve(__dirname, "..");

// ============================================================================
// Logic thuần — kiểm bằng phép thử đơn vị thẳng, không cần DB thật.
// ============================================================================

/** So chín mốc của hai kết quả doMoc() đã đo sẵn (mảng {moc, so, dat}). */
export function soSanhMoc(ketQuaNguon, ketQuaDich) {
  return MOC.map((m, i) => ({
    ten: m.ten,
    nguon: ketQuaNguon[i]?.so ?? "?",
    dich: ketQuaDich[i]?.so ?? "?",
    dichDatNhuNguon: (ketQuaDich[i]?.dat ?? false) === true || ketQuaNguon[i]?.dat !== true,
    dichThieu: ketQuaNguon[i]?.dat === true && ketQuaDich[i]?.dat !== true,
  }));
}

/** So hai danh sách tên (bucket, hoặc "bảng.policy") — trả cái đích thiếu / cái đích thừa. */
export function soSanhTenDanhSach(dsNguon, dsDich) {
  const tapNguon = new Set(dsNguon);
  const tapDich = new Set(dsDich);
  return {
    thieuODich: [...tapNguon].filter((t) => !tapDich.has(t)).sort(),
    thuaODich: [...tapDich].filter((t) => !tapNguon.has(t)).sort(),
  };
}

/** Rút "bảng.policy" từ kết quả truy vấn pg_policies, để soSanhTenDanhSach() dùng chung với bucket. */
export function tenChinhSach(chinhSachRows) {
  return chinhSachRows.map((p) => `${p.tablename}.${p.policyname}`);
}

// ============================================================================
// Lớp truy cập DB / Storage — không unit test trực tiếp phần này.
// ============================================================================

function layTepMoiTruong(duong, nhan) {
  const bien = docTepEnv(path.resolve(GOC_REPO, duong));
  if (!bien) {
    console.error(`Không thấy tệp môi trường (${nhan}): ${path.resolve(GOC_REPO, duong)}`);
    process.exit(2);
  }
  return bien;
}

async function ketNoiPg(bien, nhan) {
  const dbUrl = bien.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(`Thiếu SUPABASE_DB_URL trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  return { client, dbUrl };
}

function taoAdminStorage(bien, nhan) {
  const url = bien.NEXT_PUBLIC_SUPABASE_URL;
  const key = bien.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function layDanhSachBucket(admin) {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  return (data ?? []).map((b) => b.id).sort();
}

async function layChinhSachStorage(client) {
  const { rows } = await client.query(
    `select tablename, policyname, cmd, roles::text[] as roles
       from pg_policies
      where schemaname = 'storage'
      order by tablename, policyname`,
  );
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (ten, macDinh) => {
    const i = argv.indexOf(ten);
    return i !== -1 ? argv[i + 1] : macDinh;
  };
  const duongNguon = arg("--nguon", ".env.local");
  const duongDich = arg("--dich", null);
  if (!duongDich) {
    console.error("Thiếu --dich <đường dẫn tệp môi trường>. Ví dụ: --dich .env.prod.local");
    process.exit(2);
  }

  const bienNguon = layTepMoiTruong(duongNguon, "nguồn");
  const bienDich = layTepMoiTruong(duongDich, "đích");
  const { client: pgNguon, dbUrl: dbUrlNguon } = await ketNoiPg(bienNguon, "nguồn");
  const { client: pgDich, dbUrl: dbUrlDich } = await ketNoiPg(bienDich, "đích");

  try {
    console.log("Nguồn:");
    inMoiTruong(dbUrlNguon);
    console.log("Đích:");
    inMoiTruong(dbUrlDich);

    for (const [nhan, url] of [
      ["nguồn", dbUrlNguon],
      ["đích", dbUrlDich],
    ]) {
      const kt = kiemTraMoiTruongChoPhep(url);
      if (!kt.choPhep) {
        console.error(`(${nhan}) ${kt.ly_do}`);
        process.exit(2);
      }
    }

    // --- chín mốc migration --------------------------------------------------
    const [mocNguon, mocDich] = await Promise.all([doMoc(pgNguon), doMoc(pgDich)]);
    const soMoc = soSanhMoc(mocNguon, mocDich);
    console.log("\nChín mốc migration (nguồn vs đích):");
    for (const s of soMoc) {
      console.log(`  ${s.dichThieu ? "THIẾU" : "OK   "} ${s.ten.padEnd(38)} nguồn=${s.nguon}  đích=${s.dich}`);
    }
    const soMocThieu = soMoc.filter((s) => s.dichThieu);

    // --- danh sách tệp ứng viên (thông tin, KHÔNG phải xác nhận theo từng tệp) --
    const dsMigration = danhSachMigrationCanAp();
    console.log(
      `\nDanh sách tệp migrate-prod --thuc-thi SẼ áp lên đích nếu chạy (đọc trực ` +
        `tiếp từ db/migrations/, không phải mảng gõ tay — luôn khớp thư mục thật):`,
    );
    for (const t of dsMigration) console.log(`  ${t}`);

    // --- Storage: bucket + policy --------------------------------------------
    const adminNguon = taoAdminStorage(bienNguon, "nguồn");
    const adminDich = taoAdminStorage(bienDich, "đích");
    const [bucketNguon, bucketDich, chinhSachNguon, chinhSachDich] = await Promise.all([
      layDanhSachBucket(adminNguon),
      layDanhSachBucket(adminDich),
      layChinhSachStorage(pgNguon),
      layChinhSachStorage(pgDich),
    ]);

    const soBucket = soSanhTenDanhSach(bucketNguon, bucketDich);
    console.log("\nBucket Storage:");
    console.log(`  nguồn: ${bucketNguon.join(", ") || "(không có)"}`);
    console.log(`  đích : ${bucketDich.join(", ") || "(không có)"}`);
    if (soBucket.thieuODich.length) console.log(`  ĐÍCH THIẾU: ${soBucket.thieuODich.join(", ")}`);
    if (soBucket.thuaODich.length) console.log(`  đích thừa (nguồn không có): ${soBucket.thuaODich.join(", ")}`);

    const soChinhSach = soSanhTenDanhSach(tenChinhSach(chinhSachNguon), tenChinhSach(chinhSachDich));
    console.log("\nPolicy Storage (storage.objects/storage.buckets):");
    console.log(`  nguồn: ${chinhSachNguon.length} policy`);
    console.log(`  đích : ${chinhSachDich.length} policy`);
    if (soChinhSach.thieuODich.length) {
      console.log(`  ĐÍCH THIẾU:`);
      for (const t of soChinhSach.thieuODich) console.log(`    ${t}`);
    }
    if (soChinhSach.thuaODich.length) {
      console.log(`  đích thừa (nguồn không có):`);
      for (const t of soChinhSach.thuaODich) console.log(`    ${t}`);
    }

    // --- tổng kết --------------------------------------------------------------
    console.log("\n--- Tổng kết ---");
    console.log(`Mốc migration đích còn thiếu : ${soMocThieu.length}/${MOC.length}`);
    console.log(`Tệp migration ứng viên       : ${dsMigration.length}`);
    console.log(`Bucket đích còn thiếu        : ${soBucket.thieuODich.length}`);
    console.log(`Policy Storage đích còn thiếu: ${soChinhSach.thieuODich.length}`);
    if (soMocThieu.length === 0 && soBucket.thieuODich.length === 0 && soChinhSach.thieuODich.length === 0) {
      console.log("\nĐích đã khớp nguồn ở mọi mốc đo được.");
    } else {
      console.log(
        "\nCòn lệch. Với migration: chạy `npm run db:migrate:prod` (đọc trước, " +
          "--thuc-thi sau khi duyệt). Với Storage: bucket tự tạo khi có ảnh đầu " +
          "tiên cần đệm, nhưng POLICY thì không tự có — xem docs/26 mục Storage.",
      );
    }
  } finally {
    await pgNguon.end();
    await pgDich.end();
  }
}

const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
