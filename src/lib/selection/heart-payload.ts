/**
 * Dựng nội dung gửi đi khi khách thả tim một tấm ảnh.
 *
 * OWNER: DEV-FE. Tách ra khỏi gallery-app.tsx để CÓ THỂ KIỂM ĐƯỢC.
 *
 * ---------------------------------------------------------------------------
 * Vì sao một hàm bé thế này lại đáng có file riêng
 * ---------------------------------------------------------------------------
 * Đây là chỗ dễ hỏng nhất trong toàn bộ luồng khách, và hỏng thì im lặng.
 *
 * PATCH /api/g/selection nhận CẢ HAI trường: `mark` và `isFavorite`. Gửi
 * `{ isFavorite: true }` sẽ thành công, HTTP 200, không lỗi gì. Nhưng hạn mức
 * chỉ đếm `mark = 'selected'` — nên khách thả tim 30 ảnh, màn hình báo "đã
 * chọn 0 ảnh", không ai phải trả tiền vượt, và báo cáo thất thoát không thấy
 * gì. Không có màn hình đỏ, không có test nào đỏ.
 *
 * Bản test đầu của BB-112 tự viết lại hàm này bên trong file test rồi kiểm
 * chính bản sao đó. Nó trông như một đảm bảo mà không đảm bảo gì: component
 * gửi sai thì test vẫn xanh. Tách hàm ra đây để test kiểm ĐÚNG thứ đang chạy.
 *
 * Xem docs/16 mục 3.1.
 */

/** Một thao tác gửi lên PATCH /api/g/selection. */
export interface SelectionOp {
  photoId: string;
  /** 'selected' khi chọn, null khi bỏ chọn. KHÔNG BAO GIỜ có isFavorite ở đây. */
  mark: "selected" | null;
}

export interface SelectionPatchBody {
  clientOpId: string;
  ops: SelectionOp[];
}

/**
 * Thả tim một tấm ảnh: đang chọn thì bỏ, chưa chọn thì chọn.
 *
 * `clientOpId` truyền từ ngoài vào thay vì sinh bên trong, để chỗ gọi kiểm
 * soát được việc gửi lại: gửi lại cùng một mã là thao tác cũ, RPC nhận ra và
 * không áp dụng hai lần.
 */
export function buildHeartPayload(
  photoId: string,
  isCurrentlySelected: boolean,
  clientOpId: string,
): SelectionPatchBody {
  return {
    clientOpId,
    ops: [{ photoId, mark: isCurrentlySelected ? null : "selected" }],
  };
}
