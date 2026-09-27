import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
