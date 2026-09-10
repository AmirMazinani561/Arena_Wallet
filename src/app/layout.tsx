import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "کیف پول هوشمند",
  description: "نرم‌افزار حسابداری و کیف پول شخصی تحت وب با تقویم شمسی",
  applicationName: "کیف پول هوشمند",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "کیف پول",
  },
  formatDetection: { telephone: false },
  // آیکون‌ها و مانیفست از فایل‌های icon.tsx، apple-icon.tsx و manifest.ts به صورت خودکار تزریق می‌شوند
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0284c7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-[#f1f6fa] text-slate-800">{children}</body>
    </html>
  );
}
