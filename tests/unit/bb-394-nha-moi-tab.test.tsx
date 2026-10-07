/**
 * BB-394 — nhãn nhà "Nhà <tên> · Buổi N/M" ở MỌI tab Việc cần xử lý có dòng gắn bộ ảnh.
 * THUẦN: client Supabase giả, không cơ sở dữ liệu, không mạng.
 *   1. Ba route (Lark xoá dòng, Link sắp hết hạn, Bộ ảnh lỗi tải): dòng của khách ≥ 2 bộ có `nha` đúng,
 *      khách 1 bộ không có.
 *   2. Đọc nhãn lỗi → danh sách VẪN trả đủ dòng, `nha` rỗng (không 500).
 *   3. Một lần đọc nhãn cho cả trang (không gọi theo từng dòng).
 *   4. Nhãn dạng "chỉ nhãn" (thẻ Kanban đã là link) không lồng link "Xem cả nhà".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// Vitest dựng JSX kiểu cổ điển: component cần `React` toàn cục.
(globalThis as { React?: unknown }).React = React;

vi.mock("server-only", () => ({}));

type Loc = { col: string; vals: unknown[] };
interface Co {
  table: string;
  select: string;
  ins: Loc[];
}

const kho = vi.hoisted(() => ({
  /** (table, select, ins) → { data, error } — mỗi phép thử tự đặt. */
  giaiDap: null as null | ((c: { table: string; select: string; ins: { col: string; vals: unknown[] }[] }) => { data?: unknown; error?: unknown }),
  soLanDocNhan: 0,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const co: Co = { table, select: "", ins: [] };
      const b: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
                try {
                  const r = kho.giaiDap!(co);
                  return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej);
                } catch (e) {
                  return rej(e);
                }
              };
            }
            return (...args: unknown[]) => {
              if (prop === "select") co.select = String(args[0] ?? "");
              if (prop === "in") co.ins.push({ col: String(args[0]), vals: args[1] as unknown[] });
              return b;
            };
          },
        },
      );
      return b;
    },
  }),
}));

vi.mock("@/lib/auth/staff", async (goc) => {
  const that = await goc<typeof import("@/lib/auth/staff")>();
  return {
    ...that,
    requireStaff: async () => ({
      staffId: "nv-1",
      role: "admin",
      branchIds: ["cn-1"],
      permissions: ["system:superuser"],
    }),
  };
});

import { GET as getLarkDaXoa } from "@/app/api/admin/reports/lark-da-xoa/route";
import { GET as getLinkSapHetHan } from "@/app/api/admin/reports/link-sap-het-han/route";
import { GET as getLoiDongBo } from "@/app/api/admin/reports/loi-dong-bo/route";
import { NhanNhaBoAnh } from "@/components/features/admin/nhan-nha-bo-anh";
import { chuNhanNha } from "@/lib/gia-dinh/nha-cua-bo";

// Khách k1 có HAI bộ (g1 trước, g2 sau); khách k2 chỉ một bộ (g3).
const BO_KHACH = [
  { id: "g1", customer_id: "k1", created_at: "2026-09-01T01:00:00Z", so_thu_tu_khach: null },
  { id: "g2", customer_id: "k1", created_at: "2026-09-20T01:00:00Z", so_thu_tu_khach: null },
  { id: "g3", customer_id: "k2", created_at: "2026-09-05T01:00:00Z", so_thu_tu_khach: null },
];
const KHACH = [
  { id: "k1", full_name: "Nguyễn Thị Mai" },
  { id: "k2", full_name: "Trần Thu Hà" },
];
const CUA_KHACH: Record<string, string> = { g1: "k1", g2: "k1", g3: "k2" };

/** Trả lời các lượt đọc nhãn nhà; `lietKe` trả danh sách việc của route đang thử. */
function dung(lietKe: () => unknown, opts: { loiKhach?: boolean } = {}) {
  kho.soLanDocNhan = 0;
  kho.giaiDap = (c) => {
    const inId = c.ins.find((i) => i.col === "id");
    const inKh = c.ins.find((i) => i.col === "customer_id");
    if (c.table === "galleries" && inId && c.select === "customer_id") {
      kho.soLanDocNhan++;
      return { data: (inId.vals as string[]).map((id) => ({ customer_id: CUA_KHACH[id] ?? null })) };
    }
    if (c.table === "galleries" && inKh) {
      return { data: BO_KHACH.filter((b) => (inKh.vals as string[]).includes(b.customer_id)) };
    }
    if (c.table === "customers") {
      if (opts.loiKhach) return { error: { code: "XX000", message: "đứt kết nối" } };
      return { data: KHACH };
    }
    return { data: lietKe() };
  };
}

beforeEach(() => {
  kho.giaiDap = null;
});

const dongLark = (id: string) => ({
  id,
  title: `Bộ ${id}`,
  status: "ready",
  lark_contract_code: `HD_${id}`,
  lark_dong_da_xoa_luc: "2026-10-01T01:00:00Z",
  branches: { name: "Pasteur" },
  customers: { full_name: "Khách" },
});

