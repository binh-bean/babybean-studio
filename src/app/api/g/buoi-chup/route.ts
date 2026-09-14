/**
 * /api/g/buoi-chup — cổng khách: một link, nhiều buổi chụp.
 *
 * OWNER: DEV-BE. Task BB-130.
 * Spec: docs/16 mục 6f, docs/briefs/BB-130-cong-khach-nhieu-buoi-chup.md
 *
 *   GET   → danh sách buổi chụp của khách đang đăng nhập
 *   POST  → ba mẹ chọn một buổi, phiên chuyển sang trỏ vào bộ ảnh đó
 *
 * ---------------------------------------------------------------------------
 * Vì sao có đường này
 * ---------------------------------------------------------------------------
 * Migration `0010` đổi link từ "một link một bộ ảnh" sang "một link một KHÁCH
 * HÀNG", làm địa chỉ vĩnh viễn — lý do ghi ngay trong migration: link hết hạn
 * khiến ba mẹ không xem lại được ảnh con mình.
 *
 * Nhưng nửa còn lại chưa làm: link theo khách mint ra phiên có `galleryId`
 * RỖNG và không tạo lượt chọn, vì một khách có nhiều buổi chụp mà chưa có chỗ
 * nào cho ba mẹ nói muốn xem buổi nào. File này là chỗ đó.
 *
 * ---------------------------------------------------------------------------
 * `buoiChupId` ĐI VÀO từ thân yêu cầu — và vì sao vẫn an toàn
 * ---------------------------------------------------------------------------
 * Cảnh báo đầu `src/lib/supabase/admin.ts` nói: mọi truy vấn thay mặt khách
 * phải bị chặn bởi `gallery_id` lấy từ cookie đã ký. Luật đó giữ nguyên ở MỌI
 * đường đọc dữ liệu — và đúng là POST dưới đây nhận `buoiChupId` từ trình
 * duyệt. Không có cách nào khác: ba mẹ phải nói được muốn mở buổi nào.
 *
 * Chỗ then chốt là con số đó KHÔNG BAO GIỜ được tin:
 *
 *   1. `customerId` lấy từ cookie phiên đã ký, không từ đâu khác.
 *   2. Câu truy vấn lọc luôn `customer_id = <của cookie>`, nên một id không
 *      thuộc khách này đơn giản là không có dòng nào trả về.
 *   3. Chỉ SAU khi qua được bước 2, id mới được KÝ VÀO cookie mới.
 *
 * Tức là thân yêu cầu chỉ được quyền ĐỀ NGHỊ; thứ có hiệu lực vẫn là cookie do
 * máy chủ ký. Mọi đường đọc phía sau (`/api/g/photos`, `/api/g/gallery`, …)
 * vẫn chỉ đọc `session.galleryId`, không đọc gì của trình duyệt.
 *
 * Câu trả lời cho "id không phải của tôi" là NOT_FOUND chứ không phải
 * FORBIDDEN: FORBIDDEN xác nhận bộ ảnh đó CÓ THẬT, tức là biến đường này
 * thành máy dò xem khách nào đang có buổi chụp nào.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import {
  requireGallerySession,
  GallerySessionError,
  signGallerySession,
  SESSION_COOKIE,
} from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GalleryStatus } from "@/types/domain";
import { ChonBuoiChupSchema } from "./schema";

export const runtime = "nodejs";

/**
 * Nhãn cho BA MẸ đọc, trên danh sách buổi chụp ở cổng khách (BB-130).
 *
 * `Record` đầy đủ chứ không phải `Record<string, string>`: thêm trạng thái vào
 * enum mà quên bảng này thì KHÔNG BIÊN DỊCH ĐƯỢC, thay vì lặng lẽ hiện ô trống
 * trên màn hình khách.
 */
const NHAN_TRANG_THAI_KHACH: Record<GalleryStatus, string> = {
  draft: "Studio đang chuẩn bị",
  syncing: "Studio đang tải ảnh lên",
  sync_error: "Studio đang chuẩn bị",
  ready: "Mời ba mẹ chọn ảnh",
  in_review: "Ba mẹ đang chọn ảnh",
  submitted: "Đã chốt, studio đang chỉnh ảnh",
  in_retouch: "Studio đang chỉnh ảnh",
  awaiting_approval: "Mời ba mẹ duyệt ảnh đã chỉnh",
  approved: "Ba mẹ đã duyệt, studio đang in",
  delivered: "Đã giao",
  expired: "Đã chốt danh sách chọn",
  archived: "Đã lưu trữ",
};

