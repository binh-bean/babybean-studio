/**
 * Khoá cuộn trang nền (`body { overflow: hidden }`) CÓ ĐẾM — BB-329 mục 2.
 *
 * Chủ studio 30/09/2026 (iPhone): "bấm Đặt in rồi quay lại thì màn hình bị
 * tràn, không cuộn được".
 *
 * Gốc lỗi: sáu lớp phủ (màn xem lớn, màn treo tường, so sánh, chuông thông
 * báo, Sheet, Dialog) mỗi cái tự khoá theo kiểu "nhớ giá trị cũ → đặt hidden
 * → trả giá trị cũ khi đóng". Hai lớp phủ CHỒNG nhau mà đóng KHÔNG theo thứ
 * tự ngược lúc mở thì giá trị "cũ" mà lớp thứ hai nhớ chính là `hidden` của
 * lớp thứ nhất — đóng xong nó trả lại `hidden`, trang nền kẹt khoá vĩnh viễn.
 * Ví dụ đúng đường chủ studio đi: màn xem lớn → "Đặt in" → "Đặt in tấm này"
 * (màn xem lớn đóng, cửa hàng mở) → đóng cửa hàng. Sheet/Dialog còn tệ hơn:
 * khi đóng chúng gán thẳng `""` — mở khoá luôn cả lớp phủ khác đang mở.
 *
 * Nay mọi lớp phủ gọi chung `khoaCuonTrang()` và gọi hàm nó trả về để mở:
 * còn ít nhất một lớp đang giữ khoá thì trang nền còn khoá; lớp cuối cùng
 * nhả ra thì trả đúng giá trị `overflow` trước lần khoá ĐẦU TIÊN — bất kể thứ
 * tự đóng. Hàm mở khoá gọi hai lần cũng chỉ tính một lần.
 *
 * Tệp không import gì phía máy chủ — chỉ chạm `document` khi được gọi (trong
 * `useEffect`), nên an toàn khi dựng trên máy chủ.
 */

let soLopDangKhoa = 0;
let overflowTruocKhiKhoa = "";

export function khoaCuonTrang(): () => void {
  if (typeof document === "undefined") return () => {};
  if (soLopDangKhoa === 0) {
    overflowTruocKhiKhoa = document.body.style.overflow;
  }
  soLopDangKhoa += 1;
  document.body.style.overflow = "hidden";

  let daMo = false;
  return () => {
    if (daMo) return;
    daMo = true;
    soLopDangKhoa = Math.max(0, soLopDangKhoa - 1);
    if (soLopDangKhoa === 0) {
      document.body.style.overflow = overflowTruocKhiKhoa;
    }
  };
}

/** Chỉ cho phép thử đơn vị: số lớp phủ đang giữ khoá. */
export function soLopKhoaCuon(): number {
  return soLopDangKhoa;
}
