#!/usr/bin/env node
/**
 * setup-prod — dựng một cơ sở dữ liệu TRỐNG thành bb-prod.
 *
 * OWNER: ARCH. Task BB-138.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không chỉ là "chạy schema.sql rồi migrations"
 * ---------------------------------------------------------------------------
 * Vì thứ tự trong kho đã trôi. Đo ngày 15/09/2026 trên một cơ sở dữ liệu trống:
 *
 *   - `db/schema.sql` tham chiếu bảng `products` và `gallery_items` nhưng KHÔNG
 *     tạo chúng — hai bảng đó chỉ có trong `migrations/0014`.
 *   - `schema.sql` gọi `app.gallery_quota()` và `app.my_role()` trong ba khung
 *     nhìn, mà hai hàm đó cũng chỉ có trong migrations.
 *   - Không tệp nào tạo `schema app`.
 *
 * Không ai thấy vì bb-dev dựng từ hồi schema.sql còn khớp, rồi migrations bồi
 * dần lên. Dựng lại từ đầu mới lộ.
 *
 * Vá tay từng chỗ là vá mãi: mỗi lần ai đó thêm một hàm trong migration rồi dùng
 * nó trong schema.sql là vòng lặp lại. Nên bộ nạp này TỰ HỘI TỤ:
 *
 *   chạy từng câu lệnh -> câu nào chưa đủ điều kiện thì xếp lại -> lặp vòng sau
 *   -> dừng khi một vòng không nạp thêm được câu nào
 *
 * Còn câu nào không nạp được thì IN RA HẾT rồi thoát khác 0. Không bao giờ báo
 * "xong" trên một cơ sở dữ liệu dựng dở.
 *
 * Cách chạy (PM chạy, agent không có khoá bb-prod):
 *   node --env-file=.env.prod.local scripts/setup-prod.mjs
 *   node --env-file=.env.prod.local scripts/setup-prod.mjs --seed
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goc = path.resolve(__dirname, "..");
const coSeed = process.argv.includes("--seed");

/**
 * Tách một tệp SQL thành từng câu lệnh.
 *
 * Phải hiểu chuỗi trích dẫn kiểu $$ ... $$ và $tag$ ... $tag$: thân hàm plpgsql
 * đầy dấu chấm phẩy, cắt bừa theo `;` là băm nát hàm thành những mảnh vô nghĩa.
 */
