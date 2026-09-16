#!/usr/bin/env node
/**
 * backup — kết xuất DỮ LIỆU của một cơ sở dữ liệu ra một tệp .sql.
 *
 * OWNER: DEV-OPS. Spec: docs/11-deployment.md §7.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không dùng pg_dump
 * ---------------------------------------------------------------------------
 * Máy của chủ studio không có pg_dump, không có psql, không có Docker, cũng
 * không có Supabase CLI — đo lại ngày 16/09/2026. Bảo người không lập trình đi
 * cài PostgreSQL client rồi thêm nó vào PATH, mỗi lần đổi máy làm lại, là cách
 * chắc chắn nhất để bản sao lưu không bao giờ được chạy.
 *
 * Kho này đã có `pg` — driver Postgres viết thuần JavaScript, không cần nhị
 * phân nào. Dùng nó thì `npm run db:backup` chạy được ngay trên máy trắng.
 *
 * ---------------------------------------------------------------------------
 * Chỉ sao lưu DỮ LIỆU, không sao lưu cấu trúc. Cố ý.
 * ---------------------------------------------------------------------------
 * Cấu trúc đã nằm trong kho và dựng lại được: `scripts/setup-prod.mjs` áp
 * schema.sql -> policies.sql -> migrations -> seed. Chép cấu trúc thêm lần nữa
 * vào tệp sao lưu là tạo bản thứ hai của cùng một sự thật, rồi hai bản trôi
 * khỏi nhau.
 *
 * Đường phục hồi vì thế có hai bước, ghi sẵn ở đầu mỗi tệp kết xuất.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG sao lưu tài khoản đăng nhập. Biết trước, đừng để phát hiện lúc cháy.
 * ---------------------------------------------------------------------------
 * `staff_profiles.id` là khoá ngoại trỏ sang `auth.users` — schema `auth` của
 * Supabase, không phải `public`. Script này chỉ đọc `public`, nên tệp kết xuất
 * có hồ sơ nhân viên mà KHÔNG có tài khoản đăng nhập của họ.
 *
 * Nghĩa là nạp lại tệp này lên một dự án Supabase trắng sẽ gãy ngay ở
 * `staff_profiles`: id trỏ vào những user chưa tồn tại. Phải tạo lại user trong
 * Authentication trước (docs/18 §2.1), rồi mới nạp.
 *
 * Không tự đọc `auth.users` là cố ý: bảng đó chứa băm mật khẩu và token phiên.
 * Kéo chúng ra một tệp .sql nằm trong thư mục Drive của studio là biến một bản
 * sao lưu thành một vụ lộ mật khẩu.
 *
 * ---------------------------------------------------------------------------
 * Tệp kết xuất KHÔNG ĐƯỢC rơi vào trong kho
 * ---------------------------------------------------------------------------
 * Kho này là public (AGENTS.md §6). Tệp sao lưu bb-prod chứa tên thật và số
 * điện thoại thật của 427 khách. Một lần `git add -A` vô ý là lộ vĩnh viễn —
 * commit sau không gỡ được khỏi lịch sử.
 *
 * Nên script này TỪ CHỐI ghi vào bất cứ đâu bên trong kho, kể cả khi thư mục đó
 * đang nằm trong .gitignore: .gitignore là thoả thuận, không phải hàng rào.
 *
 * ---------------------------------------------------------------------------
 * Thứ tự bảng, và cái vòng giữa galleries với photos
 * ---------------------------------------------------------------------------
 * Nạp `galleries` trước `customers` là gãy khoá ngoại, nên thứ tự đọc từ
 * pg_constraint chứ không giữ danh sách tay — danh sách tay cũ đi ngay lần thêm
 * bảng tiếp theo.
 *
 * Nhưng sơ đồ này có một VÒNG: `photos.gallery_id -> galleries` (bắt buộc) và
 * `galleries.cover_photo_id -> photos` (cho rỗng). Không thứ tự nào thoả mãn cả
 * hai. Cách gỡ: bỏ cột cho-rỗng ra khỏi lượt INSERT, nạp xong hai bảng rồi mới
 * UPDATE nó vào. Script tự tìm vòng và tự chọn cạnh cho-rỗng để cắt.
 *
 * Nếu có vòng mà mọi cạnh trong đó đều BẮT BUỘC thì không cắt được. Lúc đó
 * script DỪNG và không ghi gì — một tệp sao lưu không nạp lại được thì tệ hơn
 * là không có tệp nào, vì nó làm người ta tưởng mình đang được che.
 *
 * Cách chạy:
 *   npm run db:backup                 # cơ sở dữ liệu ở .env.local (bb-dev)
 *   npm run db:backup:prod            # bb-prod, đọc .env.prod.local
 *
 * Đích ghi, theo thứ tự ưu tiên:
 *   --out "D:/duong/dan"    hoặc    biến môi trường BACKUP_DIR
 * Không có cái nào thì ghi ra ../babybean-backups/ cạnh kho.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goc = path.resolve(__dirname, "..");

/** Đích ghi, và cái chốt không cho ghi vào trong kho. */
function thuMucDich() {
  const i = process.argv.indexOf("--out");
  const chon =
    (i !== -1 && process.argv[i + 1]) ||
    process.env.BACKUP_DIR ||
    path.join(path.dirname(goc), "babybean-backups");

  const dich = path.resolve(chon);
  if (dich === goc || dich.startsWith(goc + path.sep)) {
    console.error(
      [
        `Từ chối ghi vào ${dich}`,
        "",
        "Chỗ đó nằm TRONG kho, mà kho này là public. Tệp sao lưu chứa tên và",
        "số điện thoại khách thật — một lần `git add -A` vô ý là lộ vĩnh viễn.",
        "",
        'Chọn chỗ khác: npm run db:backup -- --out "D:/BabyBean-sao-luu"',
      ].join("\n"),
    );
    process.exit(2);
  }
  fs.mkdirSync(dich, { recursive: true });
  return dich;
}

