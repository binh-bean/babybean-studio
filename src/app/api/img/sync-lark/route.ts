import pg from "pg";
import {
  larkAuth,
  readLarkTable,
  syncSingleRetouchRecord,
  checkRetouchTrigger,
} from "@/lib/lark/sync-retouch";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYNC_KEY = "lark_retouch_last_sync";
const LOCK_ID = 152111; // ID khoá

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

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Lấy khoá (không chờ, nếu đang chạy thì bỏ qua)
    const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
    if (!lockRows[0].locked) {
      return NextResponse.json({ message: "Tiến trình khác đang chạy, nhường" }, { status: 200 });
    }

    // Lấy thời gian đồng bộ lần trước
    const { rows: settingRows } = await client.query(
      "select value->>'timestamp' as ts from settings where key = $1 and branch_id is null limit 1",
      [SYNC_KEY]
    );
    const lastSyncTime = settingRows.length > 0 && settingRows[0].ts ? Number(settingRows[0].ts) : 0;

    // Load master data
    const { rows: branchRows } = await client.query(
      `select id, code, name from branches where is_active = true`
    );
    const { rows: staffRows } = await client.query(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`
    );

    // Xác thực Lark
    const auth = await larkAuth(appId, appSecret);
    
    // Đọc bảng, truyền mốc thời gian
    const { records } = await readLarkTable(auth, baseToken, /h[aậ]u\s*k[yỳ]/i, {
      lastModifiedTime: lastSyncTime
    });

    let maxModifiedTime = lastSyncTime;
    const qualifiedRecords: LarkRecord[] = [];

    for (const record of records) {
      const recWithTime = record as LarkRecord & { last_modified_time?: number };
      if (recWithTime.last_modified_time && recWithTime.last_modified_time > maxModifiedTime) {
        maxModifiedTime = recWithTime.last_modified_time;
      }
      const trigger = checkRetouchTrigger(record.fields);
      if (!trigger.isStatusExcluded && trigger.triggered) {
        qualifiedRecords.push(record);
      }
    }

    let createdCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (let i = 0; i < qualifiedRecords.length; i++) {
      const record = qualifiedRecords[i];
      try {
        const res = await syncSingleRetouchRecord({
          client,
          record,
          branches: branchRows,
          staffList: staffRows,
          write: true,
          index: i,
        });

        if (res.action === "created") createdCount++;
        else if (res.action === "already_exists") existingCount++;
      } catch {
        errorCount++;
      }
    }

    // Cập nhật thời gian đồng bộ nếu có records mới
    if (records.length > 0 && maxModifiedTime > lastSyncTime) {
      const newValue = JSON.stringify({ timestamp: maxModifiedTime });
      if (settingRows.length > 0) {
        await client.query("update settings set value = $1::jsonb where key = $2 and branch_id is null", [newValue, SYNC_KEY]);
      } else {
        await client.query("insert into settings (key, value) values ($1, $2::jsonb)", [SYNC_KEY, newValue]);
      }
    }

    return NextResponse.json({
      message: "Success",
      stats: {
        fetched: records.length,
        qualified: qualifiedRecords.length,
        created: createdCount,
        updated: existingCount,
        errors: errorCount,
        lastModifiedTime: maxModifiedTime
      }
    });

  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    await client.end();
  }
}
