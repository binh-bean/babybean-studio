/**
 * POST /api/g/dot-chon/chot — ba mẹ CHỐT một đợt chọn thêm (đợt 2, 3, …).
 *
 * OWNER: DEV-BE. Task BB-321. Luật doanh thu của chủ studio 29/09/2026: sau khi
 * đợt 1 đã chốt và CSKH đã xác nhận, ảnh đợt 1 khoá; MUA THÊM thì khách vẫn
 * chọn ảnh và chốt từng đợt riêng, KHÔNG cần xin mở lại.
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG dùng `/api/g/submit`, `/api/g/addons`, `/api/g/selection`
 * ---------------------------------------------------------------------------
 * Cả ba từ chối đúng luật khi bộ ảnh đã khoá (`isGalleryLocked`) — và không
 * được nới, vì đó là thứ giữ ảnh đợt 1 khỏi bị đổi. Route này là đường RIÊNG,
 * chỉ THÊM ảnh mới (ảnh đã nằm ở đợt nào cũng bị từ chối) và sản phẩm mới. Nó
 * không sửa, không bỏ chọn bất cứ thứ gì đã chốt.
 *
 * ---------------------------------------------------------------------------
 * Mở đúng lúc nào
 * ---------------------------------------------------------------------------
 * Chỉ từ khi đợt 1 đã được CSKH xác nhận (`in_retouch` trở đi — xem
 * `dangCheDoChonThem`). Trước đó ba mẹ sửa thẳng đợt 1 (migration 0060), không
 * cần đợt 2.
 *
 * Việc ghi (xem `chotDotChon`): dòng đợt ở `selection_rounds` → ảnh → sản phẩm.
 * Sau đó báo Lark (cả khi không tới được Lark, việc của khách vẫn xong) và ghi
 * nhật ký. Chưa áp migration 0077 → trả CONFLICT bằng câu tiếng Việt, không 500.
 */

