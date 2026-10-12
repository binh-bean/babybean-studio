/**
 * GET /api/admin/thung-rac — BB-409: danh sách THÙNG RÁC bộ ảnh (Admin + Quản lý).
 *
 * Trả hai nhóm:
 *   - `trongThungRac`: bộ đã xoá, còn khôi phục được (ngày xoá, người xoá, còn N ngày).
 *   - `daDonHan`: bộ đã dọn hẳn mà dấu còn CHẶN Lark tạo lại (chỉ mã — dữ liệu đã xoá).
 * Quản lý chi nhánh chỉ thấy bộ thuộc chi nhánh mình.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUYEN_XOA_BO_ANH, maBo, mocDonHan, soNgayConLai } from "@/lib/thung-rac/thung-rac";
import { tenHienThiNhanSu } from "@/lib/nhan-su/xoa-nhan-su";

export const runtime = "nodejs";

interface DongBo {
  id: string;
  title: string | null;
  branch_id: string | null;
  deleted_at: string;
  deleted_by: string | null;
  lark_hauky_record_id: string | null;
  branches?: { name?: string | null } | null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, QUYEN_XOA_BO_ANH);
    const toanQuyen = staff.permissions.includes("system:superuser");
    const admin = createAdminClient();

    let q = admin
      .from("galleries")
      .select("id, title, branch_id, deleted_at, deleted_by, lark_hauky_record_id, branches(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (!toanQuyen) q = q.in("branch_id", staff.branchIds.length ? staff.branchIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: bo, error } = await q;
    if (error) throw error;
    const ds = (bo as unknown as DongBo[] | null) ?? [];

    let qDau = admin
      .from("bo_anh_da_xoa")
      .select("gallery_id, ma_bo, branch_id, lark_hauky_record_id, xoa_luc, don_luc")
      .not("don_luc", "is", null)
      .is("bo_dau_luc", null)
      .order("don_luc", { ascending: false })
      .limit(100);
    if (!toanQuyen) qDau = qDau.in("branch_id", staff.branchIds.length ? staff.branchIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: dau, error: loiDau } = await qDau;
    if (loiDau) throw loiDau;

    const idNguoi = [...new Set(ds.map((b) => b.deleted_by).filter((x): x is string => !!x))];
    const tenTheoId = new Map<string, string | null>();
    if (idNguoi.length) {
      const { data: nguoi } = await admin
        .from("staff_profiles")
        .select("id, full_name, da_nghi_luc, la_to_chuc")
        .in("id", idNguoi);
      for (const n of (nguoi as Array<{ id: string; full_name: string; da_nghi_luc: string | null; la_to_chuc: boolean }> | null) ?? []) {
        tenTheoId.set(n.id, tenHienThiNhanSu(n));
      }
    }

    const bayGio = new Date();
    return ok({
      trongThungRac: ds.map((b) => ({
        id: b.id,
        maBo: maBo(b.id),
        tieuDe: b.title,
        chiNhanh: b.branches?.name ?? null,
        xoaLuc: b.deleted_at,
        nguoiXoa: b.deleted_by ? (tenTheoId.get(b.deleted_by) ?? null) : null,
        conNgay: soNgayConLai(b.deleted_at, bayGio),
        donHanLuc: mocDonHan(b.deleted_at).toISOString(),
        tuLark: !!b.lark_hauky_record_id,
      })),
      daDonHan: ((dau as Array<{ gallery_id: string; ma_bo: string; lark_hauky_record_id: string | null; xoa_luc: string; don_luc: string }> | null) ?? []).map((d) => ({
        id: d.gallery_id,
        maBo: d.ma_bo,
        xoaLuc: d.xoa_luc,
        donLuc: d.don_luc,
        tuLark: !!d.lark_hauky_record_id,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
