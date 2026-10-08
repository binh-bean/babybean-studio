/**
 * /api/admin/galleries/[id]/hoa-don — BB-395: xác nhận phát sinh bằng MÃ HOÁ ĐƠN.
 *
 *   GET    — các mã đã gán + kết quả đối chiếu lần đồng bộ gần nhất (không gọi Lark).
 *   POST   — `{ ma?, xacNhanHauKy?, epGanLyDo? }`: gán mã (nếu có) rồi ĐỒNG BỘ từ nguồn hoá đơn:
 *            đủ điều kiện → đối chiếu, nâng hạn mức, ghi sổ, khoá nếu khớp.
 *            `{ hanhDong: "bo_muc", muc: [{ khoa, soLuong, productId }] }`: bỏ mục dư (Thiếu)
 *            rồi đồng bộ lại.
 *   DELETE — thân `{ ma, lyDo }`: gỡ gán (chỉ quyền `thanh_toan:nhap_tay`).
 *
 * Quyền: `galleries:write` + đúng chi nhánh (như route payments). Ép gán khi app không tự kiểm
 * được khách + gỡ gán: thêm `thanh_toan:nhap_tay`. Route chỉ nói chuyện với `NguonHoaDon`.
 */
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { chonNguonHoaDon, chuanHoaMaHoaDon } from "@/lib/hoa-don/nguon-hoa-don";
import { nguonHoaDonLarkTuMoiTruong } from "@/lib/hoa-don/nguon-hoa-don-lark";
import {
  CAU_CHUA_AP_0102,
  coQuyenNhapTay,
  boAnhDu,
  boMucDu,
  dongBoHoaDonChoBo,
  layAnhCoTheBo,
  goGanHoaDon,
  laLoiChuaCoBang,
  layHoaDonDaGan,
  layPhatSinhApp,
  type MucBo,
} from "@/lib/hoa-don/xac-nhan-hoa-don-server";
import { layTienCanThu } from "@/lib/gallery/tien-can-thu-server";
import type { KetQuaDoiChieu } from "@/lib/hoa-don/doi-chieu-hoa-don";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function moBo(galleryId: string) {
  const staff = await requireStaff();
  requirePermission(staff, "galleries:write");
  if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
  const admin = createAdminClient();
  const { data: g, error } = await admin.from("galleries").select("id, branch_id").eq("id", galleryId).maybeSingle();
  if (error) throw error;
  if (!g) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
  requireBranch(staff, g.branch_id as string);
  return { staff, admin, branchId: g.branch_id as string } as const;
}

