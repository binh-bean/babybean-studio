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
import { xuLyBoAnhMatDongLark } from "@/lib/lark/ban-ghi-moi";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { baoHinhDaVe } from "@/lib/thong-bao/bao-hinh-da-ve";
import { nhacThongBaoChuaDoc } from "@/lib/thong-bao/nhac-chua-doc";
import { createAdminClient } from "@/lib/supabase/admin";
import { kiemTraLaiCacBoLoi, type KetQuaKiemTraLaiNhieu } from "@/lib/drive/kiem-tra-lai-loi";

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

/**
 * BB-326 mục 5 — phần kiểm lại bộ lỗi Drive chỉ chạy khi lượt này còn ít nhất
 * chừng này thời gian trước trần 60s; dừng hẳn ở mốc `HET_GIO_KIEM_LAI_MS`.
 */
const HET_GIO_KIEM_LAI_MS = 50_000;
const TOI_THIEU_CON_LAI_MS = 8_000;
/** Trần số bộ lỗi kiểm lại mỗi sáng — 76 bộ thật (29/09) xoay vòng trong 2 sáng. */
const GIOI_HAN_KIEM_LAI_CRON = 40;

async function chay(request: Request) {
  const batDauLuc = Date.now();
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

      // BB-332 — lưới đỡ "Lark xoá dòng": lượt đọc trên là quét ĐỦ bảng Hậu Kỳ,
      // nên bộ ảnh neo vào mã dòng không còn trong đó là dòng đã bị xoá. Bộ chưa
      // gửi khách → lưu trữ; bộ đã gửi/có ảnh chọn → chỉ đánh dấu (Việc cần xử
      // lý). Có trần số bộ mỗi lượt (ban-ghi-moi.ts). Hỏng (vd chưa áp 0079) thì
      // ghi log, không kéo cron đỏ.
      let larkXoaDong: Awaited<ReturnType<typeof xuLyBoAnhMatDongLark>> | { loi: string } | null = null;
      if (doc.size > 0) {
        try {
          const { rows: neo } = await client.query<{ r: string }>(
            `select lark_hauky_record_id as r from galleries
              where lark_hauky_record_id is not null and status <> 'archived' and lark_dong_da_xoa_luc is null`,
          );
          const mat = neo.map((x) => x.r).filter((r) => !doc.has(r));
          larkXoaDong = await xuLyBoAnhMatDongLark(client, mat);
        } catch (err) {
          larkXoaDong = { loi: err instanceof Error ? err.message : String(err) };
          console.error(JSON.stringify({ evt: "cron.hau_ky.lark_xoa_dong_loi", lyDo: larkXoaDong.loi }));
        }
      }
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

      // BB-326 mục 5 — bộ ảnh lỗi Drive tự lành: nhân viên bật chia sẻ xong
      // thì sáng hôm sau lỗi tự xoá, không cần ai bấm. Gói Hobby chỉ có hai
      // cron nên gửi nhờ vào lượt này; hỏng thì ghi log, không kéo cron đỏ.
      let kiemLaiLoi: KetQuaKiemTraLaiNhieu | { boQua: string } | { loi: string };
      const hetGioLuc = batDauLuc + HET_GIO_KIEM_LAI_MS;
      if (hetGioLuc - Date.now() < TOI_THIEU_CON_LAI_MS) {
        kiemLaiLoi = { boQua: "Hết giờ trong lượt này" };
      } else {
        try {
          kiemLaiLoi = await kiemTraLaiCacBoLoi(createAdminClient(), {
            branchIds: null,
            gioiHan: GIOI_HAN_KIEM_LAI_CRON,
            hetGioLuc,
            requestId: `cron-hau-ky-${batDauLuc}`,
          });
        } catch (err) {
          kiemLaiLoi = { loi: err instanceof Error ? err.message : String(err) };
          console.error(JSON.stringify({ evt: "cron.hau_ky.kiem_lai_loi_hong", lyDo: kiemLaiLoi.loi }));
        }
      }

      const ketQua = {
        banGhiLark: doc.size,
        ...ghi,
        baoHinhDaVe: sangHinhDaVe.length,
        nhac,
        nhacChuaDoc,
        dongBo,
        kiemLaiLoi,
        larkXoaDong,
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
