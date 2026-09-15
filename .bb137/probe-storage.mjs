import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.storage.listBuckets();
console.log("buckets:", error ? "ERR " + error.message : JSON.stringify(data?.map(b => ({ name: b.name, public: b.public }))));
