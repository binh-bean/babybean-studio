/**
 * BB-324 mục 1 — "Thêm vào màn hình chính" một bộ ảnh (iPhone và Android).
 *
 * Anh báo: tên hiện "babybean…" dài và viết liền, icon là vài ảnh bất kỳ.
 * iOS không đọc manifest: tên lấy `apple-mobile-web-app-title` (rồi `<title>`),
 * icon lấy `apple-touch-icon` — thiếu thì iOS CHỤP MÀN HÌNH trang (ra vài ảnh
 * của lưới). Android lấy `short_name` + `icons` của manifest.
 *
 * Mở trang bằng User-Agent iPhone (không phải bot) rồi đọc THẺ THẬT trong
 * `<head>` + manifest thật, cho hai bộ ảnh:
 *   A. bé có họ tên, không biệt danh, bìa đã chọn là tấm THỨ HAI (không phải
 *      tấm đầu) → "Bé Bảo An", icon = bia-vuong của bộ.
 *   B. không gắn bé, chưa chọn bìa → "Baby Bean", icon = logo hạt đậu.
 *
 * Fixture "Fixture BB-324-…", xoá theo id ở afterAll.
 * Chạy: `PW_PORT=3186 npx playwright test tests/e2e/bb-324-man-hinh-chinh.spec.ts --workers=1`.
 */

