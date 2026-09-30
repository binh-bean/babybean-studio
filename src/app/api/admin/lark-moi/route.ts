/**
 * GET  /api/admin/lark-moi — danh sách "Bản ghi mới từ Lark" cho Bàn làm việc.
 * POST /api/admin/lark-moi — nút "Đồng bộ ngay".
 *
 * BB-332. Spec: docs/27-trang-thai-app-lark.md mục "Bản ghi mới".
 *
 * ---------------------------------------------------------------------------
 * "Gần như tức thì" mà không có cron 5 phút
 * ---------------------------------------------------------------------------
 * Gói Vercel Hobby chỉ cho 2 cron, mỗi cron một lần/ngày (docs/11 §5) — không
 * đặt được cron 5–10 phút. Hook Lark (/api/lark/hook) có sẵn nhưng chỉ bắn khi
 * tự động hoá bên Lark được cấu hình cho sự kiện đó, app không cấu hình hộ được
 * (không ghi sang Lark). Nên:
 *   1. hook Lark bắn dòng nào → ghi ngay dòng đó (đường hook);
 *   2. GET ở đây: lượt cuối cũ hơn 5 phút thì đồng bộ luôn trước khi trả —
 *      nghĩa là khi có nhân viên đang mở Bàn làm việc, dữ liệu không cũ quá 5
 *      phút; không ai mở thì không tốn lượt gọi Lark nào;
 *   3. POST "Đồng bộ ngay" — bỏ qua mốc 5 phút, nhưng tối đa 1 lượt/30 giây;
 *   4. cron sáng 08:00 quét đủ bảng làm lưới đỡ cho phần "Lark xoá dòng".
 * Một lượt = ~4 lượt gọi Lark (token, danh sách bảng, search, batch_get).
 *
 * Bảng `lark_ban_ghi_moi` đến từ migration 0079 (CHƯA ÁP). Chưa áp thì trả
 * danh sách rỗng kèm `chuaApMigration: true`, không 500.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import type { StaffSession } from "@/types/domain";
import { dongBoBanGhiMoi, taoNguonLark, type KetQuaBanGhiMoi } from "@/lib/lark/ban-ghi-moi";
import { trangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";
import { ghiNhatKy } from "@/lib/nhat-ky";

export const runtime = "nodejs";
export const maxDuration = 30;

const KHOA = 332_0001;
const KHOA_LUOT = "lark_ban_ghi_moi_luot";
const CACH_TU_DONG_MS = 5 * 60_000;
const CACH_BAM_TAY_MS = 30_000;
const BLOCKED_ROLES = ["photoshop_ctv"];

function laThieuBang(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

async function lanCuoi(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ ts: string | null }>(
    `select value->>'timestamp' as ts from settings where key = $1 and branch_id is null limit 1`,
    [KHOA_LUOT],
  );
  return rows[0]?.ts ? Number(rows[0].ts) : 0;
}

async function ghiLanCuoi(client: pg.Client, ts: number) {
  const v = JSON.stringify({ timestamp: ts });
  const r = await client.query(`update settings set value = $1::jsonb where key = $2 and branch_id is null`, [v, KHOA_LUOT]);
  if (!r.rowCount) await client.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [KHOA_LUOT, v]);
}

/** Đồng bộ nếu đã quá `cach` ms kể từ lượt trước. Lỗi Lark không làm hỏng việc đọc danh sách. */
async function dongBoNeuCan(
  client: pg.Client,
  cach: number,
): Promise<{ daChay: boolean; ketQua?: KetQuaBanGhiMoi; loi?: string; luc: number }> {
  const truoc = await lanCuoi(client);
  if (Date.now() - truoc < cach) return { daChay: false, luc: truoc };
  const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN, SUPABASE_DB_URL } = process.env;
  if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) {
    return { daChay: false, loi: "Thiếu cấu hình Lark", luc: truoc };
  }
  const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [KHOA]);
  if (!rows[0]?.ok) return { daChay: false, luc: truoc };
  try {
    const bayGio = Date.now();
    // Ghi mốc TRƯỚC khi gọi Lark: Lark hỏng thì 5 phút sau mới thử lại, không
    // dội Lark mỗi lần có người tải lại trang.
    await ghiLanCuoi(client, bayGio);
    try {
      const nguon = await taoNguonLark({ appId: LARK_APP_ID, appSecret: LARK_APP_SECRET, baseToken: LARK_BASE_APP_TOKEN });
      const ketQua = await dongBoBanGhiMoi({ client, nguon, dbUrl: SUPABASE_DB_URL });
      return { daChay: true, ketQua, luc: bayGio };
    } catch (err) {
      if (laThieuBang(err)) throw err;
      const loi = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ evt: "lark_moi.dong_bo_loi", loi }));
      return { daChay: true, loi: "Không đọc được Lark lúc này", luc: bayGio };
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [KHOA]);
  }
}

interface DongTho {
  lark_record_id: string;
  ten_khach: string;
  so_dien_thoai: string | null;
  goi_chup: string;
  ma_hoa_don: string | null;
  ngay_chup: string | null;
  chi_nhanh_lark: string | null;
  branch_id: string | null;
  drive_url: string | null;
  thay_luc: Date;
}

