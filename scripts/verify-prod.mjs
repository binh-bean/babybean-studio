#!/usr/bin/env node
/**
 * verify-prod — asks the live site what it is actually serving.
 *
 * OWNER: PM / reviewer gate. Agents run it, they do not edit it.
 *
 * Why this exists: local checks read local files. They cannot tell you that
 * Vercel silently rejected every deployment for two weeks, that the functions
 * run in Sydney instead of Singapore, or that a redirect goes out with none of
 * the security headers the middleware believes it sets. Those are questions
 * only production can answer, and asking it by hand does not scale.
 *
 * Nothing here needs a credential. Every check is something an anonymous
 * visitor can observe, which is the point: this is the attacker's view.
 *
 * Usage:
 *   npm run verify:prod
 *   npm run verify:prod -- https://babybean-studio.vercel.app
 */

const DEFAULT_URL = "https://babybeanstudio.vn";

/**
 * Deliberately NOT NEXT_PUBLIC_APP_URL: on a dev machine that points at
 * localhost:3000, and a "production" check that quietly tests your own laptop
 * is worse than no check at all. Explicit argument, then an explicit PROD_URL,
 * then the real production site.
 */
const base = (process.argv[2] || process.env.PROD_URL || DEFAULT_URL).replace(/\/$/, "");

/** Seeded in bb-dev, contains no real customer data. */
const DEMO_TOKEN = "DEMO-TOKEN-NO-PIN";

/** The compute region we pay the latency for. VN→Singapore ~76ms, VN→Sydney ~272ms. */
const WANT_REGION = "sin1";

const SECURITY_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
];

const SECRET_SHAPES = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "khoá secret Supabase"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key PEM"],
  [/postgres(?:ql)?:\/\/[^\s"']*:[^\s"'@]+@/, "chuỗi kết nối Postgres"],
  [/AIza[A-Za-z0-9_-]{30,}/, "khoá API Google"],
];

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

async function probe(path, options = {}) {
  const res = await fetch(base + path, { redirect: "manual", cache: "no-store", ...options });
  const body = res.headers.get("content-type")?.includes("text") ? await res.text() : "";
  return { status: res.status, headers: res.headers, body };
}

/**
 * x-vercel-id is "<edge pop>::<compute region>::<id>" when a function ran, and
 * "<edge pop>::<id>" when the response came straight from the edge cache.
 * A statically prerendered page therefore has no region, and that is correct —
 * only ask this question of a route that actually executes code.
 */
function computeRegion(headers) {
  const parts = (headers.get("x-vercel-id") ?? "").split("::");
  return parts.length >= 3 ? parts[1] : null;
}

async function main() {
  console.info(`\nĐang hỏi ${base} …\n`);

  const login = await probe("/login");
  const admin = await probe("/admin");
  const gallery = await probe(`/g/${DEMO_TOKEN}`);
  const api = await probe("/api/admin/galleries");

  // --- the site is up and routing correctly -------------------------------

  check("/login trả 200", login.status === 200, `nhận ${login.status}`);
  check("/admin chặn khách lạ", admin.status === 307 || admin.status === 302,
    `nhận ${admin.status}`);
  check("/admin chuyển về /login kèm next", (admin.headers.get("location") ?? "").startsWith("/login?next="),
    admin.headers.get("location") ?? "không có Location");
  check("Trang album của khách trả 200", gallery.status === 200, `nhận ${gallery.status}`);
  check("GET vào route chỉ nhận POST trả 405", api.status === 405, `nhận ${api.status}`);

  // --- running where we think it is running -------------------------------

  const region = computeRegion(gallery.headers);
  check(`Hàm chạy ở ${WANT_REGION} (Singapore)`, region === WANT_REGION,
    region ? `đang chạy ở ${region}` : "không đo được — route này phục vụ từ cache biên");

  // --- headers, on every response, including the redirect -----------------

  for (const [label, r] of [["/login", login], [`/g/${DEMO_TOKEN}`, gallery], ["/admin (redirect)", admin]]) {
    const missing = SECURITY_HEADERS.filter((h) => !r.headers.get(h));
    check(`Header an ninh đủ trên ${label}`, missing.length === 0,
      missing.length ? `thiếu: ${missing.join(", ")}` : `đủ ${SECURITY_HEADERS.length} header`);
  }

  check("HSTS bật", !!login.headers.get("strict-transport-security"),
    login.headers.get("strict-transport-security") ?? "không có");

  // Photos of children sit behind a shareable URL. A search engine that indexes
  // one of these pages puts them somewhere no one can take them back from.
  check("Trang album cấm lập chỉ mục",
    (gallery.headers.get("x-robots-tag") ?? "").includes("noindex"),
    gallery.headers.get("x-robots-tag") ?? "KHÔNG CÓ X-Robots-Tag");

  check("Trang album không được cache chung",
    (gallery.headers.get("cache-control") ?? "").includes("private") ||
    (gallery.headers.get("cache-control") ?? "").includes("no-store"),
    gallery.headers.get("cache-control") ?? "không có");

  // --- nothing secret in what an anonymous visitor can read ---------------

  const hits = [];
  for (const [label, r] of [["/login", login], [`/g/${DEMO_TOKEN}`, gallery], ["/admin", admin]]) {
    for (const [re, what] of SECRET_SHAPES) {
      if (re.test(r.body)) hits.push(`${what} → ${label}`);
    }
  }
  check("Không có bí mật trong phản hồi công khai", hits.length === 0,
    hits.length ? hits.join(" | ") : "3 trang, sạch");

  report();
}

function report() {
  const failed = results.filter((r) => !r.pass);
  console.info("=== verify:prod (hỏi thẳng site đang chạy thật) ===\n");
  for (const r of results) {
    console.info(`  ${r.pass ? "ĐẠT " : "HỎNG"}  ${r.name.padEnd(44)} ${r.detail}`);
  }
  console.info(`\n${results.length - failed.length}/${results.length} đạt\n`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("verify:prod lỗi:", err.message);
  process.exit(2);
});
