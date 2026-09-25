/**
 * GET /api/admin/galleries/[id]/items — Thành phần hợp đồng và hạn mức ảnh của album (phía quản trị).
 *
 * OWNER: DEV-BE. Task BB-102.
 * Hạn mức lấy từ app.gallery_quota(), cây hai tầng (dòng hợp đồng cha và thành phần con).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { nhanHienThi, mauCanhBao, TRANG_THAI_LARK } from "@/lib/lark/trang-thai-hau-ky";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate staff
    const staff = await requireStaff();

    // 2. Validate gallery ID
    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Gallery ID không hợp lệ");
    }

    const admin = createAdminClient();

    // 3. Check gallery existence and branch authorization
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      // BB-150 thêm bốn cột cuối: màn chi tiết phải cho thấy ảnh đến từ thư mục
      // nào. Viết liền một dòng vì Supabase suy kiểu từ CHÍNH chuỗi literal này —
      // nối chuỗi là mất kiểu, và cả tệp đổ lỗi "GenericStringError".
      // BB-215 thêm ba cột cuối: khối "Bìa bộ ảnh" cần biết bìa đang chọn và
      // baby_id để suy tên bé — cùng luật viết liền một dòng như BB-150 ở trên
      // vì Supabase suy kiểu từ chuỗi literal.
      // BB-200 (2/3) thêm bốn cột cuối: nhãn quản trị + mức cảnh báo + dòng
      // "Lark: … · đọc lúc …" ở màn chi tiết. Cùng luật viết liền một dòng
      // như hai lần trước (BB-150, BB-215) — Supabase suy kiểu từ chuỗi
      // literal, nối chuỗi là mất kiểu.
      .select("id, branch_id, title, status, lark_contract_codes, extra_photo_price, photo_count, drive_folder_url, drive_folder_id, last_synced_at, sync_error, cover_photo_id, cover_headline, welcome_message, baby_id, lark_trang_thai, lark_canh_bao, lark_doc_luc")
      .eq("id", galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    requireBranch(staff, gallery.branch_id);

    // 4. Retrieve 2-tier contract components and quota
    const summary = await getGalleryContractSummary(gallery.id, admin);

    // 5. Respond
    // Số ảnh khách đã chọn, đếm MỖI ẢNH MỘT LẦN.
    //
    // Một bộ ảnh có thể có nhiều lựa chọn (mẹ một link, bà một link). count(*)
    // sẽ đếm trùng tấm ảnh mà cả hai cùng chọn — đúng lỗi đã phải sửa ở 0022.
    const { data: selRows } = await admin
      .from("selection_items")
      .select("photo_id")
      .eq("gallery_id", gallery.id)
      .eq("mark", "selected");
    const selectedCount = new Set((selRows ?? []).map((r) => r.photo_id)).size;

    // Link chia sẻ chính của bộ ảnh.
    //
    // BB-188: lấy link MỚI NHẤT **bất kể tình trạng**, không chỉ lấy link còn
    // sống. Trước đây link hết hạn hay bị thu hồi là màn quản trị hiện "chưa có
    // link nào" — CSKH không còn lựa chọn nào ngoài bấm Tạo link mới, mà tạo mới
    // là **đổi mã trên thanh địa chỉ**. Ba mẹ đã lưu link thành biểu tượng ngoài
    // màn hình điện thoại thì biểu tượng đó chết, và phải lưu lại từ đầu.
    //
    // Thấy được link cũ thì mới mở khoá tại chỗ được (đường `.../mo-lai`).
    //
    // `created_at` giảm dần, không phải tăng dần: có bộ mang nhiều link (tạo lại
    // kèm `giuLinkCu`), và link đúng là cái vừa cấp chứ không phải cái đầu tiên.
    const { data: link } = await admin
      .from("share_links")
      .select("id, status, expires_at, token_prefix, created_at, view_count, revoked_at")
      .eq("gallery_id", gallery.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Lịch sử khách yêu cầu sửa. CSKH phải thấy khách đã đòi gì ở các vòng
    // trước, nếu không người photoshop sẽ sửa lại đúng thứ đã sửa rồi.
    const { data: revisions } = await admin
      .from("revision_requests")
      .select("round, note, reviewed_url, created_at, resolved_at")
      .eq("gallery_id", gallery.id)
      .order("round", { ascending: false });

    // Link thư mục ảnh đã chỉnh gần nhất, để màn hình điền sẵn khi gửi lại.
    const { data: delivery } = await admin
      .from("deliveries")
      .select("final_drive_url")
      .eq("gallery_id", gallery.id)
      .maybeSingle();

    // Danh mục sản phẩm để CSKH thêm dòng hàng tay.
    //
    // Màn hình từ trước vẫn bảo "thêm dòng Edit file bên dưới" và "thêm tay",
    // nhưng KHÔNG có nút nào để làm — đường POST có sẵn mà giao diện thiếu.
    // Chín bộ ảnh đang bị chặn vì chưa rõ hạn mức, và CSKH không có cách nào
    // gỡ. Bảo người ta làm một việc rồi không đưa chỗ để làm là cách chắc chắn
    // để họ đi sửa thẳng cơ sở dữ liệu.
    const { data: catalog } = await admin
      .from("products")
      .select("id, name, kind")
      .eq("is_active", true)
      .order("kind")
      .order("name");

    // Tiền phát sinh: phải trả bao nhiêu, đã thu bao nhiêu, còn thiếu bao
    // nhiêu. Số PHẢI TRẢ lấy từ con số chụp lại lúc khách chốt, không tính
    // lại — khách trả theo số họ đã nhìn thấy.
    const [{ data: primarySel }, { data: payRows }] = await Promise.all([
      admin
        .from("selections")
        .select("snapshot_extra_amount")
        .eq("gallery_id", gallery.id)
        .eq("is_primary", true)
        .maybeSingle(),
      admin.from("gallery_payments").select("amount").eq("gallery_id", gallery.id),
    ]);

    const dueAmount = Number(primarySel?.snapshot_extra_amount ?? 0);
    const paidAmount = (payRows ?? []).reduce((t, r) => t + Number(r.amount), 0);

    // BB-215: tên bé cho khối "Bìa bộ ảnh" — cùng cách lấy với /api/g/gallery
    // (nickname ưu tiên hơn họ tên đầy đủ), để chip mẫu chữ và ô xem trước
    // khớp với đúng cái màn khách sẽ thấy.
    const { data: baby } = gallery.baby_id
      ? await admin.from("babies").select("full_name, nickname").eq("id", gallery.baby_id).maybeSingle()
      : { data: null };
    const { data: branch } = await admin
      .from("branches")
      .select("name")
      .eq("id", gallery.branch_id)
      .maybeSingle();

    return ok({
      galleryId: gallery.id,
      photoCount: gallery.photo_count,
      dueAmount,
      paidAmount,
      outstanding: dueAmount - paidAmount,
      revisions: revisions ?? [],
      catalog: catalog ?? [],
      finalDriveUrl: delivery?.final_drive_url ?? null,
      // Thư mục ảnh GỐC — khác hẳn finalDriveUrl ở trên (ảnh ĐÃ CHỈNH gửi khách
      // cuối quy trình). Hai thứ này mà lẫn nhau là có ngày ghi đè nguồn ảnh.
      driveFolderUrl: gallery.drive_folder_url ?? null,
      driveFolderId: gallery.drive_folder_id ?? null,
      lastSyncedAt: gallery.last_synced_at ?? null,
      syncError: gallery.sync_error ?? null,
      title: gallery.title,
      status: gallery.status,
      // BB-200 (2/3) — nhãn quản trị + mức cảnh báo, cùng luật với màn khách
      // và màn danh sách (src/lib/lark/trang-thai-hau-ky.ts). Không trả mã
      // Lark thô (`lark_trang_thai`/`lark_canh_bao`) — đó là chi tiết triển
      // khai nội bộ, màn hình chỉ cần nhãn và tên đã dịch.
      statusLabel: nhanHienThi(
        gallery.status,
        gallery.lark_trang_thai,
        (s) => GALLERY_STATUS_LABEL[s] ?? s,
      ).quanTri,
      warningColor: mauCanhBao(gallery.lark_canh_bao),
      larkTenTrangThai: gallery.lark_trang_thai
        ? (TRANG_THAI_LARK as Record<string, { ten: string }>)[gallery.lark_trang_thai]?.ten ?? null
        : null,
      larkDocLuc: gallery.lark_doc_luc ?? null,
      // BB-200 (3/3) — form "Mở lại cho khách chọn tiếp" chỉ hiện khi nhân
      // viên có quyền này (xem src/app/api/admin/galleries/[id]/reopen/route.ts).
      canReopen: staff.permissions.includes("galleries:reopen"),
      // BB-215: dữ liệu cho khối "Bìa bộ ảnh".
      coverPhotoId: gallery.cover_photo_id ?? null,
      coverHeadline: gallery.cover_headline ?? null,
      welcomeMessage: gallery.welcome_message ?? null,
      babyName: baby?.nickname || baby?.full_name || null,
      branchName: branch?.name ?? null,
      contractCodes: gallery.lark_contract_codes ?? [],
      extraPhotoPrice: Number(gallery.extra_photo_price ?? 0),
      quotaKnown: summary.quotaKnown,
      includedQuota: summary.includedQuota,
      totalValue: summary.totalValue,
      selectedCount,
      // BB-188: đủ trường để màn CSKH nói được link đang ở tình trạng nào và
      // còn bao lâu. Tuyệt đối KHÔNG trả `token_hash` — sau khi bỏ PIN, mã link
      // là thứ duy nhất che ảnh của một nhà. `token_prefix` (6 ký tự) chỉ để đối
      // chiếu, không mở được gì.
      shareLink: link
        ? {
            id: link.id,
            status: link.status,
            expiresAt: link.expires_at ?? null,
            tokenPrefix: link.token_prefix ?? null,
            createdAt: link.created_at ?? null,
            viewCount: link.view_count ?? 0,
            revokedAt: link.revoked_at ?? null,
          }
        : null,
      items: summary.items,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      // BB-223: xem giải thích ở src/app/api/admin/galleries/route.ts —
      // err.message của AuthError mặc định là mã lỗi trần, không phải câu
      // tiếng Việt cho người dùng.
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

/**
 * POST   thêm một dòng hàng vào bộ ảnh
 * PATCH  đổi số lượng một dòng
 * DELETE bỏ một dòng
 *
 * OWNER: DEV-BE. Task BB-103.
 *
 * ---------------------------------------------------------------------------
 * Sửa dòng Edit file là SỬA HẠN MỨC CỦA KHÁCH
 * ---------------------------------------------------------------------------
 * Hạn mức không phải một cột người ta gõ vào; nó là tổng số lượng các dòng
 * `Edit file`. Nên đổi số lượng một dòng như thế là đổi số ảnh khách được chọn
 * miễn phí — và khách đang nhìn con số đó trên màn hình của họ.
 *
 * Route trả về hạn mức TRƯỚC và SAU mỗi lần sửa, để giao diện hỏi lại người
 * dùng bằng con số cụ thể thay vì một câu cảnh báo chung chung.
 *
 * ---------------------------------------------------------------------------
 * Chốt xong là khoá
 * ---------------------------------------------------------------------------
 * Bộ ảnh đã ở trạng thái submitted trở đi thì không sửa dòng hàng nữa. Lúc
 * khách bấm chốt, BB-114 đã chụp lại con số họ nhìn thấy; sửa dòng hàng sau đó
 * làm hai bên nhớ hai con số khác nhau, và bên thiệt luôn là khách.
 *
 * Cùng luật với patch_selection_batch — xem docs/16 mục 4.
 */

