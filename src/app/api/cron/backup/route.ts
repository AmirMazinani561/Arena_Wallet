import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, createSnapshot } from "@/db/repo";

export const dynamic = "force-dynamic";

/**
 * بک‌آپ خودکار روزانه.
 *
 * این مسیر توسط Vercel Cron (تنظیم‌شده در vercel.json) هر روز فراخوانی می‌شود
 * و یک اسنپ‌شات کامل از حساب‌ها و تراکنش‌ها در جدول backup_snapshots ذخیره می‌کند.
 *
 * امنیت: اگر متغیر CRON_SECRET تعریف شده باشد، فقط درخواست‌هایی با
 * هدر «Authorization: Bearer <CRON_SECRET>» پذیرفته می‌شوند.
 * (Vercel این هدر را به صورت خودکار برای Cron Jobs ارسال می‌کند.)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
    }
  }

  try {
    await ensureDatabase();
    const meta = await createSnapshot("auto");
    return NextResponse.json({ success: true, snapshot: meta });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
