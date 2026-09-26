/**
 * Gợi ý ảnh bìa cho một ALBUM (sản phẩm in) nằm TRONG GÓI.
 *
 * OWNER: DEV-BE. Task BB-202.
 * Spec: docs/19-ban-yeu-cau-dot-1.md mục 1.
 *
 * Chủ studio 26/09/2026, sau khi làm rõ khái niệm "album ảnh":
 *
 *     "có hai nhiệm vụ chính là gợi ý chọn ảnh bìa cho album nếu trong gói
 *      khách hàng có album"
 *
 * Chốt thêm cùng ngày: bìa là MỘT tấm trong những tấm ba mẹ ĐÃ THẢ TIM, app
 * gợi ý sẵn 3–4 tấm, và bìa BẮT BUỘC chọn trước khi chốt (xem
 * `/api/g/submit`).
 *
 * ---------------------------------------------------------------------------
 * Vì sao hàm này THUẦN, không tự đọc "đã thả tim" từ đâu cả
 * ---------------------------------------------------------------------------
 * Màn khách đã tải sẵn TOÀN BỘ ảnh của bộ (kèm `mark`, `retouchNote`,
 * `orderIndex`, `sortIndex`) để vẽ lưới ảnh. Hỏi lại máy chủ một danh sách y
 * hệt, chỉ để lọc rồi sắp xếp, là một lượt gọi mạng thừa cho một phép tính
 * không cần dữ liệu mới. Người gọi (màn khách, hoặc phép thử) tự lọc "đã thả
 * tim" — nghĩa
 * là `mark === 'selected'`, cùng định nghĩa "trái tim" đang dùng ở
 * `handleToggleHeart` trong gallery-app.tsx — rồi đưa nguyên danh sách vào
 * đây.
 */

export interface UngVienBiaAlbum {
  /** `selection_items.id` — bìa gắn vào ĐÚNG lượt chọn này, không phải ảnh chung chung. */
  selectionItemId: string;
  photoId: string;
  fileName: string;
  /** Ghi chú chỉnh sửa của khách cho tấm này — có ghi chú nghĩa là khách đã ngồi cân nhắc tấm đó kỹ. */
  retouchNote: string | null;
  /** Thứ tự khách bấm thả tim; `null` cho dữ liệu cũ chưa có cột này. */
  orderIndex: number | null;
  /**
   * Thứ tự ổn định làm nhánh phụ khi `orderIndex` bằng nhau hoặc đều null —
   * dùng `sortIndex` của ảnh (thứ tự trong thư mục), vì màn khách LUÔN có sẵn
   * số này cho mọi ảnh (khác `orderIndex`, chỉ có khi khách đã bấm thả tim).
   */
  sortIndex: number;
}

/** "Gợi ý sẵn 3–4 tấm" — chốt của chủ studio 26/09/2026. */
export const SO_LUONG_GOI_Y_BIA_ALBUM = 4;

/**
 * Hạng ưu tiên — số CÀNG NHỎ càng nên gợi ý trước.
 *
 * 0. Đã thả tim VÀ có ghi chú chỉnh sửa — khách đã dừng lại kỹ ở tấm này.
 * 1. Là ảnh bìa của cả BỘ ẢNH (`galleries.cover_photo_id`) và đã thả tim —
 *    khách hoặc CSKH đã chọn nó đại diện cho cả buổi chụp.
 * 2. Còn lại: theo thứ tự thả tim.
 */
function hangUuTien(u: UngVienBiaAlbum, anhBiaBoAnhId: string | null): 0 | 1 | 2 {
  const coGhiChu = typeof u.retouchNote === "string" && u.retouchNote.trim().length > 0;
  if (coGhiChu) return 0;

  const laBiaBoAnh = anhBiaBoAnhId !== null && u.photoId === anhBiaBoAnhId;
  if (laBiaBoAnh) return 1;

  return 2;
}

/**
 * Gợi ý tối đa `soLuongGoiY` tấm bìa, từ danh sách ảnh ĐÃ THẢ TIM.
 *
 * Trả về danh sách RỖNG khi chưa có tấm nào được thả tim — màn khách khi đó
 * phải nói "ba mẹ thả tim vài tấm trước", không phải bịa ra gợi ý.
 *
 * Không lọc trùng `photoId` (không thể trùng: `daThaTim` là những dòng
 * `selection_items` đã lọc `mark = 'selected'`, và mỗi ảnh chỉ có một dòng
 * cho một lượt chọn — ràng buộc `uq_selection_items`).
 */
export function goiYBiaAlbum(
  daThaTim: UngVienBiaAlbum[],
  anhBiaBoAnhId: string | null,
  soLuongGoiY: number = SO_LUONG_GOI_Y_BIA_ALBUM,
): UngVienBiaAlbum[] {
  const sapXep = [...daThaTim].sort((a, b) => {
    const ha = hangUuTien(a, anhBiaBoAnhId);
    const hb = hangUuTien(b, anhBiaBoAnhId);
    if (ha !== hb) return ha - hb;

    // Cùng hạng: theo thứ tự khách bấm thả tim. `orderIndex` null (dữ liệu cũ)
    // xuống cuối nhóm cùng hạng thay vì đứng lẫn lộn ở giữa.
    const oa = a.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const ob = b.orderIndex ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;

    return a.sortIndex - b.sortIndex;
  });

  return sapXep.slice(0, Math.max(0, soLuongGoiY));
}