import { vi } from "@/i18n";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { maLarkConHieuLuc } from "@/lib/gallery-status";
import { dangCheDoChonThem } from "@/lib/gallery/dot-chon";
import { chotDotChon, layCacDot } from "@/lib/gallery/dot-chon-server";
import { ChotDotChonSchema } from "./schema";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { daMuaCuaBo, docCaiDatLamNhanh, timSanPhamLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh-server";
import type { DongSanPhamDot } from "@/lib/gallery/dot-chon-server";

export const runtime = "nodejs";

/** Chống spam: tối đa chừng này đợt đang CHỜ xác nhận cùng lúc. */
const TOI_DA_DOT_CHO = 5;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);

    // Cùng luật với nút Chốt đợt 1: quyết định (và tiền) là của người đứng tên hợp đồng.
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới chốt được đợt chọn thêm");
    }

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    const parsed = ChotDotChonSchema.safeParse(jsonBody.data);
    if (!parsed.success) return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    const input = parsed.data;

    const admin = createAdminClient();
    const { data: gallery, error: gErr } = await admin
      .from("galleries")
      .select("id, branch_id, customer_id, title, status, extra_photo_price, lark_trang_thai, lark_trang_thai_tu, reopened_at")
      .eq("id", session.galleryId)
      .single();
    if (gErr || !gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    if (!dangCheDoChonThem(gallery.status, maLarkConHieuLuc(gallery))) {
      return fail(
        "CONFLICT",
        vi.gallery.loiBean.chuaXacNhanDot1,
      );
    }

    const cacDotHienCo = await layCacDot(admin, gallery.id);
    if (cacDotHienCo.filter((d) => d.trangThai === "cho_xac_nhan").length >= TOI_DA_DOT_CHO) {
      return fail("RATE_LIMITED", "Ba mẹ đã gửi khá nhiều đợt đang chờ, CSKH sẽ liên hệ trước khi nhận thêm");
    }

    // BB-399 — "Làm ảnh nhanh" ở hộp chốt đợt: máy chủ tự tìm sản phẩm + giá; bộ đã mua rồi thì
    // không bán lần hai (màn khách đã ẩn ô — tới đây là trình duyệt cũ/hai tab).
    const caiDatNhanh = await docCaiDatLamNhanh(admin, gallery.branch_id ?? null);
    const dongDichVu: DongSanPhamDot[] = [];
    if (input.lamAnhNhanh === true) {
      if (await daMuaCuaBo(admin, gallery.id, session.selectionId, caiDatNhanh.cacGhim)) {
        return fail("CONFLICT", vi.gallery.lamNhanh.loiDaMua);
      }
      if (!caiDatNhanh.bat) return fail("CONFLICT", vi.gallery.lamNhanh.loiTamDung); // BB-399 vòng 3
      const sanPhamNhanh = await timSanPhamLamNhanh(admin, caiDatNhanh.ghim);
      if (!sanPhamNhanh) return fail("CONFLICT", vi.gallery.lamNhanh.loiKhongCoSanPham);
      dongDichVu.push({
        productId: sanPhamNhanh.id,
        ten: String(sanPhamNhanh.name ?? vi.gallery.lamNhanh.ten),
        photoId: null,
        soLuong: 1,
        donGia: Number(sanPhamNhanh.list_price),
        dichVu: true,
      });
    }

    const kq = await chotDotChon(admin, {
      galleryId: gallery.id,
      selectionId: session.selectionId,
      photoIds: input.photoIds,
      sanPham: input.items.map((i) => ({
        productId: i.productId,
        photoId: i.photoId ?? null,
        soLuong: i.soLuong,
        ganVoiAddonId: i.ganVoiAddonId ?? null,
      })),
      tenNguoiChot: input.tenNguoiChot,
      giaMoiAnh: Number(gallery.extra_photo_price ?? 0),
      bietAnhInChamHon: input.bietAnhInChamHon === true,
      dongDichVu,
    });
    if (!kq.ok) return fail(kq.code, kq.message, kq.chiTiet ? { chiTiet: kq.chiTiet } : undefined);

    const dot = kq.dot;

    // Nhật ký nội bộ — không chặn phản hồi nếu ghi hụt (ghiNhatKy không bao giờ ném).
    await ghiNhatKy({
      actorType: "customer",
      actorId: session.selectionId,
      actorLabel: input.tenNguoiChot,
      branchId: String(gallery.branch_id),
      action: "selection.round_submit",
      entityType: "gallery",
      entityId: gallery.id,
      galleryId: gallery.id,
      metadata: {
        soDot: dot.soDot,
        soAnh: dot.soAnh,
        soAnhTinhTien: dot.soAnhTinhTien,
        soSanPhamInChuaAnh: dot.soSanPhamInChuaAnh,
        tienAnh: dot.tienAnh,
        tienSanPham: dot.tienSanPham,
        soDongSanPham: dot.sanPham.length,
      },
    });

    // Báo CSKH qua Lark SAU khi ghi xong; enqueueLarkNotification không bao giờ ném
    // và tự tôn trọng `khongGuiRaLarkThat()` (phép thử không bắn tin thật).
    const { data: khach } = await admin
      .from("customers")
      .select("full_name, phone")
      .eq("id", gallery.customer_id)
      .maybeSingle();

    // Khoá payload KHÔNG được chứa chữ "anh" — `locBoAnh()` cắt mọi khoá khớp
    // (bẫy của BB-200/BB-245): "soTam"/"phuThuTam" thay cho "soAnh"/"tienAnh".
    // BB-342: nhân viên thấy đợt mới ngay, không F5.
    await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachChotDot });

    await enqueueLarkNotification({
      branchId: String(gallery.branch_id),
      event: "selection.round_submitted",
      payload: {
        galleryId: gallery.id,
        galleryTitle: gallery.title,
        soDot: dot.soDot,
        soTam: dot.soAnh,
        soTamTinhTien: dot.soAnhTinhTien,
        phuThuTam: dot.tienAnh,
        tienSanPham: dot.tienSanPham,
        tongTien: dot.tong,
        soMonInThieuTam: dot.soSanPhamInChuaAnh,
        nguoiChot: input.tenNguoiChot,
        customerName: khach?.full_name ?? null,
        customerPhone: cheSoDienThoai(khach?.phone),
        cacMon: dot.sanPham.filter((s) => !s.dichVu).map((s) => ({ ten: s.ten, soLuong: s.soLuong })),
        // BB-399 — khoá tránh chữ "anh" ("nhanh" cũng dính, locBoAnh cắt theo tên khoá).
        lamGapNgay: dot.sanPham.some((s) => s.dichVu) ? caiDatNhanh.soNgayNhanh : 0,
        submittedAt: dot.submittedAt,
      },
    });

    return ok({
      soDot: dot.soDot,
      trangThai: dot.trangThai,
      soAnh: dot.soAnh,
      tienAnh: dot.tienAnh,
      tienSanPham: dot.tienSanPham,
      tong: dot.tong,
      submittedAt: dot.submittedAt,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
