import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID, createHash } from "crypto";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data: g } = await supabase.from("galleries").select("id").limit(1).single();
  const token = "bb166-" + randomUUID();
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL });
  await pgClient.connect();
  await pgClient.query("INSERT INTO share_links (gallery_id, token_hash, token_prefix, role, status, requires_pin) VALUES ($1,$2,$3, $$owner$$, $$active$$, false)", [g.id, createHash("sha256").update(token).digest("hex"), token.slice(0,6)]);
  await pgClient.end();
  
  await supabase.from("settings").update({ value: "https://m.me/113878833349843" } as any).eq("key", "chat.page_url").is("branch_id", null);

  const res = await fetch("http://localhost:3099/api/auth/gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, pin: "" })
  });
  const cookie = res.headers.get("set-cookie");
  
  const apiRes = await fetch("http://localhost:3099/api/g/gallery", {
    headers: { "Cookie": cookie! }
  });
  const json = await apiRes.json();
  console.log(JSON.stringify(json.data.branch, null, 2));
})();