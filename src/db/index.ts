/**
 * نقطه ورود پایگاه داده.
 *
 * از نسخه ۲.۰ برنامه از یک لایه اتصال دوگانه استفاده می‌کند که هم با
 * MySQL/MariaDB (هاست‌های دایرکت‌ادمین و سی‌پنل) و هم با PostgreSQL کار می‌کند.
 * منطق اصلی در فایل‌های client.ts و repo.ts قرار دارد.
 */
export { query, execute, dialect, closePools, readBool, readNumber } from "./client";
export * from "./repo";
