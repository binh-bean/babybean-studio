/**
 * Ba nhóm sản phẩm hậu kỳ, theo cách chủ studio gọi tên.
 *
 * OWNER: DEV-BE. Chủ studio chốt 22/09/2026:
 *
 *     "Sản phẩm nhóm 3 nhóm:
 *        1 nhóm ảnh in / ảnh phóng
 *        2 album
 *        3 khung
 *      trong mỗi nhóm được phân định bằng chất liệu và kích thước."
 *
 * Kèm một lời nhắc quan trọng: **"khung ảnh là bọc ngoài ảnh, còn ảnh in ảnh
 * phóng"** — đừng nhầm hai thứ. Một tấm "Gỗ 40x60" là ẢNH IN trên chất liệu
 * gỗ; "Khung kim loại 40x60" là cái KHUNG bọc quanh tấm ảnh đó. Khách có thể
 * mua một tấm ảnh mà không mua khung, và ngược lại.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phân nhóm bằng CHẤT LIỆU chứ không thêm cột mới
 * ---------------------------------------------------------------------------
 * Bảng `products` đồng bộ từ Lark và đã mang sẵn `material` + `size` đúng cách
 * studio đặt tên hàng: "UV", "Tráng gương", "Khung HQ", "Album (Ultra HD)"…
 * Thêm một cột `nhom` nghĩa là có thêm một chỗ phải điền tay cho mỗi sản phẩm
 * mới bên Lark, và một chỗ nữa để quên.
 *
 * Cái giá phải trả: studio đặt tên một chất liệu mới mà không báo thì nó rơi
 * vào nhóm "ảnh in" theo mặc định. Đó là lý do có phép thử đối chiếu danh sách
 * này với bảng `products` thật — nó đỏ khi xuất hiện chất liệu lạ.
 */

export type NhomSanPham = "anh_in" | "album" | "khung";

export const TEN_NHOM: Record<NhomSanPham, string> = {
  anh_in: "Ảnh in và ảnh phóng",
  album: "Album",
  khung: "Khung ảnh",
};

/** Thứ tự bày ra cho khách: tấm ảnh trước, rồi album, rồi khung bọc ngoài. */
export const THU_TU_NHOM: NhomSanPham[] = ["anh_in", "album", "khung"];

/**
 * Xếp một sản phẩm vào nhóm.
 *
 * Trả `null` cho thứ KHÔNG gắn với ảnh — dịch vụ kèm buổi chụp (bánh sinh
 * nhật, hoa, trái cây). Những thứ đó không bày trong màn chọn ảnh: buổi chụp
 * đã xong từ lâu khi ba mẹ ngồi chọn ảnh, bán bánh sinh nhật ở đó là bán nhầm
 * lúc.
 */
export function nhomSanPham(kind: string | null, material: string | null): NhomSanPham | null {
  const cl = (material ?? "").toLowerCase();

  // "Khung HQ", "Khung kim loại" — cái bọc ngoài tấm ảnh.
  if (cl.startsWith("khung")) return "khung";

  // "Album (Ultra HD)" và "tờ Album (Ultra HD)" (một tờ ruột album).
  if (cl.includes("album")) return "album";

  // File ảnh đã chỉnh ("Edit file") gắn với đúng một tấm, nên nằm cùng nhóm
  // ảnh — ba mẹ nghĩ về nó như "mua thêm tấm này".
  if (kind === "edited_photo") return "anh_in";

  // Mọi chất liệu in còn lại: UV, Tráng gương, Mica HD, Thuỷ tinh, Gỗ,
  // Cavas/Kim tuyến…
  if (kind === "print") return "anh_in";

  return null;
}

/**
 * Sản phẩm của nhóm này có bắt buộc gắn vào MỘT tấm ảnh không.
 *
 * Ảnh in và khung thì có: in ra là in một tấm cụ thể. Album thì không — nó gộp
 * nhiều ảnh, và ảnh nào vào album là việc của bước đặt ảnh vào sản phẩm.
 */
export function canGanAnh(nhom: NhomSanPham | null): boolean {
  return nhom === "anh_in" || nhom === "khung";
}
