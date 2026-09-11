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
  /** The throwaway gallery every fixture link points at. */
  gid: string;
  /** The PIN-protected link, addressed by id so tests never match by prefix. */
  pinLinkId: string;
  /** Active at setup; Ca 10 revokes it. */
  revId: string;
}

export async function setupAuthFixtures(): Promise<AuthFixtures> {
  const admin = await createAdminClient();

  await admin.from("activity_logs").delete().eq("action", AUTH_ACTION);

  const tokensToClean = [
    "token-no-pin",
    "token-with-pin",
    "token-revoked",
    "token-expired",
    "token-no-selections",
    "token-to-revoke",
  ];
  const hashes = await Promise.all(
    tokensToClean.map(async (t) => {
      const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
      return Buffer.from(b).toString("hex");
    })
  );
  await admin.from("share_links").delete().in("token_hash", hashes);

  const { data: shoot } = await admin
    .from("shoots")
    .select("id, branch_id, customer_id, baby_id")
    .limit(1)
    .single();
  if (!shoot) throw new Error("Cần ít nhất một shoot trong bb-dev, chạy npm run db:seed trước");

  const { data: gallery, error: galErr } = await admin
    .from("galleries")
    .insert({
      shoot_id: shoot.id,
      branch_id: shoot.branch_id,
      customer_id: shoot.customer_id,
      baby_id: shoot.baby_id,
      title: "Fixture BB-030",
      status: "ready",
      drive_folder_id: `fixture-bb030-${Date.now()}`,
      drive_folder_url: "https://drive.google.com/drive/folders/fixture",
    })
    .select("id")
    .single();

  if (galErr || !gallery) throw galErr ?? new Error("Không tạo được gallery fixture");

  async function createLink(token: string, options: Record<string, unknown>): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const { data, error } = await admin
      .from("share_links")
      .insert({
        gallery_id: gallery!.id,
        token_hash: Buffer.from(buf).toString("hex"),
        token_prefix: token.slice(0, 6),
        // co_editor by default. uq_selections_primary allows one is_primary
        // selection per gallery, and the route sets is_primary from role ===
        // 'owner', so a second owner link on the same gallery would collide.
        // That mirrors production: one owner link, the rest are guests.
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

  await createLink("token-no-pin", { role: "owner" });
  const pinLinkId = await createLink("token-with-pin", {
    requires_pin: true,
    pin_hash: await bcrypt.hash(TEST_PIN, 10),
  });
  await createLink("token-revoked", { status: "revoked" });
  await createLink("token-expired", {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });
  await createLink("token-no-selections", {});
  const revId = await createLink("token-to-revoke", {});

  return { gid: gallery.id, pinLinkId, revId };
}

/** Galleries cascade to share_links and selections, so one delete is enough. */
export async function cleanupAuthFixtures(gid: string): Promise<void> {
  const admin = await createAdminClient();
  await admin.from("activity_logs").delete().eq("action", AUTH_ACTION);
  await admin.from("galleries").delete().eq("id", gid);
}
