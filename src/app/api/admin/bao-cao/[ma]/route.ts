/**
 * GET /api/admin/bao-cao/[ma] — chạy một báo cáo trong sổ đăng ký BB-260.
 *
 * OWNER: DEV-BE. Task BB-260. Spec: brief BB-260, `src/lib/bao-cao/README.md`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao lọc chi nhánh ở ĐÂY, không phải trong từng báo cáo
 * ---------------------------------------------------------------------------
 * Mỗi báo cáo chỉ nhận `ctx.chiNhanhIds` đã được route này thu hẹp theo
 * `staff.branchIds`/`system:superuser` — giống cách `GET
 * /api/admin/can-xu-ly` và `GET /api/admin/reports/over-quota` đã làm. Báo
 * cáo không tự quyết định nhân viên này thấy chi nhánh nào; nó chỉ tin những
 * gì route đưa vào `ctx`.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { layBaoCao } from "@/lib/bao-cao/dang-ky";
import { bangThanhCsv } from "@/lib/bao-cao/csv";
import { GetBaoCaoQuerySchema } from "./schema";
import { ngayVnTuChuoi, nNgayGanDay, kyTruocCungDoDai } from "@/lib/bao-cao/ky";
import type { KhoangThoiGian } from "@/lib/bao-cao/loai";

export const runtime = "nodejs";

function tenTepAnToan(ma: string): string {
  return ma.replace(/[^a-z0-9-]/gi, "_");
}

/** Đọc `tu`/`den` từ query. Thiếu cả hai = mặc định 7 ngày gần đây. */
function docKy(query: { tu?: string; den?: string }, now: Date): KhoangThoiGian {
  if (!query.tu && !query.den) return nNgayGanDay(now, 7);
  const tu = query.tu ? ngayVnTuChuoi(query.tu, 0) : nNgayGanDay(now, 7).tu;
  const den = query.den ? ngayVnTuChuoi(query.den, 1) : nNgayGanDay(now, 7).den;
  return { tu, den };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ma: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const { ma } = await params;
    const baoCao = layBaoCao(ma);
    if (!baoCao) {
      return fail("NOT_FOUND", "Không tìm thấy báo cáo này");
    }

    const staff = await requireStaff();
    if (!staff.permissions.includes(baoCao.quyen)) {
      return fail("FORBIDDEN", "Bạn không có quyền xem báo cáo này");
    }

    const url = new URL(request.url);
    const rawParams: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) rawParams[key] = value;
    const parsed = GetBaoCaoQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const query = parsed.data;

    let tu: Date;
    let den: Date;
    try {
      ({ tu, den } = docKy(query, new Date()));
    } catch {
      return fail("INVALID_INPUT", "Ngày tu/den không hợp lệ (định dạng yyyy-mm-dd)");
    }
    if (tu.getTime() >= den.getTime()) {
      return fail("INVALID_INPUT", "Khoảng thời gian không hợp lệ: tu phải trước den");
    }

    let chiNhanhIds: string[] | null;
    if (query.chiNhanh) {
      try {
        requireBranch(staff, query.chiNhanh);
      } catch {
        return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");
      }
      chiNhanhIds = [query.chiNhanh];
    } else if (staff.permissions.includes("system:superuser")) {
      chiNhanhIds = null;
    } else {
      chiNhanhIds = staff.branchIds;
    }

    const kyTruoc = query.soSanh ? kyTruocCungDoDai({ tu, den }) : undefined;

    const ketQua = await baoCao.chay({
      client: createAdminClient(),
      chiNhanhIds,
      tu,
      den,
      kyTruoc,
      nhom: query.nhom,
    });

    if (query.dinhDang === "csv") {
      if (!ketQua.bang) {
        return fail("INVALID_INPUT", "Báo cáo này không có bảng để xuất CSV");
      }
      const csv = bangThanhCsv(ketQua.bang);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${tenTepAnToan(ma)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return ok({
      baoCao: { ma: baoCao.ma, ten: baoCao.ten, moTa: baoCao.moTa, nhom: baoCao.nhom, boLoc: baoCao.boLoc },
      ky: { tu: tu.toISOString(), den: den.toISOString() },
      kyTruoc: kyTruoc ? { tu: kyTruoc.tu.toISOString(), den: kyTruoc.den.toISOString() } : null,
      ketQua,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "FORBIDDEN");
    }
    return failUnexpected(err, requestId);
  }
}
