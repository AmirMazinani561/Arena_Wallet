import { Pool as PgPool } from "pg";
import mysql from "mysql2/promise";

/**
 * لایه اتصال دوگانه به پایگاه داده.
 *
 * این ماژول به صورت خودکار تشخیص می‌دهد که آدرس DATABASE_URL مربوط به
 * MySQL/MariaDB (رایج در هاست‌های دایرکت‌ادمین و سی‌پنل) است یا PostgreSQL،
 * و اتصال مناسب را برقرار می‌کند. بنابراین یک کد واحد روی هر دو نوع هاست اجرا می‌شود.
 */

export type Dialect = "postgres" | "mysql";

/** دریافت رشته اتصال دیتابیس به صورت Lazy هنگام اجرای کوئری */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) {
    throw new Error(
      "DATABASE_URL تعریف نشده است. لطفاً فایل .env را بسازید یا متغیر محیطی DATABASE_URL را تنظیم نمایید."
    );
  }
  return url.trim();
}

/** تشخیص نوع پایگاه داده به صورت داینامیک */
export function getDialect(): Dialect {
  const url = process.env.DATABASE_URL || "";
  return url.startsWith("mysql://") || url.startsWith("mariadb://")
    ? "mysql"
    : "postgres";
}

/** مقدار پیش‌فرض دیالکت جهت سازگاری با ایمپورت‌های ثابت */
export const dialect: Dialect =
  (process.env.DATABASE_URL?.startsWith("mysql://") || process.env.DATABASE_URL?.startsWith("mariadb://"))
    ? "mysql"
    : "postgres";

/**
 * تشخیص محیط سرورلس (Vercel).
 * در این محیط هر درخواست ممکن است روی نمونه‌ای جدا اجرا شود؛ بنابراین باید
 * تعداد اتصال هر نمونه بسیار کم باشد تا سقف اتصال‌های دیتابیس پر نشود.
 */
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

type GlobalPools = typeof globalThis & {
  __walletPgPool?: PgPool;
  __walletMyPool?: mysql.Pool;
};

const g = globalThis as GlobalPools;

function getPgPool(): PgPool {
  if (!g.__walletPgPool) {
    const databaseUrl = getDatabaseUrl();
    const isLocal =
      databaseUrl.includes("localhost") ||
      databaseUrl.includes("127.0.0.1") ||
      databaseUrl.includes("::1");
    const needsSsl = !isLocal && process.env.DATABASE_SSL !== "false";

    g.__walletPgPool = new PgPool({
      connectionString: databaseUrl,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      max: isServerless ? 1 : 10,
      idleTimeoutMillis: isServerless ? 10000 : 30000,
      connectionTimeoutMillis: 15000,
      allowExitOnIdle: isServerless,
    });
  }
  return g.__walletPgPool;
}

function getMyPool(): mysql.Pool {
  if (!g.__walletMyPool) {
    const databaseUrl = getDatabaseUrl();
    const isLocal =
      databaseUrl.includes("localhost") ||
      databaseUrl.includes("127.0.0.1") ||
      databaseUrl.includes("::1");
    const needsSsl = !isLocal && process.env.DATABASE_SSL !== "false";

    g.__walletMyPool = mysql.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: isServerless ? 1 : 5,
      queueLimit: 0,
      charset: "utf8mb4",
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__walletMyPool;
}

/**
 * تبدیل نگه‌دارنده‌های «?» به قالب «$n» مخصوص PostgreSQL
 */
function toPgPlaceholders(sqlText: string): string {
  let index = 0;
  return sqlText.replace(/\?/g, () => `$${++index}`);
}

/**
 * تبدیل خطاهای فنی دیتابیس به پیام فارسی قابل فهم برای کاربر
 */
export function translateDbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();

  if (m.includes("password authentication failed") || m.includes("access denied")) {
    return "رمز عبور دیتابیس اشتباه است. مقدار DATABASE_URL را بررسی کنید (کاراکترهای خاص رمز باید encode شوند).";
  }
  if (m.includes("tenant or user not found")) {
    return "نام کاربری دیتابیس نامعتبر است. در Supabase باید به شکل postgres.PROJECT-REF باشد.";
  }
  if (m.includes("enotfound") || m.includes("getaddrinfo")) {
    return "آدرس سرور دیتابیس پیدا نشد. از رشته اتصال Pooler (پورت ۶۵۴۳) استفاده کنید.";
  }
  if (m.includes("etimedout") || m.includes("timeout")) {
    return "اتصال به دیتابیس زمان‌بر شد. سرویس دیتابیس ممکن است متوقف (Paused) باشد؛ از پنل Supabase آن را Restore کنید.";
  }
  if (m.includes("too many connections") || m.includes("max_client_conn")) {
    return "تعداد اتصال‌های دیتابیس پر شده است. حتماً از پورت ۶۵۴۳ (Transaction Pooler) استفاده کنید.";
  }
  if (m.includes("does not exist") && m.includes("relation")) {
    return "جداول دیتابیس وجود ندارند. برنامه به صورت خودکار آن‌ها را می‌سازد؛ صفحه را دوباره بارگذاری کنید.";
  }
  if (m.includes("permission denied")) {
    return "کاربر دیتابیس دسترسی کافی ندارد. دسترسی ساخت جدول (CREATE) را به آن بدهید.";
  }
  if (m.includes("ssl") || m.includes("certificate")) {
    return "خطای اتصال امن (SSL). اگر دیتابیس محلی است، متغیر DATABASE_SSL=false را تنظیم کنید.";
  }
  return `خطای دیتابیس: ${raw}`;
}

