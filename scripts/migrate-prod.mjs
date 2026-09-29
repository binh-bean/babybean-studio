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
 * 1. **Đo trước, đo sau.** In chín mốc kiểm, so với trạng thái bb-dev. Không đo
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
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd } from "./lib/moi-truong.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goc = path.resolve(__dirname, "..");

const thucThi = process.argv.includes("--thuc-thi");
const boQuaSaoLuu = process.argv.includes("--bo-qua-sao-luu");

/**
 * Áp cả khi chín mốc đều xanh.
 *
 * Chín mốc chỉ biết những thứ chúng được dạy để đo. Migration mới thêm vào DAY
 * — ví dụ 0051 và 0052 ngày 21/09 — không có mốc nào canh, nên script sẽ báo
 * "không có gì phải vá" rồi thoát, và tệp mới không bao giờ được áp. Cờ này để
 * áp cả dãy khi biết rõ mình vừa thêm tệp.
 */
const epAp = process.argv.includes("--ep-ap");

/**
 * Mốc bắt đầu của dãy migrate-prod biết áp: `0045` là tệp NGAY SAU baseline mà
 * `setup-prod.mjs` (schema + 0001..0044) đã dựng lên bb-prod ngày 16/09/2026 —
 * xem docs/18 §2.0. Những tệp 0001–0044 không nằm trong dãy này vì chúng thuộc
 * về ảnh chụp `db/schema.sql` + lượt setup ban đầu, không phải "khoảng lệch"
 * migrate-prod được sinh ra để vá.
 */
const TU_TEP = "0045-";

/**
 * BB-315 — trước đây DAY là một mảng gõ TAY, và mỗi migration mới (0054..0075,
 * rồi các tệp BB-31x sau này) đòi một lượt sửa tay ở đây — quên sửa là
 * `migrate-prod` báo "không có gì phải vá" trong khi tệp mới chưa từng chạy
 * trên bb-prod. Nay đọc THẲNG từ `db/migrations/`, sắp theo tên tệp — cùng thư
 * mục là nguồn sự thật duy nhất, không còn bản sao có thể lệch nhau.
 *
 * Điều kiện để một tệp được coi là an toàn đưa vào đây VẪN như cũ (xem đầu
 * tệp): phải chạy lại được nhiều lần mà kết quả không đổi. Đó là quy ước của
 * đội, không phải điều gì hàm này kiểm được — người viết migration chịu trách
 * nhiệm giữ quy ước đó.
 */
export function danhSachMigrationCanAp(gocRepo = goc, tuTep = TU_TEP) {
  const thuMuc = path.join(gocRepo, "db", "migrations");
  return fs
    .readdirSync(thuMuc)
    .filter((t) => t.endsWith(".sql") && t >= tuTep)
    .sort();
}

const DAY = danhSachMigrationCanAp();

