import { ImageResponse } from "next/og";
import { WalletMark } from "./icon";

/**
 * آیکون مخصوص افزودن به صفحه اصلی آیفون (Add to Home Screen).
 * Next.js این فایل را به صورت خودکار به <link rel="apple-touch-icon"> متصل می‌کند.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<WalletMark />, { ...size });
}
