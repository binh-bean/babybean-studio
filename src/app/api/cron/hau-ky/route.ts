/**
 * GET/POST /api/cron/hau-ky — BB-200: đọc trạng thái hậu kỳ từ Lark rồi gửi tin nhắc.
 *
 * OWNER: PM. Spec: docs/21.
 *
 * Chạy 08:00 giờ Việt Nam mỗi ngày (vercel.json, `0 1 * * *` UTC) — gói Hobby
 * chỉ cho hai cron, mỗi cron một lần một ngày (docs/11 §5). Tin nhắc là việc
 * đầu giờ của CSKH nên một lượt buổi sáng là đúng nhịp.
 *
 * Thứ tự: đọc Lark → ghi trạng thái → tính mốc nhắc. Đọc Lark hỏng thì DỪNG,
 * không chạy bộ nhắc trên số liệu hôm qua (nhắc sai còn tệ hơn không nhắc) và
 * trả 500 để lịch chạy báo đỏ, không im lặng báo xanh.
 *
 * MỘT CHIỀU: không ghi cột nào lên Lark. Tin nhắc đi vào nhóm chat của chi nhánh
 * qua webhook (notify.ts), không đụng bảng Hậu Kỳ.
 */

import { NextResponse } from "next/server";
import pg from "pg";
import { docTrangThaiTuLark, ghiTrangThaiVaoGalleries } from "@/lib/lark/doc-trang-thai-lark";
import { chayNhacHauKy } from "@/lib/lark/nhac-hau-ky";
import { dongBoBoAnhTuLark, type KetQuaDongBo } from "@/lib/lark/dong-bo-bo-anh";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { baoHinhDaVe } from "@/lib/thong-bao/bao-hinh-da-ve";
import { nhacThongBaoChuaDoc } from "@/lib/thong-bao/nhac-chua-doc";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Khoá tư vấn để hai lượt (Vercel + chạy tay) không chồng nhau. */
const KHOA = 200_2509;

function duocPhep(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const khoa = [process.env.CRON_SECRET, process.env.SYNC_CRON_SECRET].filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );
  return khoa.some((k) => header === `Bearer ${k}`);
}

async function chay(request: Request) {
  if (!duocPhep(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN, SUPABASE_DB_URL } = process.env;
  if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN || !SUPABASE_DB_URL) {
    return NextResponse.json({ error: "Thiếu cấu hình Lark hoặc SUPABASE_DB_URL" }, { status: 500 });
  }

  const client = new pg.Client({ connectionString: SUPABASE_DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query("select pg_try_advisory_lock($1) as ok", [KHOA]);
    if (!rows[0]?.ok) return NextResponse.json({ data: { boQua: "Lượt khác đang chạy" } });

    try {
      // BB-256 — lưới đỡ cho hook: dựng bộ ảnh Lark bắn hụt. Hỏng thì ghi log và
      // chạy tiếp phần trạng thái/nhắc — hai việc độc lập, không để cái này kéo
      // cái kia chết theo.
      let dongBo: KetQuaDongBo | { loi: string };
      try {
        dongBo = await dongBoBoAnhTuLark({
          client,
          appId: LARK_APP_ID,
          appSecret: LARK_APP_SECRET,
          baseToken: LARK_BASE_APP_TOKEN,
          dbUrl: SUPABASE_DB_URL,
        });
      } catch (err) {
        dongBo = { loi: err instanceof Error ? err.message : String(err) };
        console.error(JSON.stringify({ evt: "cron.hau_ky.dong_bo_loi", lyDo: dongBo.loi }));
      }

      const doc = await docTrangThaiTuLark({
        appId: LARK_APP_ID,
        appSecret: LARK_APP_SECRET,
        baseToken: LARK_BASE_APP_TOKEN,
      });
      const { sangHinhDaVe, ...ghi } = await ghiTrangThaiVaoGalleries(client, doc);
      // BB-250 — lưới đỡ: bộ nào hook (BB-252) đã báo thì ở đây thấy 9 → 9,
      // không báo lại. Tuần tự: vài bộ mỗi sáng; baoHinhDaVe không ném.
      for (const id of sangHinhDaVe) await baoHinhDaVe(id);
      const nhac = await chayNhacHauKy({
        client,
        cheSo: cheSoDienThoai,
        gui: (tin) =>
          enqueueLarkNotification({
            branchId: tin.branchId,
            event: "hau_ky.nhac",
            payload: { loai: tin.maNhac, nguoiNhan: tin.nguoiNhan, cacBo: tin.boAnh },
          }),
      });
      // BB-261 — nhắc lại thông báo khách CHƯA ĐỌC. Sau phần nhắc hậu kỳ:
      // độc lập với Lark, dùng client supabase-js (service_role) chứ không
      // phải client `pg` ở trên. Hàm này tự không bao giờ ném; bọc thêm một
      // lớp try/catch ở đây để chắc chắn lỗi bất ngờ không kéo sập cron.
      let nhacChuaDoc = 0;
      try {
        nhacChuaDoc = await nhacThongBaoChuaDoc(createAdminClient());
      } catch (err) {
        console.error(
          JSON.stringify({
            evt: "cron.hau_ky.nhac_chua_doc_loi",
            lyDo: err instanceof Error ? err.message : String(err),
          }),
        );
      }

      const ketQua = {
        banGhiLark: doc.size,
        ...ghi,
        baoHinhDaVe: sangHinhDaVe.length,
        nhac,
        nhacChuaDoc,
        dongBo,
      };
      console.info(JSON.stringify({ evt: "cron.hau_ky.xong", ...ketQua }));
      return NextResponse.json({ data: ketQua });
    } finally {
      await client.query("select pg_advisory_unlock($1)", [KHOA]);
    }
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "cron.hau_ky.failed", lyDo: err instanceof Error ? err.message : String(err) }),
    );
    return NextResponse.json({ error: "HAU_KY_FAILED" }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function GET(request: Request) {
  return chay(request);
}

export async function POST(request: Request) {
  return chay(request);
}
