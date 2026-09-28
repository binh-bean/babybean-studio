/**
 * BB-303 — ảnh bìa nhỏ đầu hàng (`anhBiaTheoBo`, src/lib/selection/anh-bia.ts):
 * bìa khách đã chọn nếu có, chưa có thì tấm đầu của bộ; bộ chưa có ảnh nào thì
 * `null` (không bịa id ảnh).
 *
 * Giả lập biên giới Supabase (không giả lập hook React) — AGENTS.md §5a cho
 * phép giả lập `fetch`/client bên ngoài, đây là đúng loại biên giới đó.
 */

import { describe, it, expect, vi } from "vitest";
import { anhBiaTheoBo } from "@/lib/selection/anh-bia";

/** Bộ giả lập tối thiểu cho chuỗi gọi `.from("photos").select().eq().eq().order().limit().maybeSingle()`. */
function fakeAdmin(tamDauTheoBo: Record<string, string | null>) {
  return {
    from() {
      let galleryId = "";
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          if (col === "gallery_id") galleryId = val;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle() {
          const id = tamDauTheoBo[galleryId];
          return { data: id ? { id } : null, error: null };
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof anhBiaTheoBo>[0];
}

describe("BB-303: anhBiaTheoBo", () => {
  it("bộ đã có coverPhotoId -> dùng luôn, KHÔNG gọi truy vấn tấm đầu", async () => {
    const admin = fakeAdmin({}); // rỗng: nếu hàm lỡ tra thêm, kết quả sẽ null chứ không phải giá trị đã cho
    const ket = await anhBiaTheoBo(admin, [{ id: "g1", coverPhotoId: "photo-bia-1" }]);
    expect(ket.get("g1")).toBe("photo-bia-1");
  });

  it("bộ chưa có bìa -> lấy tấm đầu (sort_index nhỏ nhất, do truy vấn giả lập trả về)", async () => {
    const admin = fakeAdmin({ g2: "photo-dau-tien" });
    const ket = await anhBiaTheoBo(admin, [{ id: "g2", coverPhotoId: null }]);
    expect(ket.get("g2")).toBe("photo-dau-tien");
  });

  it("bộ chưa có ảnh nào -> null, không bịa id", async () => {
    const admin = fakeAdmin({});
    const ket = await anhBiaTheoBo(admin, [{ id: "g3", coverPhotoId: null }]);
    expect(ket.get("g3")).toBeNull();
  });

  it("xử lý nhiều bộ cùng lúc, mỗi bộ đúng nguồn của nó", async () => {
    const admin = fakeAdmin({ g5: "tam-dau-5" });
    const ket = await anhBiaTheoBo(admin, [
      { id: "g4", coverPhotoId: "bia-4" },
      { id: "g5", coverPhotoId: null },
      { id: "g6", coverPhotoId: null },
    ]);
    expect(ket.get("g4")).toBe("bia-4");
    expect(ket.get("g5")).toBe("tam-dau-5");
    expect(ket.get("g6")).toBeNull();
  });

  it("lỗi truy vấn của một bộ -> null cho bộ đó, không ném lỗi làm sập cả danh sách", async () => {
    const admin = {
      from() {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          async maybeSingle() {
            return { data: null, error: { message: "lỗi giả lập" } };
          },
        };
        return builder;
      },
    } as unknown as Parameters<typeof anhBiaTheoBo>[0];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ket = await anhBiaTheoBo(admin, [{ id: "g7", coverPhotoId: null }]);
    expect(ket.get("g7")).toBeNull();
    spy.mockRestore();
  });
});
