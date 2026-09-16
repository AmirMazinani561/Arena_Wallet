/**
 * توابع اعتبارسنجی و پالایش امن ورودی‌های برنامه (Data Validation & Sanitization)
 */

/** پاکسازی تگ‌های HTML و کاراکترهای خطرناک از متون */
export function sanitizeString(val: unknown, maxLength = 500): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return null;
  // حذف هرگونه تگ HTML جهت ایمنی کامل
  const clean = str.replace(/<[^>]*>?/gm, "").trim().slice(0, maxLength);
  return clean || null;
}

/** اعتبارسنجی مبالغ مالی بزرگتر از صفر */
export function validatePositiveMoney(val: unknown): {
  valid: boolean;
  value: number;
  error?: string;
} {
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num)) {
    return { valid: false, value: 0, error: "مبلغ وارد شده یک عدد معتبر نیست." };
  }
  if (num <= 0) {
    return { valid: false, value: 0, error: "مبلغ تراکنش باید عددی بزرگتر از صفر باشد." };
  }
  if (num > 1_000_000_000_000_000) {
    return { valid: false, value: 0, error: "مبلغ وارد شده بیش از حد مجاز است." };
  }
  return { valid: true, value: num };
}

/** اعتبارسنجی کارمزد یا مبالغ اختیاری غیرمنفی */
export function validateNonNegativeMoney(val: unknown): {
  valid: boolean;
  value: number;
  error?: string;
} {
  if (val === null || val === undefined || val === "") {
    return { valid: true, value: 0 };
  }
  const num = Number(val);
  if (!Number.isFinite(num) || isNaN(num) || num < 0) {
    return { valid: false, value: 0, error: "کارمزد نمی‌تواند منفی یا نامعتبر باشد." };
  }
  if (num > 1_000_000_000_000_000) {
    return { valid: false, value: 0, error: "مبلغ کارمزد بیش از حد مجاز است." };
  }
  return { valid: true, value: num };
}

/** اعتبارسنجی فرمت تاریخ شمسی YYYY/MM/DD */
export function isValidShamsiDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== "string") return false;
  const match = dateStr.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (year < 1300 || year > 1500) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (month > 6 && day > 30) return false;
  return true;
}
