/**
 * BB-388 — chỉ nhận phản hồi của lần tải MỚI NHẤT.
 *
 * Danh sách bộ ảnh quản trị tải lại mỗi khi bộ lọc đổi (mở trang, gõ ô tìm, bấm "Chưa có tên
 * bé"…). Ba lần tải bắn gần như cùng lúc, mà phản hồi về KHÔNG theo thứ tự: lần lọc "Chưa có tên
 * bé" về sau 0,5 giây, lần tải lúc mở trang (không lọc) về sau 1,6 giây rồi GHI ĐÈ lên — CSKH
 * thấy bộ đã có tên bé nằm dưới nút "Chưa có tên bé" đang bật (e2e bb-379 bắt được 07/10).
 *
 * Mỗi lần tải lấy một số thứ tự; phản hồi về chỉ được đổ vào màn hình khi số đó vẫn là số mới
 * nhất. Lần tải cũ về muộn thì bỏ.
 */
export interface BoDemYeuCau {
  /** Gọi khi BẮT ĐẦU một lần tải — trả số thứ tự của lần đó. */
  batDau(): number;
  /** Phản hồi của lần `so` có còn là lần mới nhất không (chưa có lần nào bắt đầu sau nó). */
  laMoiNhat(so: number): boolean;
}

export function taoBoDemYeuCau(): BoDemYeuCau {
  let moiNhat = 0;
  return {
    batDau: () => ++moiNhat,
    laMoiNhat: (so) => so === moiNhat,
  };
}
