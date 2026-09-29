import type { NextConfig } from "next";
import path from "node:path";

/**
 * BB-323 — `next dev` ở thư mục GỐC không được nghe thư mục `.claude/` của
 * chính nó.
 *
 * Mọi worktree của agent nằm LỒNG trong gốc (`.claude/worktrees/bbNNN/`). Tailwind
 * v4 khai thư mục `.claude` với webpack như một phụ thuộc thư mục (nó không bị
 * gitignore, vì có `.claude/launch.json`), và webpack nghe ĐỆ QUY cả cây, bất kể
 * `.gitignore`. Nên mỗi ảnh chụp Playwright một agent ghi vào
 * `.claude/worktrees/<x>/test-results/`, mỗi lần agent sửa mã trong worktree của
 * nó, đều bắt dev server ở gốc dựng lại CSS và đẩy HMR xuống trình duyệt.
 * Đo 29/09/2026 (worktree bb323, cổng 3185): 10 lần ghi ảnh vào
 * `.claude/worktrees/x/test-results/` → 10 lượt hot-update; cùng 10 lần ghi vào
 * `test-results/` ở gốc → 0. Lượt chạy e2e ở gốc (cổng 3150) lúc 15:00 cùng
 * ngày: 14 lượt HMR trong 30 giây, POST /api/auth/gallery 22,8 s, trang kẹt
 * "Đang tải…" — bb-200/bb-245 đỏ, còn chạy ở worktree riêng thì xanh.
 *
 * Chỉ bỏ `<gốc>/.claude/` — KHÔNG bỏ mọi đường dẫn chứa "/.claude/": chính
 * worktree nằm dưới `.../babybean-studio/.claude/worktrees/bbNNN/`, bỏ theo chuỗi
 * con thì dev server trong worktree không nghe được `src/` của nó nữa.
 * Watchpack thử regex trên đường dẫn đã đổi `\` → `/`.
 */
const THU_MUC_CLAUDE_CUA_GOC = path.join(process.cwd(), ".claude").replace(/\\/g, "/");
const boQuaClaude = new RegExp(`^${THU_MUC_CLAUDE_CUA_GOC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`, "i");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // BB-324 — metadata luôn nằm trong <head> của HTML gốc, cho MỌI trình duyệt.
  // Từ Next 15.2, `generateMetadata` bất đồng bộ được "stream" xuống cuối
  // <body> cho trình duyệt thường (chỉ bot mới nhận bản chặn trong <head>).
  // Đo thật với User-Agent iPhone trên /g/<token>: <title>, manifest,
  // apple-mobile-web-app-title và apple-touch-icon đều nằm trong <body> —
  // Safari "Thêm vào MH chính" không thấy nên lấy tên miền làm tên và CHỤP
  // MÀN HÌNH làm icon. Chỉ trang /g/[token] có generateMetadata, nên cái giá
  // (HTML đợi 1 lượt xác thực token) chỉ rơi vào đúng trang cần nó.
  htmlLimitedBots: /.*/,
  webpack(webpackConfig, { dev }) {
    // Next mặc định: một RegExp bỏ node_modules/.git/.next. Chỉ nối thêm khi đúng
    // dạng đó; dạng khác (Next đổi sau này) thì để nguyên, không đánh rơi luật cũ.
    const cu = webpackConfig.watchOptions?.ignored;
    if (dev && cu instanceof RegExp) {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: new RegExp(`(?:${cu.source})|(?:${boQuaClaude.source})`, "i"),
      };
    }
    return webpackConfig;
  },
  images: {
    // Anh khach hang di qua /api/img proxy, khong dung remote loader truc tiep.
    remotePatterns: [],
  },
  async redirects() {
    // BB-280: sắp xếp lại menu quản trị. Ba trang báo cáo lỗi cũ gộp thành ba
    // tab của MỘT trang, và /admin/roles gộp vào /admin/staff làm tab thứ
    // hai — chuyển hướng để liên kết cũ (đã lưu, đã gửi) không bị 404.
    return [
      {
        source: "/admin/reports/loi-dong-bo",
        destination: "/admin/viec-can-xu-ly?tab=loi-dong-bo",
        permanent: false,
      },
      {
        source: "/admin/reports/link-sap-het-han",
        destination: "/admin/viec-can-xu-ly?tab=link-sap-het-han",
        permanent: false,
      },
      {
        source: "/admin/reports/over-quota",
        destination: "/admin/viec-can-xu-ly?tab=over-quota",
        permanent: false,
      },
      {
        source: "/admin/roles",
        destination: "/admin/staff?tab=vai-tro",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Trang gallery cua khach: khong cho index, khong ro ri referrer.
        source: "/g/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default config;
