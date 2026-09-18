import { describe, it, expect, beforeAll, vi } from "vitest";
import { POST } from "@/app/api/lark/hook/route";
import pg from "pg";

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
  let client: pg.Client;
  const SECRET = "test-secret";
  const LOCK_ID = 152111;

  beforeAll(async () => {
    process.env.SYNC_CRON_SECRET = SECRET;
    process.env.LARK_BASE_APP_TOKEN = "test-base";
    process.env.LARK_APP_ID = "test-appid";
    process.env.LARK_APP_SECRET = "test-appsec";
    // SUPABASE_DB_URL is already present in test environment
  });

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

  it("3. Mã bản ghi không tồn tại thì 200 và ghi lỗi vào results", async () => {
    // mock readLarkRecord will throw for rec_not_found
    const req = createRequest({ record_id: "rec_not_found" }, `Bearer ${SECRET}`);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Success");
    expect(body.results[0].error).toMatch(/Lỗi đọc bản ghi/);
  });

  it("4. Đang có lượt chạy thì chờ 1s rồi 200 kèm busy_queued", async () => {
    // Cầm lock từ 1 connection khác
    client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    await client.query("select pg_try_advisory_lock($1)", [LOCK_ID]);

    try {
      const req = createRequest({ record_id: "rec1" }, `Bearer ${SECRET}`);
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skipped).toBe("busy_queued");

      const queueRes = await client.query("select value from settings where key = 'lark_hook_queue'");
      expect(queueRes.rows[0].value.record_ids).toContain("rec1");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
      await client.end();
    }
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
