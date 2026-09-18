/**
 * BB-187 — Mã trên thanh địa chỉ thắng phiên trong máy.
 *
 * Lỗi: ba mẹ bấm link bộ ảnh của nhà mình, màn hiện ảnh của NHÀ KHÁC. Xảy ra
 * khi trình duyệt còn giữ phiên CÒN HẠN của một link khác — máy chủ trả 200
 * theo phiên đó, và mã trên thanh địa chỉ không được nhìn tới lần nào.
 *
 * BB-157 trước đây chỉ vá ca phiên ĐÃ HỎNG (401/410/403). Ca này phiên còn
 * sống, nên không nhánh nào bắt được.
 *
 * Ba ca dưới đây khoá chặt nguyên tắc: mã trên địa chỉ là nguồn đúng.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { GET } from "@/app/api/g/gallery/route";
import * as authSession from "@/lib/auth/gallery-session";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: async () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ),
}));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MA_A = "Fixture-BB187-token-cua-nha-A";
const MA_B = "Fixture-BB187-token-cua-nha-B";

function duong(ma?: string) {
  return new Request(
    ma
      ? `http://localhost/api/g/gallery?token=${encodeURIComponent(ma)}`
      : "http://localhost/api/g/gallery",
  );
}

describe("BB-187 — phiên của bộ khác không được thắng mã trên địa chỉ", () => {
  let boA = "";
  let boB = "";
  let linkA = "";
  let linkB = "";
  let luotChonA = "";

  beforeAll(async () => {
    // HAI bộ ảnh KHÁC NHAU — đó là cả nội dung của phép thử này. Lấy bộ đã có
    // lượt chọn để đường /api/g/gallery đi hết được nhánh thành công.
    const { data } = (await supabase
      .from("selections")
      .select("id, gallery_id")
      .limit(2)) as { data: { id: string; gallery_id: string }[] | null };

    if (!data || data.length < 2) throw new Error("Cần ít nhất 2 lượt chọn để chạy ca này.");
    const [a, b] = data;
    boA = a!.gallery_id;
    luotChonA = a!.id;
    boB = b!.gallery_id;

    const themLink = async (bo: string, ma: string) => {
      const { data: r, error } = (await supabase
        .from("share_links")
        .insert({
          gallery_id: bo,
          token_hash: await bamMaLink(ma),
          token_prefix: ma.slice(0, 6),
          role: "owner",
          label: "Fixture BB-187",
          status: "active",
        } as never)
        .select("id")
        .single()) as { data: { id: string } | null; error: unknown };
      if (!r) throw new Error(`Không tạo được link thử: ${JSON.stringify(error)}`);
      return r.id;
    };

    linkA = await themLink(boA, MA_A);
    linkB = await themLink(boB, MA_B);
  });

  afterAll(async () => {
    // Dọn sạch: bb-dev mang dữ liệu khách THẬT, link thử để lại là link sống.
    await supabase.from("share_links").delete().in("id", [linkA, linkB].filter(Boolean));
  });

  /** Phiên đang cầm trỏ vào bộ A. */
  function phienCuaA() {
    vi.spyOn(authSession, "requireGallerySession").mockResolvedValue({
      galleryId: boA,
      selectionId: luotChonA,
      shareLinkId: linkA,
      customerId: null,
      role: "owner",
      exp: Date.now() + 600_000,
    } as never);
  }

  it("phiên bộ A + mã bộ B trên địa chỉ → 409, KHÔNG trả ảnh bộ A", async () => {
    phienCuaA();
    const res = await GET(duong(MA_B));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("SESSION_MISMATCH");

    // Chốt nặng nhất: không một mẩu nào của bộ A lọt ra ngoài.
    expect(JSON.stringify(json)).not.toContain(boA);
  });

  it("phiên bộ A + mã bộ A trên địa chỉ → vẫn vào bình thường", async () => {
    phienCuaA();
    const res = await GET(duong(MA_A));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(boA);
  });

  it("mã lạ không có trong cơ sở dữ liệu → 409, không rơi về phiên cũ", async () => {
    phienCuaA();
    const res = await GET(duong("Fixture-BB187-ma-khong-ton-tai"));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SESSION_MISMATCH");
  });
});
