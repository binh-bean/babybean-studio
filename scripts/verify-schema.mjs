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

    while (hangDoi.length > 0) {
      vong += 1;
      const conLai = [];
      let nap = 0;
      let tienBo = 0;

      for (const c of hangDoi) {
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