/** Chín mốc kiểm. `dat` nhận kết quả đo và trả true khi nó khớp bb-dev. */
export const MOC = [
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
    /**
     * Hỏi bằng oid lấy từ pg_proc, KHÔNG bằng tên.
     *
     * `has_function_privilege('public','public.check_staff_deletable(uuid)','execute')`
     * NÉM LỖI khi hàm chưa tồn tại, và `coalesce` không đỡ được lỗi — nó chỉ đỡ
     * `null`. Đo bb-prod ngày 21/09/2026 sập đúng ở đây: hàm chưa có, cả script
     * chết giữa chừng, sáu mốc còn lại không mốc nào được in ra.
     *
     * Dạng này không có hàm thì không có dòng nào, `coalesce` trả false — tức
     * "PUBLIC không gọi được", đúng với sự thật là chẳng có gì để gọi.
     */
    sql: `select coalesce((
            select has_function_privilege('public', p.oid, 'execute')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname='check_staff_deletable'
            limit 1), false) ok`,
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
    /**
     * Khung nhìn KHÔNG bị RLS chặn.
     *
     * `v_share_links` và `v_staff_deletable` không phải `security_invoker`, nên
     * chúng chạy bằng quyền của chủ khung nhìn: ai select được là đọc thẳng qua
     * đầu mọi chính sách RLS của `share_links` và `staff_profiles`. Đo cả họ
     * khung nhìn chứ không đo đích danh hai cái — mốc này phải bắt được cả
     * khung nhìn chưa ai viết.
     */
    ten: "Khung nhìn: anon trắng tay, không ai ghi",
    /**
     * Ba việc bị coi là hỏng, gom vào một con số:
     *   · anon có bất kỳ quyền gì trên bất kỳ khung nhìn nào;
     *   · authenticated GHI được qua khung nhìn (khung nhìn phẳng là tự động
     *     ghi được, và ghi qua đó là đi vòng qua RLS của bảng gốc);
     *   · authenticated ĐỌC được hai khung nhìn quản trị — chỉ service_role cần.
     *
     * Ba khung nhìn báo cáo vẫn để authenticated đọc, đúng như bb-dev.
     */
    sql: `select count(*)::int n
            from information_schema.role_table_grants
           where table_schema='public'
             and table_name in (select viewname from pg_views where schemaname='public')
             and (
               grantee = 'anon'
               or (grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE'))
               or (grantee = 'authenticated' and privilege_type = 'SELECT'
                   and table_name in ('v_share_links','v_staff_deletable'))
             )`,
    doc: (r) => (r.n ? `${r.n} quyền đang mở` : "đã khoá"),
    dat: (r) => r.n === 0,
    hong: "Khung nhìn mở cho anon là đi vòng qua RLS — đọc thẳng link và nhân sự của mọi chi nhánh.",
  },
  {
    /**
     * Quyền MẶC ĐỊNH, tức quyền một bảng/khung nhìn nhận được lúc chào đời.
     * Đây là chỗ đã sinh ra hai mốc hỏng ở trên: 0045 và 0047 tạo khung nhìn
     * mới, và trên bb-prod chúng sinh ra với anon = đọc/ghi/xoá.
     */
    ten: "Vật sinh sau không tự mở cho anon",
    sql: `select coalesce((
            select array_to_string(d.defaclacl, ' ')
              from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
             where n.nspname='public' and d.defaclobjtype='r'
               and pg_get_userbyid(d.defaclrole)='postgres'
             limit 1), '') acl`,
    doc: (r) => {
      const q = /anon=([^/]*)/.exec(r.acl)?.[1] ?? "";
      return /[arwd]/.test(q) ? `anon mặc định có "${q}"` : "đã thu hồi";
    },
    dat: (r) => !/[arwd]/.test(/anon=([^/]*)/.exec(r.acl)?.[1] ?? ""),
    hong: "Bảng và khung nhìn nào sinh ra sau cũng mở sẵn cho anon, không ai phải cấp.",
  },
  {
    ten: "settings chat.page_url",
    sql: `select count(*)::int n from settings where key='chat.page_url'`,
    doc: (r) => (r.n ? "có" : "THIẾU"),
    dat: (r) => r.n >= 1,
    hong: "Thiếu thì nút 'Nhắn cho studio' của ba mẹ biến mất, không báo lỗi.",
  },
];

/**
 * Một mốc đo hỏng thì chỉ mốc đó hỏng.
 *
 * Bản đầu để lỗi của một câu truy vấn ném thẳng ra ngoài, và lần đo bb-prod đầu
 * tiên chết ngay ở mốc thứ ba — sáu mốc còn lại không ai biết. Với một script
 * mà cả công dụng là "nói cho tôi biết đang thiếu những gì", đó là hỏng đúng
 * chỗ tệ nhất.
 */
export async function doMoc(client) {
  const ketQua = [];
  for (const m of MOC) {
    try {
      const r = (await client.query(m.sql)).rows[0];
      ketQua.push({ moc: m, so: m.doc(r), dat: m.dat(r) });
    } catch (e) {
      ketQua.push({ moc: m, so: `KHÔNG ĐO ĐƯỢC — ${e.message}`, dat: false });
    }
  }
  return ketQua;
}

export function inBang(tieuDe, ketQua) {
  console.log(`\n${tieuDe}`);
  for (const k of ketQua) {
    console.log(`  ${k.dat ? "OK " : "-- "} ${k.moc.ten.padEnd(38)} ${k.so}`);
  }
}

