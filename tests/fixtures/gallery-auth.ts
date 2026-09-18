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
  runId: string;
  gid: string;
  pinLinkId: string;
  revId: string;
  customerAId: string;
  customerBId: string;
  galleryBId: string;
  customerToken: string;
  tokenNoPin: string;
  tokenWithPin: string;
  tokenRevoked: string;
  tokenExpired: string;
  tokenNoSelections: string;
  tokenToRevoke: string;
}

let lastCreatedFixtures: AuthFixtures | null = null;

export async function setupAuthFixtures(): Promise<AuthFixtures> {
  const admin = await createAdminClient();

  // Dọn rác của lần chạy TRƯỚC, nhưng CHỈ DỌN RÁC CŨ HƠN MỘT GIỜ.
  // Không bao giờ dọn theo tiền tố chung của các tiến trình đang chạy song song.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: oldGalleries, error: oldGalErr } = await admin
    .from("galleries")
    .select("id")
    .like("title", "Fixture BB-030%")
    .lt("created_at", oneHourAgo);
  if (oldGalErr) throw oldGalErr;
  if (oldGalleries && oldGalleries.length > 0) {
    const { error: delGalErr } = await admin
      .from("galleries")
      .delete()
      .in("id", oldGalleries.map((g) => g.id));
    if (delGalErr) throw delGalErr;
  }

  const { data: oldCusts, error: oldCustErr } = await admin
    .from("customers")
    .select("id")
    .like("full_name", "Fixture BB-030%")
    .lt("created_at", oneHourAgo);
  if (oldCustErr) throw oldCustErr;
  if (oldCusts && oldCusts.length > 0) {
    const cids = oldCusts.map((c) => c.id);
    const { error: delLinksErr } = await admin.from("share_links").delete().in("customer_id", cids);
    if (delLinksErr) throw delLinksErr;

    const { error: delShootsErr } = await admin.from("shoots").delete().in("customer_id", cids);
    if (delShootsErr) throw delShootsErr;

    const { error: delCustsErr } = await admin.from("customers").delete().in("id", cids);
    if (delCustsErr) throw delCustsErr;
  }

  const { error: delLogsErr } = await admin
    .from("activity_logs")
    .delete()
    .eq("action", AUTH_ACTION)
    .lt("created_at", oneHourAgo);
  if (delLogsErr) throw delLogsErr;

  // Mỗi LẦN CHẠY mang một nhãn riêng biệt (8 ký tự ngẫu nhiên).
  const runId = Math.random().toString(36).slice(2, 10);

  // TỰ TẠO khách và buổi chụp mang nhãn runId.
  const { data: branch } = await admin.from("branches").select("id").order("name").limit(1).single();
  if (!branch) throw new Error("Cần ít nhất một chi nhánh, chạy npm run db:seed trước");

  const made = await Promise.all(
    ["A", "B"].map(async (suffix) => {
      const { data: cust, error: custErr } = await admin
        .from("customers")
        .insert({ branch_id: branch.id, full_name: `Fixture BB-030 ${runId} Khách ${suffix}` })
        .select("id")
        .single();
      if (custErr || !cust) throw custErr ?? new Error("Không tạo được khách fixture");

      const { data: shoot, error: shootErr } = await admin
        .from("shoots")
        .insert({
          branch_id: branch.id,
          customer_id: cust.id,
          shoot_date: "2026-01-01",
        })
        .select("id, branch_id, customer_id, baby_id")
        .single();
      if (shootErr || !shoot) throw shootErr ?? new Error("Không tạo được buổi chụp fixture");

      return shoot;
    }),
  );

  const [shootA, shootB] = made;
  if (!shootA || !shootB) throw new Error("Không dựng đủ hai buổi chụp fixture");
  const customerA = shootA.customer_id!;
  const customerB = shootB.customer_id!;

  const { data: gallery, error: galErr } = await admin
    .from("galleries")
    .insert({
      shoot_id: shootA.id,
      branch_id: shootA.branch_id,
      customer_id: shootA.customer_id,
      baby_id: shootA.baby_id,
      title: `Fixture BB-030 ${runId} A`,
      status: "ready",
      drive_folder_id: `fixture-bb030-${runId}-a`,
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
      title: `Fixture BB-030 ${runId} B`,
      status: "ready",
      drive_folder_id: `fixture-bb030-${runId}-b`,
      drive_folder_url: "https://drive.google.com/drive/folders/fixture",
    })
    .select("id")
    .single();

  if (galErr || galErrB || !gallery || !galleryB) {
    throw galErr ?? galErrB ?? new Error("Không tạo được gallery fixture");
  }

  async function createLink(token: string, options: Record<string, unknown>): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const { data, error } = await admin
      .from("share_links")
      .insert({
        gallery_id: options.customer_id ? null : gallery!.id,
        token_hash: Buffer.from(buf).toString("hex"),
        token_prefix: token.slice(0, 6),
        role: "co_editor",
        status: "active",
        ...options,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error(`Không tạo được share_link ${token}`);
    return data.id;
  }

  const tokenNoPin = `token-no-pin-${runId}`;
  await createLink(tokenNoPin, { role: "owner" });

  const tokenWithPin = `token-with-pin-${runId}`;
  const pinLinkId = await createLink(tokenWithPin, {});

  const tokenRevoked = `token-revoked-${runId}`;
  await createLink(tokenRevoked, { status: "revoked" });

  const tokenExpired = `token-expired-${runId}`;
  await createLink(tokenExpired, {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  });

  const tokenNoSelections = `token-no-selections-${runId}`;
  await createLink(tokenNoSelections, {});

  const tokenToRevoke = `token-to-revoke-${runId}`;
  const revId = await createLink(tokenToRevoke, {});

  const customerToken = `customer-token-${runId}`;
  await createLink(customerToken, { customer_id: customerA, role: "owner" });

  const fixtures: AuthFixtures = {
    runId,
    gid: gallery.id,
    pinLinkId,
    revId,
    customerAId: customerA,
    customerBId: customerB,
    galleryBId: galleryB.id,
    customerToken,
    tokenNoPin,
    tokenWithPin,
    tokenRevoked,
    tokenExpired,
    tokenNoSelections,
    tokenToRevoke,
  };

  lastCreatedFixtures = fixtures;
  return fixtures;
}

/**
 * Dọn sạch fixture của lần chạy này.
 * Chỉ xoá dữ liệu mang nhãn / ID của chính mình, không đụng tới tiền tố chung.
 *
 * Xoá buổi chụp TRƯỚC khi xoá khách, và đọc error ở mỗi bước:
 * shoots.customer_id là on delete NO ACTION nên xoá khách bị chặn, mà
 * Supabase .delete() không ném lỗi.
 */
export async function cleanupAuthFixtures(fixtures?: AuthFixtures): Promise<void> {
  const target = fixtures ?? lastCreatedFixtures;
  if (!target) return;

  const admin = await createAdminClient();

  const custIds = [target.customerAId, target.customerBId].filter(Boolean);
  if (custIds.length > 0) {
    const { error: linkErr } = await admin.from("share_links").delete().in("customer_id", custIds);
    if (linkErr) throw linkErr;
  }

  const gids = [target.gid, target.galleryBId].filter(Boolean);
  if (gids.length > 0) {
    const { error: galErr } = await admin.from("galleries").delete().in("id", gids);
    if (galErr) throw galErr;
  }

  if (custIds.length > 0) {
    const { error: shootErr } = await admin.from("shoots").delete().in("customer_id", custIds);
    if (shootErr) throw shootErr;

    const { error: custErr } = await admin.from("customers").delete().in("id", custIds);
    if (custErr) throw custErr;
  }

  if (target === lastCreatedFixtures) {
    lastCreatedFixtures = null;
  }
}
