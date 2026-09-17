import pg from "pg";
import { NextResponse } from "next/server";
import {
  larkAuth,
  readLarkRecord,
  syncSingleRetouchRecord,
} from "@/lib/lark/sync-retouch";

export const runtime = "nodejs";

const LOCK_ID = 152111; // ID khoá chia sẻ với cron/sync-lark

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SYNC_CRON_SECRET;
  
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[Lark Hook] Lỗi parse body:", err);
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 200 });
  }

  const recordId = body?.record_id;
  if (!recordId) {
    console.error("[Lark Hook] Thiếu record_id trong body");
    return NextResponse.json({ message: "Missing record_id" }, { status: 200 });
  }

  const baseToken = process.env.LARK_BASE_APP_TOKEN;
  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!baseToken || !appId || !appSecret || !dbUrl) {
    console.error("[Lark Hook] Thiếu cấu hình môi trường");
    return NextResponse.json({ message: "Thiếu cấu hình môi trường" }, { status: 200 });
  }

  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
  } catch (err) {
    console.error("[Lark Hook] Lỗi kết nối DB:", err);
    return NextResponse.json({ message: "Lỗi kết nối DB" }, { status: 200 });
  }

  try {
    // Lấy khoá (không chờ, nếu đang chạy thì bỏ qua)
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    if (!lockRows[0].locked) {
      return NextResponse.json({ skipped: "busy" }, { status: 200 });
    }

    // Load master data
    const { rows: branchRows } = await client.query(
      `select id, code, name from branches where is_active = true`
    );
    const { rows: staffRows } = await client.query(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`
    );

    // Xác thực Lark
    const auth = await larkAuth(appId, appSecret);
    
    // Đọc bảng, lấy đúng 1 bản ghi
    const { record } = await readLarkRecord(auth, baseToken, /h[aậ]u\s*k[yỳ]/i, recordId);

    // Xử lý bản ghi
    const res = await syncSingleRetouchRecord({
      client,
      record,
      branches: branchRows,
      staffList: staffRows,
      write: true,
      index: 0,
      dbUrl,
    });

    return NextResponse.json({
      message: "Success",
      result: res
    }, { status: 200 });

  } catch (error) {
    console.error("[Lark Hook] Lỗi xử lý:", error);
    // Bắt buộc trả 200 để Lark không thử lại vô hạn
    return NextResponse.json({ message: "Lỗi xử lý nhưng trả 200 để báo Lark" }, { status: 200 });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    await client.end();
  }
}
