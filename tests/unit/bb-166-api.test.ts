import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { GET } from "@/app/api/g/gallery/route";
import * as authSession from "@/lib/auth/gallery-session";
import { createClient } from "@supabase/supabase-js";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: async () => {
      return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    }
  }
});

describe("BB-166 API Route", () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Phep thu nay GHI vao settings cua bb-dev, khong phai mot ban gia lap.
  // Khong tra lai gia tri cu thi moi lan chay `npm run test` la
  // `chat.page_url` bi bo lai o gia tri cua ca cuoi cung — mot object —
  // va nut nhan tin BIEN MAT khoi app that cho toi khi co nguoi phat hien.
  // Da do that ngay 16/09/2026 truoc khi vá.
  let goc: unknown = null;

  beforeAll(async () => {
    const { data } = await supabase
      .from("settings").select("value").eq("key", "chat.page_url").is("branch_id", null).maybeSingle();
    goc = data?.value ?? null;
  });

  afterAll(async () => {
    await supabase
      .from("settings").update({ value: goc } as never).eq("key", "chat.page_url").is("branch_id", null);
  });

  it("GET /api/g/gallery trả về chatUrl hợp lệ và không rò rỉ settings khác", async () => {
    const { data: gallery } = await supabase.from("galleries").select("id").limit(1).single() as { data: { id: string } | null };
    const { data: selection } = await supabase.from("selections").select("id").eq("gallery_id", gallery!.id).limit(1).single() as { data: { id: string } | null };
    
    // Fallback if no selection exists
    const selId = selection ? selection.id : "00000000-0000-0000-0000-000000000000";

    await supabase.from("settings").update({ value: "https://m.me/113878833349843" } as never).eq("key", "chat.page_url").is("branch_id", null);
    
    vi.spyOn(authSession, "requireGallerySession").mockResolvedValue({
      galleryId: gallery!.id,
      selectionId: selId,
      shareLinkId: "link-1",
      customerId: "cust-1",
      role: "owner",
      exp: Date.now() + 10000,
    } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    
    expect(json.data.branch.chatUrl).toBe("https://m.me/113878833349843");
    
    const keys = Object.keys(json.data.branch);
    expect(keys.includes("settings")).toBe(false);
  });

  it("GET /api/g/gallery không trả chatUrl nếu giá trị không hợp lệ", async () => {
    const { data: gallery } = await supabase.from("galleries").select("id").limit(1).single() as { data: { id: string } | null };
    const { data: selection } = await supabase.from("selections").select("id").eq("gallery_id", gallery!.id).limit(1).single() as { data: { id: string } | null };
    
    const selId = selection ? selection.id : "00000000-0000-0000-0000-000000000000";

    vi.spyOn(authSession, "requireGallerySession").mockResolvedValue({
      galleryId: gallery!.id,
      selectionId: selId,
      shareLinkId: "link-1",
      customerId: "cust-1",
      role: "owner",
      exp: Date.now() + 10000,
    } as never);

    // Case 1: http string
    await supabase.from("settings").update({ value: "http://m.me/113878833349843" } as never).eq("key", "chat.page_url").is("branch_id", null);
    let res = await GET();
    let json = await res.json();
    expect(json.data.branch.chatUrl).toBeNull();

    // Case 2: Object
    await supabase.from("settings").update({ value: { url: "https://m.me/113878833349843" } } as never).eq("key", "chat.page_url").is("branch_id", null);
    res = await GET();
    json = await res.json();
    expect(json.data.branch.chatUrl).toBeNull();
  });
});