import type { CSSProperties } from "react";

/**
 * BB-292 vòng 2 — giám đốc chấm ảnh chụp: tranh minh hoạ (`public/minh-hoa/**`)
 * có nền kem ngả vàng hơi khác `#FBF7F2` của trang, nên hiện thành MỘT KHỐI
 * tách khỏi nền thay vì tan vào — thấy rõ viền hình chữ nhật/vuông quanh
 * tranh dù đã cùng tông màu.
 *
 * Hai lớp CSS xử lý việc này, dùng chung ở mọi nơi gắn tranh minh hoạ:
 *  - `mix-blend-mode: multiply` — nhân màu tranh với màu nền phía sau; nền
 *    kem gần trắng của tranh gần như biến mất, chỉ còn nét vẽ đậm hơn nổi
 *    lên, giống tranh được "in" thẳng lên nền trang.
 *  - `mask-image` mờ dần ra mép — che viền hình chữ nhật cứng của tệp ảnh,
 *    để phần nền kem còn sót lại (chưa nhân hết) tan dần vào nền trang thay
 *    vì dừng đột ngột ở mép tệp.
 *
 * Hai biến thể mặt nạ:
 *  - `layerMoVuong` — toả tròn từ giữa, dùng cho tranh vuông/gần-vuông đứng
 *    một mình (KhongCoQuyen, chân trang khách — không có gì "vào khung"
 *    ngang).
 *  - `layerMoNgang` — mờ hai bên trái/phải VÀ mép dưới, giữ mép trên sắc nét,
 *    dùng cho tranh ngang (banner) đặt sát đỉnh khối chứa nó (dải đăng nhập,
 *    trạng thái trống quản trị) — mép trên không cần mờ vì không có gì phía
 *    trên nó trong cùng khối.
 */
export const layerMoVuong: CSSProperties = {
  mixBlendMode: "multiply",
  WebkitMaskImage: "radial-gradient(closest-side, black 55%, transparent 100%)",
  maskImage: "radial-gradient(closest-side, black 55%, transparent 100%)",
};

export const layerMoNgang: CSSProperties = {
  mixBlendMode: "multiply",
  WebkitMaskImage:
    "linear-gradient(to right, transparent, black 6%, black 94%, transparent), linear-gradient(to bottom, black 82%, transparent)",
  WebkitMaskComposite: "source-in, source-over",
  maskImage:
    "linear-gradient(to right, transparent, black 6%, black 94%, transparent), linear-gradient(to bottom, black 82%, transparent)",
  maskComposite: "intersect",
};