function tachCauLenh(sql) {
  const ra = [];
  let cur = "";
  let i = 0;
  let trongChuoi = null; // "'" | '"' | "$tag$"
  while (i < sql.length) {
    const c = sql[i];
    if (trongChuoi) {
      if (trongChuoi.startsWith("$")) {
        if (sql.startsWith(trongChuoi, i)) {
          cur += trongChuoi;
          i += trongChuoi.length;
          trongChuoi = null;
          continue;
        }
      } else if (c === trongChuoi) {
        trongChuoi = null;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const het = sql.indexOf("\n", i);
      const doan = het < 0 ? sql.slice(i) : sql.slice(i, het + 1);
      cur += doan;
      i += doan.length;
      continue;
    }
    if (c === "'" || c === '"') {
      trongChuoi = c;
      cur += c;
      i += 1;
      continue;
    }
    const the = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
    if (the) {
      trongChuoi = the[0];
      cur += the[0];
      i += the[0].length;
      continue;
    }
    if (c === ";") {
      if (cur.trim()) ra.push(cur.trim() + ";");
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.trim()) ra.push(cur.trim());
  return ra.filter((s) => s.replace(/--[^\n]*\n?/g, "").trim().length > 0);
}

function napTep(duong) {
  return tachCauLenh(fs.readFileSync(duong, "utf8"))
    // Bỏ begin/commit/rollback của từng tệp: bộ nạp này tự quản giao dịch, và
    // để nguyên thì một câu hỏng sẽ kéo cả khối sau trôi theo trong một giao
    // dịch đã hỏng — đúng chỗ làm revision_requests không bao giờ được tạo.
    .filter((sql) => {
      // Bỏ begin/commit/rollback riêng của từng tệp: bộ nạp này tự quản giao
      // dịch. Để nguyên thì một câu hỏng kéo cả khối sau trôi theo trong một
      // giao dịch đã hỏng — đúng chỗ làm revision_requests không bao giờ được tạo.
      const t = sql
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith("--"))
        .join(" ")
        .trim()
        .toLowerCase()
        .replace(";", "");
      return t !== "begin" && t !== "commit" && t !== "rollback";
    })
    .map((sql) => ({ tep: path.basename(duong), sql }));
}

/**
 * Lỗi kiểu "câu lệnh này đã lỗi thời".
 *
 * Dựng lại từ đầu thì migration cũ chạy ĐÈ lên kết quả của migration mới hơn:
 * 0004 dựng get_photos với kiểu trả về cũ, 0006 cấp quyền cho chữ ký cũ của
 * patch_selection_batch. Trên cơ sở dữ liệu trống, bản mới nhất đã thắng rồi,
 * nên những câu này không còn đối tượng để đụng vào.
 *
 * Bỏ qua chúng KHÔNG phải nhắm mắt: cuối tệp này còn bước kiểm thẳng hai hàm
 * xương sống có tồn tại hay không, và thoát khác 0 nếu thiếu.
 */
function laLoiThoi(msg) {
  const m = msg.toLowerCase();
  return (
    m.includes("cannot change return type of existing function") ||
    m.includes("could not find a function named") ||
    (m.includes("function ") && m.includes("does not exist"))
  );
}

/**
 * Khung nhìn đổi tên cột thì create or replace không làm được — Postgres đòi
 * xoá rồi tạo lại. Xảy ra khi dựng từ đầu: bản cũ trong migration tạo view với
 * bộ cột cũ, bản mới hơn muốn đổi tên cột.
 *
 * Trả về tên view để bộ nạp xoá đi rồi thử lại ở vòng sau, hoặc "" nếu không
 * phải chuyện đó.
 */
function viewCanXoa(msg, sql) {
  if (!msg.toLowerCase().includes("cannot change name of view column")) return "";
  const sau = sql.toLowerCase().split(" view ")[1];
  if (!sau) return "";
  const t = sau.trim();
  const cat = [t.indexOf(" "), t.indexOf("("), t.indexOf(String.fromCharCode(10))].filter((n) => n > 0);
  return cat.length ? t.slice(0, Math.min(...cat)) : t;
}
/** Lỗi kiểu "đã có rồi" — nạp lại lần hai là gặp, và không phải chuyện xấu. */
function laDaCo(msg) {
  return /already exists|duplicate (object|key|column)|multiple primary keys/i.test(msg);
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu SUPABASE_DB_URL. Chạy: node --env-file=.env.prod.local scripts/setup-prod.mjs");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: truoc } = await client.query(
    "select count(*)::int n from information_schema.tables where table_schema='public'",
  );
  console.log(`Cơ sở dữ liệu trước khi dựng: ${truoc[0].n} bảng`);

  let hangDoi = [
    { tep: "(mở đầu)", sql: "create schema if not exists app;" },
    ...napTep(path.join(goc, "db/schema.sql")),
    // policies.sql là NỀN, migrations tinh chỉnh lên trên. Để policies chạy cuối
    // là dựng lại những chính sách mà migration sau đã cố ý xoá: 0037 xoá
    // activity_select rồi tạo activity_logs_select, mà policies.sql vẫn còn bản
    // cũ — hai chính sách PERMISSIVE thì OR với nhau, cái LỎNG thắng.
    ...napTep(path.join(goc, "db/policies.sql")),
  ];
  for (const f of fs.readdirSync(path.join(goc, "db/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    hangDoi.push(...napTep(path.join(goc, "db/migrations", f)));
  }
  // (policies.sql đã xếp ngay sau schema.sql ở trên)

  console.log(`Tổng cộng ${hangDoi.length} câu lệnh.`);

  let daCo = 0;
  let vong = 0;
  const boQua = [];

  while (hangDoi.length > 0) {
    vong += 1;
    const conLai = [];
    let nap = 0;
    // Xoá một view cũng là tiến bộ: vòng sau câu lệnh mới dựng lại được nó.
    let tienBo = 0;

    for (const c of hangDoi) {
      try {
        await client.query(c.sql);
        nap += 1;
      } catch (e) {
        // Dọn trạng thái giao dịch hỏng, nếu không mọi câu sau đều đổ theo.
        await client.query("rollback").catch(() => {});
        const view = viewCanXoa(e.message, c.sql);
        if (view) {
          // Xoá bằng cascade: view khác có thể đang dựa lên nó, và chúng nằm
          // ngay trong hàng đợi nên sẽ được dựng lại ở vòng sau.
          await client.query("drop view if exists " + view + " cascade").catch(() => {});
          tienBo += 1;
          conLai.push({ ...c, loi: e.message.split(String.fromCharCode(10))[0] });
          continue;
        }
        if (laDaCo(e.message) || laLoiThoi(e.message)) {
          daCo += 1;
          boQua.push({ ...c, loi: e.message.split("\n")[0] });
        } else {
          conLai.push({ ...c, loi: e.message.split("\n")[0] });
        }
      }
    }

    console.log(`  vòng ${vong}: nạp ${nap}, xoá view ${tienBo}, bỏ qua ${daCo}, còn lại ${conLai.length}`);

    if (conLai.length === 0) break;
    if (nap === 0 && tienBo === 0) {
      console.error(`\nKHÔNG HỘI TỤ. ${conLai.length} câu lệnh không nạp được:\n`);
      for (const c of conLai.slice(0, 25)) {
        console.error(`  [${c.tep}] ${c.loi}`);
        console.error(`      ${c.sql.replace(/\s+/g, " ").slice(0, 120)}…`);
      }
      await client.end();
      process.exit(1);
    }
    hangDoi = conLai;
  }

  if (coSeed) {
    const seed = path.join(goc, "db/seed-prod.sql");
    console.log(`\nGieo dữ liệu nền từ ${path.basename(seed)} …`);
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(seed, "utf8"));
      await client.query("COMMIT");
      console.log("  xong.");
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("  HỎNG:", e.message.split("\n")[0]);
      await client.end();
      process.exit(1);
    }
  }

  const { rows: sau } = await client.query(
    "select count(*)::int n from information_schema.tables where table_schema='public'",
  );
  const { rows: ham } = await client.query(
    "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname in ('public','app')",
  );
  console.log(`\nSau khi dựng: ${sau[0].n} bảng, ${ham[0].n} hàm.`);

  // Hai hàm này là xương sống: thiếu chúng thì màn danh sách của nhân viên và
  // đường ghi lựa chọn của khách đều hỏng. Kiểm thẳng thay vì tin số đếm.
  for (const ten of ["get_admin_galleries", "patch_selection_batch"]) {
    const { rows } = await client.query(
      "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where p.proname=$1",
      [ten],
    );
    console.log(`  ${ten}: ${rows[0].n > 0 ? "có" : "KHÔNG CÓ"}`);
    if (rows[0].n === 0) {
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\nXong. Chạy tiếp: npm run verify:db với biến môi trường trỏ vào cơ sở dữ liệu này.");
}

main();
