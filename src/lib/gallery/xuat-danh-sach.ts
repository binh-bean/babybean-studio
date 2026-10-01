/**
 * BB-348 — một dòng cho MỘT ảnh trong dạng xuất "Thông tin chi tiết" (`?format=chi-tiet`).
 *
 * Anh 01/10/2026: mỗi ảnh đúng một dòng, dán sang Lark/Zalo đọc liền một mạch:
 *
 *   R01_0008.JPG (Dùng cho: BÌA Album 20x20 · "xóa mụn cho bé dùm chị")
 *
 *   · "Dùng cho" = sản phẩm in / bìa album đang dùng ảnh này (suất trong gói,
 *     mua thêm, album mua thêm, bìa) — nối bằng dấu phẩy;
 *   · sau đó là ghi chú của khách cho tấm đó, trong ngoặc kép;
 *   · ảnh KHÔNG có ghi chú và KHÔNG dùng cho sản phẩm nào → CHỈ tên file, không ngoặc.
 *
 * Ghi chú khách gõ tự do, có thể xuống dòng — gộp khoảng trắng về một dấu cách để
 * mỗi ảnh vẫn đúng một dòng (dòng vỡ đôi là thợ chỉnh ảnh đọc nhầm sang tấm bên cạnh).
 */
export function dongAnhChiTiet(input: {
  tenFile: string;
  dungCho: readonly string[];
  ghiChu: string | null | undefined;
}): string {
  const phan: string[] = [];
  const dungCho = input.dungCho.map((t) => t.trim()).filter((t) => t.length > 0);
  if (dungCho.length > 0) phan.push(`Dùng cho: ${dungCho.join(", ")}`);
  const ghiChu = (input.ghiChu ?? "").replace(/\s+/g, " ").trim();
  if (ghiChu.length > 0) phan.push(`"${ghiChu}"`);
  return phan.length > 0 ? `${input.tenFile} (${phan.join(" · ")})` : input.tenFile;
}

/** Nhãn "bìa" đứng TRƯỚC tên album, đúng mẫu anh đưa: `BÌA Album 20x20`. */
export function nhanBiaAlbum(tenAlbum: string): string {
  return `BÌA ${tenAlbum}`;
}
