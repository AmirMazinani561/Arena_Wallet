import type { MetadataRoute } from "next";

/**
 * مانیفست PWA — به صورت خودکار در مسیر /manifest.webmanifest تولید می‌شود.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "کیف پول هوشمند",
    short_name: "کیف پول",
    description: "نرم‌افزار حسابداری و کیف پول شخصی با تقویم شمسی",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0284c7",
    theme_color: "#0284c7",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
