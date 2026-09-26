import pg from "pg";
import { NextResponse } from "next/server";
import { dongBoBoAnhTuLark } from "@/lib/lark/dong-bo-bo-anh";

export const runtime = "nodejs";

/**
 * Chạy tay lượt dựng bộ ảnh từ Lark. Thân việc nằm ở `dongBoBoAnhTuLark`
 * (BB-256) — cron hậu kỳ 08:00 cũng gọi hàm đó mỗi sáng làm lưới đỡ cho hook.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SYNC_CRON_SECRET;
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseToken = process.env.LARK_BASE_APP_TOKEN;
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!baseToken || !appId || !appSecret || !dbUrl) {
    return NextResponse.json({ error: "Thiếu cấu hình môi trường" }, { status: 500 });
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const kq = await dongBoBoAnhTuLark({ client, appId, appSecret, baseToken, dbUrl });
    if (kq.nhuong) return NextResponse.json({ message: "Tiến trình khác đang chạy, nhường" }, { status: 200 });
    const { nhuong: _n, ...stats } = kq;
    return NextResponse.json({ message: "Success", stats });
  } finally {
    await client.end();
  }
}
