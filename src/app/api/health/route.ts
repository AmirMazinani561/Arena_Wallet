import { query, dialect, readNumber, translateDbError } from "@/db/client";
import { ensureDatabase } from "@/db/repo";
import { APP_VERSION, APP_BUILD_DATE, DB_LAYER } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * بررسی سلامت سرویس، اتصال پایگاه داده و آمادگی جداول.
 * پس از استقرار، آدرس /api/health را باز کنید تا از صحت نصب مطمئن شوید.
 */
export async function GET() {
  try {
    await query(`SELECT 1`);

    let tablesReady = false;
    let accountCount = 0;
    let txCount = 0;

    try {
      await ensureDatabase();
      const [accRows, txRows] = await Promise.all([
        query<{ c: number }>(`SELECT COUNT(*) AS c FROM accounts`),
        query<{ c: number }>(`SELECT COUNT(*) AS c FROM transactions`),
      ]);
      accountCount = readNumber(accRows[0]?.c);
      txCount = readNumber(txRows[0]?.c);
      tablesReady = true;
    } catch {
      tablesReady = false;
    }

    return Response.json({
      ok: true,
      version: APP_VERSION,
      buildDate: APP_BUILD_DATE,
      dbLayer: DB_LAYER,
      database: "connected",
      dialect,
      tablesReady,
      accountCount,
      transactionCount: txCount,
      hint: tablesReady
        ? "سیستم آماده استفاده است."
        : "اتصال برقرار است اما ساخت جداول با خطا مواجه شد. دسترسی کاربر دیتابیس را بررسی کنید.",
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return Response.json(
      {
        ok: false,
        version: APP_VERSION,
        database: "disconnected",
        dialect,
        error: message,
        hint: "مقدار DATABASE_URL در فایل .env را بررسی کنید و از فعال بودن سرویس دیتابیس مطمئن شوید.",
      },
      { status: 500 }
    );
  }
}
