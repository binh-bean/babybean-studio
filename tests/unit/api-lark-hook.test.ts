import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/*
 * BB-351 — trước đây tệp này gọi hook THẬT trên bb-dev (`SUPABASE_DB_URL`) và mỗi lần
 * `npm run test` là đọc/ghi đè hàng đợi THẬT `lark_hook_queue` (người soát C vòng 7 xoá
 * trắng hàng đợi thật đúng kiểu này). Nay `pg` là bản giả trong bộ nhớ: không đụng DB thật.
 */
vi.mock("pg", async () => (await import("../helpers/pg-gia-hang-doi")).moduleGia);
vi.mock("@/lib/lark/doc-trang-thai-lark", async (goc) => ({
  ...(await goc<typeof import("@/lib/lark/doc-trang-thai-lark")>()),
  taoDocMotBanGhi: async () => async () => null,
}));
vi.mock("@/lib/lark/ban-ghi-moi", () => ({ ghiBanGhiMoi: async () => "bo_qua" }));
vi.mock("@/lib/thong-bao/bao-hinh-da-ve", () => ({ baoHinhDaVe: async () => {} }));
vi.mock("@/lib/thong-bao/bao-moc-khach", () => ({ baoMocKhach: async () => {} }));
vi.mock("@/lib/supabase/tuc-thi", () => ({ phatSuKienBoAnh: async () => {} }));

import { POST } from "@/app/api/lark/hook/route";
import { khoGia } from "../helpers/pg-gia-hang-doi";

vi.mock("@/lib/lark/sync-retouch", () => {
  return {
    larkAuth: vi.fn().mockResolvedValue({ authorization: "Bearer fake_token" }),
    readLarkRecord: vi.fn().mockImplementation(async (auth, token, pattern, id) => {
      if (id === "rec_not_found") {
        throw new Error("Lỗi đọc bản ghi");
      }
      return {
        tableId: "tblX",
        tableName: "Hậu Kỳ",
        record: { record_id: id, fields: {} }
      };
    }),
    syncSingleRetouchRecord: vi.fn().mockResolvedValue({ action: "created", galleryId: "g1" })
  };
});

describe("BB-179: API POST /api/lark/hook", () => {
  const SECRET = "test-secret";

  beforeAll(async () => {
    process.env.SYNC_CRON_SECRET = SECRET;
    process.env.LARK_BASE_APP_TOKEN = "test-base";
    process.env.LARK_APP_ID = "test-appid";
    process.env.LARK_APP_SECRET = "test-appsec";
    process.env["SUPABASE_DB_URL"] = "postgres://gia-bb351";
  });
  beforeEach(() => khoGia.datLai());

  function createRequest(body: unknown, authHeader: string | null) {
    const headers = new Headers();
    if (authHeader) headers.set("authorization", authHeader);
    return new Request("http://localhost/api/lark/hook", {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  }

  it("1. Không có header thì 401", async () => {
    const req = createRequest({ record_id: "rec1" }, null);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("2. Header sai thì 401", async () => {
    const req = createRequest({ record_id: "rec1" }, "Bearer wrong-secret");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("3. Mã bản ghi đọc hỏng thì 503, ghi lỗi vào results và GIỮ bản ghi trong hàng đợi (BB-351)", async () => {
    // mock readLarkRecord will throw for rec_not_found
    const req = createRequest({ record_id: "rec_not_found" }, `Bearer ${SECRET}`);
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.results[0].error).toMatch(/Lỗi đọc bản ghi/);
    expect(khoGia.hangDoi()).toEqual(["rec_not_found"]);
  });

  it("4. Đang có lượt chạy thì chờ 1s rồi 200 kèm busy_queued", async () => {
    khoGia.khoaDangBan = true;
    const res = await POST(createRequest({ record_id: "rec1" }, `Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("busy_queued");
    expect(khoGia.hangDoi()).toContain("rec1");
  });

  /**
   * Ca quan trọng nhất của BB-182: bản ghi bị xếp hàng lúc bận phải được lượt gọi
   * KẾ TIẾP rút ra xử, và hàng đợi trống sau khi xử xong.
   */
  it("6. Bản ghi bị xếp hàng được xử ở lượt gọi kế tiếp, không rơi mất", async () => {
    khoGia.khoaDangBan = true;
    const res1 = await POST(createRequest({ record_id: "rec_xep_hang" }, `Bearer ${SECRET}`));
    expect((await res1.json()).skipped).toBe("busy_queued");

    khoGia.khoaDangBan = false;
    const res2 = await POST(createRequest({ record_id: "rec_sau" }, `Bearer ${SECRET}`));
    const body2 = await res2.json();
    const daXu = (body2.results ?? []).map((r: { record_id: string }) => r.record_id);
    expect(daXu, "bản ghi bị xếp hàng không được rút ra — lỗi BB-182 đã quay lại").toContain("rec_xep_hang");
    expect(daXu).toContain("rec_sau");
    expect(khoGia.hangDoi(), "hàng đợi chưa được dọn sau khi xử").toEqual([]);
  });

  it("5. Chạy thành công", async () => {
    const req = createRequest({ record_id: "rec_success" }, `Bearer ${SECRET}`);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Success");
    expect(body.results[0].result.action).toBe("created");
  });
});