/**
 * Trạng thái KHÔNG hiện cho ba mẹ.
 *
 * `draft` là bộ nhân viên vừa tạo, chưa đồng bộ Drive xong; `archived` là bộ
 * đã cất kho. Cả hai đều không phải thứ ba mẹ được mời vào xem.
 *
 * `expired` thì VẪN HIỆN. Đó là toàn bộ ý định của `0010`: hết hạn chỉ có
 * nghĩa là không đổi lựa chọn được nữa, không có nghĩa là ảnh con mình biến
 * mất.
 */
const TRANG_THAI_AN: readonly GalleryStatus[] = ["draft", "archived"];

interface BuoiChupChoKhach {
  id: string;
  ten: string;
  ngayChup: string | null;
  soAnh: number;
  trangThai: GalleryStatus;
  nhanTrangThai: string;
  anhBiaId: string | null;
  dangXem: boolean;
}

/**
 * Supabase trả quan hệ lồng khi là mảng, khi là đối tượng, tuỳ suy luận kiểu.
 * Gỡ một chỗ ở đây thay vì lặp lại ở từng dòng.
 */
function ngayChupCua(raw: unknown): string | null {
  const nested = Array.isArray(raw) ? raw[0] : raw;
  const value = (nested as { shoot_date?: string } | null | undefined)?.shoot_date;
  return value ?? null;
}

/**
 * Danh sách buổi chụp của khách đang đăng nhập.
 *
 * Trả kèm `theoKhach` để màn hình biết mình đang ở kiểu link nào mà không phải
 * đoán: link kiểu cũ (gắn theo bộ ảnh) nhận `theoKhach: false` và danh sách
 * rỗng, rồi đi tiếp đường cũ như chưa có gì thay đổi.
 */
