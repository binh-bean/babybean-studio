/**
 * Bóc tên mẹ và tên bé từ tên thư mục Drive.
 *
 * OWNER: DEV-INT. Task BB-097.
 * Thuật ngữ: docs/16 mục 0 ("Bộ ảnh", không phải "Album").
 *
 * LUẬT BÓC TÊN (chủ studio chốt):
 *   - ngoài ngoặc          -> tên mẹ
 *   - trong ngoặc          -> tên bé (cặp ngoặc tròn đầu tiên nếu có nhiều cặp)
 *   - không có ngoặc       -> tất cả là tên mẹ, bé rỗng, isGuessed = true
 *   - chuỗi rỗng / không hợp lệ -> mẹ rỗng, bé rỗng, isGuessed = false
 *
 * Không suy diễn thêm: không đoán theo họ Việt Nam, không suy luận giới tính,
 * không chuẩn hoá tên. Sai thì nhân viên tự sửa.
 */

export interface ParsedFolderName {
  motherName: string;
  babyName: string;
  isGuessed: boolean;
}

/**
 * Phân tích tên thư mục Drive thành tên mẹ và tên bé.
 */
export function parseFolderName(name?: string | null): ParsedFolderName {
  if (!name || typeof name !== "string") {
    return { motherName: "", babyName: "", isGuessed: false };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { motherName: "", babyName: "", isGuessed: false };
  }

  // Tìm cặp ngoặc tròn đầu tiên: '(' ... ')'
  const openIdx = trimmed.indexOf("(");
  const closeIdx = trimmed.indexOf(")", openIdx + 1);

  if (openIdx !== -1 && closeIdx !== -1) {
    const babyPart = trimmed.slice(openIdx + 1, closeIdx).trim().replace(/\s+/g, " ");
    const beforePart = trimmed.slice(0, openIdx).trim();
    const afterPart = trimmed.slice(closeIdx + 1).trim();

    const motherPart = [beforePart, afterPart]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      motherName: motherPart,
      babyName: babyPart,
      isGuessed: false,
    };
  }

  // Không có ngoặc: toàn bộ là tên mẹ, isGuessed = true
  return {
    motherName: trimmed.replace(/\s+/g, " "),
    babyName: "",
    isGuessed: true,
  };
}
