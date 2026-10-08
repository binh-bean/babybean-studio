/**
 * POST /api/g/anh-chinh-sua/anh-mau — ba mẹ gửi kèm ẢNH MẪU khi xin sửa (BB-371).
 *
 * Ảnh khách tải lên là dữ liệu nhạy cảm (có thể là ảnh con mình):
 *   - lưu ở bucket RIÊNG TƯ `yeu-cau-sua` (migration 0091), đường dẫn
 *     '<galleryId>/<uuid>.<đuôi>' — bộ ảnh lấy từ PHIÊN, không từ thân yêu cầu;
 *   - không bao giờ trả URL công khai; nhân viên xem bằng URL ký 10 phút;
 *   - chỉ ảnh (JPG/PNG/WEBP/HEIC — xét cả kiểu khai báo LẪN chữ ký byte đầu
 *     tệp), tối đa 5 MB, tối đa 30 tấm một bộ ảnh;
 *   - không gửi sang dịch vụ bên thứ ba nào.
 *
 * Chưa áp 0091 (bảng/bucket chưa có) → 409, màn khách đã ẩn nút từ trước.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_ANH_MAU,
  coBangChiTiet,
  coBucketAnhMau,
  docBoiCanhAnhChinh,
  docVongSua,
} from "@/lib/anh-chinh-sua/du-lieu";
import { kieuTheoChuKy, TOI_DA_BYTE_ANH_MAU } from "@/lib/anh-chinh-sua/nhan-dien";
import { laKhoaMuaThem, trangThaiDuyetDot, type TrangThaiDuyetDot } from "@/lib/anh-chinh-sua/theo-dot";
import { nhanAnhMinhHoaDuoc } from "@/lib/anh-chinh-sua/duyet-tung-tam";

const TOI_DA_TAM_MOT_BO = 30;


export const runtime = "nodejs";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const session = await requirePhienBoAnh(request);
    if (session.role !== "owner") return fail("FORBIDDEN", "Chỉ người nhận link chính mới gửi được ảnh mẫu ạ.");

    const admin = createAdminClient();
    if (!(await coBangChiTiet(admin)) || !(await coBucketAnhMau(admin))) {
      return fail("CONFLICT", "Bean chưa mở phần gửi ảnh mẫu, ba mẹ ghi chú giúp Bean nhé ạ.");
    }

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, status")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    // BB-401 — đợt MUA THÊM duyệt riêng (BB-377) khi bộ có thể đã duyệt/đã giao: ba mẹ xin
    // sửa ảnh mua thêm cũng gửi kèm được ảnh minh hoạ. Chỉ đọc thêm khi bộ không ở bước duyệt.
    let cacDot: TrangThaiDuyetDot[] = [];
    if (gallery.status !== "awaiting_approval") {
      const bc = await docBoiCanhAnhChinh(admin, gallery.id);
      if (bc.mocDot) {
        const vong = await docVongSua(admin, gallery.id, false);
        cacDot = [...bc.mocDot.entries()]
          .filter(([khoa]) => laKhoaMuaThem(khoa))
          .map(([khoa, moc]) => trangThaiDuyetDot(moc, vong.some((v) => v.resolved_at === null && v.dot_khoa === khoa)));
      }
    }
    if (!nhanAnhMinhHoaDuoc({ trangThaiBo: gallery.status, cacDotMuaThem: cacDot })) {
      return fail("INVALID_INPUT", "Bộ ảnh chưa tới bước duyệt ảnh đã chỉnh ạ.");
    }

    const form = await request.formData().catch(() => null);
    const tep = form?.get("tep");
    if (!tep || typeof tep === "string") return fail("INVALID_INPUT", "Ba mẹ chọn giúp Bean một tấm ảnh ạ.");
    if (tep.size <= 0 || tep.size > TOI_DA_BYTE_ANH_MAU) {
      return fail("INVALID_INPUT", "Ảnh mẫu cần nhỏ hơn 5 MB ạ.");
    }
    const byte = new Uint8Array(await tep.arrayBuffer());
    const kieu = kieuTheoChuKy(byte);
    if (!kieu) return fail("INVALID_INPUT", "Bean chỉ nhận ảnh JPG, PNG, WEBP hoặc HEIC ạ.");

    const kho = admin.storage.from(BUCKET_ANH_MAU);
    const { data: dangCo } = await kho.list(gallery.id, { limit: TOI_DA_TAM_MOT_BO + 1 });
    if ((dangCo?.length ?? 0) >= TOI_DA_TAM_MOT_BO) {
      return fail("RATE_LIMITED", "Ba mẹ đã gửi nhiều ảnh mẫu rồi ạ, Bean sẽ gọi lại để trao đổi thêm ạ.");
    }

    const duongDan = `${gallery.id}/${randomUUID()}.${kieu}`;
    const { error } = await kho.upload(duongDan, byte, { contentType: MIME[kieu], upsert: false });
    if (error) throw error;

    return ok({ duongDan });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
