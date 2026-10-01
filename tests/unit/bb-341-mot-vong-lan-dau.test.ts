/**
 * BB-341 — lần đầu mở link: MỘT vòng thay vì ba.
 *
 * Trước bản vá: chưa có cookie thì `GET /api/g/gallery?token=…` trả 401, màn
 * khách phải POST /api/auth/gallery rồi GET lại — ba vòng nối đuôi.
 * Sau bản vá: chính lượt GET đầu đổi mã lấy phiên (cùng lõi `dangNhapBangMa`
 * với POST), trả dữ liệu VÀ đặt cookie trên cùng phản hồi.
 *
 * Giả lập ở BIÊN: phiên cookie (ném "chưa đăng nhập") và lõi đổi mã (đã có
 * phép thử riêng: tests/security/gallery-auth.test.ts, bb-183, bb-148…).
 * Phần dựng dữ liệu bộ ảnh chạy THẬT, chỉ ĐỌC bb-dev (không ghi gì).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: async () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
}));
const dangNhap = vi.fn();
vi.mock("@/lib/auth/dang-nhap-bang-ma", async (goc) => ({
  ...(await goc<typeof import("@/lib/auth/dang-nhap-bang-ma")>()),
  dangNhapBangMa: (...a: unknown[]) => dangNhap(...a),
}));

import { GET } from "@/app/api/g/gallery/route";
import * as authSession from "@/lib/auth/gallery-session";
import { GallerySessionError } from "@/lib/auth/gallery-session";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const MA = "Fixture-BB341-ma-thu-khong-ton-tai";

let boAnh = "";
let luotChon = "";

beforeAll(async () => {
  const { data } = (await supabase.from("selections").select("id, gallery_id").limit(1)) as {
    data: { id: string; gallery_id: string }[] | null;
  };
  if (!data?.length) throw new Error("Cần ít nhất 1 lượt chọn để chạy ca này.");
  boAnh = data[0]!.gallery_id;
  luotChon = data[0]!.id;
});

beforeEach(() => {
  dangNhap.mockReset();
  // Trình duyệt CHƯA có cookie phiên.
  vi.spyOn(authSession, "requireGallerySession").mockRejectedValue(new GallerySessionError("UNAUTHENTICATED"));
});

describe("BB-341 — GET /api/g/gallery lần đầu (chưa có phiên)", () => {
  it("có ?token= hợp lệ → 200 + dữ liệu bộ ảnh + cookie phiên, KHÔNG cần POST riêng", async () => {
    dangNhap.mockResolvedValue({
      ok: true,
      phien: { galleryId: boAnh, selectionId: luotChon, shareLinkId: "x", customerId: "", role: "owner" },
      cookie: { token: "phien-thu.chu-ky", expiresAt: new Date(Date.now() + 3600_000) },
    });

    const res = await GET(new Request(`http://localhost/api/g/gallery?token=${MA}`));

    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(boAnh);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/bb_gs=phien-thu\.chu-ky/);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/HttpOnly/i);
    expect(dangNhap).toHaveBeenCalledTimes(1);
    expect(dangNhap.mock.calls[0]![0]).toBe(MA);
  });

  it("mã hỏng/thu hồi → lỗi của lõi đổi mã kèm `daThuMa` (màn khách không POST lại), không cookie", async () => {
    dangNhap.mockResolvedValue({ ok: false, code: "NOT_FOUND" });

    const res = await GET(new Request(`http://localhost/api/g/gallery?token=${MA}`));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.details.daThuMa).toBe(true);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("không có ?token= → 401 như cũ, không đổi mã gì", async () => {
    const res = await GET(new Request("http://localhost/api/g/gallery"));
    expect(res.status).toBe(401);
    expect(dangNhap).not.toHaveBeenCalled();
  });
});
