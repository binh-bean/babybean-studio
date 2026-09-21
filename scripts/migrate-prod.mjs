#!/usr/bin/env node
/**
 * migrate-prod — áp một dãy migration lên một cơ sở dữ liệu ĐÃ CÓ DỮ LIỆU THẬT.
 *
 * OWNER: PM. Sinh ra từ mục 2.0 của `docs/18-bang-kiem-bb-prod.md`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần thêm một script nữa, đã có db-push và setup-prod rồi
 * ---------------------------------------------------------------------------
 * `db:push` cố tình TỪ CHỐI chạy trên production: `schema.sql` là ảnh chụp toàn
 * bộ, áp lên một cơ sở dữ liệu đang chạy là đánh nhau với những gì đã có ở đó.
 * `setup-prod` thì dành cho một cơ sở dữ liệu TRỐNG.
 *
 * Còn thiếu đúng một việc ở giữa: bb-prod đã có hàng trăm nhà thật, và đang
 * chậm hơn bb-dev vài migration. Trước hôm nay việc đó phải làm bằng tay, dán
 * từng tệp SQL vào ô SQL Editor — nghĩa là không ai kiểm tra trước, không ai đo
 * lại sau, và không có gì bắt buộc phải sao lưu.
 *
 * ---------------------------------------------------------------------------
 * Ba điều script này bảo đảm
 * ---------------------------------------------------------------------------
 * 1. **Đo trước, đo sau.** In bảy mốc kiểm, so với trạng thái bb-dev. Không đo
 *    được thì không áp.
 * 2. **Mặc định KHÔNG ghi gì.** Chạy trần là chế độ soi. Muốn ghi phải gõ hẳn
 *    `--thuc-thi`.
 * 3. **Sao lưu trước khi ghi.** Tự gọi `scripts/backup.mjs` bằng đúng khoá đang
 *    dùng. Bỏ qua được, nhưng phải gõ `--bo-qua-sao-luu` và script sẽ nói to.
 *
 * Mọi migration trong dãy đều chạy lại được nhiều lần mà kết quả không đổi
 * (`if exists`, `or replace`, `on conflict do nothing`) — đó là điều kiện để
 * một tệp được đưa vào DAY dưới đây.
 *
 * ---------------------------------------------------------------------------
 * Cách chạy
 * ---------------------------------------------------------------------------
 *   # diễn tập trên bb-dev (không đụng khoá prod)
 *   node --env-file=.env.local      scripts/migrate-prod.mjs
 *
 *   # soi bb-prod — chỉ đọc, không ghi
 *   node --env-file=.env.prod.local scripts/migrate-prod.mjs
 *
 *   # áp thật (chủ studio duyệt rồi mới chạy)
 *   node --env-file=.env.prod.local scripts/migrate-prod.mjs --thuc-thi
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goc = path.resolve(__dirname, "..");

const thucThi = process.argv.includes("--thuc-thi");
const boQuaSaoLuu = process.argv.includes("--bo-qua-sao-luu");

/**
 * Dãy migration bb-prod đang thiếu, theo đúng thứ tự phải áp.
 *
 * 0045 dựng lại `v_share_links` và `create_gallery_bundle` rồi mới bỏ cột PIN —
 * đảo thứ tự là gãy. 0048 phải đứng sau 0047 vì nó thu hồi lại quyền mà chính
 * 0047 lỡ cấp cho PUBLIC.
 */
const DAY = [
  "0045-bo-ma-pin.sql",
  "0046-link-ttl.sql",
  "0047-xoa-nhan-su.sql",
  "0048-khoa-lai-check-staff-deletable.sql",
  "0049-dong-chat-page-url.sql",
];

/** Bảy mốc kiểm. `dat` nhận kết quả đo và trả true khi nó khớp bb-dev. */
const MOC = [
  {
    ten: "Khung nhìn public.v_staff_deletable",
    sql: `select count(*)::int n from pg_views where schemaname='public' and viewname='v_staff_deletable'`,
    doc: (r) => (r.n ? "có" : "THIẾU"),
    dat: (r) => r.n === 1,
    hong: "Màn Nhân sự truy vấn khung nhìn này. Thiếu -> danh sách hỏng trong im lặng.",
  },
  {
    ten: "Hàm public.check_staff_deletable",
    sql: `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
          where ns.nspname='public' and p.proname='check_staff_deletable'`,
    doc: (r) => (r.n ? "có" : "THIẾU"),
    dat: (r) => r.n === 1,
    hong: "Không có hàm thì khung nhìn ở trên cũng không dựng được.",
  },
  {
    ten: "PUBLIC KHÔNG gọi được hàm đó",
    sql: `select coalesce(
            (select has_function_privilege('public','public.check_staff_deletable(uuid)','execute')), false) ok`,
    doc: (r) => (r.ok ? "GỌI ĐƯỢC — hở" : "đã khoá"),
    dat: (r) => r.ok === false,
    hong: "Hàm SECURITY DEFINER mà PUBLIC gọi được là đi vòng qua lớp kiểm quyền (BB-189).",
  },
  {
    ten: "Cặp app.* lạc ngoài migration",
    sql: `select (select count(*) from pg_views where schemaname='app' and viewname='v_staff_deletable')
               + (select count(*) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
                  where ns.nspname='app' and p.proname='check_staff_deletable') as n`,
    doc: (r) => (Number(r.n) ? `còn ${r.n} vật lạc` : "sạch"),
    dat: (r) => Number(r.n) === 0,
    hong: "Bản sao trong schema app không ai bảo trì — 0048 dọn nó đi.",
  },
  {
    ten: "Cột mã PIN đã bỏ (0045)",
    sql: `select count(*)::int n from information_schema.columns
          where table_schema='public' and table_name='share_links'
            and column_name in ('requires_pin','pin_hash','failed_attempts','locked_until')`,
    doc: (r) => (r.n ? `còn ${r.n} cột thừa` : "đã bỏ"),
    dat: (r) => r.n === 0,
    hong: "Cột thừa không làm hỏng gì hôm nay, nhưng mã đã thôi đọc chúng từ BB-169.",
  },
  {
    ten: "settings gallery.link_ttl_days",
    sql: `select count(*)::int n from settings where key='gallery.link_ttl_days'`,
    doc: (r) => (r.n ? "có" : "THIẾU"),
    dat: (r) => r.n >= 1,
    hong: "Thiếu thì hạn link rơi về số 60 nằm trong mã — không ai đổi được qua giao diện.",
  },
  {
    ten: "settings chat.page_url",
    sql: `select count(*)::int n from settings where key='chat.page_url'`,
    doc: (r) => (r.n ? "có" : "THIẾU"),
    dat: (r) => r.n >= 1,
    hong: "Thiếu thì nút 'Nhắn cho studio' của ba mẹ biến mất, không báo lỗi.",
  },
];

