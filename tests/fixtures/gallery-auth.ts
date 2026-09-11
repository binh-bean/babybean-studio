/**
 * Fixtures for BB-030.
 *
 * OWNER: SEC-ARCH.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const AUTH_ACTION = "gallery.auth";

export interface AuthFixtures {
  gid: string;
  revId: string;
  customerAId: string;
  customerBId: string;
  galleryBId: string;
}

export async function setupAuthFixtures(): Promise<AuthFixtures> {
  const admin = await createAdminClient();

  await admin.from("activity_logs").delete().eq("action", AUTH_ACTION);

  // We need two distinct customers and two shoots
  const { data: customers } = await admin
    .from("customers")
    .select("id")
    .limit(2);
    
  if (!customers || customers.length < 2) {
    throw new Error("Cần ít nhất hai khách hàng trong bb-dev, chạy npm run db:seed trước");
  }

  const customerA = customers[0].id;
  const customerB = customers[1].id;

  const { data: shootA } = await admin.from("shoots").select("*").eq("customer_id", customerA).limit(1).single();
  const { data: shootB } = await admin.from("shoots").select("*").eq("customer_id", customerB).limit(1).single();

  if (!shootA || !shootB) {
    throw new Error("Mỗi khách hàng cần ít nhất 1 shoot");
  }

  const { data: galleryA, error: galErrA } = await admin
    .from("galleries")
    .insert({
      shoot_id: shootA.id,
      branch_id: shootA.branch_id,
      customer_id: shootA.customer_id,
      baby_id: shootA.baby_id,
      title: "Fixture Gallery A",
      status: "ready",
      drive_folder_id: `fixture-a-${Date.now()}`,
      drive_folder_url: "https://drive.google.com/drive/folders/fixture",
    })
    .select("id")
    .single();

  const { data: galleryB, error: galErrB } = await admin
    .from("galleries")
    .insert({
      shoot_id: shootB.id,
      branch_id: shootB.branch_id,
      customer_id: shootB.customer_id,
      baby_id: shootB.baby_id,
      title: "Fixture Gallery B",
      status: "ready",
      drive_folder_id: `fixture-b-${Date.now()}`,
      drive_folder_url: "https://drive.google.com/drive/folders/fixture",
    })
    .select("id")
    .single();

  if (galErrA || galErrB || !galleryA || !galleryB) throw new Error("Không tạo được gallery fixture");

  async function createLink(token: string, options: Record<string, unknown>): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const { data, error } = await admin
      .from("share_links")
      .insert({
        customer_id: options.customer_id as string || null,
        gallery_id: options.gallery_id as string || null,
        token_hash: Buffer.from(buf).toString("hex"),
        token_prefix: token.slice(0, 6),
        role: "owner",
        status: "active",
        requires_pin: false,
        ...options,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error(`Không tạo được share_link ${token}`);
    return data.id;
  }

  await createLink("token-active", { customer_id: customerA });
  await createLink("token-revoked", { customer_id: customerA, status: "revoked" });
  const revId = await createLink("token-to-revoke", { customer_id: customerA });

  return { 
    gid: galleryA.id, 
    revId,
    customerAId: customerA,
    customerBId: customerB,
    galleryBId: galleryB.id
  };
}

export async function cleanupAuthFixtures(gid: string): Promise<void> {
  const admin = await createAdminClient();
  await admin.from("activity_logs").delete().eq("action", AUTH_ACTION);
  // Also clean up galleries. They cascade to share_links
  await admin.from("galleries").delete().like("title", "Fixture Gallery%");
}
