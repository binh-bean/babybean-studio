/**
 * /api/admin/customers/<id>/link-gia-dinh — CSKH tạo / đổi / thu hồi LINK GIA ĐÌNH.
 *
 * OWNER: DEV-BE. Task BB-334A. Hợp đồng: docs/29-link-gia-dinh.md §3.
 *
 *   GET    → link gia đình đang sống (hiện lại địa chỉ — BB-201), link cũ theo bộ
 *            còn sống, lời mời người thân theo khách.
 *   POST   → tạo (chưa có) | đổi (`doiLink: true` + `xacNhan: true`), rồi ghi
 *            CÙNG một địa chỉ /k/<mã> vào cột "Link app" mọi dòng Hậu Kỳ của khách.
 *   DELETE → thu hồi (`xacNhan: true`).
 *
 * Quyền: `galleries:share` + đúng chi nhánh của khách. ĐỔI và THU HỒI chỉ CSKH
 * (`cs`) và Admin (`admin`, `owner` — chủ studio hiện "Admin") — anh chốt Q8 ★,
 * kèm hộp xác nhận "link cũ sẽ ngừng mở ngay" (máy chủ đòi `xacNhan: true`, không
 * chỉ tin giao diện).
 *
 * Link gia đình lộ ra là lộ MỌI bộ của nhà, kể cả sau này (kế hoạch §5) — nên đổi
 * link thu hồi link cũ NGAY, trước khi tạo link mới.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";
import {
  linkGiaDinhSong,
  giaiMaLink,
  taoLinkGiaDinh,
  ghiLinkGiaDinhVeLark,
  duongDanGiaDinh,
  duocDoiLinkGiaDinh,
} from "@/lib/gia-dinh/link-gia-dinh";
import { danhSachBoAnhGiaDinh } from "@/lib/gia-dinh/bo-anh-gia-dinh";
import type { StaffSession } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


const PostBody = z
  .object({
    doiLink: z.boolean().optional(),
    xacNhan: z.boolean().optional(),
    ghiLark: z.boolean().optional(),
  })
  .strict();

const DeleteBody = z.object({ xacNhan: z.literal(true) }).strict();

async function khachCuaNhanVien(staff: StaffSession, customerId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("customers").select("id, branch_id").eq("id", customerId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  requireBranch(staff, String(data.branch_id));
  return data;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");
    if (!(await khachCuaNhanVien(staff, id))) return fail("NOT_FOUND", "Không tìm thấy khách");

    const admin = createAdminClient();
    const song = await linkGiaDinhSong(admin, id);
    let linkGiaDinh = null;
    if (song) {
      const ma = await giaiMaLink(admin, song);
      const duongDan = ma ? duongDanGiaDinh(ma) : null;
      linkGiaDinh = {
        shareLinkId: song.id,
        duongDan,
        diaChi: duongDan ? diaChiDayDu(duongDan) : null,
        tokenPrefix: song.token_prefix,
        taoLuc: song.created_at,
        soLanMo: song.view_count ?? 0,
        moLanCuoi: song.last_viewed_at,
      };
    }

    const { data: boCuaKhach, error: bErr } = await admin.from("galleries").select("id, title").eq("customer_id", id);
    if (bErr) throw bErr;
    const tieuDe = new Map((boCuaKhach ?? []).map((g) => [g.id as string, (g.title as string | null) ?? ""]));
    const idsBo = [...tieuDe.keys()];

    let linkCuConSong: unknown[] = [];
    if (idsBo.length > 0) {
      const { data: cu, error: cuErr } = await admin
        .from("share_links")
        .select("id, gallery_id, role, token_prefix, created_at, view_count, expires_at")
        .in("gallery_id", idsBo)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (cuErr) throw cuErr;
      linkCuConSong = (cu ?? [])
        .filter((l) => !l.expires_at || new Date(l.expires_at as string) > new Date())
        .map((l) => ({
          shareLinkId: l.id,
          galleryId: l.gallery_id,
          tieuDeBo: tieuDe.get(l.gallery_id as string) ?? "",
          vai: l.role,
          tokenPrefix: l.token_prefix,
          taoLuc: l.created_at,
          soLanMo: l.view_count ?? 0,
        }));
    }

    const { data: moi, error: moiErr } = await admin
      .from("share_links")
      .select("id, label, created_at")
      .eq("customer_id", id)
      .eq("role", "viewer")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (moiErr) throw moiErr;

    const ds = await danhSachBoAnhGiaDinh(admin, id);

    return ok({
      linkGiaDinh,
      linkCuConSong,
      loiMoiGiaDinh: (moi ?? []).map((m) => ({ shareLinkId: m.id, nhan: m.label, taoLuc: m.created_at })),
      soBoAnh: ds.length,
      duocDoi: duocDoiLinkGiaDinh(staff),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền xem link gia đình");
    return failUnexpected(err, requestId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");

    const body = await readJsonBody(request);
    const parsed = PostBody.safeParse(body.ok ? (body.data ?? {}) : {});
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const { doiLink = false, xacNhan = false, ghiLark = true } = parsed.data;

    if (!(await khachCuaNhanVien(staff, id))) return fail("NOT_FOUND", "Không tìm thấy khách");

    const admin = createAdminClient();
    const song = await linkGiaDinhSong(admin, id);
    if (song && !doiLink) {
      return fail("CONFLICT", "Khách đã có link gia đình. Muốn đổi link thì bấm \"Tạo link mới\".", {
        shareLinkId: song.id,
      });
    }
    if (song) {
      if (!duocDoiLinkGiaDinh(staff)) return fail("FORBIDDEN", "Chỉ CSKH hoặc Admin được đổi link gia đình");
      if (!xacNhan) return fail("INVALID_INPUT", "Cần xác nhận: link cũ sẽ ngừng mở ngay");
    }

    // Khách chưa có bộ nào hiện cho gia đình → link mở ra trang trống, ba mẹ gọi điện.
    const ds = await danhSachBoAnhGiaDinh(admin, id);
    if (ds.length === 0) {
      return fail("INVALID_INPUT", "Khách chưa có bộ ảnh nào có ảnh. Đồng bộ ảnh xong rồi hãy tạo link gia đình.");
    }

    const kq = await taoLinkGiaDinh(admin, { customerId: id, staffId: staff.staffId, requestId });

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: kq.daThuHoi ? "share_link.gia_dinh_doi" : "share_link.gia_dinh_tao",
      entity_type: "customer",
      entity_id: id,
      // SÁU ký tự đầu — không bao giờ cả mã (AGENTS §5).
      metadata: { shareLinkId: kq.shareLinkId, tokenPrefix: kq.ma.slice(0, 6), daThuHoi: kq.daThuHoi },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    const lark = ghiLark
      ? await ghiLinkGiaDinhVeLark(admin, id, kq.ma).catch((err: unknown) => ({
          tong: 0,
          ghiDuoc: 0,
          dong: [],
          lyDo: `Không ghi được sang Lark: ${err instanceof Error ? err.message : String(err)}`,
        }))
      : null;

    console.info(
      JSON.stringify({
        evt: "share_link.gia_dinh",
        requestId,
        customerId: id,
        tokenPrefix: kq.ma.slice(0, 6),
        lark: lark ? { tong: lark.tong, ghiDuoc: lark.ghiDuoc } : null,
      }),
    );

    return ok({
      shareLinkId: kq.shareLinkId,
      duongDan: duongDanGiaDinh(kq.ma),
      tokenPrefix: kq.ma.slice(0, 6),
      luuDiaChiDuoc: kq.luuDiaChiDuoc,
      daThuHoi: kq.daThuHoi,
      lark,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền tạo link gia đình");
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");
    if (!duocDoiLinkGiaDinh(staff)) return fail("FORBIDDEN", "Chỉ CSKH hoặc Admin được thu hồi link gia đình");
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");

    const body = await readJsonBody(request);
    if (!DeleteBody.safeParse(body.ok ? body.data : null).success) {
      return fail("INVALID_INPUT", "Cần xác nhận: link sẽ ngừng mở ngay");
    }
    if (!(await khachCuaNhanVien(staff, id))) return fail("NOT_FOUND", "Không tìm thấy khách");

    const admin = createAdminClient();
    const song = await linkGiaDinhSong(admin, id);
    if (!song) return fail("NOT_FOUND", "Khách không có link gia đình đang mở");

    const { error } = await admin
      .from("share_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: staff.staffId })
      .eq("id", song.id)
      .eq("status", "active");
    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "share_link.gia_dinh_thu_hoi",
      entity_type: "customer",
      entity_id: id,
      metadata: { shareLinkId: song.id, tokenPrefix: song.token_prefix },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ daThuHoi: song.id });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền thu hồi link gia đình");
    return failUnexpected(err, requestId);
  }
}
