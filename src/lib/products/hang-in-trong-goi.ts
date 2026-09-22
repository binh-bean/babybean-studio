/**
 * Hàng in NẰM SẴN TRONG GÓI: dòng nào ăn một tấm, dòng nào ăn cả chục tấm.
 *
 * OWNER: DEV-BE. Chủ studio 22/09/2026:
 *
 *     "Tư duy lại các luồng của việc bán hàng đi. **Album không phải là một
 *      ảnh**, và ảnh ở trong gói đã mua rồi — đâu, khách chọn thế nào?"
 *
 * ---------------------------------------------------------------------------
 * Hai cách đếm khác hẳn nhau, trước nay bị gộp làm một
 * ---------------------------------------------------------------------------
 * Màn khách cũ lấy mọi dòng `kind = 'print'` rồi hiện "đã xếp x/số lượng ảnh".
 * Với "Gỗ 40x60 ×2" thì đúng: hợp đồng mua hai tấm, xếp đủ hai tấm là xong.
 *
 * Với "Album (Ultra HD) 15x21 ×1" thì sai tận gốc. Số 1 đó là MỘT CUỐN, không
 * phải một tấm ảnh. Ba mẹ đưa tấm đầu vào là app báo "đủ rồi", còn tấm thứ hai
 * thì không còn chỗ nào để đưa vào — trong khi một cuốn album thật chứa mấy
 * chục tấm. Đây là lý do có tệp này: chỗ duy nhất quyết định một dòng hàng ăn
 * ảnh kiểu gì, để giao diện và phép thử không ai đoán lại.
 *
 * Bao nhiêu tấm thì ĐỦ một cuốn là việc của studio lúc dựng cuốn (số tờ ruột
 * đặt bên Lark), không phải việc của màn chọn ảnh. Nên ở đây album chỉ có hai
 * trạng thái: rỗng, hoặc đang có mấy tấm.
 */

import { nhomSanPham, type NhomSanPham } from "./nhom-san-pham";

/** Hình dạng tối thiểu của một dòng hợp đồng mà hàm này cần. */
export interface DongHopDong {
  id: string;
  name: string;
  kind: string;
  material?: string | null;
  quantity: number;
  components?: Array<{
    id: string;
    name: string;
    kind: string;
    material?: string | null;
    quantity: number;
  }>;
}

export interface HangInTrongGoi {
  galleryItemId: string;
  name: string;
  /** Số lượng hợp đồng đã mua: 2 TẤM ảnh phóng, hoặc 1 CUỐN album. */
  quantity: number;
  nhom: NhomSanPham;
}

/**
 * Lọc ra hàng in của hợp đồng, từ CẢ HAI tầng.
 *
 * Tầng cha là dòng khách mua lẻ (một tấm ảnh phóng mua thêm lúc ký hợp đồng);
 * tầng con là thành phần nằm trong gói chụp. Cả hai đều là dòng `gallery_items`
 * nên đều có mã để đặt ảnh vào — bỏ sót tầng nào là mất chỗ chọn của tầng đó.
 */
export function locHangInTrongGoi(items: DongHopDong[]): HangInTrongGoi[] {
  const out: HangInTrongGoi[] = [];

  const them = (r: {
    id: string;
    name: string;
    kind: string;
    material?: string | null;
    quantity: number;
  }) => {
    if (r.kind !== "print") return;
    const nhom = nhomSanPham(r.kind, r.material ?? null);
    // `null` là dịch vụ kèm buổi chụp — không gắn với tấm ảnh nào.
    if (!nhom) return;
    out.push({ galleryItemId: r.id, name: r.name, quantity: r.quantity, nhom });
  };

  for (const item of items) {
    them(item);
    for (const comp of item.components ?? []) them(comp);
  }
  return out;
}

/**
 * Dòng hàng này còn thiếu ảnh không — để nhắc ba mẹ TRƯỚC khi chốt.
 *
 * Nhắc chứ không chặn (chủ studio chốt 17/09): khách đang bế con, chặn là họ
 * bỏ dở giữa chừng.
 */
export function conThieuAnh(dong: HangInTrongGoi, soAnhDaXep: number): boolean {
  // Cuốn album RỖNG mới là thiếu. Một tấm trong cuốn không có nghĩa là đủ,
  // nhưng app không biết bao nhiêu mới đủ nên không được phép doạ ba mẹ.
  if (dong.nhom === "album") return soAnhDaXep === 0;

  return soAnhDaXep < dong.quantity;
}
