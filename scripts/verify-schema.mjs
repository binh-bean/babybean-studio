import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goc = path.resolve(__dirname, '..');

const tempId = crypto.randomBytes(4).toString('hex');
const tPublic = 'verify_schema_' + tempId + '_public';
const tApp = 'verify_schema_' + tempId + '_app';

function preprocessSql(sql) {
  return sql
    // Replace public with tPublic
    .replace(/\bpublic\./g, tPublic + '.')
    .replace(/schema\s+(if\s+not\s+exists\s+)?public\b/gi, 'schema $1' + tPublic)
    .replace(/search_path\s*=\s*'?public'?/gi, 'search_path = ' + tPublic)
    .replace(/search_path\s+to\s+'?public'?/gi, 'search_path to ' + tPublic)
    .replace(/table_schema\s*=\s*'public'/gi, "table_schema = '" + tPublic + "'")
    
    // Replace app with tApp
    .replace(/\bapp\./g, tApp + '.')
    .replace(/schema\s+(if\s+not\s+exists\s+)?app\b/gi, 'schema $1' + tApp)
    .replace(/search_path\s*=\s*'?app'?/gi, 'search_path = ' + tApp)
    .replace(/search_path\s+to\s+'?app'?/gi, 'search_path to ' + tApp)
    
    // Replace tuples
    .replace(/in\s*\(\s*'public'\s*,\s*'app'\s*\)/gi, "in ('" + tPublic + "', '" + tApp + "')")
    
    // Special extensions fix
    .replace(/(?<!["'])\bcitext\b(?!["'])/g, 'public.citext')
    .replace(/(?<!["'])\bgin_trgm_ops\b(?!["'])/g, 'public.gin_trgm_ops');
}

/**
 * Câu lệnh chạm vào thứ DÙNG CHUNG CẢ CƠ SỞ DỮ LIỆU, không nằm trong schema nào.
 *
 * Cổng này dựng schema.sql vào hai schema tạm bằng cách đổi `public.` thành
 * `verify_schema_xxx_public.`. Event trigger KHÔNG thuộc schema nào — tên của nó
 * là tên chung cho cả cơ sở dữ liệu. Nên câu `drop event trigger if exists
 * ensure_rls` trong migration 0044 không bị đổi tên gì cả: nó xoá đúng cái
 * ensure_rls THẬT của bb-dev, dựng lại một cái trỏ vào hàm trong schema tạm,
 * rồi phần dọn dẹp xoá schema tạm và kéo luôn cái trigger đó đi.
 *
 * Xảy ra thật 16/09/2026: chạy verify:schema một lần là bb-dev mất lưới an toàn
 * ensure_rls, im lặng, không báo gì. Một cổng kiểm mà phá cơ sở dữ liệu của
 * người chạy nó thì tệ hơn là không có cổng.
 *
 * Nên cổng bỏ qua hẳn nhóm này và NÓI RA. Đường nạp thật (setup-prod.mjs,
 * db-push.mjs) vẫn chạy chúng, vì ở đó chúng đúng là thứ cần tạo.
 */
function laDungChungCaDb(sql) {
  return /(?:create|drop|alter)\s+event\s+trigger/i.test(sql);
}

function tachCauLenh(sql) {
  const ra = [];
  let cur = '';
  let i = 0;
  let trongChuoi = null;
  while (i < sql.length) {
    const c = sql[i];
    if (trongChuoi) {
      if (trongChuoi.startsWith('$')) {
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
    if (c === '-' && sql[i + 1] === '-') {
      const het = sql.indexOf('\n', i);
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
    if (c === ';') {
      if (cur.trim()) ra.push(cur.trim() + ';');
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.trim()) ra.push(cur.trim());
  return ra.filter((s) => s.replace(/--[^\n]*\n?/g, '').trim().length > 0);
}

function napTep(duong) {
  return tachCauLenh(preprocessSql(fs.readFileSync(duong, 'utf8')))
    .filter((sql) => {
      const t = sql
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith('--'))
        .join(' ')
        .trim()
        .toLowerCase()
        .replace(';', '');
      return t !== 'begin' && t !== 'commit' && t !== 'rollback';
    })
    .map((sql) => ({ tep: path.basename(duong), sql }));
}

function laLoiThoi(msg) {
  const m = msg.toLowerCase();
  return (
    m.includes('cannot change return type of existing function') ||
    m.includes('could not find a function named') ||
    (m.includes('function ') && m.includes('does not exist'))
  );
}

function viewCanXoa(msg, sql) {
  if (!msg.toLowerCase().includes('cannot change name of view column')) return '';
  const sau = sql.toLowerCase().split(' view ')[1];
  if (!sau) return '';
  const t = sau.trim();
  const cat = [t.indexOf(' '), t.indexOf('('), t.indexOf(String.fromCharCode(10))].filter((n) => n > 0);
  return cat.length ? t.slice(0, Math.min(...cat)) : t;
}

function laDaCo(msg) {
  return /already exists|duplicate (object|key|column)|multiple primary keys/i.test(msg);
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('Thiếu SUPABASE_DB_URL. Chạy: node --env-file-if-exists=.env.local scripts/verify-schema.mjs');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  console.log('Dựng schema tạm: ' + tPublic + ' và ' + tApp);
  await client.query('create schema ' + tPublic);
  await client.query('set search_path to ' + tPublic + ', extensions');

  let exitCode = 0;

  try {
    let hangDoi = [
      ...napTep(path.join(goc, 'db/schema.sql')),
      ...napTep(path.join(goc, 'db/policies.sql')),
    ];
    for (const f of fs.readdirSync(path.join(goc, 'db/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      hangDoi.push(...napTep(path.join(goc, 'db/migrations', f)));
    }

    console.log('Tổng cộng ' + hangDoi.length + ' câu lệnh.');

    let daCo = 0;
    let vong = 0;
    const boQua = [];
    const boQuaChung = [];

    while (hangDoi.length > 0) {
      vong += 1;
      const conLai = [];
      let nap = 0;
      let tienBo = 0;

      for (const c of hangDoi) {
        if (laDungChungCaDb(c.sql)) {
          boQuaChung.push(c);
          continue;
        }
        try {
          await client.query(c.sql);
          nap += 1;
        } catch (e) {
          await client.query('rollback').catch(() => {});
          const view = viewCanXoa(e.message, c.sql);
          if (view) {
            await client.query('drop view if exists ' + view + ' cascade').catch(() => {});
            tienBo += 1;
            conLai.push({ ...c, loi: e.message.split(String.fromCharCode(10))[0] });
            continue;
          }
          if (laDaCo(e.message) || laLoiThoi(e.message)) {
            daCo += 1;
            boQua.push({ ...c, loi: e.message.split('\n')[0] });
          } else {
            conLai.push({ ...c, loi: e.message.split('\n')[0] });
          }
        }
      }

      console.log('  vòng ' + vong + ': nạp ' + nap + ', xoá view ' + tienBo + ', bỏ qua ' + daCo + ', còn lại ' + conLai.length);

      if (conLai.length === 0) break;
      if (nap === 0 && tienBo === 0) {
        console.error('\nKHÔNG HỘI TỤ. ' + conLai.length + ' câu lệnh không nạp được:\n');
        for (const c of conLai.slice(0, 25)) {
          console.error('  [' + c.tep + '] ' + c.loi);
          console.error('      ' + c.sql.replace(/\s+/g, ' ').slice(0, 120) + '…');
        }
        exitCode = 1;
        break;
      }
      hangDoi = conLai;
    }

    // -----------------------------------------------------------------------
    // THỬ GHI ĐÚNG ĐƯỜNG LARK HẬU KỲ
    //
    // Dựng nổi không đủ: schema.sql dựng được mà vẫn không nhận nổi thứ mã
    // nguồn ghi vào nó. BB-163: cột customers.phone khai `not null` trong
    // schema.sql, còn src/lib/lark/sync-retouch.ts chèn THẲNG null vào đó —
    // đúng bảng ánh xạ docs/16 §7.3, vì bảng Hậu Kỳ không có ô số điện thoại.
    // bb-dev đã nới cột này từ lâu nên mọi phép thử đều xanh; bb-prod dựng theo
    // schema.sql nên mỗi hợp đồng mới từ Lark đều rơi, và chỉ lộ ra khi cắt sang.
    //
    // Nên cổng này chèn THẬT bốn dòng theo đúng thứ tự của đường đó. Schema tạm
    // bị xoá ở finally, không cần dọn.
    // -----------------------------------------------------------------------
    if (boQuaChung.length > 0) {
      const ten = [...new Set(boQuaChung.map((c) => c.tep))].join(', ');
      console.log('  bỏ qua ' + boQuaChung.length + ' câu lệnh dùng chung cả cơ sở dữ liệu (event trigger) từ ' + ten + ' — cổng này không dựng nổi chúng trong schema tạm; đường nạp thật vẫn chạy.');
    }

    if (exitCode === 0) {
      try {
        await client.query('begin');
        const { rows: cn } = await client.query(
          'insert into ' + tPublic + ".branches (code, name) values ('BB-THU', 'Chi nhánh thử') returning id",
        );
        const { rows: kh } = await client.query(
          'insert into ' + tPublic + ".customers (branch_id, full_name, phone, source, tags, lark_customer_key)" +
            " values ($1, 'KH · HD_THU', null, 'lark_retouch', array['lark_draft'], 'khoa-thu') returning id",
          [cn[0].id],
        );
        const { rows: bc } = await client.query(
          'insert into ' + tPublic + ".shoots (branch_id, customer_id, shoot_date) values ($1, $2, '2026-01-01') returning id",
          [cn[0].id, kh[0].id],
        );
        await client.query(
          'insert into ' + tPublic + '.galleries (branch_id, customer_id, shoot_id, title, status,' +
            " drive_folder_id, drive_folder_url, lark_contract_code, included_quota, extra_photo_price)" +
            " values ($1, $2, $3, 'Bộ ảnh thử', 'draft', 'thu-muc-thu', 'https://drive/thu', 'HD_THU', 20, 50000)",
          [cn[0].id, kh[0].id, bc[0].id],
        );
        await client.query('rollback');
        console.log('  ghi thử đường Lark Hậu Kỳ (khách KHÔNG có số điện thoại): được');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        console.error('LỖI: schema.sql không nhận nổi thứ mà đường Lark Hậu Kỳ ghi vào nó.');
        console.error('     ' + e.message.split(String.fromCharCode(10))[0]);
        console.error('     Đối chiếu src/lib/lark/sync-retouch.ts và docs/16 §7.3.');
        exitCode = 1;
      }
    }

    if (exitCode === 0) {
      for (const ten of ['get_admin_galleries', 'patch_selection_batch']) {
        const { rows } = await client.query(
          'select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where p.proname=$1 and ns.nspname=$2',
          [ten, tPublic],
        );
        console.log('  ' + ten + ': ' + (rows[0].n > 0 ? 'có' : 'KHÔNG CÓ'));
        if (rows[0].n === 0) {
          console.error('LỖI: thiếu hàm ' + ten);
          exitCode = 1;
        }
      }
    }
  } finally {
    console.log('Xoá dọn schema tạm...');
    await client.query('drop schema if exists ' + tPublic + ' cascade');
    await client.query('drop schema if exists ' + tApp + ' cascade');
    
    const { rows: schemas } = await client.query(
      "select count(*)::int n from information_schema.schemata where schema_name like 'verify_schema_%'"
    );
    console.log('Số schema tạm còn sót lại: ' + schemas[0].n);
    
    await client.end();
  }

  process.exit(exitCode);
}

main();
