import { NextResponse } from "next/server";
import crypto from "crypto";
import { translateDbError } from "@/db/client";
import { ensureDatabase, createSnapshot } from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * بک‌آپ خودکار روزانه.
 *
 * این مسیر توسط Vercel Cron (تنظیم‌شده در vercel.json) هر روز فراخوانی می‌شود
 * و یک اسنپ‌شات کامل از حساب‌ها و تراکنش‌ها در جدول backup_snapshots ذخیره می‌کند.
 *
 * امنیت: اگر متغیر CRON_SECRET تعریف شده باشد، فقط درخواست‌هایی با
 * هدر «Authorization: Bearer <CRON_SECRET>» با مقایسه زمان‌ثابت پذیرفته می‌شوند.
 * در صورت عدم تنظیم متغیر، دسترسی فقط برای سشن معتبر ادمین مجاز خواهد بود تا از پر شدن دیتابیس توسط مهاجم ناشناس جلوگیری شود.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";

  let authorized = false;

  if (secret) {
    const expected = `Bearer ${secret}`;
    if (authHeader.length === expected.length) {
      authorized = crypto.timingSafeEqual(
        Buffer.from(authHeader),
        Buffer.from(expected)
      );
    }
  } else {
    const session = getSessionFromRequest(req);
    if (session) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      { error: "دسترسی غیرمجاز. کلید امنیتی یا احراز هویت معتبر الزامی است." },
      { status: 401 }
    );
  }

  try {
    await ensureDatabase();
    const meta = await createSnapshot("auto");
    return NextResponse.json({ success: true, snapshot: meta });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
