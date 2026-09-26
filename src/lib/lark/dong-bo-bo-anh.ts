/**
 * BB-256 — dựng bộ ảnh từ bảng Hậu Kỳ của Lark (phần thân của /api/cron/sync-lark,
 * tách ra để cron hậu kỳ 08:00 gọi được).
 *
 * Vì sao cần: bộ ảnh mới vào app qua hook Lark (BB-179) — Lark bắn hụt một lượt
 * là bộ đó KHÔNG BAO GIỜ vào app, CSKH không biết. Route /api/cron/sync-lark có
 * sẵn nhưng chưa từng được lên lịch (gói Hobby chỉ cho 2 cron). Chạy nó ké trong
 * cron hậu kỳ mỗi sáng thì bộ bị sót chậm nhất một ngày là có. 26/09/2026 soát
 * thấy 2 bộ đủ điều kiện mà chưa có trong app.
 *
 * Đọc tăng dần theo mốc `lark_retouch_last_sync` (settings) như route cũ; khoá
 * 152111 dùng chung với hook và route cũ — đang có lượt khác thì nhường.
 */
import type pg from "pg";
import {
  larkAuth,
  readLarkTable,
  syncSingleRetouchRecord,
  checkRetouchTrigger,
  type LarkRecord,
} from "@/lib/lark/sync-retouch";

const SYNC_KEY = "lark_retouch_last_sync";
const LOCK_ID = 152111;

export interface KetQuaDongBo {
  nhuong?: true;
  fetched: number;
  qualified: number;
  created: number;
  updated: number;
  errors: number;
  lastModifiedTime: number;
}

export async function dongBoBoAnhTuLark(opts: {
  client: pg.Client | pg.PoolClient;
  appId: string;
  appSecret: string;
  baseToken: string;
  dbUrl: string;
}): Promise<KetQuaDongBo> {
  const { client } = opts;
  const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
  if (!lockRows[0].locked) {
    return { nhuong: true, fetched: 0, qualified: 0, created: 0, updated: 0, errors: 0, lastModifiedTime: 0 };
  }
  try {
    const { rows: settingRows } = await client.query(
      "select value->>'timestamp' as ts from settings where key = $1 and branch_id is null limit 1",
      [SYNC_KEY],
    );
    const lastSyncTime = settingRows.length > 0 && settingRows[0].ts ? Number(settingRows[0].ts) : 0;

    const { rows: branchRows } = await client.query(`select id, code, name from branches where is_active = true`);
    const { rows: staffRows } = await client.query(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`,
    );

    const auth = await larkAuth(opts.appId, opts.appSecret);
    const { records } = await readLarkTable(auth, opts.baseToken, /h[aậ]u\s*k[yỳ]/i, {
      lastModifiedTime: lastSyncTime,
    });

    let maxModifiedTime = lastSyncTime;
    const qualifiedRecords: LarkRecord[] = [];
    for (const record of records) {
      const recWithTime = record as LarkRecord & { last_modified_time?: number };
      if (recWithTime.last_modified_time && recWithTime.last_modified_time > maxModifiedTime) {
        maxModifiedTime = recWithTime.last_modified_time;
      }
      const trigger = checkRetouchTrigger(record.fields);
      if (!trigger.isStatusExcluded && trigger.triggered) qualifiedRecords.push(record);
    }

    let created = 0;
    let updated = 0;
    let errors = 0;
    for (const [i, record] of qualifiedRecords.entries()) {
      try {
        const res = await syncSingleRetouchRecord({
          client,
          record,
          branches: branchRows,
          staffList: staffRows,
          write: true,
          index: i,
          dbUrl: opts.dbUrl,
        });
        if (res.action === "created") created++;
        else if (res.action === "already_exists") updated++;
      } catch (err) {
        errors++;
        console.error(`[dong-bo-bo-anh] Lỗi bản ghi ${record.record_id}:`, err);
      }
    }

    if (records.length > 0 && maxModifiedTime > lastSyncTime) {
      const newValue = JSON.stringify({ timestamp: maxModifiedTime });
      if (settingRows.length > 0) {
        await client.query("update settings set value = $1::jsonb where key = $2 and branch_id is null", [newValue, SYNC_KEY]);
      } else {
        await client.query("insert into settings (key, value) values ($1, $2::jsonb)", [SYNC_KEY, newValue]);
      }
    }

    return { fetched: records.length, qualified: qualifiedRecords.length, created, updated, errors, lastModifiedTime: maxModifiedTime };
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
  }
}
