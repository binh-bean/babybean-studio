import { createAdminClient } from "@/lib/supabase/admin";
import bcrypt from "bcryptjs";

export async function setupAuthFixtures() { await createAdminClient().from('activity_logs').delete().in('action', ['gallery_auth']);
  const admin = await createAdminClient();
  
  const { data: shoot } = await admin.from("shoots").select("id, branch_id, customer_id, baby_id").limit(1).single();
  if (!shoot) throw new Error("No shoot found");

  const { data: gallery, error: galErr } = await admin.from("galleries").insert({
    shoot_id: shoot.id,
    branch_id: shoot.branch_id,
    customer_id: shoot.customer_id,
    baby_id: shoot.baby_id,
    title: "Test Gallery Auth",
    status: "ready",
    drive_folder_id: "test-folder-auth-" + Date.now(),
    drive_folder_url: "https://drive.google.com/test"
  }).select("id").single();
  
  if (galErr || !gallery) {
    console.error(galErr);
    throw new Error("Failed to create fixture gallery");
  }
  const gid = gallery.id;
  
  async function createLink(token: string, options: Record<string, unknown>) {
    const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then(buf => Buffer.from(buf).toString("hex"));
    const { data, error } = await admin.from("share_links").insert({
      gallery_id: gid,
      token_hash: tokenHash,
      token_prefix: token.substring(0, 6),
      role: "viewer",
      status: "active",
      ...options
    }).select("id").single();
    if (error) console.error("Link error", error);
    return data?.id;
  }

  await createLink("token-no-pin", { requires_pin: false });
  const pinHash = await bcrypt.hash("1234", 10);
  await createLink("token-with-pin", { requires_pin: true, pin_hash: pinHash });
  await createLink("token-revoked", { requires_pin: false, status: "revoked" });
  await createLink("token-expired", { requires_pin: false, status: "active", expires_at: new Date(Date.now() - 10000).toISOString() });
  await createLink("token-no-selections", { requires_pin: false });
  const revId = await createLink("token-to-revoke", { requires_pin: false });

  return { gid, revId };
}

export async function cleanupAuthFixtures(gid: string) {
  const admin = await createAdminClient();
  await admin.from('activity_logs').delete().in('action', ['gallery_auth']); await admin.from('galleries').delete().eq('id', gid);
}
