/**
 * شناسه‌های سرفصل‌های سیستمی «در انتظار دسته‌بندی».
 *
 * این ماژول عمداً هیچ وابستگی‌ای ندارد تا هم در کد سرور (repo.ts و API ها)
 * و هم در کامپوننت‌های کلاینت (بدون وارد کردن درایورهای دیتابیس) قابل استفاده باشد.
 * مقدارها باید دقیقاً با رکوردهای ساخته‌شده در ensureSystemCategories یکسان بمانند.
 */

export const PENDING_EXPENSE_CATEGORY_ID = "cat_pending_expense";
export const PENDING_INCOME_CATEGORY_ID = "cat_pending_income";
