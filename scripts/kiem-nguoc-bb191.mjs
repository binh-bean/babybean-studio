import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("status", "sent");

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`Số lượt gửi thành công (status='sent'): ${count}`);
}

run();