const dongLink = (id: string) => ({
  id: `sl-${id}`,
  status: "active",
  expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  token_prefix: "abc123",
  view_count: 0,
  created_at: "2026-09-01T01:00:00Z",
  galleries: { id, title: `Bộ ${id}`, branch_id: "cn-1", lark_contract_codes: [`HD_${id}`], branches: { name: "Pasteur" }, customers: { full_name: "Khách", phone: "0900000000" } },
});

const dongLoi = (id: string) => ({
  id,
  title: `Bộ ${id}`,
  status: "ready",
  lark_contract_codes: [`HD_${id}`],
  branch_id: "cn-1",
  drive_folder_url: "https://drive.example/x",
  last_synced_at: null,
  sync_error: "Không có quyền",
  branch: { name: "Pasteur" },
});

describe("BB-394: nhãn nhà ở các tab Việc cần xử lý", () => {
  it("Lark xoá dòng: dòng của khách 2 bộ có nhãn đúng, khách 1 bộ không có, MỘT lần đọc nhãn", async () => {
    dung(() => ["g1", "g2", "g3"].map(dongLark));
    const res = await getLarkDaXoa();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items.map((i: { galleryId: string }) => i.galleryId)).toEqual(["g1", "g2", "g3"]);
    expect(data.nha.g1).toMatchObject({ customerId: "k1", tenKhach: "Nguyễn Thị Mai", buoi: 1, tong: 2 });
    expect(chuNhanNha(data.nha.g2)).toBe("Nhà Nguyễn Thị Mai · Buổi 2/2");
    expect(data.nha.g3).toBeUndefined();
    expect(kho.soLanDocNhan).toBe(1);
  });

  it("Link sắp hết hạn: nhãn đúng cho dòng của khách 2 bộ", async () => {
    dung(() => ["g2", "g3"].map(dongLink));
    const res = await getLinkSapHetHan(new Request("http://localhost/api/admin/reports/link-sap-het-han"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items).toHaveLength(2);
    expect(data.nha.g2).toMatchObject({ customerId: "k1", buoi: 2, tong: 2 });
    expect(data.nha.g3).toBeUndefined();
    expect(kho.soLanDocNhan).toBe(1);
  });

  it("Bộ ảnh lỗi tải: nhãn đúng, đọc theo MỌI nhóm lỗi một lần", async () => {
    dung(() => ["g1", "g2", "g3"].map(dongLoi));
    const res = await getLoiDongBo();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.summary.galleryCount).toBe(3);
    expect(data.nha.g1).toMatchObject({ buoi: 1, tong: 2 });
    expect(data.nha.g2).toMatchObject({ buoi: 2, tong: 2 });
    expect(data.nha.g3).toBeUndefined();
    expect(kho.soLanDocNhan).toBe(1);
  });

  it("đọc nhãn lỗi → danh sách vẫn trả đủ dòng, không có nhãn (cả ba route)", async () => {
    dung(() => ["g1", "g2", "g3"].map(dongLark), { loiKhach: true });
    const a = await (await getLarkDaXoa()).json();
    expect(a.data.items).toHaveLength(3);
    expect(a.data.nha).toEqual({});

    dung(() => ["g1", "g2"].map(dongLink), { loiKhach: true });
    const rb = await getLinkSapHetHan(new Request("http://localhost/api/admin/reports/link-sap-het-han"));
    expect(rb.status).toBe(200);
    const b = await rb.json();
    expect(b.data.items).toHaveLength(2);
    expect(b.data.nha).toEqual({});

    dung(() => ["g1", "g2", "g3"].map(dongLoi), { loiKhach: true });
    const rc = await getLoiDongBo();
    expect(rc.status).toBe(200);
    const c = await rc.json();
    expect(c.data.summary.galleryCount).toBe(3);
    expect(c.data.nha).toEqual({});
  });
});

describe("BB-394: nhãn dạng 'chỉ nhãn' cho thẻ đã là link", () => {
  const nha = { customerId: "k1", tenKhach: "Nguyễn Thị Mai", buoi: 2, tong: 3 };
  it("mặc định có lối 'Xem cả nhà'; chiNhan thì không (không lồng link trong link)", () => {
    const co = renderToStaticMarkup(React.createElement(NhanNhaBoAnh, { nha }));
    const chiNhan = renderToStaticMarkup(React.createElement(NhanNhaBoAnh, { nha, chiNhan: true }));
    expect(co).toContain("Nhà Nguyễn Thị Mai · Buổi 2/3");
    expect(co).toContain("Xem cả nhà");
    expect(chiNhan).toContain("Nhà Nguyễn Thị Mai · Buổi 2/3");
    expect(chiNhan).not.toContain("Xem cả nhà");
    expect(chiNhan).not.toContain("<a ");
  });
  it("khách chỉ 1 bộ (hoặc không có nhãn) thì không hiện gì", () => {
    expect(renderToStaticMarkup(React.createElement(NhanNhaBoAnh, { nha: undefined }))).toBe("");
    expect(renderToStaticMarkup(React.createElement(NhanNhaBoAnh, { nha: { ...nha, tong: 1 } }))).toBe("");
  });
});
