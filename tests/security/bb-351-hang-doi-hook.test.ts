/**
 * BB-351 — hàng đợi hook Lark: chỉ rút bản ghi SAU KHI xử lý xong; cron 08:00 rút phần còn lại.
 * `pg` giả (tests/helpers/pg-gia-hang-doi.ts), Lark giả. Không chạm DB thật, không gọi Lark.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("pg", async () => (await import("../helpers/pg-gia-hang-doi")).moduleGia);

const lark = vi.hoisted(() => ({
  authHong: false,
  /** id bản ghi mà readLarkRecord ném lỗi */
  hong: new Set<string>(),
  /** id bản ghi mà đọc trạng thái hậu kỳ ném lỗi */
  hongTrangThai: new Set<string>(),
  daDongBo: [] as string[],
}));
vi.mock("@/lib/lark/sync-retouch", () => ({
  larkAuth: async () => {
    if (lark.authHong) throw new Error("Lark 503 (giả)");
    return { authorization: "Bearer gia" };
  },
  readLarkRecord: async (_a: unknown, _b: unknown, _c: unknown, id: string) => {
    if (lark.hong.has(id)) throw new Error(`không đọc được ${id} (giả)`);
    return { tableId: "tbl", tableName: "Hậu Kỳ", record: { record_id: id, fields: {} } };
  },
  syncSingleRetouchRecord: async (o: { record: { record_id: string } }) => {
    lark.daDongBo.push(o.record.record_id);
    return { action: "skipped" };
  },
}));
vi.mock("@/lib/lark/doc-trang-thai-lark", async (goc) => ({
  ...(await goc<typeof import("@/lib/lark/doc-trang-thai-lark")>()),
  taoDocMotBanGhi: async () => async (id: string) => {
    if (lark.hongTrangThai.has(id)) throw new Error(`trạng thái ${id} hỏng (giả)`);
    return null;
  },
}));
vi.mock("@/lib/lark/ban-ghi-moi", () => ({ ghiBanGhiMoi: async () => "bo_qua" }));
vi.mock("@/lib/thong-bao/bao-hinh-da-ve", () => ({ baoHinhDaVe: async () => {} }));
vi.mock("@/lib/thong-bao/bao-moc-khach", () => ({ baoMocKhach: async () => {} }));
vi.mock("@/lib/supabase/tuc-thi", () => ({ phatSuKienBoAnh: async () => {} }));

import pg from "pg";
import { POST } from "@/app/api/lark/hook/route";
import { rutHangDoiHook, SO_LAN_LOI_TOI_DA } from "@/lib/lark/hang-doi-hook";
import { khoGia } from "../helpers/pg-gia-hang-doi";

const SECRET = "fixture-bb351-secret";
const cu: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ["SYNC_CRON_SECRET", "LARK_BASE_APP_TOKEN", "LARK_APP_ID", "LARK_APP_SECRET", "SUPABASE_DB_URL"]) {
    cu[k] = process.env[k];
    process.env[k] = k === "SYNC_CRON_SECRET" ? SECRET : `fixture-bb351-${k}`;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(cu)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  khoGia.datLai();
  lark.authHong = false;
  lark.hong.clear();
  lark.hongTrangThai.clear();
  lark.daDongBo = [];
});

function goi(recordId: string) {
  return POST(
    new Request("http://localhost/api/lark/hook", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ record_id: recordId }),
    }),
  );
}

describe("BB-351 hook Lark — hàng đợi", () => {
  it("chạy trót lọt → xử lý cả bản ghi đang chờ lẫn bản ghi mới, hàng đợi rỗng, 200", async () => {
    khoGia.settings.set("lark_hook_queue", { record_ids: ["recCho1"] });
    const res = await goi("recMoi");
    expect(res.status).toBe(200);
    expect(lark.daDongBo.sort()).toEqual(["recCho1", "recMoi"]);
    expect(khoGia.hangDoi()).toEqual([]);
  });

  it("một bản ghi đọc Lark hỏng → CHỈ nó ở lại (so_lan_loi 1); bản ghi tốt được rút", async () => {
    khoGia.settings.set("lark_hook_queue", { record_ids: ["recHong", "recTot"] });
    lark.hong.add("recHong");
    const res = await goi("recMoi");
    expect(res.status).toBe(200); // bản ghi Lark vừa đẩy (recMoi) xong
    expect(khoGia.hangDoi()).toEqual(["recHong"]);
    expect(khoGia.soLanLoi()).toEqual({ recHong: 1 });
  });

  it("đọc trạng thái hậu kỳ (báo mốc khách) hỏng → bản ghi ở lại, không coi là xong", async () => {
    lark.hongTrangThai.add("recMoi");
    const res = await goi("recMoi");
    expect(res.status).toBe(503);
    expect(khoGia.hangDoi()).toEqual(["recMoi"]);
  });

  it("bản ghi hỏng đủ SO_LAN_LOI_TOI_DA lần thì bị bỏ ra, không kẹt hàng đợi mãi", async () => {
    khoGia.settings.set("lark_hook_queue", {
      record_ids: ["recChet"],
      so_lan_loi: { recChet: SO_LAN_LOI_TOI_DA - 1 },
    });
    lark.hong.add("recChet");
    const res = await goi("recMoi");
    expect(res.status).toBe(200);
    expect(khoGia.hangDoi()).toEqual([]);
    expect(khoGia.soLanLoi()).toEqual({});
  });

  it("khoá bận → xếp hàng, 200 busy_queued; lượt sau rút được", async () => {
    khoGia.khoaDangBan = true;
    const r1 = await goi("recXepHang");
    expect((await r1.json()).skipped).toBe("busy_queued");
    expect(khoGia.hangDoi()).toEqual(["recXepHang"]);
    khoGia.khoaDangBan = false;
    const r2 = await goi("recSau");
    const body = await r2.json();
    expect(body.results.map((r: { record_id: string }) => r.record_id).sort()).toEqual(["recSau", "recXepHang"]);
    expect(khoGia.hangDoi()).toEqual([]);
  });

  it("cron 08:00 rút phần còn lại khi Lark đã lành", async () => {
    khoGia.settings.set("lark_hook_queue", { record_ids: ["recA", "recB"], so_lan_loi: { recA: 2 } });
    const client = new pg.Client();
    const kq = await rutHangDoiHook({ client, appId: "a", appSecret: "b", baseToken: "c", dbUrl: "d" });
    expect(kq).toMatchObject({ soBanGhi: 2, daXong: ["recA", "recB"], conLai: [] });
    expect(khoGia.hangDoi()).toEqual([]);
    expect(khoGia.soLanLoi()).toEqual({});
  });

  it("cron 08:00 mà Lark vẫn hỏng → giữ nguyên hàng đợi", async () => {
    khoGia.settings.set("lark_hook_queue", { record_ids: ["recA"] });
    lark.authHong = true;
    const kq = await rutHangDoiHook({ client: new pg.Client(), appId: "a", appSecret: "b", baseToken: "c", dbUrl: "d" });
    expect(kq).toMatchObject({ soBanGhi: 1, conLai: ["recA"] });
    expect(khoGia.hangDoi()).toEqual(["recA"]);
  });
});
