/**
 * BB-398 vòng 2 — NGĂN XẾP LỚP HỘP THOẠI: Esc / Tab chỉ thuộc về lớp TRÊN CÙNG.
 *
 * Màn treo tường và màn "Xem album trên bàn" mở ĐÈ LÊN cửa hàng. Cửa hàng bẫy phím
 * (`useBayFocusHopThoai`, nghe `keydown` ở pha bắt của `document`): Esc bấm trên màn
 * album từng đóng LUÔN cửa hàng bên dưới, Tab trên màn treo bị kéo ngược về cửa hàng.
 * Mỗi lớp mở thì đăng ký vào ngăn xếp này; bộ xử lý phím của một lớp chỉ chạy khi
 * nó đang là lớp trên cùng. Lớp mở sau (kể cả lồng bên trong lớp trước) nằm trên.
 */

import { useCallback, useEffect, useRef } from "react";

let dem = 0;
const nganXep: number[] = [];

/** Mở một lớp mới (nằm trên mọi lớp đang mở). Trả id để đóng / hỏi. */
export function moLop(): number {
  dem += 1;
  nganXep.push(dem);
  return dem;
}

/** Đóng đúng lớp này (lớp đóng không theo thứ tự cũng được). */
export function dongLop(id: number): void {
  const i = nganXep.lastIndexOf(id);
  if (i >= 0) nganXep.splice(i, 1);
}

/** Lớp này có đang ở trên cùng không. */
export function laLopTrenCung(id: number): boolean {
  return id > 0 && nganXep.length > 0 && nganXep[nganXep.length - 1] === id;
}

/**
 * Đăng ký lớp khi `mo` = true, gỡ khi đóng/huỷ. Trả hàm hỏi "mình có đang trên cùng
 * không" — gọi TRONG bộ xử lý phím (lúc phím được bấm), không phải lúc render.
 */
export function useLopHopThoai(mo: boolean): () => boolean {
  const idRef = useRef(0);
  useEffect(() => {
    if (!mo) return;
    const id = moLop();
    idRef.current = id;
    return () => {
      dongLop(id);
      idRef.current = 0;
    };
  }, [mo]);
  return useCallback(() => laLopTrenCung(idRef.current), []);
}

/**
 * Bộ xử lý Esc cho một lớp nằm TRÊN (màn treo tường, màn album trên bàn): chỉ khi đang
 * trên cùng thì nuốt phím (không cho lan xuống lớp dưới) và đóng chính mình.
 */
export function taoXuLyEscLopTren(
  laTren: () => boolean,
  onDong: () => void,
): (e: Pick<KeyboardEvent, "key" | "preventDefault" | "stopImmediatePropagation">) => void {
  return (e) => {
    if (e.key !== "Escape" || !laTren()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onDong();
  };
}
