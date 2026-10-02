import pg from "pg";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api-response";
import { KHOA_HOOK_LARK, docHangDoi, themVaoHangDoi, xuLyHangDoiHook } from "@/lib/lark/hang-doi-hook";

export const runtime = "nodejs";

const LOCK_ID = KHOA_HOOK_LARK; // ID khoá chia sẻ với cron/sync-lark

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SYNC_CRON_SECRET;
  
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jsonBody = await readJsonBody<{ record_id?: string }>(request);
  if (!jsonBody.ok) {
    console.error("[Lark Hook] Lỗi parse body");
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 200 });
  }
  const body = jsonBody.data;

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
    // BB-351: chưa ghi được vào hàng đợi → bản ghi chỉ còn ở phía Lark; báo lỗi thật.
    return NextResponse.json({ message: "Lỗi kết nối DB" }, { status: 503 });
  }

  try {
    // Lấy khoá (chờ tối đa 1 giây)
    let locked = false;
    for (let i = 0; i < 2; i++) {
      const { rows: lockRows } = await client.query("select pg_try_advisory_lock($1) as locked", [LOCK_ID]);
      if (lockRows[0].locked) {
        locked = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!locked) {
      console.log(`[Lark Hook] Khoá bận, đưa bản ghi ${recordId} vào hàng đợi`);
      await themVaoHangDoi(client, [recordId]);
      return NextResponse.json({ skipped: "busy_queued" }, { status: 200 });
    }

    // BB-351 — ghi bản ghi vừa nhận VÀO hàng đợi trước tiên, rồi mới xử lý; chỉ bản ghi
    // xong trọn mới được rút ra (xem src/lib/lark/hang-doi-hook.ts). Trước đây hàng đợi bị
    // ghi đè `[]` ngay đây, Lark hỏng sau đó là mất hết bản ghi đang chờ.
    await themVaoHangDoi(client, [recordId]);
    const { recordIds: dangCho } = await docHangDoi(client);
    const recordIdsToProcess = [...new Set([...dangCho, recordId])];

    const kq = await xuLyHangDoiHook({ client, recordIds: recordIdsToProcess, appId, appSecret, baseToken, dbUrl });

    // Bản ghi Lark vừa đẩy sang chưa xử lý được → 503 để automation thấy lỗi (và gửi lại
    // nếu nó có thử lại). Bản ghi vẫn nằm trong hàng đợi: lượt hook sau hoặc cron 08:00 rút.
    const banGhiNayHong = kq.conLai.includes(recordId) || kq.boQua.includes(recordId);
    return NextResponse.json(
      {
        message: banGhiNayHong ? "Chưa xử lý được, đã giữ trong hàng đợi" : "Success",
        results: kq.results,
        trangThai: kq.trangThai,
        conTrongHangDoi: kq.conLai,
        boQuaVinhVien: kq.boQua,
        ...(kq.loiChung ? { loi: kq.loiChung } : {}),
      },
      { status: banGhiNayHong ? 503 : 200 },
    );

  } catch (error) {
    console.error("[Lark Hook] Lỗi xử lý:", error);
    // BB-351: lỗi DB trước khi kịp ghi hàng đợi — báo lỗi thật, không giả vờ thành công.
    return NextResponse.json({ message: "Lỗi xử lý hook" }, { status: 503 });
  } finally {
    // Luôn thử unlock (nếu không giữ thì cũng không lỗi)
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]);
    await client.end();
  }
}
