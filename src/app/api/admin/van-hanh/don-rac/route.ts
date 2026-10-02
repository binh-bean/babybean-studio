/**
 * GET  /api/admin/van-hanh/don-rac — dung lượng DB/Storage so với hạn mức gói Free
 *                                   + chính sách giữ dữ liệu. Không ghi gì.
 * POST /api/admin/van-hanh/don-rac — một lượt dọn dữ liệu vận hành.
 *        body { thuTruoc: true }                    → XEM TRƯỚC (chỉ đếm, giao dịch chỉ đọc)
 *        body { thuTruoc: false, xacNhan: "DON" }   → dọn thật
 *
 * OWNER: DEV-BE. Task BB-356.
 *
 * Chỉ Admin (vai có `system:superuser` VÀ `settings:system`). Dọn thật phải kèm
 * chuỗi xác nhận — một cú POST lỡ tay không có nó thì bị từ chối. Mỗi lượt (kể
 * cả xem trước) ghi MỘT dòng nhật ký `van_hanh.don_rac`, chỉ có con số.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { CHINH_SACH, KHOA_DON_RAC, donRac, ghiNhatKyDonRac } from "@/lib/van-hanh/don-rac";
import { docDungLuong } from "@/lib/van-hanh/dung-luong";

export const runtime = "nodejs";

const BodySchema = z.object({
  thuTruoc: z.boolean(),
  xacNhan: z.literal("DON").optional(),
});

async function kiemQuyen() {
  const staff = await requireStaff();
  requirePermission(staff, "settings:system");
  requirePermission(staff, "system:superuser");
  return staff;
}

function moKetNoi(): pg.Client | null {
  const { SUPABASE_DB_URL } = process.env;
  if (!SUPABASE_DB_URL) return null;
  return new pg.Client({ connectionString: SUPABASE_DB_URL });
}

function traLoiQuyen(err: unknown) {
  if (err instanceof AuthError) {
    return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
  }
  return null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  let client: pg.Client | null = null;
  try {
    await kiemQuyen();
    client = moKetNoi();
    if (!client) return fail("INTERNAL", "Thiếu cấu hình cơ sở dữ liệu");
    await client.connect();
    const dungLuong = await docDungLuong(client);
    return ok({ dungLuong, chinhSach: CHINH_SACH });
  } catch (err) {
    return traLoiQuyen(err) ?? failUnexpected(err, requestId);
  } finally {
    await client?.end().catch(() => {});
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  let client: pg.Client | null = null;
  try {
    const staff = await kiemQuyen();

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = BodySchema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const { thuTruoc, xacNhan } = parsed.data;
    if (!thuTruoc && xacNhan !== "DON") {
      return fail("INVALID_INPUT", "Dọn thật cần xác nhận");
    }

    client = moKetNoi();
    if (!client) return fail("INTERNAL", "Thiếu cấu hình cơ sở dữ liệu");
    await client.connect();

    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [KHOA_DON_RAC]);
    if (!rows[0]?.ok) return fail("CONFLICT", "Một lượt dọn khác đang chạy, đợi một chút rồi xem lại.");
    try {
      const ketQua = await donRac(client, { thuTruoc, hanMs: 45_000 });
      await ghiNhatKyDonRac(client, ketQua, { actorType: "staff", actorId: staff.staffId, actorLabel: staff.roleName ?? staff.role });
      console.info(
        JSON.stringify({ evt: "van_hanh.don_rac", thuTruoc, tongXoa: ketQua.tongXoa, hetGio: ketQua.hetGio }),
      );
      return ok(ketQua);
    } finally {
      await client.query("select pg_advisory_unlock($1)", [KHOA_DON_RAC]).catch(() => {});
    }
  } catch (err) {
    return traLoiQuyen(err) ?? failUnexpected(err, requestId);
  } finally {
    await client?.end().catch(() => {});
  }
}