import { test, expect, devices } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-324-${runId}`;

function taoToken(): string {
  return randomBytes(17).toString("base64url").slice(0, 22);
}
function bam(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

test.use({ userAgent: devices["iPhone 13"].userAgent });

test.describe("BB-324: tên + icon khi thêm bộ ảnh vào màn hình chính", () => {
  let client: Client;
  const ids = { khach: "", be: "", boA: "", boB: "" };
  const tokenA = taoToken();
  const tokenB = taoToken();

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const branchId = br[0].id;

    const { rows: k } = await client.query(
      "insert into customers (branch_id, full_name) values ($1,$2) returning id",
      [branchId, `${NHAN} Khách`],
    );
    ids.khach = k[0].id;
    const { rows: b } = await client.query(
      "insert into babies (customer_id, full_name, nickname) values ($1,$2,null) returning id",
      [ids.khach, "Nguyễn Ngọc Bảo An"],
    );
    ids.be = b[0].id;

    const taoBo = async (babyId: string | null, nhan: string) => {
      const { rows } = await client.query(
        `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count)
         values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',2) returning id`,
        [branchId, ids.khach, babyId, `${NHAN} ${nhan}`, `fixture-bb324-${nhan}-${runId}`],
      );
      return rows[0].id as string;
    };
    ids.boA = await taoBo(ids.be, "A");
    ids.boB = await taoBo(null, "B");

    for (const bo of [ids.boA, ids.boB]) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,'dau.jpg','image/jpeg',1,'active'), ($1,$3,'bia.jpg','image/jpeg',2,'active')`,
        [bo, `fixture-bb324-dau-${bo}`, `fixture-bb324-bia-${bo}`],
      );
    }
    // Bộ A: bìa đã chọn là tấm THỨ HAI. Bộ B: chưa chọn bìa (cover_photo_id null).
    await client.query(
      `update galleries set cover_photo_id =
         (select id from photos where gallery_id = $1 and file_name = 'bia.jpg') where id = $1`,
      [ids.boA],
    );

    for (const [bo, token] of [
      [ids.boA, tokenA],
      [ids.boB, tokenB],
    ] as const) {
      await client.query(
        `insert into share_links (gallery_id, customer_id, token_hash, token_prefix, role, status)
         values ($1,null,$2,$3,'owner','active')`,
        [bo, bam(token), token.slice(0, 6)],
      );
    }
  });

  test.afterAll(async () => {
    if (!client) return;
    const bos = [ids.boA, ids.boB].filter(Boolean);
    if (bos.length) {
      await client.query("delete from share_links where gallery_id = any($1::uuid[])", [bos]);
      await client.query("update galleries set cover_photo_id = null where id = any($1::uuid[])", [bos]);
      await client.query("delete from photos where gallery_id = any($1::uuid[])", [bos]);
      await client.query("delete from galleries where id = any($1::uuid[])", [bos]);
    }
    if (ids.be) await client.query("delete from babies where id = $1", [ids.be]);
    if (ids.khach) await client.query("delete from customers where id = $1", [ids.khach]);
    await client.end();
  });

  /** Ảnh chụp bằng chứng: thẻ trong <head> (HTML gốc gửi iPhone) + manifest, không có ảnh trẻ em. */
  async function chupBangChung(
    page: import("@playwright/test").Page,
    head: string,
    manifest: unknown,
    tep: string,
  ) {
    const the = (head.match(/<(title|meta|link)[^>]*>(?:[^<]*<\/title>)?/g) ?? []).filter((t) =>
      /apple|manifest|<title/.test(t),
    );
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    await page.setContent(
      `<body style="font:14px/1.5 monospace;padding:16px;background:#fff">
        <h3>&lt;head&gt; (HTML gốc, User-Agent iPhone)</h3><pre>${esc(the.join("\n"))}</pre>
        <h3>manifest.webmanifest</h3><pre>${esc(JSON.stringify(manifest, null, 2))}</pre></body>`,
    );
    await page.screenshot({ path: `test-results/bb-324/${tep}`, fullPage: true });
  }

  /** Thẻ trong `<head>` của HTML gốc (trước khi JS chạy) — thứ Safari đọc được chắc chắn. */
  async function theTrongHeadGoc(request: import("@playwright/test").APIRequestContext, token: string) {
    const res = await request.get(`/g/${token}`, { headers: { "User-Agent": devices["iPhone 13"].userAgent } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const head = html.slice(0, html.indexOf("</head>"));
    return head;
  }

  test("A — bé có họ tên + bìa đã chọn: 'Bé Bảo An', icon là bìa cắt vuông", async ({ page, request }) => {
    await page.goto(`/g/${tokenA}`);

    const icon = page.locator('head link[rel="apple-touch-icon"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute("href", `/api/g/${tokenA}/bia-vuong?w=180`);
    await expect(icon).toHaveAttribute("sizes", "180x180");
    await expect(page.locator('head meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Bé Bảo An",
    );
    await expect(page).toHaveTitle("Bé Bảo An");

    const manifestHref = await page.locator('head link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBe(`/api/g/${tokenA}/manifest.webmanifest`);
    const manifest = await (await request.get(manifestHref!)).json();
    expect(manifest.short_name).toBe("Bé Bảo An");
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      `/api/g/${tokenA}/bia-vuong?w=192`,
      `/api/g/${tokenA}/bia-vuong?w=512`,
    ]);

    // Icon tải được, là ảnh (không phải trang lỗi).
    const anh = await request.get(`/api/g/${tokenA}/bia-vuong?w=180`, { maxRedirects: 0 });
    expect(anh.status()).toBe(200);
    expect(anh.headers()["content-type"]).toBe("image/jpeg");

    // HTML gốc gửi cho iPhone đã có sẵn thẻ trong <head>.
    const head = await theTrongHeadGoc(request, tokenA);
    expect(head).toContain(`rel="apple-touch-icon" href="/api/g/${tokenA}/bia-vuong?w=180"`);
    expect(head).toContain('name="apple-mobile-web-app-title" content="Bé Bảo An"');
    await chupBangChung(page, head, manifest, "man-hinh-chinh-A-co-bia.png");
  });

  test("B — không tên bé, chưa chọn bìa: 'Baby Bean', icon là logo", async ({ page, request }) => {
    await page.goto(`/g/${tokenB}`);

    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
    await expect(page.locator('head meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Baby Bean",
    );
    await expect(page).toHaveTitle("Baby Bean");

    const manifest = await (await request.get(`/api/g/${tokenB}/manifest.webmanifest`)).json();
    expect(manifest.short_name).toBe("Baby Bean");
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png"]);

    // Gọi thẳng bia-vuong của bộ chưa có bìa → chuyển về logo, không lấy tấm đầu.
    const anh = await request.get(`/api/g/${tokenB}/bia-vuong?w=180`, { maxRedirects: 0 });
    expect(anh.status()).toBe(302);
    expect(new URL(anh.headers()["location"] ?? "", "http://x").pathname).toBe("/apple-touch-icon.png");
    await chupBangChung(page, await theTrongHeadGoc(request, tokenB), manifest, "man-hinh-chinh-B-khong-bia.png");
  });

  test("manifest chung của app: 'Baby Bean Studio' / 'Baby Bean'", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.name).toBe("Baby Bean Studio");
    expect(m.short_name).toBe("Baby Bean");
  });
});
