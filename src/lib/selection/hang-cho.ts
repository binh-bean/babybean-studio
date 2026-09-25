/**
 * Hàng chờ thả tim ngoại tuyến (BB-232, E-6 ở docs/10-testing-qa.md §5).
 *
 * OWNER: DEV-FE. Toán THUẦN — không fetch, không localStorage, không
 * `crypto.randomUUID` bên trong hàm gộp/chia lô, để Vitest kiểm được hành vi
 * mà không cần giả lập trình duyệt. `use-hang-cho-tim.ts` mới là chỗ chạm
 * mạng và bộ nhớ trình duyệt.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải "triệt tiêu" thay vì cứ để phần tử mới nhất thắng
 * ---------------------------------------------------------------------------
 * Ba mẹ mất mạng, bấm tim một tấm (chọn), đổi ý bấm lại (bỏ chọn) — vẫn chưa
 * có mạng suốt hai lần bấm đó. Nếu hàng chờ chỉ đơn giản "ghi đè op mới nhất
 * theo photoId", lô gửi đi vẫn còn một op `{ mark: null }` cho tấm đó — vô
 * hại vì kết quả đúng, nhưng phí một dòng trong RPC và một dòng activity_log
 * cho một việc chẳng thay đổi gì so với TRƯỚC lúc mất mạng. Quan trọng hơn:
 * initial mark của tấm trước khi vào hàng mới là thứ quyết định "hai thao
 * tác có triệt tiêu nhau không" — không phải so hai op liên tiếp trong hàng.
 *
 * Nên mỗi phần tử trong hàng nhớ `gocTruocKhiVaoHang` — mark đã xác nhận với
 * máy chủ NGAY TRƯỚC lần đầu tấm đó vào hàng. Lần thêm sau cùng photoId chỉ
 * cập nhật `mark`, giữ nguyên gốc; mark mới trùng gốc thì bỏ hẳn phần tử đó.
 */

/** Một thao tác thả/bỏ tim đang chờ gửi. */
export interface HangChoOp {
  photoId: string;
  /** 'selected' khi chọn, null khi bỏ chọn — cùng ngữ nghĩa với SelectionOp. */
  mark: "selected" | null;
}

/** Một phần tử trong hàng chờ: thao tác mới nhất + gốc để biết khi nào triệt tiêu. */
export interface HangChoMuc extends HangChoOp {
  gocTruocKhiVaoHang: "selected" | null;
}

/** Một lô sẵn sàng gửi, cùng mã giữ nguyên qua các lần gửi lại. */
export interface LoGui {
  clientOpId: string;
  ops: HangChoOp[];
}

/** Giới hạn của SelectionPatchSchema (`src/app/api/g/selection/schema.ts`). */
export const TOI_DA_MOT_LO = 50;

/**
 * Thêm (hoặc gộp) một thao tác thả tim vào hàng chờ.
 *
 * `gocTruocKhiVaoHang` là mark của tấm ảnh NGAY TRƯỚC lần bấm này — gọi từ
 * nơi gọi hàm này (hook) truyền `photo.mark` đọc lúc bấm, trước khi optimistic
 * update đổi nó. Nếu tấm đã có mặt trong hàng, gốc CŨ được giữ nguyên (đây mới
 * là gốc thật để so sánh triệt tiêu) — tham số truyền vào lần gọi sau bị bỏ qua.
 */
export function themVaoHangCho(
  hangCho: HangChoMuc[],
  op: HangChoOp,
  gocTruocKhiVaoHang: "selected" | null,
): HangChoMuc[] {
  const idx = hangCho.findIndex((m) => m.photoId === op.photoId);
  const mucCu = idx >= 0 ? hangCho[idx] : undefined;
  const goc = mucCu ? mucCu.gocTruocKhiVaoHang : gocTruocKhiVaoHang;

  // Mark mới trùng gốc: coi như tấm này chưa từng đổi gì — bỏ khỏi hàng chờ
  // (hoặc không thêm nếu chưa có mặt).
  if (op.mark === goc) {
    if (idx < 0) return hangCho;
    return [...hangCho.slice(0, idx), ...hangCho.slice(idx + 1)];
  }

  const mucMoi: HangChoMuc = { photoId: op.photoId, mark: op.mark, gocTruocKhiVaoHang: goc };
  if (idx < 0) return [...hangCho, mucMoi];
  return [...hangCho.slice(0, idx), mucMoi, ...hangCho.slice(idx + 1)];
}

/** Hai mảng op cùng nội dung (thứ tự và giá trị) — dùng để biết một lô có đổi hay không. */
function opsTrungNhau(a: HangChoOp[], b: HangChoOp[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return !!y && x.photoId === y.photoId && x.mark === y.mark;
  });
}

/**
 * Lấy lô kế tiếp để gửi (tối đa `TOI_DA_MOT_LO` op — giới hạn của
 * `SelectionPatchSchema`).
 *
 * `loDangGui` là lô đang/đã thử gửi gần nhất (nếu có). Nội dung lô kế tiếp
 * TRÙNG với nó (cùng photoId, cùng mark, cùng thứ tự) thì trả lại NGUYÊN lô
 * cũ — giữ `clientOpId` không đổi, để máy chủ nhận ra một lượt gửi lại là
 * thao tác cũ (RPC `patch_selection_batch` idempotent theo `clientOpId`,
 * xem `src/lib/selection/mutate.ts`). Nội dung khác (hàng chờ đổi trong lúc
 * chờ) thì sinh `clientOpId` mới cho lô mới.
 *
 * Hàng chờ rỗng thì trả `null` — không có gì để gửi.
 */
export function layLoGui(hangCho: HangChoMuc[], loDangGui: LoGui | null): LoGui | null {
  if (hangCho.length === 0) return null;
  const ops = hangCho.slice(0, TOI_DA_MOT_LO).map((m) => ({ photoId: m.photoId, mark: m.mark }));
  if (loDangGui && opsTrungNhau(loDangGui.ops, ops)) {
    return loDangGui;
  }
  return { clientOpId: crypto.randomUUID(), ops };
}

/**
 * Bỏ khỏi hàng chờ những op đã gửi THÀNH CÔNG.
 *
 * So theo `photoId` VÀ `mark`: nếu ba mẹ đổi ý thêm lần nữa trong lúc lô cũ
 * đang trên đường đi (mark trong hàng chờ hiện tại khác với mark đã gửi),
 * KHÔNG bỏ — vẫn còn một thay đổi mới hơn chưa được máy chủ biết tới.
 */
export function boDaGui(hangCho: HangChoMuc[], daGui: HangChoOp[]): HangChoMuc[] {
  return hangCho.filter((muc) => {
    const gui = daGui.find((d) => d.photoId === muc.photoId);
    if (!gui) return true;
    return gui.mark !== muc.mark;
  });
}
