import { isSubmittedOrLater, GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { nhomSanPham, canGanAnh } from "@/lib/products/nhom-san-pham";
import { locHangInTrongGoi } from "@/lib/products/hang-in-trong-goi";
import { nhanHienThi } from "@/lib/lark/trang-thai-hau-ky";

export async function GET(request: Request) {
  try {
    const session = await requireGallerySession();

    // -------------------------------------------------------------------
    // BB-187 — MÃ TRÊN THANH ĐỊA CHỈ LÀ NGUỒN ĐÚNG, KHÔNG PHẢI PHIÊN
    // -------------------------------------------------------------------
    // Trước bản vá này, màn khách gọi đường này BẰNG COOKIE rồi chỉ đăng nhập
    // lại bằng mã trên địa chỉ khi bị 401, 410 hay 403. Phiên cũ CÒN SỐNG thì trả
    // 200, và app hiện bộ ảnh của phiên đó — **bỏ qua hoàn toàn mã trên địa chỉ**.
    //
    // Hậu quả chủ studio gặp ngày 18/09: mở link của bộ HD_20260908#5055 (210
    // ảnh, Pasteur) nhưng màn hiện bộ của nhà khác (261 ảnh, Thảo Điền) — vì
    // trình duyệt đang giữ phiên còn hạn của bộ kia. Đo lại trong cơ sở dữ liệu:
    // mã link HOÀN TOÀN ĐÚNG. Lỗi nằm ở đây, không nằm ở đường tạo link.
    //
    // BB-157 đã vá ca phiên HỎNG. Đây là ca phiên CÒN SỐNG nhưng CỦA BỘ KHÁC —
    // nặng hơn hẳn, vì nó cho một nhà nhìn thấy ảnh con nhà khác.
    //
    // Cách vá: màn khách gửi kèm mã trên địa chỉ. Máy chủ băm nó ra rồi so với
    // link của phiên. Lệch thì **từ chối**, để màn khách đăng nhập lại bằng đúng mã
    // ba mẹ vừa bấm. Không gửi mã thì bỏ qua phần so — các đường gọi khác
    // (đổi tim, tải ảnh…) vẫn chạy như cũ.
    const maTrenDiaChi = new URL(request.url).searchParams.get("token");
    if (maTrenDiaChi) {
      const admin0 = await createAdminClient();
      const { data: linkTheoMa } = await admin0
        .from("share_links")
        .select("id")
        .eq("token_hash", await bamMaLink(maTrenDiaChi))
        .maybeSingle();

      if (!linkTheoMa || linkTheoMa.id !== session.shareLinkId) {
        return fail(
          "SESSION_MISMATCH",
          "Phiên đang mở thuộc về một link khác",
        );
      }
    }

    // Phiên của link gắn theo khách, chưa chọn buổi chụp nào (BB-130).
    //
    // Không có bộ ảnh để trả, và nếu cứ chạy tiếp thì `.eq("id", "")` ném lỗi
    // uuid từ Postgres — tức là màn hình khách nhận "có lỗi xảy ra" đúng vào
    // lúc đáng lẽ phải mời họ chọn buổi chụp.
    //
    // `canChonBuoiChup` là dấu hiệu để màn hình rẽ sang danh sách buổi chụp
    // mà không phải đoán qua câu chữ của thông báo lỗi.
    if (!session.galleryId) {
      return fail("NOT_FOUND", "Ba mẹ chọn giúp buổi chụp muốn xem", {
        canChonBuoiChup: true,
      });
    }

    const supabase = await createAdminClient();

    const { data: gallery, error: galleryError } = await supabase
      .from("galleries")
      .select(`
        id, title, welcome_message, status, baby_id, customer_id, shoot_date:shoots(shoot_date),
        branch:branches(name, address, hotline, zalo_oa),
        photo_count, included_quota, extra_photo_price, max_selection, allow_extra, due_at,
        cover_photo_id, cover_headline, cover_layout, download_enabled, notes_enabled, invite_enabled,
        lark_trang_thai
      `)
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    const { data: baby } = gallery.baby_id ? await supabase
      .from("babies")
      .select("full_name, nickname")
      .eq("id", gallery.baby_id)
      .single() : { data: null };

    // BB-212 — tên khách hàng để ĐIỀN SẴN ô "người xác nhận" trong hộp chốt.
    //
    // Chủ studio 22/09/2026: "tên người xác nhận là tên khách hàng trong bộ".
    // Trước đây ô này luôn trống, ba mẹ phải tự gõ lại đúng cái tên đã ký hợp
    // đồng — một việc thừa mà máy đã biết sẵn.
    //
    // `customer_id` là NOT NULL trên `galleries` nên về lý thuyết dòng khách
    // luôn có; vẫn tách truy vấn riêng và trả `null` khi không thấy, để một
    // dòng dữ liệu thiếu không làm sập cả màn hình chọn ảnh.
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name")
      .eq("id", gallery.customer_id)
      .maybeSingle();

    const { data: chatSetting } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "chat.page_url")
      .is("branch_id", null)
      .maybeSingle();

    let chatUrl = null;
    if (chatSetting?.value && typeof chatSetting.value === "string" && chatSetting.value.startsWith("https://")) {
      chatUrl = chatSetting.value;
    }

    // Get subfolders for the gallery
    const { data: subfoldersData } = await supabase
      .from("photos")
      .select("subfolder")
      .eq("gallery_id", session.galleryId)
      .neq("status", "hidden")
      .not("subfolder", "is", null);

    const subfolders = Array.from(new Set(subfoldersData?.map(s => s.subfolder as string) || []));

    // Get selection summary
    const { data: selection } = await supabase
      .from("selections")
      .select("id, snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount, general_note, submitted_at")
      .eq("id", session.selectionId)
      .single();

    // Since we don't have counts in 'selections' directly unless submitted,
    // wait, we need current counts. Let's get current counts from selection_items.
    const { count: selectedCount } = await supabase
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "selected");

    const { count: favoriteCount } = await supabase
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "favorite");

    // Lấy thành phần hợp đồng và hạn mức từ app.gallery_quota
    const contractSummary = await getGalleryContractSummary(session.galleryId, supabase);
    const { quotaKnown, includedQuota } = contractSummary;

    const selected = selectedCount || 0;
    const favorite = favoriteCount || 0;
    const extraCount = quotaKnown && includedQuota !== null
      ? Math.max(0, selected - includedQuota)
      : 0;
    const extraAmount = extraCount * gallery.extra_photo_price;

    /*
      BB-202 — "Bìa album": mỗi album TRONG GÓI (`nhomSanPham === 'album'`)
      hiện đang có bìa nào (nếu có), để màn khách vẽ khối "Chọn ảnh bìa album".

      Bảng `album_covers` có thể CHƯA TỒN TẠI (migration 0075 chưa áp) — bắt
      lỗi "bảng không tồn tại" (42P01) và trả danh sách rỗng thay vì làm sập cả
      màn hình khách vì một tính năng chưa triển khai.
    */
    const albumRowsTrongGoi = locHangInTrongGoi(contractSummary.items).filter(
      (h) => h.nhom === "album",
    );
    let albumBia: Array<{
      galleryItemId: string;
      name: string;
      coverPhotoId: string | null;
      coverFileName: string | null;
    }> = albumRowsTrongGoi.map((a) => ({
      galleryItemId: a.galleryItemId,
      name: a.name,
      coverPhotoId: null,
      coverFileName: null,
    }));

    if (albumRowsTrongGoi.length > 0) {
      const { data: covers, error: coversErr } = await supabase
        .from("album_covers")
        .select("gallery_item_id, selection_item_id")
        .in(
          "gallery_item_id",
          albumRowsTrongGoi.map((a) => a.galleryItemId),
        );

      if (!coversErr && covers && covers.length > 0) {
        const selItemIds = covers.map((c) => c.selection_item_id);
        const { data: sis } = await supabase
          .from("selection_items")
          .select("id, photo_id")
          .in("id", selItemIds);
        const photoIdBySelItem = new Map((sis ?? []).map((s) => [s.id, s.photo_id as string]));

        const photoIds = Array.from(new Set(Array.from(photoIdBySelItem.values())));
        const { data: anhs } = photoIds.length
          ? await supabase.from("photos").select("id, file_name").in("id", photoIds)
          : { data: [] as { id: string; file_name: string }[] };
        const fileNameByPhoto = new Map((anhs ?? []).map((a) => [a.id, a.file_name as string]));

        const coverByGalleryItem = new Map(covers.map((c) => [c.gallery_item_id, c.selection_item_id]));
        albumBia = albumRowsTrongGoi.map((a) => {
          const selItemId = coverByGalleryItem.get(a.galleryItemId) ?? null;
          const photoId = selItemId ? photoIdBySelItem.get(selItemId) ?? null : null;
          const fileName = photoId ? fileNameByPhoto.get(photoId) ?? null : null;
          return { galleryItemId: a.galleryItemId, name: a.name, coverPhotoId: photoId, coverFileName: fileName };
        });
      }
      // `coversErr` (kể cả 42P01 bảng chưa có) thì giữ nguyên danh sách chưa
      // có bìa đã dựng sẵn ở trên — màn khách vẫn thấy tên album, chỉ chưa
      // biết bìa đang là tấm nào.
    }

    // Lấy danh sách sản phẩm mua thêm (addons) của phiên chọn ảnh
    const { data: rawAddons } = await supabase
      .from("selection_addons")
      .select(`
        id,
        selection_id,
        product_id,
        photo_id,
        quantity,
        unit_price,
        created_at,
        product:products (
          name,
          kind,
          material,
          size
        )
      `)
      .eq("selection_id", session.selectionId)
      .order("created_at", { ascending: true });

    const addonsList = (rawAddons || []).map((row) => {
      const prod = Array.isArray(row.product) ? row.product[0] : row.product;
      const unitPrice = Number(row.unit_price);
      return {
        id: row.id,
        productId: row.product_id,
        name: prod?.name || "Sản phẩm mua thêm",
        kind: prod?.kind || "addon",
        material: prod?.material || null,
        size: prod?.size || null,
        quantity: row.quantity,
        unitPrice,
        totalPrice: unitPrice * row.quantity,
        // Tấm ảnh sản phẩm này in ra — màn khách hiện ngay cạnh dòng hàng, để
        // ba mẹ thấy mình đặt in ĐÚNG tấm nào.
        photoId: (row as { photo_id?: string | null }).photo_id ?? null,
        createdAt: row.created_at,
      };
    });

    const totalAddonsAmount = addonsList.reduce((sum, a) => sum + a.totalPrice, 0);

    /**
     * DANH MỤC sản phẩm ba mẹ có thể mua thêm.
     *
     * Trước 22/09/2026 màn khách dựng `AddonSelector` từ chính những dòng ĐÃ
     * MUA. Chưa mua gì thì danh sách rỗng, mà danh sách rỗng thì component tự
     * ẩn — nên không bao giờ có cái gì để bấm mua. Vòng tròn khép kín, và
     * `selection_addons` trên bb-dev đúng **0 dòng** từ đầu tới nay.
     *
     * Lọc theo đúng ba luật tiền của BB-105 (`/api/g/addons` kiểm lại lần nữa
     * khi ghi): có giá niêm yết, độ tin cậy >= 0.8, và ít nhất 5 lần bán làm
     * mẫu. Sản phẩm chưa đủ tin cậy thì KHÔNG bày ra — thà để CSKH báo giá còn
     * hơn hiện một con số rồi phải cải chính.
     *
     * Không bày `shoot_package`: đó là một buổi chụp mới, không phải thứ mua
     * thêm trong lúc đang chọn ảnh. Bán buổi chụp qua nút "+" trên màn ảnh là
     * đường dẫn tới hiểu nhầm đắt tiền.
     */
    const { data: rawCatalogue } = await supabase
      .from("products")
      .select("id, name, kind, material, size, list_price")
      .eq("is_active", true)
      .in("kind", ["print", "addon", "edited_photo"])
      .not("list_price", "is", null)
      .gte("price_confidence", 0.8)
      .gte("price_samples", 5)
      .order("list_price", { ascending: true });

    /*
      Gắn NHÓM cho từng sản phẩm để màn khách bày theo ba nhóm chủ studio gọi
      tên: ảnh in/ảnh phóng, album, khung. Trong mỗi nhóm phân theo chất liệu
      và kích thước — hai trường đó bảng `products` đã mang sẵn từ Lark.

      Sản phẩm không thuộc nhóm nào (dịch vụ kèm buổi chụp: bánh sinh nhật,
      hoa, trái cây) bị loại khỏi danh mục: lúc ba mẹ ngồi chọn ảnh thì buổi
      chụp đã xong từ lâu, bày bánh sinh nhật ở đó là bán nhầm lúc.
    */
    /*
      Dải quảng cáo của studio, hiện ở khoảng trống bên tấm ảnh đang xem.

      Đọc từ `settings` chứ không chôn trong mã: nội dung quảng cáo đổi theo
      mùa (khuyến mãi Tết, gói chụp mới), và mỗi lần đổi mà phải sửa mã là mỗi
      lần chờ một lượt phát hành.

      Không có ảnh thì trả `null` — màn khách không dựng ô trống.
    */
    const { data: rawBanner } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["gallery.banner_image_url", "gallery.banner_link_url"])
      .is("branch_id", null);

    const layCaiDat = (k: string) => {
      const v = (rawBanner ?? []).find((r) => r.key === k)?.value;
      return typeof v === "string" && v.startsWith("https://") ? v : null;
    };
    const bannerAnh = layCaiDat("gallery.banner_image_url");
    const banner = bannerAnh
      ? { imageUrl: bannerAnh, linkUrl: layCaiDat("gallery.banner_link_url") }
      : null;

    const catalogue = (rawCatalogue ?? [])
      .map((p) => ({
        productId: p.id,
        name: p.name,
        kind: p.kind,
        material: p.material,
        size: p.size,
        unitPrice: Number(p.list_price),
        nhom: nhomSanPham(p.kind, p.material),
        canGanAnh: canGanAnh(nhomSanPham(p.kind, p.material)),
      }))
      .filter((p) => p.nhom !== null);

    // Lấy danh sách ảnh đã đặt vào sản phẩm in (selection_placements)
    const { data: userSelectionItems } = await supabase
      .from("selection_items")
      .select("id, photo_id")
      .eq("selection_id", session.selectionId);

    const selectionItemIds = (userSelectionItems || []).map((si) => si.id);
    const photoMap = new Map((userSelectionItems || []).map((si) => [si.id, si.photo_id]));

    let placementsList: { selectionItemId: string; photoId: string; galleryItemId: string }[] = [];
    let albumPlacements: { addonId: string; photoId: string }[] = [];
    if (selectionItemIds.length > 0) {
      const { data: rawPlacements } = await supabase
        .from("selection_placements")
        .select("selection_item_id, gallery_item_id")
        .in("selection_item_id", selectionItemIds);

      placementsList = (rawPlacements || []).map((p) => ({
        selectionItemId: p.selection_item_id,
        photoId: photoMap.get(p.selection_item_id) || "",
        galleryItemId: p.gallery_item_id,
      }));

      // Ảnh đã đưa vào album MUA THÊM (migration 0062). Bảng riêng vì album
      // mua thêm nằm ở `selection_addons`, không phải ở dòng hợp đồng.
      const { data: rawAlbum } = await supabase
        .from("selection_addon_photos")
        .select("addon_id, selection_item_id")
        .in("selection_item_id", selectionItemIds);

      albumPlacements = (rawAlbum || []).map((p) => ({
        addonId: p.addon_id,
        photoId: photoMap.get(p.selection_item_id) || "",
      }));
    }

    // Vòng duyệt ảnh đã chỉnh (BB-121). Khách cần THẤY link bản đã chỉnh, nếu
    // không thì nút "duyệt" bắt họ đồng ý với thứ chưa xem. Chỉ đọc khi bộ ảnh
    // đã qua bước chỉnh — trước đó chưa có gì để xem.
    let review: {
      finalDriveUrl: string | null;
      rounds: Array<{ round: number; note: string; createdAt: string; resolved: boolean }>;
    } | null = null;

    if (["in_retouch", "awaiting_approval", "approved", "delivered"].includes(gallery.status)) {
      const [{ data: delivery }, { data: rounds }] = await Promise.all([
        supabase
          .from("deliveries")
          .select("final_drive_url")
          .eq("gallery_id", gallery.id)
          .maybeSingle(),
        supabase
          .from("revision_requests")
          .select("round, note, created_at, resolved_at")
          .eq("gallery_id", gallery.id)
          .order("round", { ascending: true }),
      ]);

      review = {
        finalDriveUrl: delivery?.final_drive_url ?? null,
        rounds: (rounds ?? []).map((r) => ({
          round: r.round as number,
          note: r.note as string,
          createdAt: r.created_at as string,
          resolved: r.resolved_at !== null,
        })),
      };
    }

    const submittedOrLater = isSubmittedOrLater(gallery.status);
    const hasSnapshot = submittedOrLater && selection?.snapshot_selected_count !== null && selection?.snapshot_selected_count !== undefined;

    const finalIncludedQuota = hasSnapshot ? gallery.included_quota : includedQuota;
    const finalQuotaKnown = hasSnapshot ? true : quotaKnown;
    const finalSelectedCount = hasSnapshot ? (selection?.snapshot_selected_count ?? 0) : selected;
    const finalExtraCount = hasSnapshot ? (selection?.snapshot_extra_count ?? 0) : extraCount;
    const finalExtraAmount = hasSnapshot ? (selection?.snapshot_extra_amount ?? 0) : extraAmount;

    // BB-156: tổng dung lượng ảnh của bộ này. Cộng ở máy chủ vì màn khách chỉ
    // tải về từng trang ảnh một — cộng ở trình duyệt là ra số của trang đang
    // xem, không phải của cả bộ.
    const { data: dungLuong } = await supabase
      .from("photos")
      .select("size_bytes")
      .eq("gallery_id", session.galleryId)
      .eq("status", "active");
    const tongDungLuong = (dungLuong ?? []).reduce(
      (t: number, r: { size_bytes: number | null }) => t + Number(r.size_bytes ?? 0),
      0,
    );

    const tienDo = nhanHienThi(
      gallery.status,
      gallery.lark_trang_thai,
      (s) => GALLERY_STATUS_LABEL[s] ?? s,
    );
    const responseData = {
      id: gallery.id,
      title: gallery.title,
      welcomeMessage: gallery.welcome_message,
      status: gallery.status,
      // BB-200 (3/3) — chuỗi tiến độ tính từ trạng thái app + mã Lark
      // (docs/21 "Luồng hiển thị"). KHÔNG trả mã Lark hay mức cảnh báo cho
      // khách — đó là chuyện nội bộ studio, không phải thứ ba mẹ cần thấy.
      // `null` = giữ nguyên chữ cũ theo `status` (xem review-panel.tsx).
      nhanTienDo: tienDo.khach,
      // BB-225 — số giai đoạn (2–11, docs/21) để màn khách chọn tranh "hành
      // trình bộ ảnh". Chỉ là con số giai đoạn, không phải mã Lark.
      giaiDoanTienDo: tienDo.giaiDoan,
      babyName: baby?.nickname || baby?.full_name || null,
      // BB-212 — xem ghi chú ở chỗ truy vấn `customer` phía trên.
      customerName: customer?.full_name || null,
      shootDate: (gallery.shoot_date as unknown as { shoot_date: string }[])?.[0]?.shoot_date || (gallery.shoot_date as unknown as { shoot_date: string })?.shoot_date || null,
      branch: {
        name: (gallery.branch as unknown as { name: string }[])?.[0]?.name || (gallery.branch as unknown as { name: string })?.name,
        address:
          (gallery.branch as unknown as { address: string | null }[])?.[0]?.address ??
          (gallery.branch as unknown as { address: string | null })?.address ??
          null,
        hotline: (gallery.branch as unknown as { hotline: string }[])?.[0]?.hotline || (gallery.branch as unknown as { hotline: string })?.hotline,
        zaloOa: (gallery.branch as unknown as { zalo_oa: string }[])?.[0]?.zalo_oa || (gallery.branch as unknown as { zalo_oa: string })?.zalo_oa,
        chatUrl
      },
      photoCount: gallery.photo_count,
      // BB-156: tổng dung lượng ảnh, để màn khách nói trước "bộ này nặng 6,7 GB"
      // chứ đừng để ba mẹ bấm tải rồi mới biết máy không đủ chỗ.
      tongDungLuongAnh: tongDungLuong,
      quotaKnown: finalQuotaKnown,
      includedQuota: finalIncludedQuota,
      extraPhotoPrice: gallery.extra_photo_price,
      maxSelection: gallery.max_selection,
      allowExtra: gallery.allow_extra,
      dueAt: gallery.due_at,
      options: {
        download: gallery.download_enabled,
        notes: gallery.notes_enabled,
        invite: gallery.invite_enabled
      },
      subfolders,
      coverPhotoId: gallery.cover_photo_id,
      // BB-215: tiêu đề bìa CSKH tự viết. `null` thì màn khách tự suy ra (tên
      // bé, rồi mới tới câu mặc định) — xem bia-bo-anh.tsx.
      coverHeadline: gallery.cover_headline,
      coverLayout: gallery.cover_layout,
      myRole: session.role,
      selection: {
        id: session.selectionId,
        selectedCount: finalSelectedCount,
        favoriteCount: favorite,
        extraCount: finalExtraCount,
        extraAmount: finalExtraAmount,
        addonsAmount: totalAddonsAmount,
        generalNote: selection?.general_note || null,
        submittedAt: selection?.submitted_at || null
      },
      contract: {
        totalValue: contractSummary.totalValue,
        items: contractSummary.items,
      },
      banner,
      addons: {
        totalAmount: totalAddonsAmount,
        /** Những dòng ba mẹ ĐÃ đặt mua. */
        items: addonsList,
        /** Những thứ ba mẹ CÓ THỂ đặt mua. */
        catalogue,
      },
      placements: placementsList,
      /** Ảnh nào nằm trong album mua thêm nào. */
      albumPlacements,
      /** BB-202 — bìa của mỗi album TRONG GÓI (rỗng = gói không có album nào). */
      albumBia,
      review,
    };

    return ok(responseData);
  } catch (error) {
    if (error instanceof GallerySessionError) {
      return fail(error.code);
    }
    console.error("[GET /api/g/gallery]", error);
    return fail("INTERNAL");
  }
}
