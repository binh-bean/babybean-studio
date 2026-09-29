// BB-315 (cố vấn CV-01, lỗi S1) — mọi tệp trong db/migrations/ phải chạy lại
// được nhiều lần (migrate-prod.mjs áp cả dãy mỗi lượt). Phép thử này quét
// THẬT toàn bộ thư mục — 0069 từng là ngoại lệ duy nhất (add column thiếu
// "if not exists"), đã vá; nếu vá lại lọt vào tương lai, ca "kho thật sạch"
// dưới đây phải đỏ.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { phatHienViPham, quetThuMuc } from "../../scripts/lib/kiem-tra-idempotent.mjs";
import { danhSachMigrationCanAp } from "../../scripts/migrate-prod.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOC_REPO = path.resolve(__dirname, "..", "..");

describe("phatHienViPham — logic thuần trên chuỗi SQL bịa", () => {
  it("bắt create table thiếu if not exists", () => {
    expect(phatHienViPham("create table foo (id uuid);")).toHaveLength(1);
  });

  it("create table if not exists -> sạch", () => {
    expect(phatHienViPham("create table if not exists foo (id uuid);")).toEqual([]);
  });

  it("bắt add column thiếu if not exists", () => {
    const viPham = phatHienViPham("alter table galleries add column cover_layout text;");
    expect(viPham).toHaveLength(1);
    expect(viPham[0]).toMatch(/add column/);
  });

  it("add column if not exists -> sạch", () => {
    expect(phatHienViPham("alter table galleries add column if not exists cover_layout text;")).toEqual([]);
  });

  it("create policy có drop policy if exists CÙNG TÊN đứng trước -> sạch", () => {
    const sql = `
      drop policy if exists cho_doc on foo;
      create policy cho_doc on foo for select to authenticated using (true);
    `;
    expect(phatHienViPham(sql)).toEqual([]);
  });

  it("create policy KHÔNG có drop trước -> vi phạm", () => {
    const sql = `create policy cho_doc on foo for select to authenticated using (true);`;
    expect(phatHienViPham(sql)).toHaveLength(1);
  });

  it("create trigger có drop trigger if exists CÙNG TÊN -> sạch; thiếu -> vi phạm", () => {
    const sach = `
      drop trigger if exists trg_x on foo;
      create trigger trg_x before update on foo for each row execute function set_updated_at();
    `;
    expect(phatHienViPham(sach)).toEqual([]);

    const ban = `create trigger trg_x before update on foo for each row execute function set_updated_at();`;
    expect(phatHienViPham(ban)).toHaveLength(1);
  });

  it("create or replace function -> luôn sạch, không cần drop", () => {
    const sql = `create or replace function public.f() returns void as $$ begin null; end; $$ language plpgsql;`;
    expect(phatHienViPham(sql)).toEqual([]);
  });

  it("create index có drop index if exists cùng tên -> sạch", () => {
    const sql = `drop index if exists idx_foo; create index idx_foo on foo(id);`;
    expect(phatHienViPham(sql)).toEqual([]);
  });

  it("bỏ qua dòng comment -- chứa chữ 'create table' giả", () => {
    const sql = `-- ví dụ: create table không có if not exists thì gãy\ncreate table if not exists thuc(id uuid);`;
    expect(phatHienViPham(sql)).toEqual([]);
  });
});

describe("quetThuMuc — chạy TRÊN KHO THẬT, ĐÚNG dãy migrate-prod.mjs sẽ áp lại", () => {
  it("không tệp nào (trong danhSachMigrationCanAp — 0045 trở lên) vi phạm, sau khi vá S1 ở 0069", () => {
    // CHỈ soát dãy migrate-prod.mjs THẬT SỰ áp lại mỗi lượt (>= 0045) — 0001–
    // 0044 thuộc ảnh chụp baseline, chỉ chạy MỘT LẦN qua setup-prod.mjs (dung
    // thứ lỗi từng câu, xem docs/11), không nằm trong phạm vi "phải chạy lại
    // được nhiều lần" của quy tắc này.
    const daySoDo = new Set(danhSachMigrationCanAp());
    const toanBo = quetThuMuc(fs, path, path.join(GOC_REPO, "db", "migrations"));
    const ketQua = new Map([...toanBo.entries()].filter(([tep]) => daySoDo.has(tep)));
    if (ketQua.size > 0) {
      const chiTiet = [...ketQua.entries()]
        .map(([tep, vp]) => `${tep}:\n  ${(vp as string[]).join("\n  ")}`)
        .join("\n");
      throw new Error(`Còn ${ketQua.size} tệp (trong dãy migrate-prod áp) không chạy lại được:\n${chiTiet}`);
    }
    expect(ketQua.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Kiểm ngược (AGENTS.md §5a): hoàn nguyên tạm dòng vá ở 0069 (bỏ "if not
// exists"), chạy lại đúng ca "không tệp nào vi phạm" ở trên — ĐỎ, báo đúng
// tên tệp 0069-kieu-chu-bia.sql và đúng câu "add column thiếu if not
// exists". Phục hồi dòng vá, chạy lại — XANH. Dán cả hai kết quả vào bàn
// giao, không để lại mã giả lập ở đây (đó là hoàn nguyên MÃ NGUỒN thật, xem
// scripts/bb-315-doi-tep.sh trong lịch sử thao tác của phiên này nếu cần).
// ---------------------------------------------------------------------------
