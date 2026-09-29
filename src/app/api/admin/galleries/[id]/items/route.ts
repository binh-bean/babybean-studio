/**
 * GET /api/admin/galleries/[id]/items — Thành phần hợp đồng và hạn mức ảnh của album (phía quản trị).
 *
 * OWNER: DEV-BE. Task BB-102.
 * Hạn mức lấy từ app.gallery_quota(), cây hai tầng (dòng hợp đồng cha và thành phần con).
 */

import { randomUUID, createHash } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { HINH_THUC_GIAM_GIA } from "@/lib/gallery/tien-phat-sinh";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { giaiMaMaLink, maHoaMaLink } from "@/lib/auth/ma-link";
import { docMaLinkAppTuLark } from "@/lib/lark/khoi-phuc-link-app";

/** Link đã thử khôi phục từ Lark trong đời tiến trình này — không gọi Lark mỗi lần mở trang. */
const daThuKhoiPhuc = new Set<string>();
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { nhanHienThi, mauCanhBao, TRANG_THAI_LARK } from "@/lib/lark/trang-thai-hau-ky";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { locHangInTrongGoi } from "@/lib/products/hang-in-trong-goi";
import { layTrangThaiXinMoLai } from "@/lib/gallery/yeu-cau-mo-lai";
import { layChiTietDotQuanTri, layThongTinChotDot1 } from "@/lib/gallery/dot-chon-server";

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
      // BB-200 (2/3) thêm ba cột lark_trang_thai…: nhãn quản trị + mức cảnh báo
      // + dòng "Lark: … · đọc lúc …". BB-201 thêm lark_hauky_record_id: khôi
      // phục link cũ từ cột "Link app". BB-244 thêm cover_layout (kiểu chữ bìa).
      // Cùng luật viết liền một dòng (BB-150, BB-215) — Supabase suy kiểu từ
      // chuỗi literal, nối chuỗi là mất kiểu.
      // BB-303 thêm customer_id, shoot_id, package_id: tiêu đề "Loại buổi ·
      // Bé …" + dòng phụ "khách · SĐT · chi nhánh · ngày chụp"
      // (quan-tri-chi-tiet.png). Cùng luật viết liền một dòng (BB-150,
      // BB-215, BB-200) — Supabase suy kiểu từ chuỗi literal, nối chuỗi mất kiểu.
      .select("id, branch_id, title, status, lark_contract_codes, extra_photo_price, photo_count, drive_folder_url, drive_folder_id, last_synced_at, sync_error, cover_photo_id, cover_headline, welcome_message, cover_layout, baby_id, lark_hauky_record_id, lark_trang_thai, lark_canh_bao, lark_doc_luc, submitted_at, customer_id, shoot_id, package_id")
      .eq("id", galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    requireBranch(staff, gallery.branch_id);

    // 4. Retrieve 2-tier contract components and quota
    const summary = await getGalleryContractSummary(gallery.id, admin);

    /*
      BB-202 — "Bìa album: <tên tệp>" cho CSKH ở màn chi tiết bộ ảnh.

      Bảng `album_covers` có thể CHƯA TỒN TẠI (migration 0075 chưa áp) — bắt
      lỗi 42P01 và trả mảng rỗng, không làm sập cả màn chi tiết vì một tính
      năng chưa triển khai.
    */
    const albumRowsTrongGoi = locHangInTrongGoi(summary.items).filter((h) => h.nhom === "album");
    let albumCovers: Array<{ galleryItemId: string; name: string; fileName: string | null }> = [];
    if (albumRowsTrongGoi.length > 0) {
      const { data: covers, error: coversErr } = await admin
        .from("album_covers")
        .select("gallery_item_id, selection_item_id")
        .in(
          "gallery_item_id",
          albumRowsTrongGoi.map((a) => a.galleryItemId),
        );
      if (!coversErr && covers) {
        const selItemIds = covers.map((c) => c.selection_item_id);
        const { data: sis } = selItemIds.length
          ? await admin.from("selection_items").select("id, photo_id").in("id", selItemIds)
          : { data: [] as { id: string; photo_id: string }[] };
        const photoIdBySelItem = new Map((sis ?? []).map((s) => [s.id, s.photo_id]));
        const photoIds = Array.from(new Set(Array.from(photoIdBySelItem.values())));
        const { data: anhs } = photoIds.length
          ? await admin.from("photos").select("id, file_name").in("id", photoIds)
          : { data: [] as { id: string; file_name: string }[] };
        const fileNameByPhoto = new Map((anhs ?? []).map((a) => [a.id, a.file_name]));
        const coverByItem = new Map(covers.map((c) => [c.gallery_item_id, c.selection_item_id]));

        albumCovers = albumRowsTrongGoi.map((a) => {
          const selItemId = coverByItem.get(a.galleryItemId) ?? null;
          const photoId = selItemId ? photoIdBySelItem.get(selItemId) ?? null : null;
          const fileName = photoId ? fileNameByPhoto.get(photoId) ?? null : null;
          return { galleryItemId: a.galleryItemId, name: a.name, fileName };
        });
      } else {
        albumCovers = albumRowsTrongGoi.map((a) => ({
          galleryItemId: a.galleryItemId,
          name: a.name,
          fileName: null,
        }));
      }
    }

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
      .select("id, status, expires_at, token_prefix, token_hash, created_at, view_count, revoked_at")
      .eq("gallery_id", gallery.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    /*
      BB-201 — link đầy đủ để CSKH thấy lại như link Drive (chủ studio 25/09).
      Chỉ trả cho người có quyền GỬI link (galleries:share) — xem chi tiết bộ ảnh
      không đủ. Link đã thu hồi thì không trả (mở ra chỉ thấy báo hết hiệu lực).
      Giải mã xong ĐỐI CHIẾU với bản băm: bản mã lệch link (lỗi ghi, khôi phục
      nhầm dòng) thì thà không hiện còn hơn hiện link của nhà khác.
    */
    let diaChiLink: string | null = null;
    if (link && !link.revoked_at && staff.permissions.includes("galleries:share")) {
      const { data: maRow } = await admin
        .from("share_link_ma")
        .select("ma_hoa")
        .eq("share_link_id", link.id)
        .maybeSingle();
      const khop = (m: string | null): m is string =>
        !!m && createHash("sha256").update(m).digest("hex") === link.token_hash;
      let ma = giaiMaMaLink(maRow?.ma_hoa);
      /*
        Link tạo TRƯỚC BB-201 chưa có bản mã. App đã tự ghi link đó sang cột
        "Link app" bên Lark (BB-132) — đọc lại một lần, đối chiếu băm, khớp thì
        mã hoá bằng khoá của CHÍNH máy chủ này rồi lưu. Không khớp / Lark lỗi
        thì thôi, lần mở sau thử lại.
      */
      if (!maRow && gallery.lark_hauky_record_id && !daThuKhoiPhuc.has(link.id)) {
        daThuKhoiPhuc.add(link.id);
        const tuLark = await docMaLinkAppTuLark(gallery.lark_hauky_record_id);
        if (khop(tuLark)) {
          ma = tuLark;
          const { error: ghiErr } = await admin
            .from("share_link_ma")
            .upsert({ share_link_id: link.id, ma_hoa: maHoaMaLink(tuLark) }, { onConflict: "share_link_id", ignoreDuplicates: true });
          if (ghiErr) console.error(JSON.stringify({ evt: "share_link_ma.khoi_phuc_failed", shareLinkId: link.id, lyDo: ghiErr.message }));
        }
      }
      if (khop(ma)) diaChiLink = diaChiDayDu(`/g/${ma}`);
    }

    // Lịch sử khách yêu cầu sửa. CSKH phải thấy khách đã đòi gì ở các vòng
    // trước, nếu không người photoshop sẽ sửa lại đúng thứ đã sửa rồi.
    const { data: revisions } = await admin
      .from("revision_requests")
      .select("round, note, reviewed_url, created_at, resolved_at")
      .eq("gallery_id", gallery.id)
      .order("round", { ascending: false });

    // BB-312 — trạng thái "khách xin mở lại" (khác hẳn `revision_requests` ở
    // trên, đó là vòng DUYỆT ẢNH ĐÃ CHỈNH). Khối nổi bật đầu trang
    // (`YeuCauMoLaiBanner`) đọc field này.
    const reopenRequest = await layTrangThaiXinMoLai(admin, gallery.id);

    // BB-321 — ảnh theo từng ĐỢT chọn (đợt 1 + các đợt mua thêm). Rỗng khi chưa
    // có đợt nào ≥ 2 hoặc chưa áp migration 0077 — khối "Đợt chọn" tự ẩn.
    const dotChon = await layChiTietDotQuanTri(admin, gallery.id);

    // BB-321 — cờ lúc chốt đợt 1: khách nhờ studio chọn thêm N ảnh / biết ảnh in sẽ chậm hơn.
    const chotDot1 = await layThongTinChotDot1(admin, gallery.id);

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
        .select("id, snapshot_extra_amount")
        .eq("gallery_id", gallery.id)
        .eq("is_primary", true)
        .maybeSingle(),
      admin.from("gallery_payments").select("amount, payment_method").eq("gallery_id", gallery.id),
    ]);

    const dueAmount = Number(primarySel?.snapshot_extra_amount ?? 0);
    // `paidAmount` = mọi khoản GHI CÓ cho khách (tiền thu + phần giảm giá) — số còn thiếu tính trên tổng này.
    const paidAmount = (payRows ?? []).reduce((t, r) => t + Number(r.amount), 0);
    // BB-320: riêng phần giảm giá (dòng `giam_gia`), để màn hình tách "đã thu" khỏi "giảm".
    const discountAmount = (payRows ?? [])
      .filter((r) => r.payment_method === HINH_THUC_GIAM_GIA)
      .reduce((t, r) => t + Number(r.amount), 0);

    // BB-294 (#2) — thẻ "Mua thêm" ở hàng số liệu đầu trang trước đây hiện
    // `dueAmount` (snapshot_extra_amount = tiền VƯỢT HẠN MỨC ảnh, không phải
    // sản phẩm mua thêm), nên khi khách chốt kèm "Mua thêm 3 món · 60.000 ₫"
    // ở màn khách (cửa hàng, bảng `selection_addons`) thì thẻ này vẫn ghi 0 ₫
    // nếu khách không vượt hạn mức ảnh. Hai con số khác nhau: `dueAmount` vẫn
    // dùng cho "Phải thu"/"Còn thiếu" ở khối Tiền phát sinh bên dưới (không
    // đổi), còn `addonsAmount` dưới đây là tổng đúng của sản phẩm mua thêm,
    // lấy trực tiếp từ `selection_addons` của lượt chọn CHÍNH — không có cột
    // snapshot riêng (xem comment bảng trong db/schema.sql), nên đọc trực
    // tiếp từ bảng là nguồn đúng duy nhất.
    const { data: addonRows } = primarySel?.id
      ? await admin
          .from("selection_addons")
          .select("quantity, unit_price")
          .eq("selection_id", primarySel.id)
      : { data: null };
    const addonsAmount = (addonRows ?? []).reduce(
      (t, r) => t + Number(r.unit_price) * Number(r.quantity),
      0,
    );

    /*
      BB-296 mục #6 — báo cáo chấm độc lập lần 3: màn chi tiết chỉ có MỘT con
      số "Mua thêm X ₫", không thấy khách chọn TẤM NÀO và mua MÓN GÌ cụ thể —
      cột trái trống hoác dưới thẻ số liệu. Thêm hai khối dữ liệu:
        - `selectedPhotos`: ảnh khách đã thả tim (mark='selected'), gộp mọi
          lượt chọn của bộ ảnh (ba mẹ + ông bà nếu có), không trùng tấm.
        - `addonPurchases`: TỪNG dòng `selection_addons` của lượt chốt CHÍNH,
          kèm tên/chất liệu/cỡ sản phẩm và tấm ảnh gắn (album không gắn tấm cụ
          thể nên `photoId` có thể null — đúng nghiệp vụ, không phải thiếu dữ
          liệu). Không đổi schema, không migration — đọc thẳng hai bảng đã có
          sẵn (`selection_items`, `selection_addons`) và join `photos`/`products`.
    */
    const { data: selectedRows } = await admin
      .from("selection_items")
      .select("photo_id, retouch_note, photos(file_name)")
      .eq("gallery_id", gallery.id)
      .eq("mark", "selected")
      .order("order_index", { ascending: true });
    const selectedPhotoMap = new Map<
      string,
      { photoId: string; fileName: string; note: string | null }
    >();
    for (const r of selectedRows ?? []) {
      const pid = r.photo_id as string;
      if (selectedPhotoMap.has(pid)) continue;
      const anh = r.photos as unknown as { file_name: string | null } | null;
      selectedPhotoMap.set(pid, {
        photoId: pid,
        fileName: anh?.file_name ?? "",
        note: (r.retouch_note as string | null) ?? null,
      });
    }
    const selectedPhotos = Array.from(selectedPhotoMap.values());

    const { data: addonPurchaseRows } = primarySel?.id
      ? await admin
          .from("selection_addons")
          .select("id, product_id, photo_id, quantity, unit_price, products(name, material, size, kind)")
          .eq("selection_id", primarySel.id)
          .order("created_at", { ascending: true })
      : { data: [] as never[] };
    const addonPurchases = (addonPurchaseRows ?? []).map((r) => {
      const p = r.products as unknown as {
        name: string | null;
        material: string | null;
        size: string | null;
        kind: string | null;
      } | null;
      return {
        id: r.id as string,
        productId: r.product_id as string,
        photoId: (r.photo_id as string | null) ?? null,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unit_price),
        totalPrice: Number(r.unit_price) * Number(r.quantity),
        productName: p?.name ?? "",
        material: p?.material ?? null,
        size: p?.size ?? null,
        kind: p?.kind ?? null,
      };
    });

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

    // BB-303 (quan-tri-chi-tiet.png) — dòng phụ "khách · SĐT · chi nhánh ·
    // ngày chụp" + tiêu đề "Loại buổi · Bé …". `package_id` có thể nằm ở
    // `galleries` hoặc chỉ ở `shoots` (buổi chụp) tuỳ luồng tạo bộ ảnh — thử
    // cột trên `galleries` trước, thiếu thì lấy từ `shoots`.
    // BB-308 (vòng 4, mục #5 báo cáo chấm 28/09/2026) — thêm `concept` vào
    // SELECT: khung xem trước bìa của trình thiết kế quản trị (BiaBoAnhEditor)
    // thiếu "Thôi nôi" vì route này chưa từng đọc cột này — chỉ thêm cột vào
    // truy vấn có sẵn, không đổi schema. Cùng nguồn `shoots.concept` mà màn
    // khách đọc qua (`GET /api/g/gallery`, prop `sessionType` của `BiaBoAnh`).
    const [{ data: customer }, { data: shoot }] = await Promise.all([
      admin.from("customers").select("full_name, phone").eq("id", gallery.customer_id).maybeSingle(),
      gallery.shoot_id
        ? admin
            .from("shoots")
            .select("shoot_date, package_id, concept")
            .eq("id", gallery.shoot_id)
            .maybeSingle()
        : Promise.resolve({
            data: null as { shoot_date: string | null; package_id: string | null; concept: string | null } | null,
          }),
    ]);
    const packageId = gallery.package_id ?? shoot?.package_id ?? null;
    const { data: goiChup } = packageId
      ? await admin.from("packages").select("name").eq("id", packageId).maybeSingle()
      : { data: null };

    return ok({
      galleryId: gallery.id,
      photoCount: gallery.photo_count,
      // BB-290 lượt 2: hàng 4 số liệu ở đầu trang chi tiết cần "Chốt lúc"
      // (quan-tri-chi-tiet.png) — cột đã có sẵn trên `galleries`, chỉ thêm
      // vào SELECT/response, không đổi schema.
      submittedAt: gallery.submitted_at ?? null,
      dueAmount,
      addonsAmount,
      paidAmount,
      discountAmount,
      outstanding: dueAmount - paidAmount,
      revisions: revisions ?? [],
      // BB-312 — xem chú thích ở phần truy vấn phía trên.
      reopenRequest,
      // BB-321 — xem chú thích ở phần truy vấn phía trên.
      dotChon,
      chotDot1,
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
      // BB-311 — nút "Đã giao ảnh" chỉ hiện khi nhân viên có quyền
      // `deliveries:write` (xem src/app/api/admin/galleries/[id]/delivered/route.ts).
      canMarkDelivered: staff.permissions.includes("deliveries:write"),
      // BB-313 mục 2 — "Quyền: vai có quyền sửa bộ ảnh". Route PATCH/POST/
      // DELETE của tệp này đã chặn bằng `requirePermission(staff,
      // "galleries:write")` (xem `loadEditableGallery`) — cờ này chỉ để MÀN
      // HÌNH ẩn nút sửa/xoá/thêm cho đúng vai, không phải ranh giới an ninh.
      canEditItems: staff.permissions.includes("galleries:write"),
      // BB-215: dữ liệu cho khối "Bìa bộ ảnh".
      coverPhotoId: gallery.cover_photo_id ?? null,
      coverHeadline: gallery.cover_headline ?? null,
      welcomeMessage: gallery.welcome_message ?? null,
      coverLayout: gallery.cover_layout ?? null,
      // BB-313 (ảnh chụp app thật, Đợt 9) — gửi nickname/họ tên đầy đủ RIÊNG,
      // để chỗ gọi tự chọn `tinhTenBiaTuDuLieu`/`tinhTieuDeBoAnhQuanTri` đúng
      // luật (nickname → tenGoiBe, mất nickname → HỌ TÊN NGUYÊN VẸN, không
      // thêm "Bé "). Gửi sẵn một chuỗi COALESCE (`nickname || full_name`,
      // cách cũ) buộc chỗ gọi phải áp `tenGoiBe` MÙ QUÁNG lên cả hai trường
      // hợp — đúng lỗi đã sửa ở mục 1 (họ tên đầy đủ bị ăn nhầm "Bé ").
      babyNickname: baby?.nickname ?? null,
      babyFullName: baby?.full_name ?? null,
      branchName: branch?.name ?? null,
      // BB-303 — xem chú thích ở phần truy vấn phía trên.
      packageName: goiChup?.name ?? null,
      customerName: customer?.full_name ?? null,
      customerPhone: customer?.phone ?? null,
      shootDate: shoot?.shoot_date ?? null,
      // BB-308 (vòng 4, mục #5) — "loại buổi chụp" ("Thôi nôi", "Newborn"…),
      // CÙNG TÊN PROP `sessionType` mà `BiaBoAnh` (component dùng chung với
      // màn khách) đã nhận sẵn. KHÁC `packageName` ở trên (tên GÓI/sản phẩm
      // chụp, vd "Gói Newborn Premium") — hai khái niệm khác nhau dù nghe
      // tương tự, đừng gộp lại.
      sessionType: shoot?.concept ?? null,
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
            // null = chưa có bản mã (link tạo trước BB-201) hoặc không có quyền.
            diaChi: diaChiLink,
            // BB-320: phân biệt "link cũ không khôi phục được" với "người xem không có quyền gửi link".
            coQuyenGuiLink: staff.permissions.includes("galleries:share"),
          }
        : null,
      items: summary.items,
      // BB-202 — khối "Bìa album" ở màn chi tiết.
      albumCovers,
      // BB-296 mục #6 — xem chú thích ở phần truy vấn phía trên.
      selectedPhotos,
      addonPurchases,
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
 * BB-320 (chủ dự án, 29/09/2026) ĐỔI LUẬT: CSKH thêm/sửa/xoá dòng hàng được ở
 * MỌI trạng thái, chỉ trừ "lưu trữ" (archived). Ca thật: khách chọn vượt hạn mức
 * rồi chốt, CSKH muốn tăng Edit file 15 → 17 — luật cũ chặn đúng lúc cần sửa nhất.
 *
 * Điều KHÔNG đổi: `selections.snapshot_extra_amount` — con số khách đã nhìn thấy
 * lúc bấm chốt (BB-114) — vẫn đứng nguyên, vì khách trả theo số đó (xem chú thích
 * ở payments/route.ts). Sửa dòng hàng chỉ đổi hạn mức HIỆN TẠI; màn quản trị hiện
 * cả hai số cạnh nhau. Mỗi lần sửa vẫn ghi nhật ký kèm hạn mức trước/sau.
 *
 * (Luật của phía KHÁCH — patch_selection_batch, /api/g/* — không đổi: khách chốt
 * xong vẫn không tự sửa được lựa chọn của mình.)
 */

const KHOA_SUA_DONG_HANG = ["archived"];

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

  if (KHOA_SUA_DONG_HANG.includes(gallery.status)) {
    return {
      error: fail(
        "GALLERY_LOCKED",
        "Bộ ảnh đã lưu trữ. Không sửa được dòng hàng nữa.",
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

    // BB-313 mục 2 — dòng hàng ĐANG mang `lark_contract_code` là dòng
    // `scripts/sync-lark-contracts.mjs` còn quản lý: lần đồng bộ Lark SAU sẽ
    // `delete from gallery_items where gallery_id = $1 and lark_contract_code
    // = $2` rồi ghi lại nguyên số lượng theo Lark — XOÁ MẤT số nhân viên vừa
    // sửa tay mà không báo gì (đọc kỹ script trước khi sửa mục này, đúng yêu
    // cầu brief BB-313).
    //
    // Thiết kế: "detach" dòng vừa sửa khỏi hợp đồng — NULL `lark_contract_code`
    // (cột SẴN CÓ, không cần migration) để câu DELETE của lần đồng bộ sau
    // không còn khớp dòng này nữa; GIỮ NGUYÊN `lark_record_id` (cũng cột sẵn
    // có, có ràng buộc UNIQUE) làm "dấu vết" — sync script (đã sửa cùng lúc,
    // xem writeGallery()) kiểm tra dòng nào ĐÃ TỒN TẠI theo `lark_record_id`
    // trước khi ghi lại, thấy trùng thì BỎ QUA dòng đó thay vì chèn thêm —
    // vừa tránh vỡ ràng buộc UNIQUE, vừa tránh đếm lặp hạn mức (một dòng thật
    // thay vì hai dòng cộng dồn).
    //
    // Giới hạn đã biết (ghi vào bàn giao): cách này bảo vệ được SỬA SỐ LƯỢNG
    // vĩnh viễn. XOÁ HẲN một dòng còn `lark_contract_code` (route DELETE bên
    // dưới) thì KHÔNG có cơ chế tương đương — dòng biến mất khỏi bảng nên
    // `lark_record_id` cũng biến mất theo, và lần đồng bộ Lark sau sẽ tạo lại
    // đúng dòng đó từ đầu (Lark vẫn "nói" dòng này tồn tại). Muốn xoá vĩnh
    // viễn một dòng hợp đồng thật thì phải sửa trên Lark, không phải trong
    // app này — không xây thêm bảng "đã xoá tay" (tombstone) trong đợt này vì
    // cần một migration mới, mà brief cấm áp migration lên bb-dev.
    const { data: dongHienTai, error: loiDoc } = await admin
      .from("gallery_items")
      .select("quantity, lark_contract_code, parent_item_id")
      .eq("id", body.itemId)
      .eq("gallery_id", galleryId)
      .maybeSingle();
    if (loiDoc) throw loiDoc;
    if (!dongHienTai) return fail("NOT_FOUND", "Không tìm thấy dòng hàng này");

    const quantityBefore = Number(dongHienTai.quantity);
    const tachKhoiLark = dongHienTai.lark_contract_code !== null;

    // Ràng buộc gallery_id trong câu update, không chỉ ràng id: thiếu nó thì
    // một mã dòng hàng của bộ ảnh KHÁC vẫn sửa được, và kiểm quyền chi nhánh ở
    // trên chẳng bảo vệ được gì.
    const { error } = await admin
      .from("gallery_items")
      .update(tachKhoiLark ? { quantity, lark_contract_code: null } : { quantity })
      .eq("id", body.itemId)
      .eq("gallery_id", galleryId);

    if (error) throw error;

    // BB-313 mục 2 — dòng vừa sửa là THÀNH PHẦN (có `parent_item_id`, ví dụ
    // "Edit file" nằm trong gói) thì phải tách LUÔN dòng CHA khỏi Lark, không
    // chỉ dòng này. `parent_item_id references gallery_items(id) on delete
    // cascade` (db/schema.sql) — nếu chỉ tách dòng con, dòng cha vẫn mang
    // `lark_contract_code` cũ, lần đồng bộ Lark sau XOÁ đúng dòng cha đó (vẫn
    // khớp câu `delete ... where lark_contract_code = $2`), và Postgres CASCADE
    // xoá theo mọi con của nó — kể cả con vừa được tách, dù bản thân nó không
    // còn `lark_contract_code`. Tách luôn dòng cha chặn cascade này. Các con
    // KHÁC (chưa ai sửa) của cùng dòng cha vẫn còn `lark_contract_code`, vẫn
    // được xoá/ghi lại đúng số Lark như cũ — chỉ dòng cha (giá/tên) và dòng
    // con vừa sửa là ngừng nhận cập nhật từ Lark từ nay (đã ghi ở bàn giao).
    if (tachKhoiLark && dongHienTai.parent_item_id) {
      const { error: loiTachCha } = await admin
        .from("gallery_items")
        .update({ lark_contract_code: null })
        .eq("id", dongHienTai.parent_item_id)
        .eq("gallery_id", galleryId);
      if (loiTachCha) throw loiTachCha;
    }

    const quotaAfter = await quotaOf(admin, galleryId);
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: gallery.branch_id,
      action: "gallery.item_changed",
      entityType: "gallery",
      entityId: galleryId,
      galleryId,
      // "từ bao nhiêu thành bao nhiêu" (BB-313 mục 2) — `quantityBefore`/
      // `quantity` là số lượng CỦA DÒNG NÀY; `quotaBefore`/`quotaAfter` là
      // hạn mức TOÀN BỘ ẢNH của cả bộ (có thể khác dòng vì bộ có nhiều dòng
      // edited_photo) — giữ cả hai, đừng nhầm lẫn.
      metadata: { itemId: body.itemId, quantityBefore, quantity, quotaBefore, quotaAfter, tachKhoiLark },
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

    // BB-313 mục 2 — đọc trước khi xoá để nhật ký nói được "từ bao nhiêu"
    // (không chỉ hạn mức toàn bộ mà cả số lượng CỦA DÒNG bị xoá), và để báo
    // cho CSKH biết dòng này có mang `lark_contract_code` không: xoá xong,
    // dòng biến mất nên KHÔNG còn cách nào chặn lần đồng bộ Lark sau tạo lại
    // đúng dòng đó (xem chú thích dài ở PATCH phía trên — cùng giới hạn, xoá
    // vĩnh viễn một dòng hợp đồng thật phải sửa trên Lark).
    const { data: dongHienTai } = await admin
      .from("gallery_items")
      .select("quantity, lark_contract_code")
      .eq("id", itemId)
      .eq("gallery_id", galleryId)
      .maybeSingle();
    const tuLark = dongHienTai?.lark_contract_code != null;

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
      metadata: {
        itemId,
        quantityBefore: dongHienTai ? Number(dongHienTai.quantity) : null,
        quotaBefore,
        quotaAfter,
        tuLark,
      },
    });

    // `tuLark`: CSKH cần biết dòng vừa xoá có thể quay lại sau lần đồng bộ
    // Lark kế tiếp (xem chú thích ở trên) — màn hình hiện cảnh báo đúng lúc,
    // không phải đoán.
    return ok({ quotaBefore, quotaAfter, tuLark });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền sửa dòng hàng");
    return failUnexpected(err, requestId);
  }
}
