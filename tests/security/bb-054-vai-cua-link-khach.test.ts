/**
 * BB-054 — ca 8 và ca 9 của ma trận nghiệm thu bảo mật (docs/05 mục 6).
 *
 * ---------------------------------------------------------------------------
 * Hai ca này nằm trong ma trận từ đầu, dưới dạng `it.todo`
 * ---------------------------------------------------------------------------
 * `tests/security/rbac.test.ts` ghi:
 *
 *     it.todo("Ca 8: viewer link gọi PATCH /api/g/selection -> 403 (Chờ BB-035)");
 *     it.todo("Ca 9: suggester gửi mark: 'selected' -> lưu thành 'suggested' (Chờ BB-035)");
 *
 * BB-035 xong từ lâu, còn hai dòng todo thì ở lại. Vitest đếm `todo` là
 * "đã lên kế hoạch", không phải "đang hỏng", nên bộ phép thử vẫn xanh và ma
 * trận nghiệm thu trông như đã đủ.
 *
 * ---------------------------------------------------------------------------
 * Đo ở CẢ HAI TẦNG, vì mỗi tầng hỏng một kiểu
 * ---------------------------------------------------------------------------
 * Vai của link được xét ở hai chỗ:
 *
 *   · `requireGallerySession(EDITING_ROLES)` — cửa của route.
 *   · `patch_selection_batch` — thân hàm SQL, nơi ghi thật.
 *
 * Bỏ cửa route thì SQL vẫn giữ; bỏ SQL thì route vẫn giữ. Chỉ đo một tầng là
 * không biết tầng kia còn sống hay đã chết từ lâu — đúng bài học của phép thử
 * BB-068 hôm nay: hai chốt che cho nhau thì mỗi chốt phải có ca riêng.
 *
 * Phép thử KHÔNG giả lập `requireGallerySession`: nó ký một phiên thật bằng
 * `signGallerySession`, nhét vào cookie giả, rồi để cả chuỗi thật chạy. Giả
 * lập chính cái cửa đang đo thì chỉ đo được cái giả lập.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));

/** Cookie giả: `getGallerySession` đọc đúng qua `next/headers`. */
let cookieHienTai = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (ten: string) => (ten === "bb_gs" && cookieHienTai ? { value: cookieHienTai } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

import {
  signGallerySession,
  requireGallerySession,
  EDITING_ROLES,
} from "@/lib/auth/gallery-session";

describe("BB-054: vai của link khách", () => {
  let client: Client;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let galleryId = "";
  let anh1 = "";
  const links: Record<string, { linkId: string; selectionId: string }> = {};

  async function taoLink(vai: string) {
    const { rows: l } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb054x', $2, 'active') returning id`,
      [galleryId, vai],
    );
    const { rows: s } = await client.query(
      `insert into selections (gallery_id, share_link_id, display_name)
       values ($1, $2, $3) returning id`,
      [galleryId, l[0].id, `BB-054 ${vai}`],
    );
    links[vai] = { linkId: l[0].id, selectionId: s[0].id };
  }

  /** Ký phiên thật cho một vai rồi đặt vào cookie giả. */
  async function dangNhapVoiVai(vai: string) {
    const { token } = await signGallerySession({
      galleryId,
      shareLinkId: links[vai]!.linkId,
      selectionId: links[vai]!.selectionId,
      role: vai as "owner" | "co_editor" | "suggester" | "viewer",
      customerId: null,
    } as unknown as Parameters<typeof signGallerySession>[0]);
    cookieHienTai = token;
  }

  const goiRpc = (vai: string, mark: string) =>
    admin.rpc("patch_selection_batch", {
      p_client_op_id: randomUUID(),
      p_selection_id: links[vai]!.selectionId,
      p_gallery_id: galleryId,
      p_role: vai,
      p_ops: [{ photoId: anh1, mark }],
      p_max_selection: null,
      p_allow_extra: true,
      p_included_quota: 10,
      p_extra_price: 50000,
      p_actor_label: "BB-054",
      p_ip: null,
      p_user_agent: null,
    });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-054') returning id`,
      [br[0].id],
    );
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-054','ready',$3,'https://example.com/x',2,10) returning id`,
      [br[0].id, kh[0].id, `fixture-bb054-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: p } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'1.jpg','image/jpeg',1,'active') returning id`,
      [galleryId, `bb054-file-${Date.now()}`],
    );
    anh1 = p[0].id;

    for (const vai of ["owner", "suggester", "viewer"]) await taoLink(vai);
  });

  afterAll(async () => {
    if (galleryId) {
      // galleries xoá kéo theo share_links, selections, photos (on delete cascade).
      const { rows } = await client.query("select customer_id from galleries where id=$1", [
        galleryId,
      ]);
      await client.query("delete from galleries where id = $1", [galleryId]);
      if (rows[0]?.customer_id) {
        await client.query("delete from customers where id = $1", [rows[0].customer_id]);
      }
    }
    await client.end();
  });

  // --- Ca 8 -----------------------------------------------------------------

  it("Ca 8a (cửa route): link vai 'viewer' không qua được EDITING_ROLES", async () => {
    await dangNhapVoiVai("viewer");
    await expect(requireGallerySession(EDITING_ROLES)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("Ca 8b (đối chứng dương): link vai 'owner' thì qua", async () => {
    await dangNhapVoiVai("owner");
    const phien = await requireGallerySession(EDITING_ROLES);
    expect(phien.role).toBe("owner");
  });

  it("Ca 8c (tầng SQL): viewer gửi thẳng vào RPC thì KHÔNG ghi được gì", async () => {
    // Đây là vế quan trọng: giả sử ai đó gỡ mất cửa route, hoặc gọi thẳng RPC
    // bằng một khoá lấy được, thì tầng dưới vẫn phải chặn.
    //
    // Tầng SQL không "từ chối từng thao tác" như với ảnh hỏng — nó NÉM THẲNG
    // `raise exception 'FORBIDDEN'`. Chặt hơn, và đáng ghi ra đây: người đọc
    // sau sẽ biết phải bắt lỗi chứ không phải đọc mảng `rejected`.
    const { data, error } = await goiRpc("viewer", "selected");
    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain("FORBIDDEN");
    expect(data).toBeNull();

    const { rows } = await client.query(
      "select count(*)::int n from selection_items where selection_id = $1",
      [links.viewer!.selectionId],
    );
    expect(rows[0].n).toBe(0);
  });

  // --- Ca 9 -----------------------------------------------------------------

  it("Ca 9: suggester gửi mark 'selected' thì lưu thành 'suggested'", async () => {
    const { data, error } = await goiRpc("suggester", "selected");
    expect(error).toBeNull();
    expect(data.rejected.length).toBe(0);

    const { rows } = await client.query(
      "select mark::text from selection_items where selection_id = $1 and photo_id = $2",
      [links.suggester!.selectionId, anh1],
    );
    expect(rows[0]?.mark).toBe("suggested");

    // Và nó KHÔNG được tính vào số ảnh đã chọn — nếu tính thì một người bà
    // gợi ý mười tấm là ăn hết hạn mức của gia đình.
    expect(data.selectedCount).toBe(0);
  });

  it("Ca 9b (đối chứng dương): owner gửi 'selected' thì đúng là 'selected'", async () => {
    const { data, error } = await goiRpc("owner", "selected");
    expect(error).toBeNull();

    const { rows } = await client.query(
      "select mark::text from selection_items where selection_id = $1 and photo_id = $2",
      [links.owner!.selectionId, anh1],
    );
    expect(rows[0]?.mark).toBe("selected");
    expect(data.selectedCount).toBe(1);
  });
});
