import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== BẮT ĐẦU KIỂM NGƯỢC BB-171 ===");
  
  console.log("1. Tạo tài khoản Fixture BB-171...");
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: "fixture.bb171.kiemnguoc@demo.babybean.vn",
    password: "password1234",
    email_confirm: true,
  });
  if (authErr) throw authErr;
  
  const userId = authUser.user.id;
  console.log(`-> Đã tạo auth.users: ${userId}`);
  
  const { error: profileErr } = await admin.from("staff_profiles").insert({
    id: userId,
    email: "fixture.bb171.kiemnguoc@demo.babybean.vn",
    full_name: "Fixture BB-171 Kiểm Ngược",
    role: "cs"
  });
  if (profileErr) throw profileErr;
  console.log("-> Đã tạo staff_profiles");
  
  const { data: checkProfile } = await admin.from("staff_profiles").select("id").eq("id", userId).single();
  console.log(`-> staff_profiles tồn tại: ${!!checkProfile}`);
  
  const { data: checkAuth } = await admin.auth.admin.getUserById(userId);
  console.log(`-> auth.users tồn tại: ${!!checkAuth.user}`);
  
  console.log("\n2. Gọi thao tác xoá...");
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) throw delErr;
  console.log("-> Gọi admin.auth.admin.deleteUser() thành công");
  
  console.log("\n3. Kiểm tra kết quả...");
  const { data: finalProfile } = await admin.from("staff_profiles").select("id").eq("id", userId).maybeSingle();
  console.log(`-> staff_profiles tồn tại: ${!!finalProfile}`);
  
  const { data: finalAuth, error: checkAuthErr } = await admin.auth.admin.getUserById(userId);
  console.log(`-> auth.users tồn tại: ${!checkAuthErr && !!finalAuth?.user}`);
  
  if (!finalProfile && checkAuthErr) {
    console.log("\n=== KIỂM NGƯỢC THÀNH CÔNG: Xoá 1 được 2 ===");
  } else {
    console.error("\n=== KIỂM NGƯỢC THẤT BẠI ===");
  }
}
run().catch(console.error);
