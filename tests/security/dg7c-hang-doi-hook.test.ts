/**
 * Vòng 7 — C (ca c3), chép về BB-351 và LẬT kỳ vọng: hook Lark KHÔNG được làm mất
 * bản ghi trong `lark_hook_queue` khi Lark lỗi giữa chừng.
 *
 * Bản gốc của người soát C (worktree dg7c) xanh = lỗi tái hiện được: hàng đợi về `[]`
 * trước khi xử lý, Lark 503 → hai bản ghi đang chờ mất hẳn, route vẫn 200.
 * Bản này xanh = đã vá. Hoàn nguyên `src/app/api/lark/hook/route.ts` về main 3e5478e
 * (câu `update settings set value = '{"record_ids": []}'`) thì đỏ — pg giả bên dưới
 * giả lập đúng câu ghi đè đó.
 *
 * Không chạm DB thật: `pg` giả hoàn toàn (tests/helpers/pg-gia-hang-doi.ts). Không gọi
 * Lark: `larkAuth` giả ném lỗi.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("pg", async () => (await import("../helpers/pg-gia-hang-doi")).moduleGia);
vi.mock("@/lib/lark/sync-retouch", () => ({
  larkAuth: async () => {
    throw new Error("Lark 503 (giả)");
  },
  readLarkRecord: async () => ({ record: {} }),
  syncSingleRetouchRecord: async () => ({}),
}));
vi.mock("@/lib/lark/ban-ghi-moi", () => ({ ghiBanGhiMoi: async () => "bo_qua" }));
vi.mock("@/lib/thong-bao/bao-hinh-da-ve", () => ({ baoHinhDaVe: async () => {} }));
vi.mock("@/lib/thong-bao/bao-moc-khach", () => ({ baoMocKhach: async () => {} }));
vi.mock("@/lib/supabase/tuc-thi", () => ({ phatSuKienBoAnh: async () => {} }));

import { POST } from "@/app/api/lark/hook/route";
import { khoGia } from "../helpers/pg-gia-hang-doi";

const cu: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ["SYNC_CRON_SECRET", "LARK_BASE_APP_TOKEN", "LARK_APP_ID", "LARK_APP_SECRET", "SUPABASE_DB_URL"]) {
    cu[k] = process.env[k];
    process.env[k] = `fixture-dg7c-${k}`;
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
  khoGia.settings.set("lark_hook_queue", { record_ids: ["recCho1", "recCho2"] });
});

describe("hook Lark — hàng đợi (BB-351)", () => {
  it("Lark hỏng sau khi lấy khoá → bản ghi đang chờ VÀ bản ghi mới vẫn còn trong hàng đợi; không trả 200", async () => {
    const res = await POST(
      new Request("http://localhost/api/lark/hook", {
        method: "POST",
        headers: { authorization: "Bearer fixture-dg7c-SYNC_CRON_SECRET", "content-type": "application/json" },
        body: JSON.stringify({ record_id: "recMoi" }),
      }),
    );
    const hangDoi = khoGia.hangDoi();
    console.log("DG7C_HANG_DOI", JSON.stringify({ status: res.status, hangDoiSau: hangDoi }));
    expect(res.status).toBe(503);
    expect([...hangDoi].sort()).toEqual(["recCho1", "recCho2", "recMoi"]);
    expect(khoGia.soLanLoi()).toEqual({ recCho1: 1, recCho2: 1, recMoi: 1 });
  });
});
