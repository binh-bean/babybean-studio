import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Anh khach hang di qua /api/img proxy, khong dung remote loader truc tiep.
    remotePatterns: [],
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
