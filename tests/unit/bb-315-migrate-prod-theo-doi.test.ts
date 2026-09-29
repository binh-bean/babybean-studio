// BB-315 (cố vấn CV-01, lỗi chặn C1) — migrate-prod.mjs phải quyết định "áp
// gì" bằng bảng theo dõi TỆP đã áp, không phải chín mốc cấu trúc (chín mốc
// chỉ canh 0045-0050). Client pg ở đây là GIẢ — không kết nối gì thật.

import { describe, it, expect } from "vitest";
import { layTenDaAp, layTenDaApChiDoc, tepConThieu, damBaoBangTheoDoi } from "../../scripts/migrate-prod.mjs";

function taoClientGia(banGhiDaAp: Array<{ ten: string }> = []) {
  const rows: Array<{ ten: string }> = [...banGhiDaAp];
  const lenhDaGoi: string[] = [];
  return {
    lenhDaGoi,
    async query(sql: string, params?: unknown[]) {
      lenhDaGoi.push((sql.trim().split("\n")[0] ?? "").trim());
      if (/create table if not exists public\.schema_migrations/i.test(sql)) {
        return { rows: [] };
      }
      if (/^select ten from public\.schema_migrations/i.test(sql.trim())) {
        return { rows: rows.map((r) => ({ ten: r.ten })) };
      }
      if (/^insert into public\.schema_migrations/i.test(sql.trim())) {
        const ten = (params as string[])[0]!;
        if (!rows.find((r) => r.ten === ten)) rows.push({ ten });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

describe("layTenDaAp — đảm bảo bảng theo dõi rồi đọc tên tệp đã áp", () => {
  it("bảng theo dõi rỗng (lượt đầu trên một CSDL chưa từng dùng migrate-prod mới) -> Set rỗng, KHÔNG ném lỗi", async () => {
    const client = taoClientGia([]);
    const daAp = await layTenDaAp(client as never);
    expect(daAp.size).toBe(0);
    expect(client.lenhDaGoi.some((l) => /create table if not exists public\.schema_migrations/i.test(l))).toBe(true);
  });

  it("bảng đã có dòng -> trả đúng tập tên", async () => {
    const client = taoClientGia([{ ten: "0045-bo-ma-pin.sql" }, { ten: "0046-link-ttl.sql" }]);
    const daAp = await layTenDaAp(client as never);
    expect([...daAp].sort()).toEqual(["0045-bo-ma-pin.sql", "0046-link-ttl.sql"]);
  });

  it("damBaoBangTheoDoi tự đứng riêng được (idempotent, gọi trực tiếp không lỗi)", async () => {
    const client = taoClientGia([]);
    await expect(damBaoBangTheoDoi(client as never)).resolves.toBeUndefined();
  });
});

function taoClientGiaChiDoc(bangTonTai: boolean, banGhiDaAp: Array<{ ten: string }> = []) {
  const lenhDaGoi: string[] = [];
  return {
    lenhDaGoi,
    async query(sql: string) {
      const dongDau = sql.trim().split("\n")[0]!.trim();
      lenhDaGoi.push(dongDau);
      if (/^select count\(\*\)::int n from pg_tables/i.test(dongDau)) {
        return { rows: [{ n: bangTonTai ? 1 : 0 }] };
      }
      if (/^select ten from public\.schema_migrations/i.test(dongDau)) {
        return { rows: banGhiDaAp.map((r) => ({ ten: r.ten })) };
      }
      throw new Error(`Câu lệnh không mong đợi trong client chỉ-đọc-giả: ${dongDau}`);
    },
  };
}

describe("layTenDaApChiDoc — BB-315 lượt 3: KHÔNG tự tạo bảng, chỉ đọc", () => {
  it("bảng CHƯA tồn tại -> báo tonTai:false, KHÔNG gọi 'create table' (không có lệnh ghi nào)", async () => {
    const client = taoClientGiaChiDoc(false);
    const kq = await layTenDaApChiDoc(client as never);
    expect(kq.tonTai).toBe(false);
    expect(kq.daAp.size).toBe(0);
    expect(client.lenhDaGoi.some((l) => /create table/i.test(l))).toBe(false);
    expect(client.lenhDaGoi.some((l) => /^insert/i.test(l))).toBe(false);
  });

  it("bảng ĐÃ tồn tại -> đọc đúng tập tên, vẫn không có lệnh ghi nào", async () => {
    const client = taoClientGiaChiDoc(true, [{ ten: "0045-bo-ma-pin.sql" }]);
    const kq = await layTenDaApChiDoc(client as never);
    expect(kq.tonTai).toBe(true);
    expect([...kq.daAp]).toEqual(["0045-bo-ma-pin.sql"]);
    expect(client.lenhDaGoi.every((l) => !/^create |^insert |^update |^delete /i.test(l))).toBe(true);
  });
});

describe("tepConThieu — ĐÚNG lỗi chặn C1: 6/31 tệp đã áp KHÔNG được coi là 'xong cả dãy'", () => {
  const day31Tep = [
    "0045-bo-ma-pin.sql",
    "0046-link-ttl.sql",
    "0047-xoa-nhan-su.sql",
    "0048-khoa-lai-check-staff-deletable.sql",
    "0049-dong-chat-page-url.sql",
    "0050-quyen-mac-dinh-cho-vat-sinh-sau.sql",
    "0051-activity-logs-gallery-fk.sql",
    "0052-vai-tro-dong.sql",
    // ... (rút gọn cho phép thử, đại diện đủ cho "còn nhiều tệp sau 0050")
    "0075-bia-album.sql",
  ];

  it("chỉ 0045-0050 đã áp (ĐÚNG hiện trạng bb-prod thật, docs/18) -> báo còn thiếu TỪ 0051 trở đi, KHÔNG rỗng", () => {
    const daAp = new Set([
      "0045-bo-ma-pin.sql",
      "0046-link-ttl.sql",
      "0047-xoa-nhan-su.sql",
      "0048-khoa-lai-check-staff-deletable.sql",
      "0049-dong-chat-page-url.sql",
      "0050-quyen-mac-dinh-cho-vat-sinh-sau.sql",
    ]);
    const conThieu = tepConThieu(day31Tep, daAp);
    // Đây CHÍNH là ca lỗi chặn C1: trước khi vá, cơ chế cũ (9 mốc) sẽ báo
    // "không có gì phải vá" ở đúng trạng thái này. Cơ chế mới PHẢI báo còn
    // thiếu, và phải liệt kê đúng 0051 trở đi.
    expect(conThieu).toEqual(["0051-activity-logs-gallery-fk.sql", "0052-vai-tro-dong.sql", "0075-bia-album.sql"]);
    expect(conThieu.length).toBeGreaterThan(0);
  });

  it("cả dãy đã áp -> rỗng, đúng nghĩa 'không có gì phải vá'", () => {
    const daAp = new Set(day31Tep);
    expect(tepConThieu(day31Tep, daAp)).toEqual([]);
  });

  it("chưa áp gì (CSDL trắng vừa được setup-prod dựng, chưa từng chạy migrate-prod) -> thiếu TOÀN BỘ dãy", () => {
    expect(tepConThieu(day31Tep, new Set())).toEqual(day31Tep);
  });
});

// ---------------------------------------------------------------------------
// Kiểm ngược (AGENTS.md §5a): sửa tạm `tepConThieu` trong
// scripts/migrate-prod.mjs để LUÔN trả về [] (mô phỏng đúng lỗi chặn C1 cũ —
// "báo xong dù chưa áp gì") — ca "chỉ 0045-0050 đã áp… KHÔNG rỗng" ở trên
// phải ĐỎ (nhận [] thay vì mảng có phần tử). Đã thử thật, thấy đỏ, phục hồi,
// thấy xanh lại — xem kết quả dán trong bàn giao.
// ---------------------------------------------------------------------------
