import { describe, it, expect, vi } from "vitest";
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

  it("GET /api/g/gallery trả về chatUrl hợp lệ và không rò rỉ settings khác", async () => {
    const { data: gallery } = await supabase.from("galleries").select("id").limit(1).single() as any;
    const { data: selection } = await supabase.from("selections").select("id").eq("gallery_id", gallery!.id).limit(1).single() as any;
    
    // Fallback if no selection exists
    const selId = selection ? selection.id : "00000000-0000-0000-0000-000000000000";

    await supabase.from("settings").update({ value: "https://m.me/113878833349843" } as any).eq("key", "chat.page_url").is("branch_id", null);
    
    vi.spyOn(authSession, "requireGallerySession").mockResolvedValue({
      galleryId: gallery!.id,
      selectionId: selId,
      shareLinkId: "link-1",
      customerId: "cust-1",
      role: "owner",
      exp: Date.now() + 10000,
    } as any);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    
    expect(json.data.branch.chatUrl).toBe("https://m.me/113878833349843");
    
    const keys = Object.keys(json.data.branch);
    expect(keys.includes("settings")).toBe(false);
  });

  it("GET /api/g/gallery không trả chatUrl nếu giá trị không hợp lệ", async () => {
    const { data: gallery } = await supabase.from("galleries").select("id").limit(1).single() as any;
    const { data: selection } = await supabase.from("selections").select("id").eq("gallery_id", gallery!.id).limit(1).single() as any;
    
    const selId = selection ? selection.id : "00000000-0000-0000-0000-000000000000";

    vi.spyOn(authSession, "requireGallerySession").mockResolvedValue({
      galleryId: gallery!.id,
      selectionId: selId,
      shareLinkId: "link-1",
      customerId: "cust-1",
      role: "owner",
      exp: Date.now() + 10000,
    } as any);

    // Case 1: http string
    await supabase.from("settings").update({ value: "http://m.me/113878833349843" } as any).eq("key", "chat.page_url").is("branch_id", null);
    let res = await GET();
    let json = await res.json();
    expect(json.data.branch.chatUrl).toBeNull();

    // Case 2: Object
    await supabase.from("settings").update({ value: { url: "https://m.me/113878833349843" } } as any).eq("key", "chat.page_url").is("branch_id", null);
    res = await GET();
    json = await res.json();
    expect(json.data.branch.chatUrl).toBeNull();
  });
});