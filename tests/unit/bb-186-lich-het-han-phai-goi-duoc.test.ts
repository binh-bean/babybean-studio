/**
 * BB-186 — lịch cho link hết hạn phải THẬT SỰ gọi được.
 *
 * Soát ngày 18.09.2026: `/api/cron/expire-galleries` nằm trong `vercel.json`
 * từ đầu nhưng **chưa bao giờ chạy**, vì hai lỗi chồng nhau:
 *
 *   1. Handler chỉ có `POST`. Vercel Cron gọi bằng `GET` → 405 mỗi ngày.
 *   2. Handler kiểm `SYNC_CRON_SECRET`, Vercel gửi `Bearer $CRON_SECRET` → 401.
 *
 * Cả hai đều im lặng: cửa đóng đúng cách, không ai thấy gì hỏng. Cùng hình
 * dạng với BB-152 và BB-164 — tính năng chết im lặng khó thấy hơn tính năng
 * báo lỗi.
 *
 * Ba ca dưới đây khoá đúng ba điều đó, cộng một ca đọc thẳng `vercel.json`:
 * đừng xếp lịch cho một đường không tồn tại.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const goc = path.resolve(__dirname, "../..");

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    // Đủ để đường đi hết mà không chạm cơ sở dữ liệu. Ca ở đây kiểm CỬA VÀO,
    // không kiểm phần đổi dữ liệu — phần đó đã có ca riêng của BB-183.
    const ketQua = { data: 0, error: null, count: 0 };
    const chuoi: Record<string, unknown> = {};
    for (const ten of [
      "from", "update", "select", "eq", "not", "lt", "gte", "lte",
      // BB-167: lượt chạy này còn gọi `guiLaiThongBaoDangCho`, dùng thêm ba móc nữa.
      "in", "order", "limit",
    ]) {
      chuoi[ten] = () => chuoi;
    }
    chuoi.then = (giai: (v: unknown) => unknown) => Promise.resolve(ketQua).then(giai);
    return { rpc: async () => ketQua, ...chuoi };
  },
}));

import { GET, POST } from "@/app/api/cron/expire-galleries/route";

const KHOA_VERCEL = "khoa-cua-vercel";
const KHOA_DU_AN = "khoa-cua-du-an";

function goiVoi(khoa?: string) {
  return new Request("http://localhost/api/cron/expire-galleries", {
    headers: khoa ? { authorization: `Bearer ${khoa}` } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = KHOA_VERCEL;
  process.env.SYNC_CRON_SECRET = KHOA_DU_AN;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SYNC_CRON_SECRET;
});

describe("BB-186 — lịch cho link hết hạn", () => {
  it("Vercel Cron gọi bằng GET thì KHÔNG được 405", async () => {
    // Đây là lỗi (1). Trước bản vá, tệp route không hề xuất `GET`, nên Next.js
    // trả 405 cho mọi lượt chạy hàng ngày — suốt từ lúc dựng.
    expect(typeof GET).toBe("function");

    const res = await GET(goiVoi(KHOA_VERCEL));
    expect(res.status).toBe(200);
  });

  it("nhận khoá CRON_SECRET của Vercel, chứ không chỉ SYNC_CRON_SECRET", async () => {
    // Đây là lỗi (2). Tên `CRON_SECRET` do Vercel quy định và không đổi được,
    // nên route phải nhận nó — không thể bắt Vercel gửi tên khác.
    expect((await GET(goiVoi(KHOA_VERCEL))).status).toBe(200);

    // Và vẫn phải nhận khoá cũ, để đường gọi tay bằng curl không chết.
    expect((await POST(goiVoi(KHOA_DU_AN))).status).toBe(200);
  });

  it("không khoá, hoặc khoá sai, thì vẫn 401", async () => {
    expect((await GET(goiVoi())).status).toBe(401);
    expect((await GET(goiVoi("khoa-bia"))).status).toBe(401);

    // Thiếu CẢ HAI biến môi trường thì từ chối, không có nhánh "chưa cấu hình
    // thì cho qua": đường này sửa dữ liệu của mọi chi nhánh.
    delete process.env.CRON_SECRET;
    delete process.env.SYNC_CRON_SECRET;
    expect((await GET(goiVoi("bat-ky-gi"))).status).toBe(401);
  });

  it("mọi đường trong vercel.json phải có route thật", async () => {
    // `send-reminders` nằm trong `crons` mà route không tồn tại: Vercel gọi vào
    // một 404 mỗi ngày lúc 02:00 UTC, từ lúc dựng tới 18/09/2026.
    const cfg = JSON.parse(fs.readFileSync(path.join(goc, "vercel.json"), "utf8")) as {
      crons?: { path: string }[];
    };

    for (const c of cfg.crons ?? []) {
      const thuMuc = path.join(goc, "src/app", c.path);
      const coRoute =
        fs.existsSync(path.join(thuMuc, "route.ts")) ||
        fs.existsSync(path.join(thuMuc, "route.tsx"));
      expect(coRoute, `vercel.json xếp lịch cho ${c.path} nhưng không có route`).toBe(true);
    }
  });
});
