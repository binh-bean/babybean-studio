/**
 * GET /api/admin/galleries/[id]/link-khach — link gửi KHÁCH (thật, `/g/<token>`) của
 * MỘT bộ ảnh, cho nút "Sao chép link" ở danh sách quản trị.
 *
 * OWNER: DEV-BE/DEV-FE (BB-311, P1).
 *
 * ---------------------------------------------------------------------------
 * Vì sao route này tồn tại
 * ---------------------------------------------------------------------------
 * Người đánh giá vận hành độc lập phát hiện nút "Sao chép link" ở
 * `src/components/features/admin/gallery-list.tsx` (`copyShareLink`) chép NHẦM
 * link QUẢN TRỊ (`/admin/galleries/<id>`) — đo bằng clipboard thật, không phải
 * đọc mã nguồn. Lý do sinh ra bug đó: mã link khách thật KHÔNG lưu chữ rõ
 * (bảng `share_links` chỉ giữ `token_hash` sha256, xem
 * `src/app/api/admin/galleries/route.ts`), nên component không có cách nào tự
 * dựng lại `/g/<token>` — nó dựng bừa một link quản trị thay thế.
 *
 * Mã link chữ rõ CHỈ hiện đúng một lần lúc tạo (POST .../share-link). Muốn
 * hiện lại sau đó thì phải giải mã bản MÃ HOÁ THUẬN NGHỊCH lưu ở bảng riêng
 * `share_link_ma` (AES-256-GCM, khoá dẫn xuất từ APP_SECRET — xem
 * `src/lib/auth/ma-link-loi.ts`) — ĐÚNG khuôn mẫu route chi tiết
 * `src/app/api/admin/galleries/[id]/items/route.ts` (đoạn `diaChiLink`, dòng
 * ~161-189) đã dùng. Route này lặp lại khuôn mẫu đó cho MỘT gallery.
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG nhét vào GET /api/admin/galleries (danh sách hàng loạt)
 * ---------------------------------------------------------------------------
 * Giải mã và trả token thật cho MỌI bộ ảnh đang hiện trên một trang danh sách
 * là mở rộng bề mặt lộ token không cần thiết — vi phạm tinh thần AGENTS.md §5
 * "Share token là bí mật: không log full token". Route này CHỈ trả đúng MỘT
 * bộ ảnh, đúng lúc CSKH bấm nút — cùng lý do bình luận đã có sẵn ở
 * `gallery-list.tsx` cho nút "Nhắc khách" (không gọi Lark hàng loạt trên cả
 * trang danh sách).
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG tách hàm dùng chung từ items/route.ts
 * ---------------------------------------------------------------------------
 * `items/route.ts` đang bị nhiều task khác sửa liên tục trong cùng đợt việc
 * (BB-296, BB-303, BB-215, BB-201 — xem các chú thích trong chính file đó).
 * Tách một hàm dùng chung ra khỏi file đó lúc này dễ đụng độ với agent khác
 * đang ở trong đúng file này (AGENTS.md mục 3). Khối giải mã dưới đây CHỦ Ý
 * lặp lại nguyên khuôn mẫu của `items/route.ts` — không tự chế cách mã hoá
 * mới — vì khối đó nhỏ và ổn định (`ma-link-loi.ts` không đổi từ BB-201).
 */

import { randomUUID, createHash } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { giaiMaMaLink, maHoaMaLink } from "@/lib/auth/ma-link";
import { docMaLinkAppTuLark } from "@/lib/lark/khoi-phuc-link-app";
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Link đã thử khôi phục từ Lark trong đời tiến trình này — không gọi Lark mỗi lần bấm nút. */
const daThuKhoiPhuc = new Set<string>();

const CHUA_CO_LINK =
  "Chưa có link — mở chi tiết bộ ảnh để tạo link trước.";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    // Cùng cửa quyền với việc HIỆN LẠI link ở màn chi tiết (items/route.ts,
    // đoạn `diaChiLink`): xem chi tiết bộ ảnh không đủ, phải là người được
    // phép GỬI link.
    requirePermission(staff, "galleries:share");

    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Gallery ID không hợp lệ");
    }

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, lark_hauky_record_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    requireBranch(staff, gallery.branch_id);

    // Link MỚI NHẤT bất kể tình trạng (cùng luật BB-188 ở items/route.ts) —
    // nhưng chỉ CHÉP được nếu còn sống (chưa thu hồi). Link thu hồi thì đằng
    // nào khách cũng không mở được nữa, chép ra chỉ gây nhầm.
    const { data: link } = await admin
      .from("share_links")
      .select("id, token_hash, revoked_at")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link || link.revoked_at) {
      return fail("NOT_FOUND", CHUA_CO_LINK);
    }

    const { data: maRow } = await admin
      .from("share_link_ma")
      .select("ma_hoa")
      .eq("share_link_id", link.id)
      .maybeSingle();

    // Giải mã xong ĐỐI CHIẾU với bản băm: bản mã lệch link (lỗi ghi, khôi
    // phục nhầm dòng) thì thà không trả còn hơn trả link của nhà khác.
    const khop = (m: string | null): m is string =>
      !!m && createHash("sha256").update(m).digest("hex") === link.token_hash;

    let ma = giaiMaMaLink(maRow?.ma_hoa);

    // Link tạo TRƯỚC BB-201 chưa có bản mã — thử khôi phục một lần từ cột
    // "Link app" bên Lark, đúng khuôn mẫu items/route.ts.
    if (!maRow && gallery.lark_hauky_record_id && !daThuKhoiPhuc.has(link.id)) {
      daThuKhoiPhuc.add(link.id);
      const tuLark = await docMaLinkAppTuLark(gallery.lark_hauky_record_id);
      if (khop(tuLark)) {
        ma = tuLark;
        const { error: ghiErr } = await admin
          .from("share_link_ma")
          .upsert(
            { share_link_id: link.id, ma_hoa: maHoaMaLink(tuLark) },
            { onConflict: "share_link_id", ignoreDuplicates: true },
          );
        if (ghiErr) {
          console.error(
            JSON.stringify({
              evt: "share_link_ma.khoi_phuc_failed",
              requestId,
              shareLinkId: link.id,
              lyDo: ghiErr.message,
            }),
          );
        }
      }
    }

    if (!khop(ma)) {
      return fail("NOT_FOUND", CHUA_CO_LINK);
    }

    const duongDan = `/g/${ma}`;
    return ok({
      // Đường dẫn tương đối — trình duyệt tự ghép với tên miền đang mở nếu
      // máy chủ không đoán được (thiếu NEXT_PUBLIC_APP_URL), cùng luật với
      // POST .../share-link (`duongDan`).
      duongDan,
      // Địa chỉ đầy đủ theo NEXT_PUBLIC_APP_URL, null nếu biến trống.
      shareUrl: diaChiDayDu(duongDan),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(
        err.code,
        err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : "Không có quyền lấy link khách",
      );
    }
    return failUnexpected(err, requestId);
  }
}
