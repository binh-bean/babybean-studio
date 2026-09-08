/**
 * Edge middleware: route gating, session refresh, security headers.
 *
 * OWNER: SEC-ARCH. Task BB-020.
 * Spec: docs/05-rbac.md §3, docs/12-security.md §6
 *
 * This is layer 1 of 3. It stops the obvious cases cheaply; it is NOT the
 * authorization boundary. Route handlers still call requireRole/requireBranch,
 * and RLS still guards the database.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Shape @supabase/ssr passes to setAll. */
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const PUBLIC_PATHS = ["/api/auth", "/api/webhooks", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (pathname.startsWith("/admin") && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (list: CookieToSet[]) => {
            for (const { name, value } of list) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of list) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    // getUser() revalidates against Supabase; getSession() would trust a cookie
    // the client could have forged.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  applySecurityHeaders(response, pathname);
  return response;
}

function applySecurityHeaders(response: NextResponse, pathname: string): void {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join("; "),
  );

  // Customer galleries must never be indexed — these pages contain photos of
  // children behind a shareable URL.
  if (pathname.startsWith("/g/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
