/**
 * Xuất `BangBaoCao` ra CSV mà Excel (tiếng Việt) mở đọc được đúng.
 *
 * OWNER: DEV-BE. Task BB-260.
 *
 * Excel trên Windows đoán bảng mã theo BOM UTF-8 (`﻿`) ở đầu tệp — thiếu
 * nó thì các cột có dấu tiếng Việt hiện thành ký tự lạ khi mở bằng double-
 * click thay vì import thủ công.
 */

import type { BangBaoCao } from "./loai";

function thoatO(gia: string | number | null): string {
  const s = gia === null ? "" : String(gia);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function bangThanhCsv(bang: BangBaoCao): string {
  const dongTieuDe = bang.cot.map(thoatO).join(",");
  const cacDong = bang.dong.map((d) => d.map(thoatO).join(","));
  return "﻿" + [dongTieuDe, ...cacDong].join("\r\n") + "\r\n";
}