/**
 * Xếp bảng sao cho bảng được trỏ tới đứng trước bảng trỏ đi.
 *
 * Trả về { thuTu, hoanLai }. `hoanLai` là những cột đã bị cắt khỏi sơ đồ để phá
 * vòng: chúng không đi trong INSERT, mà đi trong UPDATE ở cuối tệp.
 *
 * Khoá ngoại tự trỏ vào chính bảng mình (cha con trong cùng bảng, ví dụ
 * `gallery_items.parent_item_id`) thì bỏ qua — nó không nói gì về thứ tự GIỮA
 * các bảng. Trong cùng một bảng, dòng cha có thể đứng sau dòng con, nhưng cả
 * tệp nằm trong MỘT giao dịch nên khoá ngoại chỉ bị soi lúc commit.
 */
function xepTheoKhoaNgoai(bang, canh) {
  const conLai = new Set(bang);
  const daCat = new Set();
  const hoanLai = [];
  const thuTu = [];

  const khoa = (c) => `${c.tu}.${c.cot}`;
  const conSong = () =>
    canh.filter(
      (c) =>
        c.tu !== c.den &&
        conLai.has(c.tu) &&
        conLai.has(c.den) &&
        !daCat.has(khoa(c)),
    );

  while (conLai.size) {
    const song = conSong();
    const biChan = new Set(song.map((c) => c.tu));
    const san = [...conLai].filter((t) => !biChan.has(t)).sort();

    if (san.length) {
      for (const t of san) {
        thuTu.push(t);
        conLai.delete(t);
      }
      continue;
    }

    // Kẹt: mọi bảng còn lại đều đang chờ một bảng còn lại khác. Cắt một cạnh
    // CHO RỖNG rồi đi tiếp. Sắp xếp trước khi chọn để hai lần chạy ra cùng
    // một tệp — sao lưu mà mỗi lần một khác thì không so được hai bản.
    const catDuoc = song
      .filter((c) => !c.buoc)
      .sort((a, b) => khoa(a).localeCompare(khoa(b)))[0];

    if (!catDuoc) {
      const ket = [...conLai].sort().join(", ");
      throw new Error(
        [
          `Vòng khoá ngoại không cắt được, giữa: ${ket}`,
          "",
          "Mọi cạnh trong vòng đều NOT NULL, nên không thứ tự nạp nào hợp lệ.",
          "Không ghi tệp nào — một bản sao lưu không phục hồi được thì tệ hơn",
          "là không có, vì nó làm người ta tưởng mình đang được che.",
          "",
          "Cách gỡ: cho một trong các cột đó nhận null, hoặc khai nó là",
          "DEFERRABLE INITIALLY DEFERRED trong migration.",
        ].join("\n"),
      );
    }

    daCat.add(khoa(catDuoc));
    hoanLai.push({ bang: catDuoc.tu, cot: catDuoc.cot, den: catDuoc.den });
  }

  return { thuTu, hoanLai };
}

