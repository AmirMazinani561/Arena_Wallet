import { ImageResponse } from "next/og";

/**
 * آیکون برنامه — در زمان بیلد به صورت خودکار تولید می‌شود.
 * مزیت: وابسته به آپلود فایل‌های پوشه public نیست و همیشه وجود دارد.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<WalletMark />, { ...size });
}

/**
 * طرح کیف پول با ابعاد پایه ۵۱۲. پارامتر scale همه ابعاد ثابت را متناسب
 * مقیاس می‌کند تا استفاده مجدد در کادرهای کوچک‌تر (مثل apple-icon ۱۸۰)
 * باعث سرریز و بریده شدن طرح نشود. مقدار پیش‌فرض ۱ یعنی بدون تغییر.
 */
export function WalletMark({ scale = 1 }: { scale?: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, #38bdf8 0%, #0284c7 55%, #0c4a6e 100%)",
      }}
    >
      {/* بدنه کیف پول */}
      <div
        style={{
          position: "relative",
          width: 300 * scale,
          height: 220 * scale,
          borderRadius: 40 * scale,
          background: "rgba(255,255,255,0.96)",
          boxShadow: `0 ${24 * scale}px ${60 * scale}px rgba(3,105,161,0.45)`,
          display: "flex",
        }}
      >
        {/* نوار بالایی */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 56 * scale,
            borderTopLeftRadius: 40 * scale,
            borderTopRightRadius: 40 * scale,
            background: "#bae6fd",
          }}
        />
        {/* قفل / بند کیف */}
        <div
          style={{
            position: "absolute",
            right: -28 * scale,
            top: 88 * scale,
            width: 120 * scale,
            height: 82 * scale,
            borderRadius: 26 * scale,
            background: "#0284c7",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 28 * scale,
          }}
        >
          <div
            style={{
              width: 34 * scale,
              height: 34 * scale,
              borderRadius: 17 * scale,
              background: "#e0f2fe",
            }}
          />
        </div>
      </div>
    </div>
  );
}
