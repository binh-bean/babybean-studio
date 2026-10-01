/**
 * BB-340 — gõ chữ để lọc danh sách, bất kể dấu và hoa thường.
 *
 * Anh chủ studio: "các phần chọn có danh sách bên trong hiện tại phải kéo để
 * tìm — thêm tính năng gõ ký tự sẽ hiện ra sp có ký tự đó".
 *
 * Hàm thuần, không phụ thuộc React — ô chọn có tìm (`o-chon-tim.tsx`) gọi vào
 * đây, và phép thử đơn vị canh đúng hàm này.
 */

/**
 * "Gỗ" -> "go", "Nguyễn" -> "nguyen", "Đã giao" -> "da giao".
 *
 * `đ` không tách được bằng NFD (nó là một chữ riêng, không phải d + dấu) nên
 * phải đổi tay; thiếu dòng đó là gõ "da" không ra "Đã chốt".
 */
export function boDauVaHoa(chu: string): string {
  return chu
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/**
 * Giữ lại những mục có chứa MỌI từ người dùng gõ (không cần đúng thứ tự).
 * Gõ rỗng thì trả nguyên danh sách. Giữ nguyên thứ tự ban đầu.
 */
export function locTheoChu<T extends { label: string }>(
  cacMuc: readonly T[],
  truyVan: string,
): T[] {
  const cacTu = boDauVaHoa(truyVan).split(/\s+/).filter(Boolean);
  if (cacTu.length === 0) return [...cacMuc];
  return cacMuc.filter((muc) => {
    const nhan = boDauVaHoa(muc.label);
    return cacTu.every((tu) => nhan.includes(tu));
  });
}