async function docDanhSach(client: pg.Client, staff: StaffSession) {
  const toanQuyen = staff.permissions.includes("system:superuser");
  const { rows } = await client.query<DongTho>(
    `select lark_record_id, ten_khach, so_dien_thoai, goi_chup, ma_hoa_don, ngay_chup::text as ngay_chup,
            chi_nhanh_lark, branch_id, drive_url, thay_luc
       from lark_ban_ghi_moi
      where gallery_id is null
        and ($1::boolean or branch_id = any($2::uuid[]))
      order by thay_luc desc
      limit 100`,
    [toanQuyen, staff.branchIds],
  );
  return rows.map((r) => {
    const tt = trangThaiBoAnh({ status: null, coDriveLink: !!r.drive_url, coLinkApp: false });
    return {
      recordId: r.lark_record_id,
      tenKhach: r.ten_khach,
      soDienThoai: r.so_dien_thoai,
      goiChup: r.goi_chup,
      maHoaDon: r.ma_hoa_don,
      ngayChup: r.ngay_chup,
      chiNhanh: r.chi_nhanh_lark,
      coDriveLink: !!r.drive_url,
      thayLuc: r.thay_luc.toISOString(),
      trangThai: { ma: tt.ma, nhan: tt.quanTri },
    };
  });
}

async function xuLy(request: Request, bamTay: boolean): Promise<Response> {
  const requestId = randomUUID();
  let client: pg.Client | null = null;
  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) return fail("FORBIDDEN", "Vai trò này không xem được bản ghi mới từ Lark");
    if (bamTay) requirePermission(staff, "galleries:write");

    const dbUrl = process.env.SUPABASE_DB_URL;
    if (!dbUrl) return fail("INTERNAL", "Thiếu cấu hình cơ sở dữ liệu", { requestId });
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    // Chưa áp 0079: dừng ở đây — không gọi Lark, không ghi mốc vào settings.
    const { rows: coBang } = await client.query<{ t: string | null }>(
      `select to_regclass('public.lark_ban_ghi_moi')::text as t`,
    );
    if (!coBang[0]?.t) {
      return ok({ dong: [], dongBoLuc: null, vuaDongBo: false, ketQua: null, loiDongBo: null, chuaApMigration: true });
    }

    // `?ma=rec…` — thuật sĩ tạo bộ ảnh đọc MỘT dòng để điền sẵn; không đồng bộ.
    const ma = new URL(request.url).searchParams.get("ma");
    if (!bamTay && ma) {
      if (!/^rec[A-Za-z0-9]{3,40}$/.test(ma)) return fail("INVALID_INPUT");
      const { rows } = await client.query<{
        ma_hoa_don: string | null;
        so_dien_thoai: string | null;
        drive_url: string | null;
        branch_id: string | null;
      }>(`select ma_hoa_don, so_dien_thoai, drive_url, branch_id from lark_ban_ghi_moi where lark_record_id = $1`, [ma]);
      const r = rows[0];
      const toanQuyen = staff.permissions.includes("system:superuser");
      if (!r || (!toanQuyen && !(r.branch_id && staff.branchIds.includes(r.branch_id)))) return fail("NOT_FOUND");
      return ok({ banGhi: { maHoaDon: r.ma_hoa_don, soDienThoai: r.so_dien_thoai, driveUrl: r.drive_url } });
    }

    try {
      const dongBo = await dongBoNeuCan(client, bamTay ? CACH_BAM_TAY_MS : CACH_TU_DONG_MS);
      // BB-336 (luật BB-052): lượt đồng bộ không chỉ chép dữ liệu Lark vào
      // `lark_ban_ghi_moi` — Lark xoá dòng thì nó LƯU TRỮ bộ ảnh chưa gửi
      // khách và đánh dấu bộ đã gửi (`xuLyBoAnhMatDongLark`). Đó là đổi trạng
      // thái bộ ảnh, nên phải để dấu. Ghi khi nhân viên bấm "Đồng bộ ngay",
      // hoặc khi lượt tự động thật sự đụng tới bộ ảnh — lượt 5 phút không đổi
      // gì thì không ghi, tránh nhật ký ngập dòng không ai đọc.
      const k = dongBo.ketQua;
      if (dongBo.daChay && (bamTay || (k && k.luuTruBoAnh + k.danhDauLarkXoa > 0))) {
        await ghiNhatKy({
          actorType: "staff",
          actorId: staff.staffId,
          action: "lark.ban_ghi_moi_dong_bo",
          entityType: "lark_ban_ghi_moi",
          metadata: {
            bamTay,
            ketQua: k ?? null,
            loi: dongBo.loi ?? null,
          },
        });
      }
      const dong = await docDanhSach(client, staff);
      return ok({
        dong,
        dongBoLuc: dongBo.luc ? new Date(dongBo.luc).toISOString() : null,
        vuaDongBo: dongBo.daChay,
        ketQua: dongBo.ketQua ?? null,
        loiDongBo: dongBo.loi ?? null,
      });
    } catch (err) {
      if (laThieuBang(err)) {
        return ok({ dong: [], dongBoLuc: null, vuaDongBo: false, ketQua: null, loiDongBo: null, chuaApMigration: true });
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  } finally {
    await client?.end().catch(() => {});
  }
}

export async function GET(request: Request) {
  return xuLy(request, false);
}

export async function POST(request: Request) {
  return xuLy(request, true);
}