const LOCKED_STATUSES = ["submitted", "in_retouch", "delivered", "archived"];

/** Lấy bộ ảnh, kiểm quyền và kiểm khoá. Trả về null kèm lý do nếu không được. */
type EditableGallery =
  | { error: Response; admin?: undefined; gallery?: undefined; staff?: undefined }
  | {
      error?: undefined;
      admin: ReturnType<typeof createAdminClient>;
      gallery: { id: string; branch_id: string; status: string };
      /** Cần cho dòng nhật ký: ai sửa dòng hàng này (BB-052). */
      staff: Awaited<ReturnType<typeof requireStaff>>;
    };

async function loadEditableGallery(galleryId: string): Promise<EditableGallery> {
  const staff = await requireStaff();
  requirePermission(staff, "galleries:write");

  const admin = createAdminClient();
  const { data: gallery } = await admin
    .from("galleries")
    .select("id, branch_id, status")
    .eq("id", galleryId)
    .maybeSingle();

  if (!gallery) return { error: fail("NOT_FOUND", "Không tìm thấy bộ ảnh") } as const;
  requireBranch(staff, gallery.branch_id);

  if (LOCKED_STATUSES.includes(gallery.status)) {
    return {
      error: fail(
        "GALLERY_LOCKED",
        "Khách đã chốt bộ ảnh này. Không sửa được dòng hàng nữa.",
      ),
    } as const;
  }

  return { admin, gallery, staff } as const;
}

