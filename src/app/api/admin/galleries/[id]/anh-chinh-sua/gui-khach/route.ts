/**
 * POST /api/admin/galleries/[id]/anh-chinh-sua/gui-khach — CSKH kiểm xong, "Gửi khách duyệt" (BB-371).
 *
 * Ảnh chỉnh trong thư mục con của link Drive KHÔNG tự lộ ra khách: đồng bộ kéo
 * về rồi nằm chờ tới khi CSKH bấm nút này. Bấm thì:
 *   1. (bộ còn `submitted` — CSKH chưa bấm Xác nhận) xác nhận luôn, đúng đường
 *      của nút Xác nhận (`xacNhanDot1`): nhật ký + tín hiệu tức thì;
 *   2. ghi mốc gửi `deliveries.anh_chinh_gui_luc` (0091; chưa áp thì
 *      `deliveries.updated_at` làm mốc) — ảnh về SAU mốc này vẫn chờ lượt gửi sau;
 *   3. đóng vòng xin sửa đang mở (bản mới = vòng cũ đã xử lý — cùng luật BB-121);
 *   4. bộ ảnh → `awaiting_approval`: thanh tiến độ khách sang "Duyệt ảnh";
 *   5. báo ba mẹ: chuông + thông báo đẩy (`guiThongBaoBoAnh`, không bao giờ ném).
 *
 * Gửi lại khi đang `awaiting_approval` chỉ được khi có ảnh MỚI chưa gửi.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireMotTrongCacQuyen, requireBranch, AuthError } from "@/lib/auth/staff";
import { CAC_QUYEN_GUI_KHACH_DUYET } from "@/lib/auth/quyen-xem-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { xacNhanDot1 } from "@/lib/gallery/xac-nhan-danh-sach";
import { laAnhChuaGui, TRANG_THAI_GUI_DUOC } from "@/lib/anh-chinh-sua/nhan-dien";
import { docBoiCanhAnhChinh, docVongSua, laLoiChuaCoBang } from "@/lib/anh-chinh-sua/du-lieu";
import {
  KHOA_TRONG_GOI,
  guiDuocDotMuaThem,
  laKhoaMuaThem,
  mocGuiCuaKhoa,
  nhanCuaKhoa,
  trangThaiDuyetDot,
} from "@/lib/anh-chinh-sua/theo-dot";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lyDoKhongGuiDuoc } from "@/lib/anh-chinh-sua/vong-duyet";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    // BB-383 — thợ chỉnh tự gửi được: `anh_chinh:gui_khach` HOẶC `galleries:write`.
    requireMotTrongCacQuyen(staff, CAC_QUYEN_GUI_KHACH_DUYET);

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status, title")
      .eq("id", galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // BB-377 — `{ khoa: "dot:N" | "mt:<id>" }`: gửi riêng một đợt MUA THÊM.
    const than = (await request.json().catch(() => null)) as { khoa?: unknown } | null;
    const khoa = than?.khoa ?? KHOA_TRONG_GOI;
    if (khoa !== KHOA_TRONG_GOI) {
      if (!laKhoaMuaThem(khoa)) return fail("INVALID_INPUT", "Đợt ảnh không hợp lệ");
      return await guiDotMuaThem(admin, { galleryId, gallery, khoa, staffId: staff.staffId });
    }

    if (!(TRANG_THAI_GUI_DUOC as readonly string[]).includes(gallery.status)) {
      return fail("INVALID_INPUT", `Bộ ảnh đang ở "${gallery.status}", không gửi ảnh chỉnh cho khách được.`);
    }

    // BB-377 — vòng TRONG GÓI chỉ tính tấm trong gói (đã áp 0095); tấm mua thêm gửi riêng.
    const bc = await docBoiCanhAnhChinh(admin, galleryId);
    const guiLucCu = bc.mocChung;
    const anhChinh =
      bc.mocDot === null ? bc.anhChinh : bc.anhChinh.filter((a) => !laKhoaMuaThem(bc.khoaCua.get(a.id)));
    // BB-384 — không có ảnh chỉnh trong app thì KHÔNG đưa bộ sang chờ duyệt (khách sẽ
    // không có gì để xem): chặn với câu nói rõ phải làm gì.
    const lyDoChan = lyDoKhongGuiDuoc(anhChinh.length);
    if (lyDoChan) return fail("INVALID_INPUT", lyDoChan);
    const soMoi = anhChinh.filter((a) => laAnhChuaGui(guiLucCu, a.created_at)).length;
    if (gallery.status === "awaiting_approval" && soMoi === 0) {
      return fail("CONFLICT", "Khách đã nhận đủ ảnh chỉnh, chưa có ảnh mới để gửi.");
    }

    // 1. Chưa xác nhận danh sách chọn → xác nhận luôn, cùng đường với nút Xác nhận.
    if (gallery.status === "submitted") {
      const kq = await xacNhanDot1(admin, { galleryId, branchId: gallery.branch_id, staff });
      if (!kq.ok) return fail(kq.code, kq.message);
    }

    // 2. Mốc gửi. `now` lấy SAU khi đọc ảnh: tấm nào đã có trong app lúc CSKH bấm là
    // tấm CSKH vừa nhìn thấy trên màn quản trị.
    // Đồng hồ máy app và máy cơ sở dữ liệu có thể lệch vài giây: mốc gửi không bao giờ
    // nhỏ hơn lúc tạo của chính những tấm CSKH đang gửi.
    const now = new Date(Math.max(Date.now(), ...anhChinh.map((a) => Date.parse(a.created_at) || 0))).toISOString();
    const { data: dangCo } = await admin.from("deliveries").select("id").eq("gallery_id", galleryId).maybeSingle();
    const ghiGiao = async (coCotMoi: boolean) => {
      const dong: Record<string, unknown> = { status: "ready", updated_at: now };
      if (coCotMoi) dong.anh_chinh_gui_luc = now;
      return dangCo
        ? admin.from("deliveries").update(dong).eq("id", dangCo.id)
        : admin.from("deliveries").insert({ gallery_id: galleryId, branch_id: gallery.branch_id, ...dong });
    };
    let { error: loiGiao } = await ghiGiao(true);
    if (loiGiao && laLoiChuaCoBang(loiGiao)) ({ error: loiGiao } = await ghiGiao(false)); // chưa áp 0091
    if (loiGiao) throw loiGiao;

    // 3. Đóng vòng xin sửa đang mở.
    let qVong = admin
      .from("revision_requests")
      .update({ resolved_at: now })
      .eq("gallery_id", galleryId)
      .is("resolved_at", null);
    if (bc.mocDot !== null) qVong = qVong.is("dot_khoa", null); // vòng của đợt mua thêm đóng ở lượt gửi đợt đó
    const { error: loiVong } = await qVong;
    if (loiVong) throw loiVong;

    // 4. Chờ khách duyệt.
    const { error: loiBo } = await admin
      .from("galleries")
      .update({ status: "awaiting_approval", updated_at: now })
      .eq("id", galleryId);
    if (loiBo) throw loiBo;

    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.anh_chinh_gui_khach",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { soAnh: anhChinh.length, soMoi, tuTrangThai: gallery.status },
    });

    // 5. Báo ba mẹ — sau khi ghi DB xong; hàm tự không ném.
    const thongBao = await guiThongBaoBoAnh(admin, galleryId, {
      tieuDe: "Ảnh của bé đã chỉnh xong ạ",
      noiDung: "Mời ba mẹ xem và duyệt ảnh ngay trong app ạ.",
      loai: "anh_chinh_xong",
    });

    return ok({ status: "awaiting_approval", soAnh: anhChinh.length, soMoi, guiLuc: now, thongBao });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code === "FORBIDDEN" ? "FORBIDDEN" : err.code, err.code === "FORBIDDEN" ? "Không có quyền gửi ảnh cho khách" : undefined);
    return failUnexpected(err, requestId);
  }
}

/**
 * BB-377 — CSKH gửi một ĐỢT MUA THÊM cho khách duyệt. Không đụng trạng thái bộ ảnh
 * (bộ có thể đã duyệt/đã giao): ghi mốc gửi của đợt (`anh_chinh_dot`, 0095), đóng
 * vòng sửa đang mở CỦA ĐỢT ĐÓ, báo ba mẹ.
 */
