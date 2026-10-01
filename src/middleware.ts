/**
 * Edge middleware: route gating, session refresh, security headers.
 *
 * OWNER: SEC-ARCH. Task BB-020, BB-075.
 * Spec: docs/05-rbac.md §3, docs/12-security.md §6
 *
 * This is layer 1 of 3. It stops the obvious cases cheaply; it is NOT the
 * authorization boundary. Route handlers still call requireRole/requireBranch,
 * and RLS still guards the database.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { HEADER_NGUOI_DUNG, kyNguoiDung } from "@/lib/auth/dau-nguoi-dung";

/** Shape @supabase/ssr passes to setAll. */
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

const PUBLIC_PATHS = ["/api/auth", "/api/webhooks", "/api/cron"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // BB-341 — dấu "đã xác thực" chỉ được do CHÍNH middleware này đặt. Bản gửi
  // từ ngoài vào (giả mạo) bị xoá trước mọi thứ khác, trên MỌI đường.
  // Xoá không được thì từ chối luôn (đóng cửa khi nghi ngờ) — request bình
  // thường không bao giờ mang header này.
  if (request.headers.has(HEADER_NGUOI_DUNG)) {
    try {
      request.headers.delete(HEADER_NGUOI_DUNG);
    } catch {
      return new NextResponse(null, { status: 400 });
    }
  }
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
      const redirectResponse = NextResponse.redirect(url);
      applySecurityHeaders(redirectResponse, pathname);
      return redirectResponse;
    }

    // BB-341 — chuyển lời đáp của getUser() xuống `requireStaff()` (layout,
    // trang) để nó KHÔNG hỏi Supabase Auth lần hai. Ký bằng APP_SECRET, gắn
    // với đúng header cookie đi tiếp (đã gồm phiên vừa làm mới, nếu có) — xem
    // src/lib/auth/dau-nguoi-dung.ts. Không ký được thì thôi: requireStaff tự
    // hỏi lại như cũ.
    const dau = await kyNguoiDung(data.user.id, request.headers.get("cookie") ?? "");
    if (dau) {
      const headersDi = new Headers(request.headers);
      headersDi.set(HEADER_NGUOI_DUNG, dau);
      const tiep = NextResponse.next({ request: { headers: headersDi } });
      for (const c of response.cookies.getAll()) tiep.cookies.set(c);
      response = tiep;
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
      // BB-314: ảnh nhỏ (lưới/thu nhỏ, w<=800) nay điều hướng 302 thẳng sang
      // lh3.googleusercontent.com thay vì đi qua hàm Vercel — xem
      // src/app/api/img/[photoId]/route.ts. Không có nguồn này thì CSP chặn
      // trình duyệt tải ảnh sau khi theo điều hướng, dù route đã xét quyền
      // đúng và trả Location đúng.
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      // 'unsafe-eval' CHỈ ở môi trường dev. Hot-reload của Next dùng eval; CSP
      // chặn nó thì React không hydrate được, và hậu quả không hề giống một lỗi
      // bảo mật: mọi nút bấm chết lặng, form gửi theo kiểu mặc định của trình
      // duyệt rồi tự xoá trắng. Ngày 10/09/2026 chủ studio bấm Đăng nhập, form
      // trắng xoá, không một thông báo nào — và tưởng mình gõ sai mật khẩu.
      //
      // Production KHÔNG có 'unsafe-eval'. Bản build không cần eval, và cho
      // phép nó ở đó là mở đường cho XSS chạy chuỗi thành mã.
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // BB-342: wss — websocket Supabase Realtime (cập nhật tức thì). Không có
      // thì trình duyệt chặn kết nối, màn chỉ còn lưới đỡ 30 giây.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
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
