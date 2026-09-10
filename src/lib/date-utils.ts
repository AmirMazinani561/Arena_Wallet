import * as jalaali from "jalaali-js";

export const PERSIAN_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function toShamsiDateString(date: Date | string | number): string {
  const d = new Date(date);
  const j = jalaali.toJalaali(d);
  const m = String(j.jm).padStart(2, "0");
  const day = String(j.jd).padStart(2, "0");
  return `${j.jy}/${m}/${day}`;
}

export function formatShamsiDisplay(date: Date | string | number): string {
  const d = new Date(date);
  const j = jalaali.toJalaali(d);
  const monthName = PERSIAN_MONTH_NAMES[j.jm - 1] || "";
  return `${j.jd} ${monthName} ${j.jy}`;
}

export function getCurrentShamsi(): { jy: number; jm: number; jd: number; formatted: string; fullText: string } {
  const now = new Date();
  const j = jalaali.toJalaali(now);
  const m = String(j.jm).padStart(2, "0");
  const d = String(j.jd).padStart(2, "0");
  return {
    jy: j.jy,
    jm: j.jm,
    jd: j.jd,
    formatted: `${j.jy}/${m}/${d}`,
    fullText: `${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${j.jy}`,
  };
}

export function shamsiToGregorian(shamsiStr: string): Date {
  const parts = shamsiStr.split("/").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return new Date();
  }
  const [jy, jm, jd] = parts;
  const g = jalaali.toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0));
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fa-IR").format(Math.round(amount));
}

/** تعداد روزهای هر ماه شمسی با در نظر گرفتن سال کبیسه */
export function getShamsiMonthLength(jy: number, jm: number): number {
  try {
    return jalaali.jalaaliMonthLength(jy, jm);
  } catch {
    return 31;
  }
}

/** آخرین روز ماه شمسی به صورت رشته 1403/07/30 */
export function shamsiMonthEnd(jy: number, jm: number): string {
  const len = getShamsiMonthLength(jy, jm);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(len).padStart(2, "0")}`;
}

/** تجزیه رشته تاریخ شمسی به اجزا */
export function parseShamsi(value: string): { jy: number; jm: number; jd: number } | null {
  const parts = value.split("/").map((p) => parseInt(p.trim(), 10));
  if (parts.length !== 3 || parts.some((p) => isNaN(p))) return null;
  return { jy: parts[0], jm: parts[1], jd: parts[2] };
}

/** ساخت رشته استاندارد تاریخ شمسی */
export function buildShamsi(jy: number, jm: number, jd: number): string {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

/** جداکننده هزارگان برای ورودی مبلغ (ریال) */
export function separateThousands(value: string): string {
  const digitsOnly = value.replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** تبدیل رشته دارای جداکننده به عدد خام */
export function parseAmount(value: string): number {
  const digitsOnly = value.replace(/[^\d]/g, "");
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

/** تبدیل عدد به حروف ریالی خلاصه (میلیون / میلیارد) جهت راهنمای کاربر */
export function amountToWords(amount: number): string {
  if (!amount) return "";
  if (amount >= 1_000_000_000) {
    const v = amount / 1_000_000_000;
    return `${v.toLocaleString("fa-IR", { maximumFractionDigits: 3 })} میلیارد ریال`;
  }
  if (amount >= 1_000_000) {
    const v = amount / 1_000_000;
    return `${v.toLocaleString("fa-IR", { maximumFractionDigits: 3 })} میلیون ریال`;
  }
  if (amount >= 1_000) {
    const v = amount / 1_000;
    return `${v.toLocaleString("fa-IR", { maximumFractionDigits: 3 })} هزار ریال`;
  }
  return `${formatMoney(amount)} ریال`;
}

export function toPersianDigits(n: number | string): string {
  const farsiDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return n.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x, 10)]);
}