// ============================================================================
// BB-315 (cố vấn CV-01, lỗi chặn C1) — theo dõi TỆP đã áp, không chỉ đo cấu
// trúc bằng chín mốc.
//
// Chín mốc ở trên chỉ canh 0045–0050 — chạy đúng runbook cũ trên bb-prod (đã
// có 0045–0050 từ 21/09) sẽ báo "chín mốc đều OK" rồi THOÁT, và 0051→0075
// không bao giờ được áp. Bảng `public.schema_migrations` (xem migration mới
// `0076-bang-theo-doi-migration-da-ap.sql` — VIẾT nhưng KHÔNG áp trong phạm
// vi sửa lỗi này) cho một nguồn sự thật khác: đúng tên tệp nào đã chạy thành
// công trên CHÍNH cơ sở dữ liệu này.
// ============================================================================

/** Câu SQL y hệt trong 0076 — lặp lại có chủ đích, xem ghi chú đầu tệp migration đó. */
const SQL_BANG_THEO_DOI = `
create table if not exists public.schema_migrations (
  ten    text primary key,
  ap_luc timestamptz not null default now()
);
`;

/**
 * Đảm bảo bảng theo dõi tồn tại — chạy NGAY ĐẦU mỗi lượt, không đợi tới lúc
 * dãy áp chạy tới số 0076. Idempotent, không cần giao dịch riêng.
 */
export async function damBaoBangTheoDoi(client) {
  await client.query(SQL_BANG_THEO_DOI);
}

/** Tên các tệp đã áp thành công trên CHÍNH cơ sở dữ liệu đang nối, đọc từ bảng theo dõi. */
export async function layTenDaAp(client) {
  await damBaoBangTheoDoi(client);
  const { rows } = await client.query(`select ten from public.schema_migrations`);
  return new Set(rows.map((r) => r.ten));
}

/**
 * BB-315 lượt 3 (cố vấn CV-01) — biến thể CHỈ ĐỌC của `layTenDaAp()`, KHÔNG
 * tự tạo bảng theo dõi. Dùng cho `so-sanh-migration.mjs`: công cụ đó tự nhận
 * là "chỉ đọc" (`db:so-migration`), nhưng gọi `layTenDaAp()` thẳng lên CẢ
 * NGUỒN LẪN ĐÍCH lại âm thầm CHẠY `create table if not exists` trên nguồn —
 * một lệnh ghi trong một công cụ hứa chỉ đọc, kể cả khi nguồn là bb-dev (nơi
 * không ai chạy `migrate-prod` nên bảng đó sẽ mãi rỗng, làm cột "nguồn" của
 * lượt so sánh vô nghĩa).
 *
 * Trả `{ tonTai: false }` nếu bảng chưa tồn tại — không đoán, không tạo.
 */
export async function layTenDaApChiDoc(client) {
  const { rows } = await client.query(
    `select count(*)::int n from pg_tables where schemaname = 'public' and tablename = 'schema_migrations'`,
  );
  if (rows[0].n === 0) return { tonTai: false, daAp: new Set() };
  const { rows: tenRows } = await client.query(`select ten from public.schema_migrations`);
  return { tonTai: true, daAp: new Set(tenRows.map((r) => r.ten)) };
}

/**
 * Tệp nào trong `dayDayDu` CHƯA có trong `daApSet` — logic thuần, phép thử
 * dùng thẳng không cần kết nối gì.
 */
