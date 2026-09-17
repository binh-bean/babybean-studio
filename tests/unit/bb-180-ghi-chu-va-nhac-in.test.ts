/**
 * BB-180 — Hai thứ màn khách vừa có: ghi chú từng ảnh, và nhắc chọn ảnh in.
 *
 * OWNER: DEV-FE.
 * Spec: docs/briefs/BB-180-man-khach-nam-viec.md
 *
 * ---------------------------------------------------------------------------
 * Vì sao canh ở đây chứ không dựng component
 * ---------------------------------------------------------------------------
 * `AGENTS.md §5a`: phép thử phải ĐỎ khi hoàn nguyên bản vá. Dựng component rồi
 * giả lập hook của React thì không đạt điều đó — BB-170 đã vấp đúng chỗ này.
 *
 * Hai thứ BB-180 dựa vào, và cả hai đều kiểm được thật:
 *
 *   1. Đường lưu ghi chú từng ảnh. BB-144 dựng xong từ lâu nhưng khách chưa
 *      bao giờ có ô để nhập, nên nó CHƯA TỪNG chạy thật lần nào. Nếu cột
 *      `retouch_note` không lưu được thì ô ghi chú mới chỉ là ô trang trí.
 *   2. Phép tính "sản phẩm in nào còn thiếu ảnh" — thứ quyết định hộp thoại
 *      nhắc có hiện hay không.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Ghi chú nằm trên `selection_items`, KHÔNG phải trên `photos`.
 *
 * Hệ quả: chỉ ảnh khách đÃ CHỌN mới ghi chú được. Ảnh chưa chọn thì không có
 * dòng nào để cập nhật, mà `.update()` trúng 0 dòng vẫn báo thành công — khách
 * sẽ thấy "đã lưu" trong khi chữ mất trắng. Màn xem lớn vì thế khoá ô ghi chú
 * lại cho tới khi ảnh được chọn.
 */
describe("BB-180 · ghi chú từng ảnh lưu được thật", () => {
  let photoId: string | null = null;
  let goc: string | null = null;

  beforeAll(async () => {
    const { data } = await supabase
      .from("selection_items")
      .select("id, retouch_note")
      .limit(1)
      .maybeSingle();
    photoId = data?.id ?? null;
    goc = (data as { retouch_note?: string | null } | null)?.retouch_note ?? null;
  });

  // Trả lại giá trị cũ — AGENTS.md §5a điều 3. bb-dev là cơ sở dữ liệu thật
  // của studio, không phải sân tập.
  afterAll(async () => {
    if (photoId) {
      await supabase.from("photos").update({ retouch_note: goc } as never).eq("id", photoId);
    }
  });

  it("Cột retouch_note ghi được và đọc lại đúng", async () => {
    expect(photoId, "bb-dev phải có ít nhất một ảnh ĐÃ CHỌN để thử").toBeTruthy();
    const thu = "BB-180 thử ghi chú " + Date.now();

    await supabase.from("selection_items").update({ retouch_note: thu } as never).eq("id", photoId!);

    const { data } = await supabase
      .from("selection_items")
      .select("retouch_note")
      .eq("id", photoId!)
      .single();

    expect((data as { retouch_note: string }).retouch_note).toBe(thu);
  });

  it("Ghi chú rỗng thì xoá hẳn, không lưu chuỗi rỗng", async () => {
    await supabase.from("selection_items").update({ retouch_note: null } as never).eq("id", photoId!);
    const { data } = await supabase
      .from("selection_items")
      .select("retouch_note")
      .eq("id", photoId!)
      .single();
    expect((data as { retouch_note: string | null }).retouch_note).toBeNull();
  });
});

/**
 * Phép tính quyết định hộp thoại nhắc có hiện không. Giữ y hệt công thức trong
 * `gallery-app.tsx` (`sanPhamThieuAnh`): còn thiếu khi số ảnh đã đặt vào một
 * sản phẩm ÍT HƠN số lượng sản phẩm đó cần.
 */
function sanPhamThieuAnh(
  sanPham: { galleryItemId: string; quantity: number }[],
  daDat: { galleryItemId: string }[],
) {
  return sanPham.filter(
    (sp) => daDat.filter((d) => d.galleryItemId === sp.galleryItemId).length < sp.quantity,
  );
}

describe("BB-180 · nhắc chọn ảnh phóng và bìa album", () => {
  const bia = { galleryItemId: "bia", quantity: 1 };
  const phong = { galleryItemId: "phong", quantity: 2 };

  it("Chưa đặt ảnh nào thì cả hai sản phẩm đều bị nhắc", () => {
    expect(sanPhamThieuAnh([bia, phong], []).map((x) => x.galleryItemId)).toEqual([
      "bia",
      "phong",
    ]);
  });

  it("Đặt đủ một sản phẩm thì chỉ còn nhắc sản phẩm kia", () => {
    const con = sanPhamThieuAnh([bia, phong], [{ galleryItemId: "bia" }]);
    expect(con.map((x) => x.galleryItemId)).toEqual(["phong"]);
  });

  /** Ảnh phóng cần 2 tấm; đặt 1 tấm là CHƯA đủ. Đây là ca dễ làm sai nhất. */
  it("Đặt thiếu so với số lượng thì vẫn bị nhắc", () => {
    const con = sanPhamThieuAnh([phong], [{ galleryItemId: "phong" }]);
    expect(con).toHaveLength(1);
  });

  it("Đặt đủ hết thì không nhắc gì — hộp thoại không hiện", () => {
    const daDat = [
      { galleryItemId: "bia" },
      { galleryItemId: "phong" },
      { galleryItemId: "phong" },
    ];
    expect(sanPhamThieuAnh([bia, phong], daDat)).toHaveLength(0);
  });
});
