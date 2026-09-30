/**
 * BB-333 — ĐO tốc độ tải bốn màn chính trên điện thoại (không canh gì, chỉ in số).
 *
 * OWNER: QA-BOT. Chỉ chạy khi đặt `DO_TOC_DO=1` — không nằm trong lượt e2e
 * thường (mỗi màn tải 3 lần dưới mạng 4G giả lập, mất vài phút).
 *
 * Cách chạy đúng (đo BẢN BUILD, không đo `next dev`):
 *   npm run build
 *   PHEP_THU_TRINH_DUYET=1 node --require ./tests/fixtures/mock-drive-network.cjs \
 *     ./node_modules/next/dist/bin/next start -p 3198
 *   DO_TOC_DO=1 PW_PORT=3198 npx playwright test tests/e2e/bb-333-do-toc-do.spec.ts --workers=1
 *
 * Giả lập: 390×844, CPU chậm 4×, mạng "4G chậm" kiểu Lighthouse di động
 * (RTT 150 ms, tải xuống 1,6 Mbps, tải lên 750 kbps).
 *
 * Số in ra mỗi màn (trung vị 3 lần, lần đầu lạnh bỏ riêng):
 *   TTFB   — responseStart của tài liệu HTML
 *   LCP    — largest-contentful-paint
 *   XONG   — tới lúc mạng yên (networkidle) — tức mọi lượt gọi /api đã về
 *   JS     — tổng byte JS đã nén tải về (encodedBodySize)
 *   REQ    — số lượt tải (tài liệu + tài nguyên)
 *   API    — số lượt gọi /api (trừ /api/img) và lượt chậm nhất (ms)
 *
 * Dữ liệu: "Fixture BB-333 …" (1 khách, 1 bộ 425 ảnh, 1 link, 1 nhân viên
 * owner) — dọn theo id ở afterAll, kể cả tài khoản Auth.
 */
import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

test.skip(!process.env.DO_TOC_DO, "Chỉ đo khi DO_TOC_DO=1");
test.setTimeout(600_000);

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-333 ${runId}`;
const email = `test_bb333_owner_${runId}@demo.babybean.vn`;
const password = "Password123!";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const SO_LAN = 3;

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

interface SoDo {
  ttfb: number;
  lcp: number;
  xong: number;
  jsKb: number;
  req: number;
  api: number;
  apiCham: number;
  apiChamTen: string;
}

async function giaLapDienThoai(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  // Tắt bộ nhớ đệm HTTP để mỗi lần đo là một lần "mở app" thật (lần đầu của khách).
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
}

async function doMotMan(page: Page, duong: string): Promise<SoDo> {
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number };
    w.__lcp = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) w.__lcp = Math.max(w.__lcp, e.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* không hỗ trợ */
    }
  });
  const t0 = Date.now();
  await page.goto(duong, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 120_000 });
  const xong = Date.now() - t0 - 500; // networkidle = yên 500 ms
  return page.evaluate((xongMs) => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const js = res.filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name));
    const api = res.filter((r) => r.name.includes("/api/") && !r.name.includes("/api/img/"));
    let cham = 0;
    let chamTen = "";
    for (const r of api) {
      if (r.duration > cham) {
        cham = r.duration;
        chamTen = new URL(r.name).pathname;
      }
    }
    return {
      ttfb: Math.round(nav.responseStart),
      lcp: Math.round((window as unknown as { __lcp: number }).__lcp),
      xong: xongMs,
      jsKb: Math.round(js.reduce((t, r) => t + (r.encodedBodySize || r.transferSize || 0), 0) / 1024),
      req: res.length + 1,
      api: api.length,
      apiCham: Math.round(cham),
      apiChamTen: chamTen,
    };
  }, xong);
}

const trungVi = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

function inBang(ten: string, lan: SoDo[]) {
  const lanh = lan[0]!;
  const nong = lan.slice(1);
  const m = (k: keyof SoDo) => trungVi(nong.map((s) => s[k] as number));
  // eslint-disable-next-line no-console
  console.log(
    `[BB-333][${ten}] LẠNH ttfb=${lanh.ttfb} lcp=${lanh.lcp} xong=${lanh.xong} | ` +
      `TRUNG VỊ ${nong.length} lần: ttfb=${m("ttfb")} lcp=${m("lcp")} xong=${m("xong")} ` +
      `js=${m("jsKb")}KB req=${m("req")} api=${m("api")} api-chậm-nhất=${m("apiCham")}ms (${lanh.apiChamTen})`,
  );
}

test.describe("BB-333: đo tốc độ bốn màn", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let staffId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const u = await suKienAdmin().auth.admin.createUser({ email, password, email_confirm: true });
    if (u.error) throw u.error;
    staffId = u.data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [staffId, `${NHAN} Owner`, email],
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000333') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',425,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb333-${runId}`],
    );
    galleryId = g[0].id;
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height, size_bytes)
       select $1, 'bb333-' || $2 || '-' || x, 'BB333_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active', 4000, 6000, 8000000
       from generate_series(1, 425) as x`,
      [galleryId, runId],
    );
    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) {
        await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
        await client.query("delete from selections where gallery_id = $1", [galleryId]);
        await client.query("delete from share_links where gallery_id = $1", [galleryId]);
        await client.query("delete from photos where gallery_id = $1", [galleryId]);
        await client.query("delete from galleries where id = $1", [galleryId]);
      }
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (staffId) {
        await client.query("delete from activity_logs where actor_id = $1", [staffId]).catch(() => {});
        await client.query("delete from staff_profiles where id = $1", [staffId]);
      }
      await client.end();
    }
    if (staffId) await suKienAdmin().auth.admin.deleteUser(staffId);
  });

  test("màn khách /g/[token] — lần đầu mở link (chưa có phiên)", async ({ browser }) => {
    const lan: SoDo[] = [];
    for (let i = 0; i <= SO_LAN; i++) {
      // Mỗi lần một ngữ cảnh mới = khách vừa bấm link lần đầu (chưa có cookie).
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await giaLapDienThoai(page);
      lan.push(await doMotMan(page, `/g/${maLink}`));
      await ctx.close();
    }
    inBang("khach-lan-dau", lan);
  });

  test("ba màn quản trị", async ({ browser }) => {
    const ctx = await browser.newContext();
    const dn = await ctx.newPage();
    await dangNhapNhanVien(dn, email, password);
    await dn.close();
    for (const [ten, duong] of [
      ["ban-lam-viec", "/admin"],
      ["quan-ly-bo-anh", "/admin/galleries"],
      ["viec-can-xu-ly", "/admin/viec-can-xu-ly"],
    ] as const) {
      const lan: SoDo[] = [];
      for (let i = 0; i <= SO_LAN; i++) {
        const page = await ctx.newPage();
        await giaLapDienThoai(page);
        lan.push(await doMotMan(page, duong));
        await page.close();
      }
      inBang(ten, lan);
    }
    await ctx.close();
  });
});