/**
 * اجرای پرس‌وجو روی دیتابیس فعال و بازگرداندن ردیف‌ها.
 * در تمام کد از نگه‌دارنده «?» استفاده می‌شود تا مستقل از نوع دیتابیس باشد.
 */
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const activeDialect = getDialect();
    if (activeDialect === "mysql") {
      const [rows] = await getMyPool().query(sqlText, params);
      return (Array.isArray(rows) ? rows : []) as T[];
    }

    const result = await getPgPool().query(toPgPlaceholders(sqlText), params);
    return result.rows as T[];
  } catch (err) {
    // خطای اصلی برای لاگ سرور حفظ می‌شود
    console.error("[DB]", sqlText.slice(0, 120), "→", err instanceof Error ? err.message : err);
    throw err;
  }
}

/** اجرای دستوری که نیازی به خروجی ندارد */
export async function execute(sqlText: string, params: unknown[] = []): Promise<void> {
  await query(sqlText, params);
}

/** تبدیل مقدار بولی به قالب قابل ذخیره در هر دو دیتابیس */
export function boolParam(value: boolean): boolean | number {
  return getDialect() === "mysql" ? (value ? 1 : 0) : value;
}

/** خواندن مقدار بولی (MySQL عدد ۰/۱ و PostgreSQL مقدار boolean برمی‌گرداند) */
export function readBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** خواندن مقدار عددی (برخی درایورها عدد را به صورت رشته برمی‌گردانند) */
export function readNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** تبدیل ستون به متن جهت جستجو (نحو در دو دیتابیس متفاوت است) */
export function castToText(column: string): string {
  return getDialect() === "mysql" ? `CAST(${column} AS CHAR)` : `CAST(${column} AS TEXT)`;
}

/** کلاینت اجرای دستورات درون یک تراکنش */
export interface TransactionClient {
  query: <T = Record<string, unknown>>(sqlText: string, params?: unknown[]) => Promise<T[]>;
  execute: (sqlText: string, params?: unknown[]) => Promise<void>;
}

/**
 * اجرای عملیات‌های چندمرحله‌ای در یک تراکنش اتمیک (ACID Transaction).
 * در صورت بروز هرگونه خطا، تمام تغییرات خودکار Rollback شده و دیتابیس بدون تغییر باقی می‌ماند.
 */
export async function withTransaction<T>(
  callback: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  const activeDialect = getDialect();

  if (activeDialect === "mysql") {
    const conn = await getMyPool().getConnection();
    try {
      await conn.beginTransaction();
      const txClient: TransactionClient = {
        query: async <R = Record<string, unknown>>(sqlText: string, params: unknown[] = []) => {
          const [rows] = await conn.query(sqlText, params);
          return (Array.isArray(rows) ? rows : []) as R[];
        },
        execute: async (sqlText: string, params: unknown[] = []) => {
          await conn.query(sqlText, params);
        },
      };
      const result = await callback(txClient);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error("[DB Transaction Error]", err instanceof Error ? err.message : err);
      throw err;
    } finally {
      conn.release();
    }
  } else {
    const client = await getPgPool().connect();
    try {
      await client.query("BEGIN");
      const txClient: TransactionClient = {
        query: async <R = Record<string, unknown>>(sqlText: string, params: unknown[] = []) => {
          const res = await client.query(toPgPlaceholders(sqlText), params);
          return res.rows as R[];
        },
        execute: async (sqlText: string, params: unknown[] = []) => {
          await client.query(toPgPlaceholders(sqlText), params);
        },
      };
      const result = await callback(txClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[DB Transaction Error]", err instanceof Error ? err.message : err);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** بستن اتصال‌ها (برای اسکریپت‌های خط فرمان) */
export async function closePools(): Promise<void> {
  if (g.__walletPgPool) {
    await g.__walletPgPool.end();
    g.__walletPgPool = undefined;
  }
  if (g.__walletMyPool) {
    await g.__walletMyPool.end();
    g.__walletMyPool = undefined;
  }
}
