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

export function WalletMark() {
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
          width: 300,
          height: 220,
          borderRadius: 40,
          background: "rgba(255,255,255,0.96)",
          boxShadow: "0 24px 60px rgba(3,105,161,0.45)",
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
            height: 56,
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            background: "#bae6fd",
          }}
        />
        {/* قفل / بند کیف */}
        <div
          style={{
            position: "absolute",
            right: -28,
            top: 88,
            width: 120,
            height: 82,
            borderRadius: 26,
            background: "#0284c7",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingLeft: 28,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              background: "#e0f2fe",
            }}
          />
        </div>
      </div>
    </div>
  );
}