export async function GET(): Promise<NextResponse> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    // Link kiểu cũ trỏ thẳng vào một bộ ảnh và không có khách nào để liệt kê.
    // Trả 200 với danh sách rỗng chứ không phải lỗi: màn hình dùng chính câu
    // trả lời này để rẽ nhánh, mà một cái lỗi thì không rẽ được.
    if (!session.customerId) {
      return ok({ theoKhach: false, buoiChup: [] as BuoiChupChoKhach[] });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("galleries")
      .select("id, title, status, photo_count, cover_photo_id, created_at, shoot:shoots(shoot_date)")
      // ĐÂY là điều kiện giữ cho khách chỉ thấy buổi chụp CỦA CHÍNH MÌNH.
      // Bỏ dòng này đi thì mọi ba mẹ đều đọc được danh sách của mọi ba mẹ khác.
      .eq("customer_id", session.customerId)
      // Bộ chưa có tấm nào thì không hiện: ba mẹ bấm vào thấy trang trắng là
      // gọi điện ngay, và người nghe máy cũng không biết trả lời sao.
      .gt("photo_count", 0)
      .not("status", "in", `(${TRANG_THAI_AN.join(",")})`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const buoiChup: BuoiChupChoKhach[] = (data ?? []).map((row) => {
      const trangThai = row.status as GalleryStatus;
      return {
        id: row.id as string,
        ten: (row.title as string) ?? "Buổi chụp",
        ngayChup: ngayChupCua(row.shoot),
        soAnh: (row.photo_count as number) ?? 0,
        trangThai,
        nhanTrangThai: NHAN_TRANG_THAI_KHACH[trangThai],
        anhBiaId: (row.cover_photo_id as string | null) ?? null,
        // Ba mẹ vừa xem buổi nào thì đánh dấu buổi đó, để lúc quay lại danh
        // sách không phải nhớ mình đang ở đâu.
        dangXem: row.id === session.galleryId,
      };
    });

    // Sắp theo ngày chụp, mới nhất trước. Không sắp được bên Postgres vì ngày
    // nằm ở bảng `shoots`, mà bộ ảnh có thể chưa gắn buổi chụp nào (`shoot_id`
    // cho phép null) — những bộ đó rơi xuống cuối thay vì biến mất.
    buoiChup.sort((a, b) => (b.ngayChup ?? "").localeCompare(a.ngayChup ?? ""));

    return ok({ theoKhach: true, buoiChup });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

/**
 * Ba mẹ chọn một buổi chụp. Ký lại phiên cho trỏ vào bộ ảnh đó.
 *
 * Cookie được đặt trên chính câu trả lời, không qua `cookies()` của next, vì
 * cùng lý do đã ghi ở `api/auth/gallery/route.ts`: chỉ cách này mới gọi thẳng
 * được từ phép thử, và một đường an ninh không ai thử được là một đường không
 * ai canh.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    if (!session.customerId) {
      return fail("FORBIDDEN", "Link này đã mở sẵn đúng một buổi chụp rồi");
    }

    const parsed = ChonBuoiChupSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return fail("INVALID_INPUT", "Ba mẹ chọn giúp một buổi chụp trong danh sách");
    }

    const admin = createAdminClient();

    // Ba điều kiện đi CÙNG NHAU, cố ý:
    //   - `id`        : buổi ba mẹ vừa bấm
    //   - `customer_id`: từ cookie đã ký — khoá lại đúng khách này
    //   - `photo_count`: bộ trống thì cả danh sách cũng không hiện, nên vào
    //                    thẳng bằng id cũng không được vào
    const { data: buoi, error } = await admin
      .from("galleries")
      .select("id, status, photo_count")
      .eq("id", parsed.data.buoiChupId)
      .eq("customer_id", session.customerId)
      .gt("photo_count", 0)
      .not("status", "in", `(${TRANG_THAI_AN.join(",")})`)
      .maybeSingle();

    if (error) throw error;
    // Không phải của khách này, hoặc không tồn tại — một câu trả lời cho cả
    // hai. Xem phần đầu tệp.
    if (!buoi) return fail("NOT_FOUND", "Không tìm thấy buổi chụp này");

    const selectionId = await layHoacTaoLuotChon(admin, {
      shareLinkId: session.shareLinkId,
      galleryId: buoi.id as string,
      laKhachChinh: session.role === "owner",
    });

    await admin
      .from("share_links")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", session.shareLinkId);

    const { token, expiresAt } = await signGallerySession({
      customerId: session.customerId,
      galleryId: buoi.id as string,
      shareLinkId: session.shareLinkId,
      selectionId,
      role: session.role,
    });

    const response = ok({ buoiChupId: buoi.id, expiresAt: expiresAt.toISOString() });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    if (err instanceof z.ZodError) return fail("INVALID_INPUT");
    return failUnexpected(err, requestId);
  }
}

/**
 * Lượt chọn của cặp (link, bộ ảnh) — có thì lấy, chưa có thì tạo.
 *
 * MỘT lượt chọn cho mỗi CẶP, không phải mỗi link. Chỉ số cũ
 * `uq_selections_share_link` khoá theo link, đúng khi một link chỉ mở một bộ
 * ảnh; với link theo khách thì buổi chụp thứ hai ba mẹ bấm vào sẽ đâm vào lỗi
 * trùng khoá. Migration `0040` nới thành `(share_link_id, gallery_id)`.
 *
 * Tạo lúc ba mẹ bấm vào chứ không phải lúc tạo link: một khách có thể có mười
 * buổi chụp mà chỉ mở hai, và tám lượt chọn rỗng kia chỉ làm báo cáo đếm nhầm.
 */
async function layHoacTaoLuotChon(
  admin: ReturnType<typeof createAdminClient>,
  args: { shareLinkId: string; galleryId: string; laKhachChinh: boolean },
): Promise<string> {
  const { data: daCo } = await admin
    .from("selections")
    .select("id")
    .eq("share_link_id", args.shareLinkId)
    .eq("gallery_id", args.galleryId)
    .maybeSingle();

  if (daCo) return daCo.id as string;

  // `uq_selections_primary` chỉ cho MỘT lượt chọn chính trên mỗi bộ ảnh. Nếu
  // bộ này đã có lượt chọn chính từ một link khác (ví dụ link kiểu cũ gửi
  // trước đó), đặt thêm cái nữa là lỗi trùng khoá — mà lỗi đó rơi đúng vào lúc
  // ba mẹ bấm vào xem ảnh.
  let laChinh = args.laKhachChinh;
  if (laChinh) {
    const { data: chinhSan } = await admin
      .from("selections")
      .select("id")
      .eq("gallery_id", args.galleryId)
      .eq("is_primary", true)
      .maybeSingle();
    if (chinhSan) laChinh = false;
  }

  const { data: taoMoi, error } = await admin
    .from("selections")
    .insert({
      gallery_id: args.galleryId,
      share_link_id: args.shareLinkId,
      is_primary: laChinh,
    })
    .select("id")
    .single();

  if (error || !taoMoi) throw error ?? new Error("Tạo lượt chọn không trả về gì");
  return taoMoi.id as string;
}
