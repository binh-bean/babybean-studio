/**
 * POST /api/g/tim-gia-dinh/dat-chinh-sua — gia đình (link mời, vai viewer) đặt
 * chỉnh sửa các tấm mình đã thả tim.
 *
 * OWNER: DEV-BE. Task BB-345.
 *
 * KHÔNG dựng luồng mới: ghi MỘT dòng vào `yeu_cau_mua_them` (luồng BB-245/
 * BB-254 — "gia đình gửi yêu cầu, CSKH gọi lại chốt giá và thanh toán") với
 * `loai = 'chinh_sua'` (migration 0083). CSKH thấy nó ở:
 *   · Việc cần xử lý → "Khách gửi ảnh chọn" (BB-337);
 *   · khối "Yêu cầu mua thêm" ở chi tiết bộ ảnh, đổi trạng thái bằng route
 *     PATCH sẵn có (BB-249), xác nhận thanh toán như mọi khoản khác.
 *
 * Danh sách ảnh LẤY TỪ BẢNG TIM của chính link này trên máy chủ — không tin
 * danh sách trình duyệt gửi lên. Giá: `galleries.extra_photo_price` (giá ảnh
 * thêm của bộ ảnh, mặc định từ cài đặt `gallery.extra_photo_price_default`).
 *
 * Bấm hai lần (mạng chậm) với cùng một bộ tấm: trả lại yêu cầu đang mở, không
 * ghi dòng thứ hai.
 *
 * Không gửi Lark ở lượt này — CSKH xử lý trong app (Việc cần xử lý).
 *
 * Chưa áp 0083: 409 kèm `chuaApMigration: true` (màn khách vốn đã khoá nút
 * "đang chuẩn bị", đây là chốt chặn phía máy chủ) — không 500.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { dangMoChoKhachXem } from "@/lib/gallery/mo-cho-khach-xem";
import { cheSoDienThoai } from "@/lib/lark/notify";
import {
  TOI_DA_ANH_CHINH_SUA,
  cauDaNhanChinhSua,
  ghiChuDatChinhSua,
  tinhTamTinh,
} from "@/lib/gallery/tim-gia-dinh";
import { docTimCuaLink, laChuaAp0083 } from "@/lib/gallery/tim-gia-dinh-server";

export const runtime = "nodejs";

/** Cùng luật chống spam của /api/g/mua-them: tối đa 10 dòng 'moi' mỗi bộ ảnh. */
const TOI_DA_DONG_MOI = 10;

const Body = z.object({
  tenNguoiMua: z.string().trim().min(1, "Gia đình cho Bean xin tên ạ").max(100),
  sdtNguoiMua: z
    .string()
    .trim()
    .regex(/^0[0-9]{9}$/, "Số điện thoại gồm 10 số, bắt đầu bằng 0 ạ"),
  ghiChu: z.string().max(300).nullish(),
});

function cungTap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    if (session.role !== "viewer") {
      return fail("FORBIDDEN", "Ba mẹ chọn thêm ảnh ở mục \"Chọn thêm ảnh\" giúp Bean ạ");
    }

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    const parsed = Body.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, { issues: parsed.error.issues });
    }
    const { tenNguoiMua, sdtNguoiMua, ghiChu } = parsed.data;

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, status, extra_photo_price")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    if (!dangMoChoKhachXem(gallery.status as string)) {
      return fail("CONFLICT", "Bộ ảnh này không còn mở cho gia đình ạ");
    }

    const tim = await docTimCuaLink(admin, session.shareLinkId, session.galleryId);
    if (tim.chuaApMigration) {
      return fail("CONFLICT", "Bean đang chuẩn bị phần đặt chỉnh sửa ạ", { chuaApMigration: true });
    }
    const anhIds = tim.ids.slice(0, TOI_DA_ANH_CHINH_SUA);
    if (anhIds.length === 0) {
      return fail("INVALID_INPUT", "Gia đình thả tim tấm muốn chỉnh sửa trước giúp Bean ạ");
    }

    // Bấm lại cùng một bộ tấm: trả yêu cầu đang mở, không ghi trùng.
    const { data: dangMo, error: mErr } = await admin
      .from("yeu_cau_mua_them")
      .select("id, so_luong, tam_tinh, anh_ids")
      .eq("gallery_id", session.galleryId)
      .eq("share_link_id", session.shareLinkId)
      .eq("loai", "chinh_sua")
      .eq("trang_thai", "moi");
    if (mErr) {
      if (laChuaAp0083(mErr)) {
        return fail("CONFLICT", "Bean đang chuẩn bị phần đặt chỉnh sửa ạ", { chuaApMigration: true });
      }
      throw mErr;
    }
    const trung = (dangMo ?? []).find((d) => cungTap((d.anh_ids as string[]) ?? [], anhIds));
    if (trung) {
      return ok({
        id: trung.id,
        soAnh: trung.so_luong,
        tamTinh: Number(trung.tam_tinh ?? 0),
        daCo: true,
        cau: cauDaNhanChinhSua(trung.so_luong as number),
      });
    }

    const { count: soDongMoi, error: dErr } = await admin
      .from("yeu_cau_mua_them")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId)
      .eq("trang_thai", "moi");
    if (dErr) throw dErr;
    if ((soDongMoi ?? 0) >= TOI_DA_DONG_MOI) {
      return fail("RATE_LIMITED", "Gia đình đã gửi khá nhiều yêu cầu, Bean sẽ gọi lại trước ạ");
    }

    const { donGia, tamTinh } = tinhTamTinh(anhIds.length, gallery.extra_photo_price as number | string | null);
    const { data: dong, error: iErr } = await admin
      .from("yeu_cau_mua_them")
      .insert({
        gallery_id: session.galleryId,
        loai: "chinh_sua",
        product_id: null,
        photo_id: null,
        so_luong: anhIds.length,
        anh_ids: anhIds,
        don_gia: donGia,
        tam_tinh: tamTinh,
        ghi_chu: ghiChuDatChinhSua(anhIds.length, ghiChu),
        ten_nguoi_mua: tenNguoiMua,
        sdt_nguoi_mua: sdtNguoiMua,
        share_link_id: session.shareLinkId,
      })
      .select("id, so_luong, tam_tinh, trang_thai, created_at")
      .single();
    if (iErr) {
      if (laChuaAp0083(iErr)) {
        return fail("CONFLICT", "Bean đang chuẩn bị phần đặt chỉnh sửa ạ", { chuaApMigration: true });
      }
      throw iErr;
    }

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Viewer",
      action: "mua_them.dat_chinh_sua",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        yeuCauId: dong.id,
        soAnh: anhIds.length,
        tamTinh,
        nguoiMua: { ten: tenNguoiMua, sdtChe: cheSoDienThoai(sdtNguoiMua) },
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({
      id: dong.id,
      soAnh: dong.so_luong,
      tamTinh: Number(dong.tam_tinh ?? 0),
      daCo: false,
      cau: cauDaNhanChinhSua(dong.so_luong as number),
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
