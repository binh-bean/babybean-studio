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

  // Dọn rác của lần chạy TRƯỚC, ngay từ đầu — không chỉ dọn ở afterAll.
  //
  // afterAll không chạy khi một lần chạy chết giữa chừng, và lần sau kế thừa
  // nguyên đống rác đó: bộ ảnh cũ còn đấy, link cũ còn đấy, và các phép thử
  // sau đọc nhầm sang dữ liệu của lần trước. Triệu chứng đúng như đã thấy ngày
  // 12.09.2026: chạy riêng thì 14/14 đạt, chạy lại ngay sau đó thì 6 ca đỏ, và
  // TẬP CA ĐỎ KHÁC NHAU giữa hai lần.
  //
  // Dọn hai đầu thì một lần chạy hỏng không kéo theo lần sau.
  await admin.from("galleries").delete().like("title", "Fixture BB-030%");
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

  // TỰ TẠO khách và buổi chụp của mình, không mượn của cơ sở dữ liệu.
  //
  // Hai bản trước đều mượn: bản đầu lấy "customers limit 2", bản sau lấy
  // "shoots order by created_at limit 200". Cả hai đều chập chờn, và bản sau
  // chập chờn vì một lý do rất dễ bỏ qua: đợt nhập dữ liệu thật tạo 435 buổi
  // chụp trong vài giây, nên created_at TRÙNG NHAU hàng loạt. `order by` trên
  // cột có hàng trăm giá trị bằng nhau thì Postgres trả thứ tự TUỲ Ý — mỗi lần
  // chạy bốc trúng một cặp khách khác nhau, và các phép thử đỏ khác nhau.
  //
  // Ngày 12.09.2026: chạy riêng 14/14 đạt, chạy lại ngay sau đó 6 ca đỏ, tập
  // ca đỏ đổi giữa hai lần. Đã thử vá bằng dọn rác đầu vào và IP ngẫu nhiên —
  // không hết, vì cả hai đều không chạm gốc.
  //
  // Fixture tự dựng dữ liệu của mình thì không có gì để bốc trúng sai.
  const { data: branch } = await admin.from("branches").select("id").order("name").limit(1).single();
  if (!branch) throw new Error("Cần ít nhất một chi nhánh, chạy npm run db:seed trước");

  const made = await Promise.all(
    ["A", "B"].map(async (suffix) => {
      const { data: cust, error: custErr } = await admin
        .from("customers")
        .insert({ branch_id: branch.id, full_name: `Fixture BB-030 Khách ${suffix}` })
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
    pin_hash: await bcrypt.hash(TEST_PIN, 4),
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
  // Khách và buổi chụp fixture cũng phải dọn — buổi chụp cascade theo khách.
  await admin.from("customers").delete().like("full_name", "Fixture BB-030 Khách%");
}
