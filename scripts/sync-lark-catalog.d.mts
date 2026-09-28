// Khai kiểu cho sync-lark-catalog.mjs — chỉ để phép thử TypeScript (BB-309)
// gọi được sanPhamCanTat() với kiểu rõ ràng. File .mjs vẫn là nguồn sự thật;
// khai sai ở đây thì phép thử báo lỗi kiểu, không phải hành vi thật sai.

export interface SanPhamHienCo {
  id: string;
  name: string;
  lark_record_id: string | null;
  is_active: boolean;
}

export function sanPhamCanTat(
  sanPhamHienCo: SanPhamHienCo[],
  boMaLarkDangDoc: Set<string>,
): SanPhamHienCo[];