/** Nhãn ngắn để người chạy biết mình đang nối vào đâu — không in khoá. */
function nhanDb() {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = u.replace(/^https:\/\/([a-z0-9]+).*/, "$1");
  return ref && ref !== u ? `${ref.slice(0, 6)}…supabase.co` : "không rõ";
}

async function doMoc(client) {
  const ketQua = [];
  for (const m of MOC) {
    const r = (await client.query(m.sql)).rows[0];
    ketQua.push({ moc: m, so: m.doc(r), dat: m.dat(r) });
  }
  return ketQua;
}

function inBang(tieuDe, ketQua) {
  console.log(`\n${tieuDe}`);
  for (const k of ketQua) {
    console.log(`  ${k.dat ? "OK " : "-- "} ${k.moc.ten.padEnd(38)} ${k.so}`);
  }
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu SUPABASE_DB_URL. Chạy kèm --env-file=.env.prod.local (hoặc .env.local).");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  console.log(`Cơ sở dữ liệu: ${nhanDb()}`);
  const dem = (
    await client.query(
      `select (select count(*) from galleries) bo_anh, (select count(*) from staff_profiles) nhan_su`
    )
  ).rows[0];
  console.log(`Đang giữ: ${dem.bo_anh} bộ ảnh, ${dem.nhan_su} nhân sự.`);

  const truoc = await doMoc(client);
  inBang("TRƯỚC KHI VÁ", truoc);

  const thieu = truoc.filter((k) => !k.dat);
  if (thieu.length === 0) {
    console.log("\nKhông có gì phải vá — bảy mốc đều khớp bb-dev.");
    await client.end();
    process.exit(0);
  }

  console.log(`\n${thieu.length} mốc chưa đạt. Hậu quả nếu cắt sang mà chưa vá:`);
  for (const k of thieu) console.log(`  · ${k.moc.hong}`);

  if (!thucThi) {
    console.log(`\nChế độ SOI — chưa ghi gì cả. Sẽ áp ${DAY.length} tệp, theo thứ tự:`);
    for (const t of DAY) console.log(`  ${t}`);
    console.log(`\nMuốn áp thật: chạy lại kèm --thuc-thi.`);
    await client.end();
    process.exit(0);
  }

  // --- từ đây là ghi thật ---------------------------------------------------
  if (boQuaSaoLuu) {
    console.log("\n!!! BỎ QUA SAO LƯU. Nếu đây là bb-prod thì đang không có đường lùi.");
  } else {
    console.log("\nSao lưu trước đã…");
    const r = spawnSync(process.execPath, [path.join(__dirname, "backup.mjs")], {
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) {
      console.error("Sao lưu KHÔNG xong. Dừng — không áp migration khi chưa có đường lùi.");
      await client.end();
      process.exit(1);
    }
  }

  for (const ten of DAY) {
    const duong = path.join(goc, "db", "migrations", ten);
    if (!fs.existsSync(duong)) {
      console.error(`Không thấy ${ten}. Dừng ở đây; những tệp trước đã áp xong.`);
      await client.end();
      process.exit(1);
    }
    const sql = fs.readFileSync(duong, "utf8");
    process.stdout.write(`  áp ${ten} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("xong");
    } catch (e) {
      await client.query("rollback");
      console.log("GÃY");
      console.error(`\n${ten} không áp được: ${e.message}`);
      console.error("Đã hoàn nguyên đúng tệp này. Những tệp trước đó vẫn giữ nguyên.");
      await client.end();
      process.exit(1);
    }
  }

  const sau = await doMoc(client);
  inBang("SAU KHI VÁ", sau);
  await client.end();

  const conThieu = sau.filter((k) => !k.dat);
  if (conThieu.length) {
    console.error(`\nCòn ${conThieu.length} mốc chưa đạt. KHÔNG được coi là xong.`);
    process.exit(1);
  }
  console.log("\nBảy mốc đều đạt. Bước tiếp: npm run verify:db, rồi mở màn Nhân sự xem thật.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
