import { describe, it, expect } from "vitest";

describe("BB-082 - RPC Security Definer Lockdown", () => {
  it("Khoá công khai (anon) không được gọi get_gallery_photos", async () => {
    // We will use the REST API via fetch, just like the attacker does.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !anonKey) {
      throw new Error("Missing Supabase env vars");
    }

    const res = await fetch(`${url}/rest/v1/rpc/get_gallery_photos`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        p_gallery_id: "00000000-0000-0000-0000-000000000000",
        p_selection_id: "00000000-0000-0000-0000-000000000000",
        p_cursor_sort_index: 0,
        p_limit: 10,
        p_subfolder: null,
        p_filter: "all"
      })
    });

    // We verify the vulnerability is fixed. It should not be 200 OK.
    expect(res.status).not.toBe(200);
  });
});
