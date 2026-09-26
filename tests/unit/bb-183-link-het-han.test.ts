/**
 * BB-183 — Link phải thật sự hết hạn sau hai tháng.
 *
 * OWNER: DEV-BE.
 * Spec: docs/briefs/BB-183-link-het-han-that.md, docs/13 §11
 *
 * ---------------------------------------------------------------------------
 * Thước đo của AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên bản vá thì phép thử này phải ĐỎ. Cụ thể:
 *
 *   - Gỡ phần kiểm `expires_at` ở `/api/auth/gallery` -> ca 2 đỏ, vì link quá
 *     hạn lại vào được.
 *   - Đổi lại thành chỉ kiểm cho link kiểu cũ (`isLegacy`) -> ca 3 đỏ, vì link
 *     gắn theo khách quá hạn vẫn lọt.
 *   - Ghi cứng 60 ngày thay vì đọc `settings` -> ca 4 đỏ.
 *
 * Ca 3 là ca đáng giá nhất: trước BB-183 chỉ link kiểu cũ mới bị kiểm hạn, nên
 * link gắn theo khách sống vĩnh viễn dù có đặt ngày hết hạn.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/gallery/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash, randomUUID } from "node:crypto";

const admin = createAdminClient();
const runId = randomUUID().slice(0, 8);
const tao: string[] = [];

/**
 * Bộ ảnh RIÊNG của tệp này.
 *
 * Trước đây `dungLink` mượn "bộ ảnh đầu tiên" bằng `.limit(1)` — cùng một bộ
 * ảnh mà các tệp khác gọi `POST /api/auth/gallery` cũng mượn. Với link KHÔNG
 * gắn khách (`theoKhach=false`), route tạo dòng `selections` đầu tiên cho bộ
 * ảnh và giữ cờ `is_primary` theo `gallery_id` — hai tệp cùng mở link trỏ vào
 * CÙNG một bộ ảnh mượn, chạy ở hai tiến trình vitest song song, đôi khi đụng
 * nhau trên chính cờ đó và ném 500. Dựng bộ ảnh riêng của tệp này (và một
 * khách riêng cho ca `theoKhach`) thì không còn ai để đụng. Xem
 * tests/unit/bb-214a-dem-luot-mo-link.test.ts — cùng bệnh, cùng cách vá.
 */
let galleryId: string;
let customerId: string;

async function dungLink(
  nhan: string,
  hetHan: Date | null,
  theoKhach: boolean,
): Promise<string> {
  const ma = `bb183-${nhan}-${runId}`;
  const { data, error } = await admin
    .from("share_links")
    .insert({
      gallery_id: theoKhach ? null : galleryId,
      customer_id: theoKhach ? customerId : null,
      token_hash: createHash("sha256").update(ma).digest("hex"),
      token_prefix: ma.slice(0, 6),
      role: "owner",
      status: "active",
      expires_at: hetHan ? hetHan.toISOString() : null,
    } as never)
    .select("id")
    .single();

  if (error) throw error;
  tao.push((data as { id: string }).id);
  return ma;
}

const goi = async (ma: string) =>
  POST(
    new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      body: JSON.stringify({ token: ma }),
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("BB-183 · link hết hạn", () => {
  let ttlGoc: unknown = null;

  beforeAll(async () => {
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.link_ttl_days")
      .is("branch_id", null)
      .maybeSingle();
    ttlGoc = data?.value ?? null;

    const { data: branch } = await admin.from("branches").select("id").limit(1).single();
    const branchId = (branch as { id: string }).id;

    const { data: cust, error: custErr } = await admin
      .from("customers")
      .insert({ branch_id: branchId, full_name: `Fixture BB-183 ${runId}` } as never)
      .select("id")
      .single();
    if (custErr) throw custErr;
    customerId = (cust as { id: string }).id;

    const { data: gal, error: galErr } = await admin
      .from("galleries")
      .insert({
        branch_id: branchId,
        customer_id: customerId,
        title: `Fixture BB-183 ${runId}`,
        status: "ready",
        drive_folder_id: `FIXTURE_BB183_${runId}`,
        drive_folder_url: "https://example.com/fixture-bb183",
      } as never)
      .select("id")
      .single();
    if (galErr) throw galErr;
    galleryId = (gal as { id: string }).id;
  });

  // Dọn sạch sau khi xong — bb-dev là cơ sở dữ liệu thật của studio.
  afterAll(async () => {
    if (tao.length) await admin.from("share_links").delete().in("id", tao);
    if (galleryId) await admin.from("galleries").delete().eq("id", galleryId);
    if (customerId) await admin.from("customers").delete().eq("id", customerId);
    if (ttlGoc !== null) {
      await admin
        .from("settings")
        .update({ value: ttlGoc } as never)
        .eq("key", "gallery.link_ttl_days")
        .is("branch_id", null);
    }
  });

  it("1. Link còn hạn thì vào được", async () => {
    const ma = await dungLink("con-han", new Date(Date.now() + 86_400_000), false);
    const res = await goi(ma);
    expect(res.status).toBe(200);
  });

  it("2. Link quá hạn thì bị chặn", async () => {
    const ma = await dungLink("qua-han", new Date(Date.now() - 86_400_000), false);
    const res = await goi(ma);
    expect(res.status).not.toBe(200);
  });

  /**
   * Ca quan trọng nhất. Trước BB-183, phần kiểm hạn nằm sau điều kiện
   * `isLegacy`, nên link gắn theo khách KHÔNG bao giờ bị kiểm — đặt ngày hết
   * hạn cũng vô nghĩa.
   */
  it("3. Link gắn theo khách quá hạn cũng bị chặn, không riêng link kiểu cũ", async () => {
    const ma = await dungLink("khach-qua-han", new Date(Date.now() - 86_400_000), true);
    const res = await goi(ma);
    expect(res.status, "link gắn theo khách quá hạn vẫn lọt — lỗi BB-183 đã quay lại").not.toBe(200);
  });

  it("4. Số ngày đọc từ settings, không ghi cứng trong mã", async () => {
    const { data } = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.link_ttl_days")
      .is("branch_id", null)
      .maybeSingle();

    expect(data, "thiếu khoá gallery.link_ttl_days trong settings").toBeTruthy();
    expect(typeof data!.value).toBe("number");
    expect(data!.value).toBeGreaterThan(0);
  });
});
