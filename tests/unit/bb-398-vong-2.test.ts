/**
 * BB-398 vòng 2:
 *   a) Esc / Tab chỉ thuộc lớp TRÊN CÙNG: màn treo tường / album trên bàn mở đè cửa hàng
 *      thì Esc đóng màn trên, cửa hàng bên dưới KHÔNG đóng.
 *   b) Màn mời người thân mua (`/api/g/mua-them`): khung LẺ không ảnh được nhận (cùng luật
 *      `batBuocChonAnh` với cửa hàng); ảnh in không ảnh vẫn bị từ chối.
 *
 * Thuần: ngăn xếp lớp + bộ xử lý phím THẬT của hook (`taoXuLyPhimHopThoai` là đúng hàm
 * `useBayFocusHopThoai` gắn vào `document`), không giả lập hook React. Route dựng thật, chỉ
 * giả lập biên ngoài (phiên khách, client Supabase trong bộ nhớ; Lark cấm gọi).
 */
import { describe, it, expect, vi } from "vitest";
import { moLop, dongLop, laLopTrenCung, taoXuLyEscLopTren } from "@/lib/utils/lop-hop-thoai";
import { taoXuLyPhimHopThoai } from "@/lib/utils/bay-focus-hop-thoai";

const phim = (key: string) => ({ key, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });

describe("BB-398 a) Esc chỉ đóng lớp trên cùng", () => {
  it("màn treo / album mở đè cửa hàng: Esc đóng màn trên, cửa hàng KHÔNG đóng; đóng màn trên rồi Esc mới đóng cửa hàng", () => {
    const dongCuaHang = vi.fn();
    const dongManTren = vi.fn();
    const lopCuaHang = moLop();
    const xuLyCuaHang = taoXuLyPhimHopThoai({ laTren: () => laLopTrenCung(lopCuaHang), onDong: dongCuaHang, xuLyTab: vi.fn() });

    const lopTren = moLop();
    const xuLyTren = taoXuLyEscLopTren(() => laLopTrenCung(lopTren), dongManTren);

    // Cùng một lần bấm Esc tới cả hai bộ xử lý (thứ tự không quan trọng).
    const e = phim("Escape");
    xuLyCuaHang(e);
    xuLyTren(e);
    expect(dongManTren).toHaveBeenCalledTimes(1);
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
    expect(dongCuaHang).not.toHaveBeenCalled();

    dongLop(lopTren);
    xuLyCuaHang(phim("Escape"));
    expect(dongCuaHang).toHaveBeenCalledTimes(1);
    dongLop(lopCuaHang);
  });

  it("Tab khi màn trên đang mở: cửa hàng không kéo focus về (không chạy bẫy Tab)", () => {
    const xuLyTab = vi.fn();
    const lopCuaHang = moLop();
    const xuLy = taoXuLyPhimHopThoai({ laTren: () => laLopTrenCung(lopCuaHang), onDong: vi.fn(), xuLyTab });
    const lopTren = moLop();
    xuLy(phim("Tab"));
    expect(xuLyTab).not.toHaveBeenCalled();
    dongLop(lopTren);
    xuLy(phim("Tab"));
    expect(xuLyTab).toHaveBeenCalledTimes(1);
    dongLop(lopCuaHang);
  });

  it("lớp lồng mở sau (album trong cửa hàng) nằm trên; đóng lệch thứ tự vẫn đúng", () => {
    const a = moLop();
    const b = moLop();
    const c = moLop();
    expect(laLopTrenCung(c)).toBe(true);
    dongLop(b);
    expect(laLopTrenCung(c)).toBe(true);
    dongLop(c);
    expect(laLopTrenCung(a)).toBe(true);
    dongLop(a);
    expect(laLopTrenCung(a)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// b) /api/g/mua-them — khung lẻ không ảnh
// ---------------------------------------------------------------------------
type Hang = Record<string, unknown>;
const bang: Record<string, Hang[]> = {
  galleries: [{ id: "g1", branch_id: "b1", status: "ready", title: "Fixture BB-398" }],
  products: [
    { id: "00000000-0000-4000-8000-0000000000a1", name: "Gỗ 40x60", kind: "print", material: "Gỗ", size: "40x60", list_price: 600000, price_confidence: 1, price_samples: 20, is_active: true },
    { id: "00000000-0000-4000-8000-0000000000b1", name: "Khung HQ 40x60", kind: "print", material: "Khung HQ", size: "40x60", list_price: 450000, price_confidence: 1, price_samples: 20, is_active: true },
  ],
};
function truyVan(ten: string) {
  const loc: Array<(h: Hang) => boolean> = [];
  const chay = () => (bang[ten] ?? []).filter((h) => loc.every((f) => f(h)));
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (loc.push((h) => h[c] === v), b),
    in: (c: string, v: unknown[]) => (loc.push((h) => v.includes(h[c])), b),
    single: async () => ({ data: chay()[0] ?? null, error: chay()[0] ? null : { message: "không có" } }),
    maybeSingle: async () => ({ data: chay()[0] ?? null, error: null }),
    then: (ok: (v: { data: Hang[]; error: null }) => unknown) => Promise.resolve(ok({ data: chay(), error: null })),
  };
  return b;
}

vi.mock("@/lib/auth/phien-bo-anh", () => ({
  // Ba mẹ (owner): route kiểm xong sản phẩm rồi mới trả 409 "đường này đã nghỉ" — không ghi gì.
  requirePhienBoAnh: vi.fn(async () => ({ galleryId: "g1", selectionId: "s1", role: "owner", shareLinkId: "l1" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (ten: string) => truyVan(ten) }),
}));
vi.mock("@/lib/lark/notify", () => ({
  enqueueLarkNotification: () => {
    throw new Error("không được gọi Lark trong phép thử");
  },
  cheSoDienThoai: (s: string) => s,
}));

async function goi(items: Array<{ productId: string; photoId?: string | null; soLuong: number }>) {
  const { POST } = await import("@/app/api/g/mua-them/route");
  const res = await POST(
    new Request("http://localhost/api/g/mua-them", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
  return { status: res.status, json: (await res.json()) as { error?: { code?: string; message?: string } } };
}

describe("BB-398 b) /api/g/mua-them — khung lẻ không ảnh như cửa hàng", () => {
  it("khung không ảnh QUA khâu kiểm sản phẩm (không còn 400 'chọn ảnh')", async () => {
    const r = await goi([{ productId: "00000000-0000-4000-8000-0000000000b1", photoId: null, soLuong: 1 }]);
    expect(r.status).not.toBe(400);
    // Ba mẹ: đường này đã nghỉ (BB-321) — 409 chỉ đến SAU khi mọi dòng hợp lệ.
    expect(r.status).toBe(409);
  });
  it("ảnh in không ảnh vẫn bị từ chối 400", async () => {
    const r = await goi([{ productId: "00000000-0000-4000-8000-0000000000a1", photoId: null, soLuong: 1 }]);
    expect(r.status).toBe(400);
  });
});