async function guiDotMuaThem(
  admin: SupabaseClient,
  p: { galleryId: string; gallery: { branch_id: string; status: string }; khoa: string; staffId: string },
): Promise<Response> {
  const { galleryId, gallery, khoa } = p;
  const bc = await docBoiCanhAnhChinh(admin, galleryId);
  if (bc.mocDot === null) {
    return fail("CONFLICT", "Gửi riêng từng đợt mua thêm cần áp migration 0095 — tạm thời bấm Gửi khách duyệt của cả bộ.");
  }
  if (!bc.nhom.some((n) => n.khoa === khoa)) return fail("NOT_FOUND", "Không tìm thấy đợt mua thêm này");
  const nhan = nhanCuaKhoa(khoa, bc.nhom);
  const cuaDot = bc.anhChinh.filter((a) => bc.khoaCua.get(a.id) === khoa);
  const moc = mocGuiCuaKhoa(khoa, bc.mocChung, bc.mocDot);
  const soMoi = cuaDot.filter((a) => laAnhChuaGui(moc, a.created_at)).length;
  const vong = await docVongSua(admin, galleryId, false);
  const trangThai = trangThaiDuyetDot(
    bc.mocDot.get(khoa),
    vong.some((v) => v.resolved_at === null && v.dot_khoa === khoa),
  );
  if (!guiDuocDotMuaThem({ trangThaiBo: gallery.status, soAnh: cuaDot.length, soChuaGui: soMoi, trangThai })) {
    return fail(
      cuaDot.length === 0 ? "INVALID_INPUT" : "CONFLICT",
      cuaDot.length === 0
        ? `${nhan}: chưa có ảnh chỉnh nào trong thư mục ảnh chỉnh sửa.`
        : `${nhan}: khách đã nhận đủ ảnh chỉnh, chưa có ảnh mới để gửi.`,
    );
  }

  const now = new Date(Math.max(Date.now(), ...cuaDot.map((a) => Date.parse(a.created_at) || 0))).toISOString();
  const { error } = await admin
    .from("anh_chinh_dot")
    .upsert({ gallery_id: galleryId, khoa, gui_luc: now, duyet_luc: null, updated_at: now }, { onConflict: "gallery_id,khoa" });
  if (error) throw error;
  const { error: loiVong } = await admin
    .from("revision_requests")
    .update({ resolved_at: now })
    .eq("gallery_id", galleryId)
    .eq("dot_khoa", khoa)
    .is("resolved_at", null);
  if (loiVong) throw loiVong;

  await ghiNhatKy({
    actorType: "staff",
    actorId: p.staffId,
    branchId: gallery.branch_id,
    action: "gallery.anh_chinh_gui_khach",
    entityType: "gallery",
    entityId: galleryId,
    galleryId,
    metadata: { khoa, nhan, soAnh: cuaDot.length, soMoi, tuTrangThai: trangThai },
  });
  const thongBao = await guiThongBaoBoAnh(admin, galleryId, {
    tieuDe: "Ảnh mua thêm của bé đã chỉnh xong ạ",
    noiDung: `${nhan}: mời ba mẹ xem và duyệt ảnh ngay trong app ạ.`,
    loai: "anh_chinh_xong",
  });
  return ok({ status: gallery.status, khoa, nhan, soAnh: cuaDot.length, soMoi, guiLuc: now, thongBao });
}
