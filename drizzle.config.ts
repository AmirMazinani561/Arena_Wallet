import "dotenv/config";
import type { Config } from "drizzle-kit";

/**
 * آدرس دیتابیس از فایل .env خوانده می‌شود تا هنگام استقرار روی سرور
 * یا سرویس‌های ابری (Vercel / Neon / Supabase) نیازی به تغییر کد نباشد.
 */
const databaseUrl =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
} satisfies Config;
