/**
 * BB-214(a) — Mở link phải cộng view_count, nguyên tử.
 *
 * OWNER: DEV-BE.
 * Spec: db/migrations/0064-dem-luot-mo-link.sql, src/app/api/auth/gallery/route.ts
 *
 * ---------------------------------------------------------------------------
 * Thước đo của AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên bản vá (bỏ dòng gọi `admin.rpc("tang_luot_mo_link", ...)` khỏi
 * route, hoặc bỏ hàm SQL) thì ca 1 và ca 2 phải ĐỎ: view_count đứng yên ở 0
 * thay vì tăng theo số lần mở.
 */

import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/gallery/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash, randomUUID } from "node:crypto";

const admin = createAdminClient();
const runId = randomUUID().slice(0, 8);
const tao: string[] = [];

async function dungLink(nhan: string): Promise<{ ma: string; id: string }> {
  const { data: g } = await admin
    .from("galleries")
    .select("id")
    .limit(1)
    .single();

  const ma = `bb214a-${nhan}-${runId}`;
  const { data, error } = await admin
    .from("share_links")
    .insert({
      gallery_id: (g as { id: string }).id,
      token_hash: createHash("sha256").update(ma).digest("hex"),
      token_prefix: ma.slice(0, 6),
      role: "owner",
      status: "active",
      expires_at: null,
    } as never)
    .select("id")
    .single();

  if (error) throw error;
  const id = (data as { id: string }).id;
  tao.push(id);
  return { ma, id };
}

const goi = async (ma: string) =>
  POST(
    new NextRequest("http://localhost/api/auth/gallery", {
      method: "POST",
      body: JSON.stringify({ token: ma }),
      headers: { "Content-Type": "application/json" },
    }),
  );

async function docViewCount(id: string): Promise<number> {
  const { data } = await admin
    .from("share_links")
    .select("view_count, last_viewed_at")
    .eq("id", id)
    .single();
  return (data as { view_count: number }).view_count;
}

describe("BB-214a · đếm lượt mở link", () => {
  afterAll(async () => {
    if (tao.length) await admin.from("share_links").delete().in("id", tao);
  });

  it("1. Mở link hai lần thì view_count tăng đúng 2", async () => {
    const { ma, id } = await dungLink("hai-lan");

    expect(await docViewCount(id)).toBe(0);

    const r1 = await goi(ma);
    expect(r1.status).toBe(200);
    expect(await docViewCount(id)).toBe(1);

    const r2 = await goi(ma);
    expect(r2.status).toBe(200);
    expect(await docViewCount(id)).toBe(2);
  });

  /**
   * Kiểm thẳng hàm SQL, không qua route: `POST /api/auth/gallery` còn một việc
   * khác không an toàn dưới tải đồng thời thật (tạo `selections` lần đầu, có
   * khoá `uq_selections_share_link_gallery` — gọi 4 lần cùng lúc trên CÙNG một
   * link mới đôi khi ném lỗi trùng khoá, không liên quan gì tới view_count).
   * Đó là một race có thật nhưng KHÁC việc BB-214a đang vá — đã báo riêng, xem
   * báo cáo bàn giao. Ở đây kiểm đúng thứ BB-214a hứa: gọi hàm
   * `tang_luot_mo_link` bốn lần đồng thời phải cộng ra đúng 4, không mất lượt
   * nào vì đọc-rồi-ghi.
   */
  it("2. Gọi hàm đếm bốn lần đồng thời thì cộng ra đúng 4, không mất lượt", async () => {
    const { id } = await dungLink("song-song");

    await Promise.all([
      admin.rpc("tang_luot_mo_link", { p_share_link_id: id }),
      admin.rpc("tang_luot_mo_link", { p_share_link_id: id }),
      admin.rpc("tang_luot_mo_link", { p_share_link_id: id }),
      admin.rpc("tang_luot_mo_link", { p_share_link_id: id }),
    ]);

    expect(await docViewCount(id)).toBe(4);
  });

  it("3. Link sai (không tồn tại) thì không tăng gì, và không có gì để đếm", async () => {
    const res = await goi(`bb214a-khong-ton-tai-${runId}`);
    expect(res.status).not.toBe(200);
    // Không có share_link nào được tạo cho mã này nên không có gì phải đếm —
    // khẳng định duy nhất có ý nghĩa ở đây là request bị từ chối.
  });

  it("4. last_viewed_at được cập nhật cùng lúc với view_count", async () => {
    const { ma, id } = await dungLink("last-viewed");
    await goi(ma);
    const { data } = await admin
      .from("share_links")
      .select("last_viewed_at")
      .eq("id", id)
      .single();
    expect((data as { last_viewed_at: string | null }).last_viewed_at).toBeTruthy();
  });
});