function moc() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      [
        "Thiếu SUPABASE_DB_URL.",
        "  bb-dev : npm run db:backup        (đọc .env.local)",
        "  bb-prod: npm run db:backup:prod   (đọc .env.prod.local)",
      ].join("\n"),
    );
    process.exit(2);
  }

  const dich = thuMucDich();

  const u = new URL(dbUrl);
  const client = new pg.Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
  await client.connect();

  // Đọc trong MỘT ảnh chụp nhất quán. Không có nó thì bảng đọc lúc đầu và bảng
  // đọc lúc cuối thuộc hai thời điểm khác nhau, và khoá ngoại giữa chúng có thể
  // trỏ vào dòng chưa kịp có trong bản sao lưu.
  await client.query("begin isolation level repeatable read read only");

  let duong = null;
  try {
    const { rows: bangRows } = await client.query(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const bang = bangRows.map((r) => r.tablename);
    if (!bang.length) throw new Error("Không thấy bảng nào trong schema public.");

    const { rows: canhRows } = await client.query(
      `select r.relname as tu, f.relname as den, a.attname as cot, a.attnotnull as buoc
         from pg_constraint c
         join pg_class r on r.oid = c.conrelid
         join pg_class f on f.oid = c.confrelid
         join pg_namespace n on n.oid = r.relnamespace
         join unnest(c.conkey) k(attnum) on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'f' and n.nspname = 'public'`,
    );

    const { thuTu, hoanLai } = xepTheoKhoaNgoai(bang, canhRows);
    const hoanTheoBang = new Map();
    for (const h of hoanLai) {
      if (!hoanTheoBang.has(h.bang)) hoanTheoBang.set(h.bang, []);
      hoanTheoBang.get(h.bang).push(h.cot);
    }

    const ten = `${u.pathname.slice(1)}-${u.hostname.split(".")[0]}-${moc()}.sql`;
    duong = path.join(dich, ten);
    const out = fs.createWriteStream(duong, { encoding: "utf8" });
    const ghi = (s) => out.write(s + "\n");

    ghi(`-- Sao lưu DỮ LIỆU — ${new Date().toISOString()}`);
    ghi(`-- Máy chủ: ${u.hostname}   Cơ sở dữ liệu: ${u.pathname.slice(1)}`);
    ghi("--");
    ghi("-- CHỨA DỮ LIỆU KHÁCH HÀNG THẬT. Không đẩy tệp này lên GitHub,");
    ghi("-- không gửi qua chat, không để trong thư mục kho.");
    ghi("--");
    ghi("-- Phục hồi, BA bước — tệp này chỉ có dữ liệu của schema public:");
    ghi("--   1) node --env-file=.env.prod.local scripts/setup-prod.mjs");
    ghi("--      (dựng bảng, quyền, hàm, khung nhìn trên một CSDL trống)");
    ghi("--   2) tạo lại tài khoản trong Authentication -> Users, giữ NGUYÊN");
    ghi("--      từng UUID như trong lệnh insert into staff_profiles bên dưới.");
    ghi("--      Tệp này KHÔNG chứa auth.users — không chứa mật khẩu ai cả.");
    ghi("--      Bỏ qua bước này thì bước 3 gãy ngay ở staff_profiles.");
    ghi("--   3) nạp tệp này");
    ghi("--");
    ghi("-- Cả tệp nằm trong MỘT giao dịch: gãy giữa chừng thì hoàn tác sạch,");
    ghi("-- không để lại một cơ sở dữ liệu nạp dở.");
    if (hoanLai.length) {
      ghi("--");
      ghi("-- Các cột sau bị hoãn sang lượt UPDATE ở cuối tệp, vì chúng nằm");
      ghi("-- trong vòng khoá ngoại (nạp kiểu nào cũng có một đầu chưa tồn tại):");
      for (const h of hoanLai) ghi(`--   ${h.bang}.${h.cot} -> ${h.den}`);
    }
    ghi("");
    ghi("begin;");
    ghi("");

    let tongDong = 0;
    const demTheoBang = [];

    for (const t of thuTu) {
      // Cột sinh tự động không nạp lại được, và cũng không cần: chúng tính ra
      // từ các cột khác.
      const { rows: cotRows } = await client.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $1
            and is_generated = 'NEVER'
            and (identity_generation is null or identity_generation = 'BY DEFAULT')
          order by ordinal_position`,
        [t],
      );
      const hoan = hoanTheoBang.get(t) ?? [];
      const cot = cotRows.map((r) => r.column_name).filter((c) => !hoan.includes(c));
      if (!cot.length) continue;

      const danhSach = cot.map((c) => `"${c}"`).join(", ");

      // Để Postgres tự trích dẫn từng giá trị: quote_nullable trên dạng text.
      // Chuỗi, mảng, json, timestamp, uuid, bytea đều quay về đúng kiểu khi nạp
      // lại, vì cột đích tự ép kiểu cho literal text. Tự nối chuỗi trong
      // JavaScript là tự viết lại một hàm thoát dấu nháy — và tự chuốc lỗi ở
      // đúng những cái tên có dấu nháy.
      const bieuThuc = cot.map((c) => `quote_nullable("${c}"::text)`).join(", ");

      const { rows } = await client.query(
        `select 'insert into public."${t}" (${danhSach}) values ('
                || concat_ws(', ', ${bieuThuc}) || ');' as stmt
           from public."${t}"`,
      );

      demTheoBang.push([t, rows.length]);
      tongDong += rows.length;

      ghi(`-- ${t}: ${rows.length} dòng${hoan.length ? ` (hoãn: ${hoan.join(", ")})` : ""}`);
      for (const r of rows) ghi(r.stmt);
      ghi("");
    }

    // Lượt hai: vá lại những cột đã cắt để phá vòng.
    for (const h of hoanLai) {
      const { rows: pkRows } = await client.query(
        `select a.attname
           from pg_constraint c
           join unnest(c.conkey) with ordinality k(attnum, ord) on true
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
          where c.contype = 'p' and c.conrelid = $1::regclass
          order by k.ord`,
        [`public."${h.bang}"`],
      );
      const pk = pkRows.map((r) => r.attname);
      if (!pk.length) {
        throw new Error(
          `${h.bang} nằm trong vòng khoá ngoại nhưng không có khoá chính, ` +
            `nên không chỉ được đúng dòng cần vá ${h.cot}.`,
        );
      }

      const dieuKien = pk
        .map((c) => `'"${c}" = ' || quote_nullable("${c}"::text)`)
        .join(` || ' and ' || `);

      const { rows } = await client.query(
        `select 'update public."${h.bang}" set "${h.cot}" = '
                || quote_nullable("${h.cot}"::text)
                || ' where ' || ${dieuKien} || ';' as stmt
           from public."${h.bang}"
          where "${h.cot}" is not null`,
      );

      ghi(`-- vá vòng khoá ngoại: ${h.bang}.${h.cot} — ${rows.length} dòng`);
      for (const r of rows) ghi(r.stmt);
      ghi("");
    }

    ghi("commit;");
    await new Promise((res, rej) => out.end(res).on("error", rej));

    const kb = (fs.statSync(duong).size / 1024).toFixed(0);
    console.log(`Đã ghi ${duong}  (${kb} KB)`);
    console.log(`${thuTu.length} bảng, ${tongDong} dòng.`);
    for (const [t, n] of demTheoBang.filter(([, n]) => n > 0)) {
      console.log(`  ${String(n).padStart(7)}  ${t}`);
    }
    const rong = demTheoBang.filter(([, n]) => n === 0).map(([t]) => t);
    if (rong.length) console.log(`  (rỗng: ${rong.join(", ")})`);

    const soNhanVien = (demTheoBang.find(([t]) => t === "staff_profiles") ?? [, 0])[1];
    if (soNhanVien > 0) {
      console.log(
        `\nLƯU Ý: ${soNhanVien} hồ sơ nhân viên đã sao lưu, nhưng TÀI KHOẢN ĐĂNG` +
          `\nNHẬP của họ thì không — chúng nằm ở auth.users, ngoài schema public.` +
          `\nPhục hồi thì phải tạo lại user trong Authentication với ĐÚNG UUID cũ` +
          `\ntrước khi nạp tệp. Cách làm ghi ở đầu tệp và ở docs/18 §2.1.`,
      );
    }

    // Một tệp sao lưu không có dòng nào là một tệp vô dụng trông như đã xong.
    // Thoát khác 0 để lịch chạy tự động báo động thay vì im lặng.
    if (tongDong === 0) {
      console.error("\nKhông sao lưu được dòng nào. Kiểm lại SUPABASE_DB_URL.");
      process.exit(1);
    }
  } catch (e) {
    // Đừng để lại một tệp ghi dở trông như bản sao lưu thật.
    if (duong && fs.existsSync(duong)) {
      fs.rmSync(duong, { force: true });
      console.error(`Đã xoá tệp ghi dở ${path.basename(duong)}.`);
    }
    throw e;
  } finally {
    await client.query("commit").catch(() => {});
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
