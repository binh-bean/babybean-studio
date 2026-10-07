/**
 * BB-390 — POST /api/g/album-cover: chỉ chủ link (`owner`) và người cùng chọn
 * (`co_editor`) đặt được bìa album; người thân chỉ gợi ý (`suggester`) và
 * người xem (`viewer`) bị chặn TRƯỚC khi chạm cơ sở dữ liệu.
 *
 * Giả lập biên ngoài: `requirePhienBoAnh` (phiên khách) và `createAdminClient`
 * (không được gọi khi bị chặn). Không giả lập React, không đọc mã nguồn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GallerySessionError } from "@/lib/auth/gallery-session";

const vaiPhien = { hienTai: "owner" as string };
const goiAdmin = vi.fn();

vi.mock("@/lib/auth/phien-bo-anh", () => ({
  requirePhienBoAnh: vi.fn(async (_req: unknown, allowed?: readonly string[]) => {
    if (allowed && !allowed.includes(vaiPhien.hienTai)) throw new GallerySessionError("FORBIDDEN");
    return { galleryId: "g-fixture", selectionId: "s-fixture", role: vaiPhien.hienTai };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    goiAdmin();
    throw new Error("không được chạm DB trong phép thử này");
  },
}));

async function goi(vai: string) {
  vaiPhien.hienTai = vai;
  const { POST } = await import("@/app/api/g/album-cover/route");
  const req = new Request("http://localhost/api/g/album-cover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      galleryItemId: "00000000-0000-4000-8000-000000000001",
      photoId: "00000000-0000-4000-8000-000000000002",
    }),
  });
  return POST(req as never);
}

describe("BB-390 · ai đặt được bìa album", () => {
  beforeEach(() => goiAdmin.mockClear());

  it("người thân chỉ gợi ý (suggester) bị chặn 403, không chạm DB", async () => {
    const res = await goi("suggester");
    expect(res.status).toBe(403);
    expect(goiAdmin).not.toHaveBeenCalled();
  });

  it("người xem (viewer) bị chặn 403", async () => {
    const res = await goi("viewer");
    expect(res.status).toBe(403);
    expect(goiAdmin).not.toHaveBeenCalled();
  });

  it("chủ link và người cùng chọn qua được cửa vai (đi tiếp tới bước đọc DB)", async () => {
    for (const vai of ["owner", "co_editor"]) {
      goiAdmin.mockClear();
      const res = await goi(vai);
      expect(res.status).not.toBe(403);
      expect(goiAdmin).toHaveBeenCalledTimes(1);
    }
  });
});
