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

  /**
   * Ca quan trọng nhất của BB-182, và là thứ ca 4 chưa chứng minh được.
   *
   * Ca 4 chỉ nói "đã xếp vào hàng đợi". Nhưng hàng đợi không ai rút thì cũng
   * là mất — chỉ khác chỗ mất có dấu vết.
   *
   * Lỗi gốc: lúc bận trả 200 nên Lark coi như xong và KHÔNG gọi lại. Nhân viên
   * sửa hai dòng sát nhau thì dòng thứ hai rơi mất trong im lặng. Bản vá chỉ đúng
   * nếu lượt gọi KẾ TIẾP rút được bản ghi đó ra xử.
   */
  it("6. Bản ghi bị xếp hàng được xử ở lượt gọi kế tiếp, không rơi mất", async () => {
    const con = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
    await con.connect();

    try {
      // 1. Cầm khoá từ một kết nối khác — giả lập đang có lượt chạy.
      await con.query("select pg_try_advisory_lock($1)", [LOCK_ID]);
      const res1 = await POST(createRequest({ record_id: "rec_xep_hang" }, `Bearer ${SECRET}`));
      expect((await res1.json()).skipped).toBe("busy_queued");

      // 2. Nhả khoá, rồi gọi một bản ghi KHÁC.
      await con.query("select pg_advisory_unlock($1)", [LOCK_ID]);
      const res2 = await POST(createRequest({ record_id: "rec_sau" }, `Bearer ${SECRET}`));
      const body2 = await res2.json();

      // 3. Lượt này phải xử CẢ bản ghi bị xếp hàng lẫn bản ghi mới.
      const daXu = (body2.results ?? []).map((r: { record_id: string }) => r.record_id);
      expect(
        daXu,
        "bản ghi bị xếp hàng không được rút ra — lỗi BB-182 đã quay lại",
      ).toContain("rec_xep_hang");
      expect(daXu).toContain("rec_sau");

      // 4. Hàng đợi phải trống sau khi rút.
      const q = await con.query(
        "select value from settings where key = 'lark_hook_queue' and branch_id is null",
      );
      const conLai = q.rows[0]?.value?.record_ids ?? [];
      expect(conLai, "hàng đợi chưa được dọn sau khi xử").not.toContain("rec_xep_hang");
    } finally {
      await con.query("select pg_advisory_unlock_all()").catch(() => {});
      await con.end();
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
