// BB-352 — donFixtureTheoId không được nuốt lỗi xoá.
//
// Bản giả chỉ giả lập BIÊN GIỚI (supabase-js trả { error } chứ không ném); logic
// của hàm — thứ tự, gom lỗi, đọc lại — chạy thật.

import { describe, it, expect } from "vitest";
import { donFixtureTheoId, type KhachSupabaseToiThieu } from "../fixtures/don-dep-theo-id";

type Bang = Record<string, Set<string>>;

/** Một "cơ sở dữ liệu" nhỏ: mỗi bảng là tập id. `hong` chứa bảng mà lệnh xoá trả { error }. */
function taoGia(duLieu: Bang, opts: { hongKhiXoa?: string[]; xoaGia?: string[] } = {}) {
  const nhatKy: string[] = [];
  const client: KhachSupabaseToiThieu = {
    from(bang) {
      return {
        delete() {
          return {
            async in(_cot, ids) {
              nhatKy.push(`delete ${bang}`);
              if (opts.hongKhiXoa?.includes(bang)) return { error: { message: `giả lập hỏng ${bang}` } };
              // "xoaGia": báo thành công nhưng KHÔNG xoá gì — đúng hình dạng lỗi im lặng đã xảy ra.
              if (!opts.xoaGia?.includes(bang)) for (const id of ids) duLieu[bang]?.delete(id);
              return { error: null };
            },
          };
        },
        select() {
          return {
            async in(_cot, ids) {
              nhatKy.push(`select ${bang}`);
              return { data: ids.filter((id) => duLieu[bang]?.has(id)).map((id) => ({ id })), error: null };
            },
          };
        },
      };
    },
  };
  return { client, nhatKy };
}

describe("donFixtureTheoId", () => {
  it("xoá bộ ảnh rồi sản phẩm, đọc lại, và không ném khi mọi thứ sạch", async () => {
    const duLieu: Bang = { galleries: new Set(["g1"]), products: new Set(["p1", "p2"]) };
    const { client, nhatKy } = taoGia(duLieu);
    await expect(donFixtureTheoId(client, { galleryIds: ["g1"], productIds: ["p1", "p2"] })).resolves.toBeUndefined();
    expect(duLieu.galleries!.size).toBe(0);
    expect(duLieu.products!.size).toBe(0);
    expect(nhatKy.indexOf("delete galleries")).toBeLessThan(nhatKy.indexOf("delete products"));
  });

  it("xoá hỏng (trả { error }) thì NÉM, nêu đích danh bảng — không nuốt như bản cũ", async () => {
    const duLieu: Bang = { galleries: new Set(["g1"]), products: new Set(["p1"]) };
    const { client } = taoGia(duLieu, { hongKhiXoa: ["products"] });
    await expect(donFixtureTheoId(client, { galleryIds: ["g1"], productIds: ["p1"] })).rejects.toThrow(
      /xoá products: giả lập hỏng products/,
    );
  });

  it("một lượt hỏng không bỏ rơi lượt sau: bộ ảnh hỏng thì sản phẩm vẫn được thử xoá", async () => {
    const duLieu: Bang = { galleries: new Set(["g1"]), products: new Set(["p1"]) };
    const { client, nhatKy } = taoGia(duLieu, { hongKhiXoa: ["galleries"] });
    await expect(donFixtureTheoId(client, { galleryIds: ["g1"], productIds: ["p1"] })).rejects.toThrow(/galleries/);
    expect(nhatKy).toContain("delete products");
    expect(duLieu.products!.size).toBe(0);
  });

  it("báo xoá thành công mà dòng vẫn còn (lỗi im lặng) thì ĐỌC LẠI và NÉM", async () => {
    const duLieu: Bang = { galleries: new Set(), products: new Set(["p1", "p2"]) };
    const { client } = taoGia(duLieu, { xoaGia: ["products"] });
    await expect(donFixtureTheoId(client, { productIds: ["p1", "p2"] })).rejects.toThrow(
      /products còn 2\/2 dòng sau khi xoá/,
    );
  });

  it("danh sách rỗng thì không gọi gì", async () => {
    const { client, nhatKy } = taoGia({});
    await donFixtureTheoId(client, {});
    expect(nhatKy).toEqual([]);
  });
});
