/**
 * POST /api/g/submit — Khách bấm CHỐT album ảnh.
 *
 * OWNER: DEV-BE. Task BB-114.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §4, docs/04-api-spec.md §3.7
 *
 * Năm luật:
 * 1. Chốt xong là KHOÁ (lần hai ném GALLERY_LOCKED).
 * 2. CHỈ CSKH mới chuyển được giai đoạn tiếp theo (khách không thể tự chuyển sang in_retouch).
 * 3. Lúc chốt phải CHỤP LẠI con số: số ảnh đã chọn, hạn mức, số thừa, tiền thừa ghi vào album và selection.
 * 4. Hạn mức chưa biết (app.gallery_quota trả null) thì KHÔNG cho chốt (trả QUOTA_UNKNOWN).
 * 5. BB-202 — gói CÓ album mà album nào CHƯA CÓ BÌA (hoặc bìa đã mất hiệu lực
 *    vì ba mẹ bỏ tim tấm đang làm bìa) thì KHÔNG cho chốt.
 */

import { vi } from "@/i18n";
import { isGalleryLocked } from "@/lib/gallery-status";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitSelectionSchema } from "./schema";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { getGalleryContractSummary } from "@/lib/selection/contract";
import { locHangInTrongGoi } from "@/lib/products/hang-in-trong-goi";
import { kiemTraNhoStudioChon, kiemTraSanPhamInChuaAnh } from "@/lib/gallery/dot-chon";
import { demSanPhamInChuaGanAnh, laLoiThieuCot } from "@/lib/gallery/dot-chon-server";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { daMuaCuaBo, docCaiDatLamNhanh, ghiMuaLamNhanh, timSanPhamLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh-server";
import { laSanPhamLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh";

export const runtime = "nodejs";

/**
 * BB-202, luật 5 — kiểm mọi album TRONG GÓI của bộ ảnh này đã có bìa HỢP LỆ
 * chưa. "Hợp lệ" nghĩa là: có dòng trong `album_covers`, VÀ ảnh nó trỏ tới vẫn
 * đang `mark = 'selected'` (còn được thả tim) của ĐÚNG lượt chọn đang chốt.
 *
 * Trả về tên các album còn thiếu/hỏng bìa — rỗng nghĩa là mọi album đều ổn (kể
 * cả khi gói không có album nào, `albumRows` rỗng thì vòng lặp không chạy).
 *
 * Bảng `album_covers` có thể CHƯA TỒN TẠI trên môi trường chưa áp migration
 * 0075 (Opus chưa áp). Gặp lỗi "bảng không tồn tại" (Postgres 42P01) thì KHÔNG
 * chặn chốt — một tính năng chưa triển khai không được phép khoá luôn nút Chốt
 * của mọi khách hàng khác.
 */
async function timAlbumThieuBia(
  admin: ReturnType<typeof createAdminClient>,
  galleryId: string,
  selectionId: string,
): Promise<{ tenConThieu: string[]; galleryItemIdConThieu: string[] }> {
  const contractSummary = await getGalleryContractSummary(galleryId, admin);
  const albumRows = locHangInTrongGoi(contractSummary.items).filter((h) => h.nhom === "album");

  if (albumRows.length === 0) return { tenConThieu: [], galleryItemIdConThieu: [] };

  const { data: covers, error: coversError } = await admin
    .from("album_covers")
    .select("gallery_item_id, selection_item_id")
    .in(
      "gallery_item_id",
      albumRows.map((a) => a.galleryItemId),
    );

  if (coversError) {
    // Xem chú thích ở đầu hàm: bảng chưa có (0075 chưa áp) không được chặn.
    if ((coversError as { code?: string }).code === "42P01") {
      return { tenConThieu: [], galleryItemIdConThieu: [] };
    }
    throw coversError;
  }

  const coverByItem = new Map((covers ?? []).map((c) => [c.gallery_item_id, c.selection_item_id]));

  const selectionItemIds = Array.from(new Set((covers ?? []).map((c) => c.selection_item_id)));
  const { data: selItems } = selectionItemIds.length
    ? await admin
        .from("selection_items")
        .select("id, mark, selection_id")
        .in("id", selectionItemIds)
    : { data: [] as { id: string; mark: string; selection_id: string }[] };

  const hopLe = new Set(
    (selItems ?? [])
      .filter((s) => s.mark === "selected" && s.selection_id === selectionId)
      .map((s) => s.id),
  );

  const thieu = albumRows.filter((a) => {
    const selItemId = coverByItem.get(a.galleryItemId);
    return !selItemId || !hopLe.has(selItemId);
  });

  return {
    tenConThieu: thieu.map((a) => a.name),
    galleryItemIdConThieu: thieu.map((a) => a.galleryItemId),
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Xác thực phiên khách hàng
    const session = await requirePhienBoAnh(request);

    // Chỉ khách chính (owner) mới có quyền chốt
    if (session.role !== "owner") {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới có quyền chốt bộ ảnh");
    }

    // 2. Parse & validate input
    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = SubmitSelectionSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();

    // 3. Kiểm tra trạng thái album — Luật 1: Chốt xong là khoá
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id, customer_id, title, status, extra_photo_price, included_quota")
      .eq("id", session.galleryId)
      .single();

    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    // Danh sách chép tay ở đây từng thiếu 'awaiting_approval' và 'approved':
    // khách đang chờ duyệt ảnh đã chỉnh vẫn gọi được route này, đẩy bộ ảnh
    // ngược về 'submitted' và xoá mất giai đoạn chỉnh ảnh. Dùng chung
    // @/lib/gallery-status, khớp app.gallery_is_locked() bên SQL.
    if (isGalleryLocked(gallery.status)) {
      return fail("GALLERY_LOCKED", "Bộ ảnh đã được chốt, không thể thay đổi");
    }

    // 4. Kiểm tra hạn mức từ app.gallery_quota — Luật 4: Hạn mức chưa biết thì KHÔNG cho chốt
    const { data: quotaVal, error: quotaError } = await admin.rpc("gallery_quota", {
      p_gallery_id: session.galleryId,
    });

    if (quotaError) {
      throw quotaError;
    }

    if (quotaVal === null || quotaVal === undefined) {
      return fail(
        "QUOTA_UNKNOWN",
        vi.gallery.loiBean.chuaCoHanMucGoi
      );
    }

    const includedQuota = Number(quotaVal);

    // 4b. Luật 5 (BB-202) — gói có album mà chưa chọn bìa (hoặc bìa vừa mất
    // hiệu lực vì bỏ tim) thì KHÔNG cho chốt.
    const { tenConThieu: albumThieuBia } = await timAlbumThieuBia(
      admin,
      session.galleryId,
      session.selectionId,
    );
    if (albumThieuBia.length > 0) {
      return fail(
        "CONFLICT",
        `Ba mẹ chưa chọn ảnh bìa cho: ${albumThieuBia.join(", ")}. Vui lòng chọn bìa rồi chốt lại.`,
        { albumThieuBia },
      );
    }

    // 5. Đếm số ảnh đã chọn lúc này
    const { count: selectedCount, error: countError } = await admin
      .from("selection_items")
      .select("*", { count: "exact", head: true })
      .eq("selection_id", session.selectionId)
      .eq("mark", "selected")
      // BB-395 vòng 3: số lúc chốt ĐỢT 1 chỉ đếm ảnh đợt 1 — ảnh đợt ≥ 2 (còn nằm trong lượt chọn
      // khi đợt 1 được mở lại) đã tính tiền theo đợt; đếm vào đây là đòi hai lần (0103 sửa view).
      .eq("dot", 1);

    if (countError) {
      throw countError;
    }

    const selected = selectedCount || 0;

    // 5b. BB-321 — hai ô tick của chủ studio (29/09/2026). Máy chủ tự kiểm, không tin giao diện.
    //   · chọn THIẾU so với hạn mức → BẮT BUỘC tick "đồng ý ảnh studio chọn dùm". Chủ studio
    //     chốt: chọn thiếu chỉ có HAI đường — "Chọn tiếp" cho đủ, hoặc đồng ý studio chọn dùm;
    //     KHÔNG có đường thứ ba (chốt thiếu mà không nhờ). Có cờ đồng ý thì máy chủ TỰ ghi
    //     lời nhờ (`nho_studio_chon_them` = số ảnh thiếu), không cần giao diện gửi riêng;
    //   · còn sản phẩm in chưa gắn ảnh → phải tick "biết chưa chọn ảnh in thì nhận ảnh chậm hơn".
    const soAnhThieu = Math.max(0, includedQuota - selected);
    const kiemNho = kiemTraNhoStudioChon({
      soAnhThieu,
      nho: soAnhThieu > 0,
      dongY: input.dongYAnhStudioChon === true,
    });
    if (!kiemNho.ok) return fail(kiemNho.code, kiemNho.message, kiemNho.chiTiet);

    const soInChuaAnh = await demSanPhamInChuaGanAnh(admin, session.galleryId, session.selectionId);
    const kiemIn = kiemTraSanPhamInChuaAnh({ soChuaAnh: soInChuaAnh, biet: input.bietAnhInChamHon === true });
    if (!kiemIn.ok) return fail(kiemIn.code, kiemIn.message, kiemIn.chiTiet);

    // 5c. BB-399 — "Làm ảnh nhanh": ba mẹ tích ô ở hộp chốt. Máy chủ tự tìm sản phẩm đang bán
    // và lấy giá từ `products` (đồng bộ Lark) — không tin giá trình duyệt. Ghi TRƯỚC khi đổi
    // trạng thái: không có sản phẩm thì từ chối cả lượt chốt (ba mẹ đã chọn trả tiền cho một
    // thứ — chốt mà lặng lẽ bỏ nó là sai lời hứa). Đã mua (chốt lại sau khi mở) → không ghi lần hai.
    const caiDatNhanh = await docCaiDatLamNhanh(admin, gallery.branch_id ?? null);
    if (input.lamAnhNhanh === true) {
      const daMua = await daMuaCuaBo(admin, session.galleryId, session.selectionId, caiDatNhanh.cacGhim);
      if (!daMua) {
        // BB-399 vòng 3 — công tắc tắt (hậu kỳ quá tải): từ chối nhã nhặn, không chốt lặng lẽ bỏ dịch vụ.
        if (!caiDatNhanh.bat) return fail("CONFLICT", vi.gallery.lamNhanh.loiTamDung);
        const sanPhamNhanh = await timSanPhamLamNhanh(admin, caiDatNhanh.ghim);
        if (!sanPhamNhanh) return fail("CONFLICT", vi.gallery.lamNhanh.loiKhongCoSanPham);
        await ghiMuaLamNhanh(admin, { selectionId: session.selectionId, sanPham: sanPhamNhanh, dot: 1 });
      }
    }

    const extraCount = Math.max(0, selected - includedQuota);
    const extraAmount = extraCount * Number(gallery.extra_photo_price);
    const submittedAt = new Date().toISOString();

    // 6. Luật 3: Chụp lại con số — ghi vào album và selection
    // Cập nhật galleries: chuyển sang submitted, lưu hạn mức đã chụp
    const { error: updateGalleryError } = await admin
      .from("galleries")
      .update({
        status: "submitted",
        submitted_at: submittedAt,
        included_quota: includedQuota,
        updated_at: submittedAt,
      })
      .eq("id", session.galleryId);

    if (updateGalleryError) {
      throw updateGalleryError;
    }

    // Cập nhật selections: lưu snapshot số lượng, tiền phát sinh, người xác nhận
    const selectionUpdate: Record<string, unknown> = {
      submitted_at: submittedAt,
      submitted_by_name: input.confirmedByName,
      snapshot_selected_count: selected,
      snapshot_extra_count: extraCount,
      snapshot_extra_amount: extraAmount,
      updated_at: submittedAt,
    };
    if (input.generalNote !== undefined) {
      selectionUpdate.general_note = input.generalNote;
    }
    // Chỉ ghi các cột BB-321 khi có gì để ghi — chốt bình thường không đụng cột mới,
    // nên chưa áp migration 0077 thì nút Chốt của mọi khách khác vẫn chạy.
    if (kiemNho.soNho > 0) {
      selectionUpdate.nho_studio_chon_them = kiemNho.soNho;
      selectionUpdate.dong_y_anh_studio_chon = true;
    }
    if (soInChuaAnh > 0) {
      selectionUpdate.so_san_pham_in_chua_anh = soInChuaAnh;
      selectionUpdate.biet_anh_in_cham_hon = true;
    }

    let { error: updateSelectionError } = await admin
      .from("selections")
      .update(selectionUpdate)
      .eq("id", session.selectionId);

    // Migration 0077 CHƯA áp (môi trường thử): bốn cột ghi nhận lời nhờ/ô tick chưa có.
    // Khách đã tick đủ — không được chặn nút Chốt vì thiếu cột; ghi phần còn lại, báo log
    // để người áp migration thấy. Sau khi áp 0077 nhánh này không bao giờ chạy.
    const COT_BB321 = ["nho_studio_chon_them", "dong_y_anh_studio_chon", "so_san_pham_in_chua_anh", "biet_anh_in_cham_hon"];
    if (updateSelectionError && laLoiThieuCot(updateSelectionError) && COT_BB321.some((c) => c in selectionUpdate)) {
      console.error("[BB-321] Chưa áp migration 0077 — bỏ các cột đồng ý khi chốt đợt 1", {
        requestId,
        selection: String(session.selectionId).slice(0, 8),
      });
      for (const c of COT_BB321) delete selectionUpdate[c];
      ({ error: updateSelectionError } = await admin
        .from("selections")
        .update(selectionUpdate)
        .eq("id", session.selectionId));
    }

    if (updateSelectionError) {
      throw updateSelectionError;
    }

    // 7. Lấy thông tin share_link để lấy token_prefix an toàn
    const { data: link } = await admin
      .from("share_links")
      .select("token_prefix")
      .eq("id", session.shareLinkId)
      .single();

    const tokenPrefix = link?.token_prefix || "******";

    // 8. Báo CSKH — BB-167
    //
    // Đoạn cũ tự ghi thẳng vào `notifications` với hai cột `gallery_id` và
    // `recipient`. Bảng KHÔNG có cột nào trong hai cột đó. Đo ngày 21/09/2026 bằng
    // chính khoá của app:
    //
    //     PGRST204: Could not find the 'gallery_id' column of 'notifications'
    //
    // `supabase-js` không ném lỗi — nó trả `{ data, error }`, và mã cũ bỏ qua cả
    // hai. Nên mỗi lượt khách bấm Chốt là một dòng thông báo rơi vào hư không, mà
    // khách vẫn nhận 200. Bảng `notifications` rỗng trơn từ đầu tới nay.
    //
    // Đặt SAU mọi lần ghi nghiệp vụ, và `enqueueLarkNotification` cam kết không
    // bao giờ ném: Lark chết không được phép làm hỏng nút Chốt của ba mẹ.
    const { data: khach } = await admin
      .from("customers")
      .select("full_name, phone")
      .eq("id", gallery.customer_id)
      .maybeSingle();

    /*
      BB-202 — thẻ Lark báo có dòng bìa album (tên tệp, KHÔNG kèm đuôi).

      Đuôi tệp (".jpg", ".png"...) khớp đúng `GIA_TRI_CAM` trong `locBoAnh()` —
      chặn đúng luật "không ảnh của bé sang Lark" (docs/08 §5), vì một chuỗi
      kết thúc bằng đuôi ảnh CŨNG LÀ một chuỗi trỏ tới ảnh. Gửi tên KHÔNG đuôi
      thì vẫn đủ để CSKH đối chiếu, mà không lọt qua tấm lưới an toàn đó.

      Bảng `album_covers` có thể chưa tồn tại (0075 chưa áp) — không ném, chỉ
      bỏ qua dòng này khỏi thẻ.
      Bọc TOÀN BỘ khối trong try/catch: đây là dữ liệu TRANG TRÍ cho thẻ Lark,
      đứng sau giao dịch đã commit — không được phép làm hỏng nút Chốt.
    */
    let biaAlbumTen: string[] = [];
    try {
      const { data: covers } = await admin
        .from("album_covers")
        .select("selection_item_id")
        .eq("gallery_id", session.galleryId);
      const selItemIds = (covers ?? []).map((c) => c.selection_item_id);
      if (selItemIds.length > 0) {
        const { data: sis } = await admin
          .from("selection_items")
          .select("photo_id")
          .in("id", selItemIds);
        const photoIds = (sis ?? []).map((s) => s.photo_id);
        if (photoIds.length > 0) {
          const { data: anhs } = await admin.from("photos").select("file_name").in("id", photoIds);
          biaAlbumTen = (anhs ?? []).map((a) => String(a.file_name).replace(/\.[^./\\]+$/, ""));
        }
      }
    } catch {
      biaAlbumTen = [];
    }

    /*
      BB-284 — thẻ Lark báo chốt ảnh trước nay KHÔNG hiện sản phẩm mua thêm lúc
      chọn (`selection_addons`, route /api/g/addons) — chỉ hiện "chọn thêm ẢNH"
      (extraCount/extraAmount, khác khái niệm). CSKH đọc thẻ (a) tưởng khách
      chỉ chọn thêm ảnh, bỏ sót đơn mua sản phẩm đã có trong lượt chốt này.

      Bọc try/catch cùng luật với khối bìa album ở trên: dữ liệu TRANG TRÍ,
      đứng sau giao dịch đã commit, không được phép làm hỏng nút Chốt.
    */
    let cacMonMuaThem: { ten: string; soLuong: number }[] = [];
    // BB-399 — bộ có làm ảnh nhanh: thẻ Lark có dòng riêng "Làm ảnh nhanh (N ngày)", không lẫn
    // vào danh sách mua thêm.
    let coLamNhanh = false;
    try {
      const { data: monMua } = await admin
        .from("selection_addons")
        .select("product_id, quantity")
        .eq("selection_id", session.selectionId);
      const idSanPham = [...new Set((monMua ?? []).map((m) => m.product_id))];
      if (idSanPham.length > 0) {
        const { data: sanPham } = await admin.from("products").select("id, name, lark_record_id").in("id", idSanPham);
        const theoId = new Map((sanPham ?? []).map((s) => [s.id, s as { name: string | null; lark_record_id: string | null }]));
        const laNhanh = (id: string) => laSanPhamLamNhanh(theoId.get(id), caiDatNhanh.cacGhim);
        coLamNhanh = (monMua ?? []).some((m) => laNhanh(m.product_id));
        cacMonMuaThem = (monMua ?? [])
          .filter((m) => !laNhanh(m.product_id))
          .map((m) => ({
            ten: String(theoId.get(m.product_id)?.name ?? "Sản phẩm"),
            soLuong: Number(m.quantity),
          }));
      }
    } catch {
      cacMonMuaThem = [];
    }

    // BB-342: màn nhân viên (Việc cần xử lý, huy hiệu, chi tiết…) tự tải lại. Phát
    // TRƯỚC tin Lark: việc đã ghi xong, không bắt CSKH chờ thêm lượt gọi Lark.
    await phatSuKienBoAnh({
      galleryId: session.galleryId,
      branchId: gallery.branch_id,
      loai: LOAI_TUC_THI.khachChotDanhSach,
    });

    await enqueueLarkNotification({
      branchId: gallery.branch_id,
      event: "selection.submitted",
      payload: {
        galleryId: session.galleryId,
        galleryTitle: gallery.title,
        selectedCount: selected,
        includedQuota,
        extraCount,
        extraAmount,
        confirmedByName: input.confirmedByName,
        // Che giữa trước khi rời khỏi đây (docs/08 §5). Nhóm chat rộng hơn app
        // rất nhiều, và tin nhắn Lark thì chuyển tiếp được.
        customerPhone: cheSoDienThoai(khach?.phone),
        customerName: khach?.full_name ?? null,
        submittedAt,
        // Khoá KHÔNG được chứa chữ "anh" — `locBoAnh()` cắt mọi khoá khớp
        // chữ đó (bẫy đã canh ở BB-200/BB-245, xem lark/notify.ts).
        biaAlbumTen,
        cacMonMuaThem,
        // BB-321 — khoá tránh chữ "anh" (locBoAnh cắt theo tên khoá).
        nhoStudioSoTam: kiemNho.soNho,
        soMonInThieuTam: soInChuaAnh,
        // BB-399 — khoá tránh chữ "anh" (cả "nhanh" cũng dính — locBoAnh cắt theo tên khoá).
        lamGapNgay: coLamNhanh ? caiDatNhanh.soNgayNhanh : 0,
      },
    });

    // 9. Ghi activity log
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: input.confirmedByName,
      action: "selection.submit",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: {
        tokenPrefix,
        selectedCount: selected,
        includedQuota,
        extraCount,
        extraAmount,
        ...(kiemNho.soNho > 0 ? { nhoStudioChonThem: kiemNho.soNho } : {}),
        ...(soInChuaAnh > 0 ? { soSanPhamInChuaAnh: soInChuaAnh } : {}),
        ...(coLamNhanh ? { lamAnhNhanh: true } : {}),
      },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({
      submittedAt,
      selectedCount: selected,
      includedQuota,
      extraCount,
      extraAmount,
      summaryUrl: `/g/${tokenPrefix}/done`,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
