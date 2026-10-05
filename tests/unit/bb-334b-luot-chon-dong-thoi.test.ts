/**
 * BB-334B — `layHoacTaoLuotChon` khi HAI lượt gọi cùng lần đầu mở một bộ:
 * cả hai thấy "chưa có", cả hai chèn; lượt thua vấp khoá duy nhất (23505).
 * Trước bản vá lượt thua ném lỗi → `/api/g/gallery` 500 (bắt được ở e2e
 * bb-334b: tab 2 mở bộ 2 lần đầu → màn lỗi). Nay đọc lại dòng lượt thắng đã tạo.
 *
 * Cơ sở dữ liệu là biên giới ngoài → giả lập client Supabase tối thiểu.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { layHoacTaoLuotChon } from "@/lib/selection/luot-chon-theo-link";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Client giả: mọi select trả `docRa()` theo thứ tự gọi; insert trả lỗi trùng khoá. */
function clientGia(docRa: Array<{ id: string } | null>) {
  let lan = 0;
  const truyVan = () => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data: docRa[lan++] ?? null, error: null });
    q.insert = () => ({
      select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) }),
    });
    return q;
  };
  return { from: () => truyVan() } as unknown as SupabaseClient;
}

describe("layHoacTaoLuotChon — hai lượt cùng lúc", () => {
  it("link gia đình owner: chèn vấp 23505 → trả lượt CHÍNH lượt kia vừa tạo", async () => {
    // 1) tìm lượt chính: chưa có · 2) tìm theo cặp: chưa có · 3) kiểm chính trước khi chèn: chưa có
    // → chèn vấp 23505 → 4) đọc lại lượt chính: có.
    const admin = clientGia([null, null, null, { id: "luot-thang" }]);
    await expect(
      layHoacTaoLuotChon(admin, { shareLinkId: "l", galleryId: "g", laKhachChinh: true, laLinkGiaDinh: true }),
    ).resolves.toBe("luot-thang");
  });

  it("link theo bộ / người xem: đọc lại theo cặp (link, bộ)", async () => {
    const admin = clientGia([null, { id: "cap" }]);
    await expect(
      layHoacTaoLuotChon(admin, { shareLinkId: "l", galleryId: "g", laKhachChinh: false }),
    ).resolves.toBe("cap");
  });

  it("23505 mà đọc lại vẫn không thấy → vẫn ném (không nuốt lỗi thật)", async () => {
    const admin = clientGia([null, null, null]);
    await expect(
      layHoacTaoLuotChon(admin, { shareLinkId: "l", galleryId: "g", laKhachChinh: false }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
