/**
 * BB-343 — khối "Giá sản phẩm" ở màn Cài đặt: lần đồng bộ giá gần nhất + nút
 * "Đồng bộ giá ngay". Server component: đọc mốc từ bảng `settings` (khoá
 * `gia_dong_bo_gan_nhat`, qua `docLanDongBoGiaGanNhat`), trang đã kiểm quyền `settings:system` trước khi dựng.
 */
import { docLanDongBoGiaGanNhat } from "@/lib/lark/doc-lan-dong-bo-gia";
import { NutDongBoGia } from "./nut-dong-bo-gia";
import { CARD_TITLE_CLASS } from "./page-header";

export async function DongBoGiaSanPham() {
  const ganNhat = await docLanDongBoGiaGanNhat();

  return (
    <section data-testid="dong-bo-gia-san-pham" className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-5">
      <h2 className={CARD_TITLE_CLASS}>Giá sản phẩm</h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Giá, tên và trạng thái kinh doanh lấy từ bảng Sản phẩm bên Lark. Tự đồng bộ mỗi sáng 08:00; đổi giá bên Lark
        xong muốn app đổi ngay thì bấm nút. Chỉ đọc từ Lark, không ghi ngược lên Lark; đơn đã đặt giữ giá lúc đặt.
      </p>
      <NutDongBoGia ganNhat={ganNhat} />
    </section>
  );
}
