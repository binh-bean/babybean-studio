/**
 * POST /api/admin/galleries/[id]/share-link/mo-lai — mở khoá lại link CŨ.
 *
 * OWNER: PM. Task BB-188.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần một đường riêng, thay vì cứ tạo link mới
 * ---------------------------------------------------------------------------
 * Chủ studio nói thẳng ngày 18.09.2026:
 *
 *   *"Không phải tạo link mới mà mở khoá link cũ — vì nếu khách tạo icon app
 *   trên màn điện thoại mà cấp link mới thì khách phải làm lại icon khác,
 *   thiếu chuyên nghiệp mà không sử dụng được để marketing về sau."*
 *
 * Link gửi khách là `/g/<mã 43 ký tự>`. Ba mẹ bấm *Thêm vào màn hình chính*
 * thì biểu tượng ấy ghim CHÍNH chuỗi đó. Cấp link mới là đổi chuỗi, và mọi
 * biểu tượng đã ghim đều mở ra trang lỗi — kể cả khi studio chỉ muốn gia hạn
 * cho một nhà chưa tải xong ảnh.
 *
 * Đường này giữ nguyên `token_hash`, tức giữ nguyên địa chỉ. Chỉ đổi hai thứ:
 * tình trạng về `active`, và hạn dùng đẩy tới trước.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG đọc lại được mã, và không cần đọc
 * ---------------------------------------------------------------------------
 * Cơ sở dữ liệu chỉ giữ bản băm. Nên đường này KHÔNG trả về link.
 *
 * Nhưng cũng không ai cần nó: ba mẹ đang cầm sẵn link (đó là cả lý do phải mở
 * khoá), và bản đầy đủ nằm ở cột *Link app* đúng dòng Hậu Kỳ bên Lark, do
 * BB-132 ghi sang lúc cấp. CSKH cần chuỗi thì lấy ở đó.
 *
 * ---------------------------------------------------------------------------
 * Mở khoá một link ĐÃ BỊ THU HỒI là chuyện khác hẳn hết hạn
 * ---------------------------------------------------------------------------
 * Hết hạn là hết giờ. Thu hồi là **có người bấm nút thu hồi** — thường vì nghi
 * mã đã lọt ra ngoài. Mở lại một link như vậy là mở lại cho cả người đã cầm mã
 * rò rỉ đó.
 *
 * Đường này vẫn cho mở, vì máy không biết lý do thu hồi và không được quyết
 * thay người. Nhưng nó trả `daTungThuHoi: true` để màn CSKH hỏi lại một câu
 * trước khi bấm. Im lặng mở là chỗ hỏng không ai thấy.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const admin = createAdminClient();

    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // Link MỚI NHẤT, bất kể tình trạng. Đúng cái màn quản trị đang hiện.
    const { data: link } = await admin
      .from("share_links")
      .select("id, status, expires_at, token_prefix, revoked_at")
      .eq("gallery_id", galleryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) {
      return fail(
        "NOT_FOUND",
        "Bộ ảnh này chưa từng có link nào nên không có gì để mở khoá. Bấm Tạo link gửi khách.",
      );
    }

    const daTungThuHoi = link.revoked_at !== null;

    // Hạn mới đọc từ đúng khoá cấu hình mà đường tạo link dùng, để hai đường
    // không trôi khỏi nhau. Chủ studio đã chốt: hai tháng kể từ ngày gửi link
    // (docs/13 §11) — mở khoá lại chính là một lần gửi lại.
    const { data: ttlData } = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.link_ttl_days")
      .is("branch_id", null)
      .maybeSingle();

    const ttlDays = typeof ttlData?.value === "number" ? ttlData.value : 60;
    const hanMoi = new Date();
    hanMoi.setDate(hanMoi.getDate() + ttlDays);

    const { error } = await admin
      .from("share_links")
      .update({
        status: "active",
        expires_at: hanMoi.toISOString(),
        // Xoá dấu thu hồi: để nguyên thì lần sau nhìn vào không biết link đang
        // sống hay chết. Dấu vết vẫn còn đủ trong `activity_logs` bên dưới.
        revoked_at: null,
        revoked_by: null,
        // KHÔNG đụng `failed_attempts`/`locked_until`: migration 0045 đã bỏ cả hai
        // cùng mã PIN (BB-169). Ghi vào cột không còn tồn tại là 500 im lặng.
      })
      .eq("id", link.id);

    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "share_link.reopened",
      entity_type: "gallery",
      entity_id: galleryId,
      metadata: {
        shareLinkId: link.id,
        // SÁU ký tự đầu, không bao giờ cả mã — cùng luật với share_link.created.
        tokenPrefix: link.token_prefix,
        tinhTrangCu: link.status,
        hanCu: link.expires_at,
        hanMoi: hanMoi.toISOString(),
        daTungThuHoi,
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    console.info(
      JSON.stringify({
        evt: "share_link.reopened",
        requestId,
        galleryId,
        tokenPrefix: link.token_prefix,
        tinhTrangCu: link.status,
        daTungThuHoi,
      }),
    );

    return ok({
      shareLinkId: link.id,
      tinhTrangCu: link.status,
      expiresAt: hanMoi.toISOString(),
      ttlDays,
      daTungThuHoi,
      // KHÔNG có `duongDan`: mã không đọc lại được, và cũng không đổi. Địa chỉ
      // ba mẹ đang cầm vẫn là địa chỉ đúng.
      giuNguyenDiaChi: true,
    });
  } catch (err) {
    // BB-223: xem giải thích ở src/app/api/admin/galleries/route.ts —
    // err.message của AuthError mặc định là mã lỗi trần, không phải câu
    // tiếng Việt cho người dùng.
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
