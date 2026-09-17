import { NextResponse } from "next/server";
import { getSyncVersion } from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * اندپوینت استعلام وضعیت تغییرات داده‌ها (Ultra-Lightweight Sync Status).
 * این اندپوینت به صورت فوق‌العاده سریع، یک توکن نگارش کوتاه را برمی‌گرداند.
 * اگر داده‌ای تغییر نکرده باشد، هیچ کوئری سنگینی اجرا نمی‌شود و کلاینت در کمترین زمان ممکن
 * و با مصرف کمتر از ۲۰ بایت پهنای باند و بدون درگیر کردن پردازنده سرور وضعیت را می‌فهمد.
 */
export async function GET(req: Request) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز" },
        { status: 401 }
      );
    }

    const version = await getSyncVersion();

    return NextResponse.json(
      { v: version },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { v: "err" },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
