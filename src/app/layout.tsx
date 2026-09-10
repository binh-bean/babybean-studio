import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Be_Vietnam_Pro, Playfair_Display } from "next/font/google";
import { PWAInstallPrompt } from "@/components/ui/pwa-install-prompt";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-be-vietnam-pro",
});

const playfairDisplay = Playfair_Display({
  weight: ["400", "600", "700"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-playfair-display",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://babybean.vn"),
  title: {
    default: "BabyBean Studio",
    template: "%s | BabyBean Studio",
  },
  description: "Cổng xem và chọn ảnh dành cho ba mẹ tại BabyBean Studio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "BabyBean Studio - Lưu giữ khoảnh khắc ngọt ngào của bé",
    description: "Cổng xem và chọn ảnh dành cho ba mẹ tại BabyBean Studio",
    url: "/",
    siteName: "BabyBean Studio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BabyBean Studio - Nhiếp ảnh gia đình & em bé",
      },
    ],
    locale: "vi_VN",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${playfairDisplay.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <PWAInstallPrompt />
      </body>
    </html>
  );
}

