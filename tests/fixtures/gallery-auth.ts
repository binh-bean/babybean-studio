/**
 * Fixtures for BB-030.
 *
 * Built here rather than taken from db/seed.sql on purpose: the seed has no
 * revoked link, no expired link and no locked link, and its one PIN link has
 * requires_pin = true with pin_hash NULL. Security tests that depend on
 * someone else's seed test whatever that seed happens to contain.
 *
 * Everything is fake. The repository is public — see AGENTS.md §6.
 */

import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

export const AUTH_ACTION = "gallery.auth";
export const TEST_PIN = "1234";

export interface AuthFixtures {
  gid: string;
  pinLinkId: string;
  revId: string;
  customerAId: string;
  customerBId: string;
  galleryBId: string;
  customerToken: string;
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

  const customerA = customers[0]!.id;
  const customerB = customers[1]!.id;

  const { data: shootA } = await admin.from("shoots").select("*").eq("customer_id", customerA).limit(1).single();
  const { data: shootB } = await admin.from("shoots").select("*").eq("customer_id", customerB).limit(1).single();

  if (!shootA || !shootB) throw new Error("Mỗi khách hàng cần ít nhất 1 shoot");

  const { data: gallery, error: galErr } = await admin
    .from("galleries")
    .insert({
      shoot_id: shootA.id,
      branch_id: shootA.branch_id,
      customer_id: shootA.customer_id,
      baby_id: shootA.baby_id,
      title: "Fixture BB-030",
      status: "ready",
      drive_folder_id: `fixture-bb030-${Date.now()}`,
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
      title: "Fixture BB-030 B",
      status: "ready",
      drive_folder_id: `fixture-b-${Date.now()}`,
      drive_folder_url: "https://drive.google.com/drive/folders/fixture",
    })
    .select("id")
    .single();

  if (galErr || galErrB || !gallery || !galleryB) throw new Error("Không tạo được gallery fixture");

  async function createLink(tokenBase: string, options: Record<string, unknown>): Promise<string> {
    const token = `${tokenBase}-${Date.now()}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const { data, error } = await admin
      .from("share_links")
      .insert({
        gallery_id: options.customer_id ? null : gallery!.id,
        token_hash: Buffer.from(buf).toString("hex"),
        token_prefix: token.slice(0, 6),
        role: "co_editor",
        status: "active",
        requires_pin: false,
        ...options,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error(`Không tạo được share_link ${token}`);
    return token;
  }

  async function createLegacyLink(token: string, options: Record<string, unknown>): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const { data, error } = await admin
      .from("share_links")
      .insert({
        gallery_id: gallery!.id,
        token_hash: Buffer.from(buf).toString("hex"),
        token_prefix: token.slice(0, 6),
        role: "co_editor",
        status: "active",
        requires_pin: false,
        ...options,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error(`Không tạo được share_link ${token}`);
    return data.id;
  }

  await createLegacyLink("token-no-pin", { role: "owner" });
  const pinLinkId = await createLegacyLink("token-with-pin", {
    requires_pin: true,
    pin_hash: await bcrypt.hash(TEST_PIN, 10),
  });
  await createLegacyLink("token-revoked", { status: "revoked" });
  await createLegacyLink("token-expired", {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  await createLegacyLink("token-no-selections", {});
  const revId = await createLegacyLink("token-to-revoke", {});

  const customerToken = await createLink("customer-token", { customer_id: customerA, role: "owner" });

  return { 
    gid: gallery.id, 
    pinLinkId, 
    revId,
    customerAId: customerA,
    customerBId: customerB,
    galleryBId: galleryB.id,
    customerToken
  };
}

/** Galleries cascade to share_links and selections, so one delete is enough. */
export async function cleanupAuthFixtures(): Promise<void> {
  const admin = await createAdminClient();
  await admin.from("activity_logs").delete().eq("action", AUTH_ACTION);
  await admin.from("galleries").delete().like("title", "Fixture BB-030%");
}