export function tepConThieu(dayDayDu, daApSet) {
  return dayDayDu.filter((t) => !daApSet.has(t));
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu SUPABASE_DB_URL. Chạy kèm --env-file=.env.prod.local (hoặc .env.local).");
    process.exit(1);
  }

  // BB-315: in mã dự án + tên môi trường TRƯỚC MỌI bước, từ chối mã lạ — cùng
  // chốt dùng ở nap-lai-tu-lark.mjs và chep-cau-hinh.mjs, một nguồn sự thật.
  inMoiTruong(dbUrl);
  const ktMoiTruong = kiemTraMoiTruongChoPhep(dbUrl);
  if (!ktMoiTruong.choPhep) {
    console.error(ktMoiTruong.ly_do);
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const dem = (
    await client.query(
      `select (select count(*) from galleries) bo_anh, (select count(*) from staff_profiles) nhan_su`
    )
  ).rows[0];
  console.log(`Đang giữ: ${dem.bo_anh} bộ ảnh, ${dem.nhan_su} nhân sự.`);

  const truoc = await doMoc(client);
  inBang("TRƯỚC KHI VÁ (chín mốc — chỉ để THAM KHẢO, không quyết định áp gì)", truoc);

  const thieu = truoc.filter((k) => !k.dat);
  if (thieu.length) {
    console.log(`\n${thieu.length}/9 mốc chưa đạt. Hậu quả nếu cắt sang mà chưa vá:`);
    for (const k of thieu) console.log(`  · ${k.moc.hong}`);
  } else {
    console.log("\nChín mốc đều khớp bb-dev — nhưng đây chỉ là 9 điểm đo, không phải toàn bộ dãy migration.");
  }

  // BB-315 (lỗi chặn C1): quyết định áp gì dựa vào BẢNG THEO DÕI TỆP ĐÃ ÁP,
  // không dựa vào chín mốc — chín mốc chỉ canh 0045–0050, và trước đây khiến
  // script thoát "không có gì phải vá" ngay cả khi 0051–0075 chưa hề chạy.
  const daAp = await layTenDaAp(client);
  const dayThatSu = epAp ? DAY : tepConThieu(DAY, daAp);

  if (dayThatSu.length === 0) {
    console.log(`\nKhông có gì phải vá — cả ${DAY.length} tệp trong dãy (${TU_TEP} trở lên) đã có trong bảng theo dõi.`);
    console.log("Vừa thêm migration mới? Nó tự nằm trong dãy (đọc động từ db/migrations/) — không cần --ep-ap trừ khi muốn CHẠY LẠI cả những tệp đã ghi nhận.");
    await client.end();
    process.exit(0);
  }

  console.log(`\n${dayThatSu.length}/${DAY.length} tệp CHƯA có trong bảng theo dõi — đây mới là danh sách SẼ áp:`);
  for (const t of dayThatSu) console.log(`  ${t}`);

  if (!thucThi) {
    console.log(`\nChế độ SOI — chưa ghi gì cả.`);
    console.log(`\nMuốn áp thật: chạy lại kèm --thuc-thi.`);
    await client.end();
    process.exit(0);
  }

  // --- từ đây là ghi thật ---------------------------------------------------
  const ktGhi = kiemTraCoBbProd(dbUrl, process.argv.includes("--that-su-la-bb-prod"));
  if (!ktGhi.choPhep) {
    console.error(ktGhi.ly_do);
    await client.end();
    process.exit(2);
  }

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

  for (const ten of dayThatSu) {
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
      // Ghi vào bảng theo dõi TRONG CÙNG giao dịch với chính tệp đó: tệp gãy
      // thì cả hai cùng hoàn nguyên (không ghi nhận "đã áp" một tệp thật ra
      // đã rollback); tệp thành công thì cả hai cùng commit.
      await client.query(
        `insert into public.schema_migrations (ten) values ($1) on conflict (ten) do nothing`,
        [ten],
      );
      await client.query("commit");
      console.log("xong");
    } catch (e) {
      await client.query("rollback");
      console.log("GÃY");
      console.error(`\n${ten} không áp được: ${e.message}`);
      console.error("Đã hoàn nguyên đúng tệp này. Những tệp trước đó vẫn giữ nguyên (đã ghi vào bảng theo dõi).");
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
  console.log("\nChín mốc đều đạt. Bước tiếp: npm run verify:db, rồi mở màn Nhân sự xem thật.");
}

// BB-315: file này giờ có thể bị IMPORT (so-sanh-migration.mjs dùng lại MOC,
// doMoc, danhSachMigrationCanAp). Không được để việc import kéo theo chạy
// main() — main() nối thật và có thể GHI vào một cơ sở dữ liệu thật. Chỉ chạy
// khi tệp này được gọi trực tiếp bằng `node migrate-prod.mjs`, cùng cách
// nap-lai-tu-lark.mjs đã dùng.
const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
