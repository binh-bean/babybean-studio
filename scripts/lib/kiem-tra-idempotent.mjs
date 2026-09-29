/**
 * kiem-tra-idempotent — quét MỘT tệp migration, tìm câu lệnh không chạy lại
 * được lần thứ hai.
 *
 * OWNER: DEV-OPS. Task BB-315 (cố vấn CV-01, lỗi S1).
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần cái này
 * ---------------------------------------------------------------------------
 * `migrate-prod.mjs` áp lại TOÀN BỘ dãy `db/migrations/` mỗi lượt chạy (dựa
 * trên bảng theo dõi, nhưng lượt đầu tiên trên một cơ sở dữ liệu — hoặc khi
 * dùng `--ep-ap` — vẫn chạy lại mọi tệp). `0069-kieu-chu-bia.sql` từng là tệp
 * DUY NHẤT trong dãy không chạy lại được (`add column` thiếu `if not exists`)
 * — lượt chạy thứ hai gãy đúng ở đó, và mọi tệp SAU nó không bao giờ được áp.
 * Cố vấn CV-01 đọc tay cả 31 tệp và xác nhận đây là ngoại lệ DUY NHẤT; hàm
 * này tự động hoá đúng phép đọc tay đó cho những tệp thêm sau.
 *
 * ---------------------------------------------------------------------------
 * Luật chấp nhận được — khớp quy ước THẬT đang dùng trong db/migrations/
 * ---------------------------------------------------------------------------
 *   create table ...            phải có `if not exists`
 *   alter table ... add column  phải có `if not exists`
 *   create index ...            phải có `if not exists`, HOẶC có một
 *                                `drop index if exists <cùng tên>` đứng TRƯỚC
 *                                trong cùng tệp
 *   create policy <tên> ...     phải có một `drop policy if exists <tên>`
 *                                đứng TRƯỚC trong cùng tệp (Postgres không có
 *                                `create policy if not exists`)
 *   create trigger <tên> ...    phải có một `drop trigger if exists <tên>`
 *                                đứng TRƯỚC trong cùng tệp
 *   create function /
 *   create or replace function  luôn an toàn (viết lại thay vì tạo mới) — bỏ
 *                                qua, không kiểm
 *
 * Không phải một trình phân tích SQL đầy đủ — chỉ đủ để bắt đúng lớp lỗi đã
 * xảy ra một lần. Không hiểu comment lồng `/* *\/` hay chuỗi chứa dấu `;`.
 */

/** Bỏ comment `--` (không đụng nội dung trong chuỗi ký tự — migrations ở đây không có `--` trong chuỗi giá trị SQL). */
function boComment(sql) {
  // Tệp CRLF: `.` của JS không khớp `\r`, nên `--.*$` không ăn được dòng nào
  // và comment đứng đầu câu lệnh sau làm hỏng phép khớp `^drop …` (0053).
  return sql
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((dong) => dong.replace(/--.*$/, ""))
    .join("\n");
}

/** Tách thành các câu lệnh theo dấu `;` ở cấp ngoài cùng — đủ dùng cho các tệp migration ở đây (không có `;` bên trong hàm PL/pgSQL nhiều câu — những tệp có `$$...$$` được giữ nguyên khối). */
function tachCauLenh(sql) {
  const cauLenh = [];
  let hienTai = "";
  let trongKhoiDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const doanConLai = sql.slice(i, i + 2);
    if (doanConLai === "$$") {
      trongKhoiDollar = !trongKhoiDollar;
      hienTai += "$$";
      i += 1;
      continue;
    }
    const c = sql[i];
    hienTai += c;
    if (c === ";" && !trongKhoiDollar) {
      cauLenh.push(hienTai.trim());
      hienTai = "";
    }
  }
  if (hienTai.trim()) cauLenh.push(hienTai.trim());
  return cauLenh.filter(Boolean);
}

/**
 * Quét nội dung MỘT tệp `.sql`. Trả về mảng chuỗi mô tả vi phạm (rỗng = sạch).
 */
export function phatHienViPham(noiDungSql) {
  const sach = boComment(noiDungSql);
  const cauLenh = tachCauLenh(sach);
  const viPham = [];

  const tenDaDrop = { index: new Set(), policy: new Set(), trigger: new Set() };
  for (const c of cauLenh) {
    let m;
    if ((m = /^drop\s+index\s+if\s+exists\s+"?([a-z0-9_]+)"?/i.exec(c))) {
      tenDaDrop.index.add(m[1].toLowerCase());
    } else if ((m = /^drop\s+policy\s+if\s+exists\s+"?([a-z0-9_ ]+?)"?\s+on\s+/i.exec(c))) {
      tenDaDrop.policy.add(m[1].toLowerCase());
    } else if ((m = /^drop\s+trigger\s+if\s+exists\s+"?([a-z0-9_]+)"?\s+on\s+/i.exec(c))) {
      tenDaDrop.trigger.add(m[1].toLowerCase());
    }
  }

  for (const c of cauLenh) {
    let m;
    if (/^create\s+or\s+replace\s+function/i.test(c) || /^create\s+function/i.test(c)) {
      continue; // luôn an toàn
    }
    if ((m = /^create\s+table\s+(?!if\s+not\s+exists)/i.exec(c))) {
      viPham.push(`create table thiếu "if not exists": ${c.slice(0, 60)}…`);
      continue;
    }
    if ((m = /^alter\s+table\s+\S+\s+add\s+column\s+(?!if\s+not\s+exists)/i.exec(c))) {
      viPham.push(`add column thiếu "if not exists": ${c.slice(0, 70)}…`);
      continue;
    }
    if ((m = /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?!if\s+not\s+exists)"?([a-z0-9_]+)"?/i.exec(c))) {
      const ten = m[2].toLowerCase();
      if (!tenDaDrop.index.has(ten)) {
        viPham.push(`create index "${m[2]}" thiếu "if not exists" và không có "drop index if exists ${m[2]}" đứng trước`);
      }
      continue;
    }
    if ((m = /^create\s+policy\s+"?([a-z0-9_ ]+?)"?\s+on\s+/i.exec(c))) {
      const ten = m[1].toLowerCase();
      if (!tenDaDrop.policy.has(ten)) {
        viPham.push(`create policy "${m[1]}" không có "drop policy if exists ${m[1]}" đứng trước`);
      }
      continue;
    }
    if ((m = /^create\s+trigger\s+"?([a-z0-9_]+)"?\s+/i.exec(c))) {
      const ten = m[1].toLowerCase();
      if (!tenDaDrop.trigger.has(ten)) {
        viPham.push(`create trigger "${m[1]}" không có "drop trigger if exists ${m[1]}" đứng trước`);
      }
      continue;
    }
  }

  return viPham;
}

/** Quét mọi tệp `.sql` trong một thư mục migrations. Trả về Map<tênTệp, viPham[]> — chỉ chứa tệp CÓ vi phạm. */
export function quetThuMuc(fs, path, thuMucMigrations) {
  const ket = new Map();
  const tenTep = fs
    .readdirSync(thuMucMigrations)
    .filter((t) => t.endsWith(".sql"))
    .sort();
  for (const t of tenTep) {
    const noiDung = fs.readFileSync(path.join(thuMucMigrations, t), "utf8");
    const viPham = phatHienViPham(noiDung);
    if (viPham.length) ket.set(t, viPham);
  }
  return ket;
}
