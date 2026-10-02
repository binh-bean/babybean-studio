/**
 * BB-360 mục 2 — anh chốt 02/10/2026: ông bà mở bộ đã thu gọn bằng link mời gia đình (vai
 * `viewer`) cũng kích được "mở lại toàn bộ ảnh" như ba mẹ. BB-359 chỉ cho vai `owner`.
 *
 * Chạy `POST /api/g/mo-lai-anh` THẬT với phiên đã ký thật (cookie giả ở biên giới
 * `next/headers`, như cong-khach-nhieu-buoi-chup.test.ts) và share_link thật trên bb-dev.
 * Bộ fixture KHÔNG thu gọn nên route trả `khong_thu_gon` ngay — không đụng Drive, không
 * chạy `after()`. Khoá + 10 phút/bộ + tối đa 3 bộ vẫn nằm trong hàm SQL `nhan_mo_lai_anh`
 * (0088, chưa áp) — thử ở bb-359-thu-gon-mo-lai.test.ts, không đổi.
 *
 * Kiểm ngược (đã chạy, dán trong bàn giao): trả route về `requireGallerySession(SUBMIT_ROLES)`
 * → ca viewer nhận 403 thay vì 200 → ĐỎ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { SESSION_COOKIE, signGallerySession } from "@/lib/auth/gallery-session";
import type { ShareRole } from "@/types/domain";

const coDb = Boolean(process.env.SUPABASE_DB_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.APP_SECRET);

describe.skipIf(!coDb)("BB-360: ông bà (viewer) kích được mở lại ảnh", () => {
  let pg: Client;
  const RUN = `${Date.now() % 1_000_000}`;
  const id: Record<string, string> = {};
  const link: Partial<Record<ShareRole, string>> = {};

  function dungPhien(cookie: string | null): void {
    vi.doMock("next/headers", () => ({
      cookies: async () => ({
        get: (ten: string) => (cookie && ten === SESSION_COOKIE ? { value: cookie } : undefined),
      }),
    }));
  }

  async function goiPost(vai: ShareRole | null): Promise<{ status: number; body: unknown }> {
    let cookie: string | null = null;
    if (vai) {
      ({ token: cookie } = await signGallerySession({
        customerId: "",
        galleryId: id.gallery!,
        shareLinkId: link[vai]!,
        selectionId: "",
        role: vai,
      }));
    }
    vi.resetModules();
    dungPhien(cookie);
    const { POST } = await import("@/app/api/g/mo-lai-anh/route");
    const res = await POST();
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    id.branch = (
      await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB360M-${RUN}`, `Fixture BB-360-${RUN} Chi nhánh mở lại`])
    ).rows[0].id;
    id.customer = (
      await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [id.branch, `Fixture BB-360-${RUN} Khách`])
    ).rows[0].id;
    id.gallery = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
         values ($1,$2,$3,'in_retouch',$4,'https://example.com/x',0) returning id`,
        [id.branch, id.customer, `Fixture BB-360-${RUN} Bộ mở lại`, `SEED_FOLDER_ID_360M_${RUN}`],
      )
    ).rows[0].id;
    for (const vai of ["owner", "viewer"] as const) {
      link[vai] = (
        await pg.query(
          `insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,'bb360m',$3,'active') returning id`,
          [id.gallery, `fixture-bb360m-${vai}-${RUN}`, vai],
        )
      ).rows[0].id;
    }
  }, 60_000);

  afterAll(async () => {
    if (!pg) return;
    if (id.gallery) {
      await pg.query(`delete from activity_logs where gallery_id = $1`, [id.gallery]).catch(() => {});
      await pg.query(`delete from share_links where gallery_id = $1`, [id.gallery]);
      await pg.query(`delete from galleries where id = $1`, [id.gallery]);
    }
    if (id.customer) await pg.query(`delete from customers where id = $1`, [id.customer]);
    if (id.branch) await pg.query(`delete from branches where id = $1`, [id.branch]);
    const { rows } = await pg.query(`select count(*)::int n from branches where code = $1`, [`FXBB360M-${RUN}`]);
    console.info("BB360_MO_LAI_SAU_DON", rows[0].n);
    expect(rows[0].n).toBe(0);
    await pg.end();
    vi.doUnmock("next/headers");
  });

  it("viewer (link mời gia đình) → được nhận (200), không bị 403", async () => {
    const kq = await goiPost("viewer");
    expect(kq.status).toBe(200);
    expect((kq.body as { data?: { trangThai?: string } })?.data?.trangThai).toBe("khong_thu_gon");
  });

  it("owner vẫn được như BB-359", async () => {
    const kq = await goiPost("owner");
    expect(kq.status).toBe(200);
    expect((kq.body as { data?: { trangThai?: string } })?.data?.trangThai).toBe("khong_thu_gon");
  });

  it("không có phiên → 401 (vẫn chỉ người có link gia đình)", async () => {
    const kq = await goiPost(null);
    expect(kq.status).toBe(401);
  });

  it("link bị thu hồi → không kích được, kể cả viewer", async () => {
    await pg.query(`update share_links set status = 'revoked' where id = $1`, [link.viewer]);
    try {
      const kq = await goiPost("viewer");
      expect(kq.status).not.toBe(200);
    } finally {
      await pg.query(`update share_links set status = 'active' where id = $1`, [link.viewer]);
    }
  });
});