async function quotaOf(
  admin: ReturnType<typeof createAdminClient>,
  galleryId: string,
): Promise<number | null> {
  const { data } = await admin.rpc("gallery_quota", { p_gallery_id: galleryId });
  return data === null || data === undefined ? null : Number(data);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id: galleryId } = await context.params;
    if (!UUID_REGEX.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const loaded = await loadEditableGallery(galleryId);
    if (loaded.error) return loaded.error;
    const { admin, gallery, staff } = loaded;

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as {
      productId?: string;
      quantity?: number;
      unitPrice?: number | null;
    } | null;

    if (!body?.productId || !UUID_REGEX.test(body.productId)) {
      return fail("INVALID_INPUT", "Thiếu sản phẩm");
    }
    const quantity = Number(body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail("INVALID_INPUT", "Số lượng phải là số nguyên từ 1 trở lên");
    }

    const quotaBefore = await quotaOf(admin, galleryId);

    const { data: inserted, error } = await admin
      .from("gallery_items")
      .insert({
        gallery_id: galleryId,
        product_id: body.productId,
        quantity,
        // Dòng CSKH thêm tay là dòng hợp đồng (không có cha), nên được mang
        // tiền. Thành phần của gói thì không — ràng buộc chk_component_no_price
        // ở 0023 chặn việc đó.
        unit_price: body.unitPrice ?? null,
      })
      .select("id")
      .single();

    if (error) throw error;

    const quotaAfter = await quotaOf(admin, galleryId);
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.item_added",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      // Hạn mức trước/sau là thứ đổi số tiền khách phải trả, nên ghi cả hai.
      metadata: { itemId: inserted.id, productId: body.productId, quantity, quotaBefore, quotaAfter },
    });

    return ok({
      id: inserted.id,
      quotaBefore,
      quotaAfter,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền sửa dòng hàng");
    return failUnexpected(err, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id: galleryId } = await context.params;
    if (!UUID_REGEX.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const loaded = await loadEditableGallery(galleryId);
    if (loaded.error) return loaded.error;
    const { admin, gallery, staff } = loaded;

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as {
      itemId?: string;
      quantity?: number;
    } | null;

    if (!body?.itemId || !UUID_REGEX.test(body.itemId)) {
      return fail("INVALID_INPUT", "Thiếu dòng hàng cần sửa");
    }
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail("INVALID_INPUT", "Số lượng phải là số nguyên từ 1 trở lên");
    }

    const quotaBefore = await quotaOf(admin, galleryId);

    // Ràng buộc gallery_id trong câu update, không chỉ ràng id: thiếu nó thì
    // một mã dòng hàng của bộ ảnh KHÁC vẫn sửa được, và kiểm quyền chi nhánh ở
    // trên chẳng bảo vệ được gì.
    const { error } = await admin
      .from("gallery_items")
      .update({ quantity })
      .eq("id", body.itemId)
      .eq("gallery_id", galleryId);

    if (error) throw error;

    const quotaAfter = await quotaOf(admin, galleryId);
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.item_changed",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { itemId: body.itemId, quantity, quotaBefore, quotaAfter },
    });

    return ok({ quotaBefore, quotaAfter });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền sửa dòng hàng");
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const { id: galleryId } = await context.params;
    if (!UUID_REGEX.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const loaded = await loadEditableGallery(galleryId);
    if (loaded.error) return loaded.error;
    const { admin, gallery, staff } = loaded;

    const url = new URL(request.url);
    const jsonBody = await readJsonBody(request);
    const itemId =
      ((jsonBody.ok ? jsonBody.data : null) as { itemId?: string } | null)?.itemId ??
      url.searchParams.get("itemId") ??
      "";

    if (!UUID_REGEX.test(itemId)) return fail("INVALID_INPUT", "Thiếu dòng hàng cần bỏ");

    const quotaBefore = await quotaOf(admin, galleryId);

    // Xoá dòng cha kéo theo thành phần của nó (0014 khai on delete cascade),
    // nên bỏ một gói chụp là bỏ luôn hạn mức nằm trong gói đó.
    const { error } = await admin
      .from("gallery_items")
      .delete()
      .eq("id", itemId)
      .eq("gallery_id", galleryId);

    if (error) throw error;

    const quotaAfter = await quotaOf(admin, galleryId);
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.item_removed",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      metadata: { itemId, quotaBefore, quotaAfter },
    });

    return ok({ quotaBefore, quotaAfter });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền sửa dòng hàng");
    return failUnexpected(err, requestId);
  }
}