async function trangThai(admin: ReturnType<typeof createAdminClient>, galleryId: string, quyenNhapTay: boolean) {
  const [hoaDon, tien] = await Promise.all([layHoaDonDaGan(admin, galleryId), layTienCanThu(admin, galleryId)]);
  // Vòng 2: danh sách ảnh có thể bỏ (tích sẵn N ảnh chọn sau cùng) theo lần đối chiếu gần nhất.
  const kqMoiNhat = hoaDon
    .map((h) => (h.ketQua as { doiChieu?: KetQuaDoiChieu } | null)?.doiChieu)
    .filter((k): k is KetQuaDoiChieu => Boolean(k && Array.isArray(k.dotThieu)))
    .at(-1);
  const anhCoTheBo = kqMoiNhat && (kqMoiNhat.anhDot1Thieu > 0 || kqMoiNhat.dotThieu.length > 0) ? await layAnhCoTheBo(admin, galleryId, kqMoiNhat) : [];
  return {
    hoaDon,
    tien: { phaiThu: tien.tongPhaiThu, daGhiCo: tien.daGhiCo, conThieu: tien.conThieu },
    quyenNhapTay,
    anhCoTheBo,
  };
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const mo = await moBo(id);
    if (mo instanceof Response) return mo;
    return ok(await trangThai(mo.admin, id, coQuyenNhapTay(mo.staff)));
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem hoá đơn của bộ ảnh");
    if (laLoiChuaCoBang(err as { code?: string })) return fail("CONFLICT", CAU_CHUA_AP_0102);
    return failUnexpected(err, requestId);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const mo = await moBo(id);
    if (mo instanceof Response) return mo;
    const { staff, admin, branchId } = mo;

    const json = await readJsonBody(request);
    const body = (json.ok ? json.data : null) as {
      ma?: unknown;
      xacNhanHauKy?: unknown;
      epGanLyDo?: unknown;
      hanhDong?: unknown;
      muc?: unknown;
      anh?: unknown;
    } | null;

    let maMoi: string | null = null;
    if (body?.ma !== undefined && body.ma !== null && body.ma !== "") {
      maMoi = chuanHoaMaHoaDon(body.ma);
      if (!maMoi) return fail("INVALID_INPUT", "Mã hoá đơn phải có dạng HD_YYYYMMDD#NN (vd HD_20260910#5071)");
    }
    const epGanLyDo = typeof body?.epGanLyDo === "string" ? body.epGanLyDo.trim() : null;
    if (epGanLyDo && !coQuyenNhapTay(staff)) {
      return fail("FORBIDDEN", "Chỉ Admin/Quản lý ép gán hoá đơn được");
    }
    if (epGanLyDo !== null && epGanLyDo.length > 0 && epGanLyDo.length < 3) {
      return fail("INVALID_INPUT", "Ghi lý do ép gán (ít nhất 3 ký tự)");
    }

    // Vòng 2 — bỏ ẢNH dư theo danh sách nhân viên tích (đợt 1 / đợt ≥ 2 đang chờ) → đồng bộ lại.
    if (body?.hanhDong === "bo_anh") {
      const anh = Array.isArray(body.anh) ? [...new Set(body.anh.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)))] : [];
      if (anh.length === 0 || anh.length > 500 || anh.length !== (body.anh as unknown[]).length) {
        return fail("INVALID_INPUT", "Tích ít nhất một ảnh để bỏ");
      }
      const kqBo = await boAnhDu(admin, { galleryId: id, branchId, staff, selectionItemIds: anh });
      if (!kqBo.ok) return fail("INVALID_INPUT", kqBo.message);
    }

    // Bỏ SẢN PHẨM dư (Thiếu) → rồi đồng bộ lại.
    if (body?.hanhDong === "bo_muc") {
      if (!Array.isArray(body.muc) || body.muc.length === 0 || body.muc.length > 50) {
        return fail("INVALID_INPUT", "Chọn ít nhất một mục để bỏ");
      }
      const app = await layPhatSinhApp(admin, id);
      const muc: MucBo[] = [];
      for (const m of body.muc as { khoa?: unknown; soLuong?: unknown; productId?: unknown }[]) {
        const khoa = typeof m?.khoa === "string" ? m.khoa : "";
        const soLuong = Number(m?.soLuong);
        const productId = typeof m?.productId === "string" && UUID_RE.test(m.productId) ? m.productId : null;
        if (!(khoa.startsWith("sp:") && productId) || !Number.isInteger(soLuong) || soLuong <= 0 || soLuong > 500) {
          return fail("INVALID_INPUT", "Mục cần bỏ không hợp lệ (ảnh dư bỏ bằng danh sách tích ảnh)");
        }
        // Không cho bỏ nhiều hơn phần app đang có (chặn bấm nhầm số).
        const coTrenApp = app.sanPham.find((s) => s.productId === productId)?.soLuong ?? 0;
        if (soLuong > coTrenApp) return fail("INVALID_INPUT", "Số cần bỏ lớn hơn số khách đang chọn");
        muc.push({ khoa, soLuong, productId });
      }
      await boMucDu(admin, { galleryId: id, branchId, staff, muc });
    }

    const kq = await dongBoHoaDonChoBo(admin, {
      galleryId: id,
      staff,
      nguon: chonNguonHoaDon(nguonHoaDonLarkTuMoiTruong),
      maMoi,
      xacNhanHauKy: body?.xacNhanHauKy === true,
      epGanLyDo: epGanLyDo || null,
    });
    const tt = await trangThai(admin, id, coQuyenNhapTay(staff));
    if (!kq.ok) {
      return fail(kq.code === "LARK" ? "INTERNAL" : kq.code, kq.message, {
        ...(kq.canXacNhanHauKy ? { canXacNhanHauKy: true } : {}),
        ...(kq.choPhepEpGan ? { choPhepEpGan: true } : {}),
        trangThai: tt,
      });
    }
    return ok({ ...tt, ketQua: kq });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xác nhận bằng hoá đơn");
    if (laLoiChuaCoBang(err as { code?: string })) return fail("CONFLICT", CAU_CHUA_AP_0102);
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id } = await context.params;
    const mo = await moBo(id);
    if (mo instanceof Response) return mo;
    const { staff, admin, branchId } = mo;
    if (!coQuyenNhapTay(staff)) throw new AuthError("FORBIDDEN");
    // Lý do nằm trong thân yêu cầu, không đưa lên địa chỉ (nhật ký máy chủ ghi địa chỉ).
    const json = await readJsonBody(request);
    const body = (json.ok ? json.data : null) as { ma?: unknown; lyDo?: unknown } | null;
    const ma = chuanHoaMaHoaDon(body?.ma);
    const lyDo = typeof body?.lyDo === "string" ? body.lyDo.trim() : "";
    if (!ma) return fail("INVALID_INPUT", "Mã hoá đơn không hợp lệ");
    if (lyDo.length < 3) return fail("INVALID_INPUT", "Ghi lý do gỡ gán");
    const kq = await goGanHoaDon(admin, { galleryId: id, branchId, ma, staff, lyDo: lyDo.slice(0, 500) });
    if (!kq.ok) return fail("NOT_FOUND", kq.message);
    // Vòng 2: còn mã khác của bộ → đồng bộ lại ngay để dấu "đã trả" (đợt, giỏ) và hạn mức khớp với
    // các mã còn lại. Hỏng thì vẫn trả gỡ gán thành công, kèm câu nhắc bấm Đồng bộ.
    let nhac = "";
    if ((await layHoaDonDaGan(admin, id)).length > 0) {
      const lai = await dongBoHoaDonChoBo(admin, {
        galleryId: id,
        staff,
        nguon: chonNguonHoaDon(nguonHoaDonLarkTuMoiTruong),
        maMoi: null,
        xacNhanHauKy: true,
        epGanLyDo: null,
      }).catch(() => null);
      if (!lai?.ok) nhac = " Bấm \"Đồng bộ từ Lark\" để đối chiếu lại các mã còn lại.";
    }
    return ok({ ...(await trangThai(admin, id, true)), message: kq.message + nhac });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Chỉ Admin/Quản lý gỡ gán hoá đơn được");
    if (laLoiChuaCoBang(err as { code?: string })) return fail("CONFLICT", CAU_CHUA_AP_0102);
    return failUnexpected(err, requestId);
  }
}
