/**
 * پارسر پیامک‌های بانکی ایرانی — جنریک و مستقل از بانک.
 *
 * طراحی به صورت «جدول‌کلیدواژه‌ای» است تا با هر بانکی کار کند:
 *   ۱. نرمال‌سازی متن (ارقام فارسی/عربی، ی/ک عربی، جداکننده‌ها، نیم‌فاصله)
 *   ۲. استخراج مبلغ / کارمزد / مانده با برچسب‌های رایج («مبلغ»، «کارمزد»، «مانده»)
 *   ۳. تشخیص نوع (واریز/برداشت/کارمزد) با امتیازدهی کلیدواژه‌ها
 *   ۴. استخراج تاریخ (شمسی یا میلادی) و ساعت
 *   ۵. استخراج توکن‌های کارت/حساب و سمتِ آن‌ها («از …» / «به …»)
 *
 * این ماژول کاملاً خالص (Pure) است و به دیتابیس وابسته نیست؛
 * تطبیق توکن‌ها با حساب‌های کاربر در لایه API انجام می‌شود.
 */

import * as jalaali from "jalaali-js";
import { toShamsiDateString } from "./date-utils";

export type SmsKind = "deposit" | "withdrawal" | "fee" | "unknown";

export interface ParsedSms {
  /** آیا پارس موفق بود (حداقل مبلغ شناسایی شده باشد) */
  ok: boolean;
  /** در صورت شکست، دلیل آن */
  reason: string | null;
  /** نوع تشخیص‌داده‌شده؛ unknown یعنی باید از سمت حساب‌ها تعیین شود */
  kind: SmsKind;
  amount: number;
  fee: number;
  balance: number | null;
  dateIso: string;
  shamsiDate: string;
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
  tracking: string | null;
  /** توکن‌های رقم‌دار کارت/حساب موجود در متن (مثل 6219-86**-****-9023) */
  cardTokens: string[];
  /** توکن‌هایی که بعد از «از کارت/حساب …» آمده‌اند (سمت پرداخت‌کننده) */
  fromSideTokens: string[];
  /** توکن‌هایی که بعد از «به کارت/حساب …» آمده‌اند (سمت دریافت‌کننده) */
  toSideTokens: string[];
  /** نام احتمالی طرف مقابل («از طرف …» / «به نام …») */
  counterpartyHint: string | null;
  /** نام بانک اگر در متن ذکر شده باشد */
  bankHint: string | null;
  /** متن نرمال‌شده (برای هش و تشخیص تکراری) */
  normalized: string;
}

/* ------------------------------------------------------------------ */
/*  نرمال‌سازی                                                          */
/* ------------------------------------------------------------------ */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * نرمال‌سازی متن پیامک:
 * - ارقام فارسی/عربی → انگلیسی
 * - ی/ک/ه عربی → فارسی
 * - جداکننده هزارگان عربی (٬) → کاما، ویرگول/سیمیکلن عربی (، ؛) → «;»
 * - حذف نویسه‌های صفر-عرض (نیم‌فاصله و علائم جهت متن)
 * - فشرده‌سازی فاصله‌ها
 */
export function normalizeSmsText(raw: string): string {
  let s = String(raw ?? "");
  s = s.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "");
  s = s.replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
  s = s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ةۀ]/g, "ه");
  s = s.replace(/٬/g, ",");
  s = s.replace(/[،؛]/g, ";");
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** چهار رقم آخر بخش‌های عددی یک توکن (برای تطبیق کارت/حساب) */
export function tokenLast4(token: string): string {
  return token.replace(/[^0-9]/g, "").slice(-4);
}

/* ------------------------------------------------------------------ */
/*  کلیدواژه‌ها                                                          */
/* ------------------------------------------------------------------ */

/** کلیدواژه‌های واریز با وزن امتیاز */
const DEPOSIT_HINTS: [RegExp, number][] = [
  [/واریز/g, 3],
  [/وصول/g, 3],
  [/انتقال\s+از/g, 2],
  [/به\s+حساب\s+شما/g, 2],
  [/دریافت/g, 1],
  [/بستانکار/g, 1],
];

/** کلیدواژه‌های برداشت/هزینه با وزن امتیاز */
const WITHDRAW_HINTS: [RegExp, number][] = [
  [/برداشت/g, 3],
  [/خرید/g, 3],
  [/پرداخت/g, 2],
  [/انتقال\s+(?:وجه\s+)?به/g, 2],
  [/خودپرداز/g, 1],
  [/پایانه/g, 1],
  [/کارمزد/g, 1],
  [/بدهکار/g, 1],
];

/** نام بانک‌های رایج برای تشخیص از روی متن پیامک (ترتیب از خاص به عام) */
const BANK_HINTS = [
  "بلو",
  "سامان",
  "ملت",
  "ملی",
  "صادرات",
  "سپه",
  "پارسیان",
  "پاسارگاد",
  "تجارت",
  "آینده",
  "رفاه کارگران",
  "رفاه",
  "سینا",
  "خاورمیانه",
  "مهر ایران",
  "شهر",
  "انصاری",
  "گردشگری",
  "دیجیتال",
];

/* ------------------------------------------------------------------ */
/*  پارسر اصلی                                                          */
/* ------------------------------------------------------------------ */

interface Range {
  start: number;
  end: number;
}

function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

function toNumber(s: string): number {
  const n = parseInt(String(s).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseBankSms(raw: string): ParsedSms {
  const normalized = normalizeSmsText(raw);

  const empty: ParsedSms = {
    ok: false,
    reason: null,
    kind: "unknown",
    amount: 0,
    fee: 0,
    balance: null,
    dateIso: new Date().toISOString(),
    shamsiDate: toShamsiDateString(new Date()),
    hasExplicitDate: false,
    hasExplicitTime: false,
    tracking: null,
    cardTokens: [],
    fromSideTokens: [],
    toSideTokens: [],
    counterpartyHint: null,
    bankHint: null,
    normalized,
  };

  if (!normalized) {
    return { ...empty, reason: "متن پیامک خالی است." };
  }

  /** بازه‌های مصرف‌شده توسط فیلدهای شناسایی‌شده (برای جستجوی فالبک مبلغ) */
  const consumed: Range[] = [];
  const mark = (m: RegExpMatchArray | null) => {
    if (m && m.index !== undefined) {
      consumed.push({ start: m.index, end: m.index + m[0].length });
    }
  };

  /* ---------- ۱) مبلغ / کارمزد / مانده ---------- */
  const mAmount = normalized.match(/مبلغ\s*[:;()\-]*\s*([\d,]{3,})/);
  const mFee = normalized.match(/کارمزد\s*[:;()\-]*\s*([\d,]{3,})/);
  const mBalance = normalized.match(/مانده[^;\d]*([\d,]{3,})/);
  mark(mAmount);
  mark(mFee);
  mark(mBalance);

  const labeledAmount = mAmount ? toNumber(mAmount[1]) : 0;
  const labeledFee = mFee ? toNumber(mFee[1]) : 0;
  const balance = mBalance ? toNumber(mBalance[1]) : null;

  /* ---------- ۲) تاریخ و ساعت ---------- */
  // تاریخ شمسی: 1300 تا 1499 — تاریخ میلادی: 2000 تا 2099
  const mJDate = normalized.match(/(1[3-9]\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
  const mGDate = mJDate ? null : normalized.match(/(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
  const mTime = normalized.match(/(?:ساعت\s*)?(\d{1,2}):(\d{2})/);

  let hour = -1;
  let minute = -1;
  if (mTime) {
    const h = parseInt(mTime[1], 10);
    const mi = parseInt(mTime[2], 10);
    if (h <= 23 && mi <= 59) {
      hour = h;
      minute = mi;
      mark(mTime);
    }
  }
  const hasExplicitTime = hour >= 0;

  let date = new Date();
  let hasExplicitDate = false;
  const dm = mJDate || mGDate;
  if (dm) {
    const y = parseInt(dm[1], 10);
    const mo = parseInt(dm[2], 10);
    const d = parseInt(dm[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let gy = y;
      let gmo = mo;
      let gd = d;
      if (mJDate) {
        const g = jalaali.toGregorian(y, mo, d);
        gy = g.gy;
        gmo = g.gm;
        gd = g.gd;
      }
      // ساعت پیامک به وقت تهران (UTC+3:30) تفسیر می‌شود
      date = hasExplicitTime
        ? new Date(Date.UTC(gy, gmo - 1, gd, hour - 3, minute - 30))
        : new Date(Date.UTC(gy, gmo - 1, gd, 12, 0));
      hasExplicitDate = true;
      mark(dm);
    }
  } else if (hasExplicitTime) {
    // فقط ساعت ذکر شده — تاریخ امروز در نظر گرفته می‌شود
    const now = new Date();
    date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour - 3, minute - 30));
  }

  /* ---------- ۳) کد پیگیری ---------- */
  const mTrack = normalized.match(
    /(?:شناسه(?:\s*رسید)?|رسید\s*شماره|شماره\s*مرجع|شماره\s*پیگیری|کد\s*پیگیری|مرجع)\s*[:;\-]*\s*(\d{6,24})/
  );
  let tracking: string | null = null;
  if (mTrack) {
    tracking = mTrack[1];
    mark(mTrack);
  }

  /* ---------- ۴) توکن‌های کارت/حساب و سمت‌ها ---------- */
  const fromSideTokens: string[] = [];
  const toSideTokens: string[] = [];
  const cardTokenSet = new Set<string>();

  // «از/به کارت|حساب|شبا 1234-…» — جهت انتقال را مشخص می‌کند
  const SIDE_RE = /(?:^|[\s;])(از|به)\s*(?:شماره\s*)?(?:کارت|حساب|شبا)?\s*[:;\-]*\s*([0-9][0-9\-*]{3,})/g;
  for (const m of normalized.matchAll(SIDE_RE)) {
    const token = m[2];
    if (m[1] === "از") fromSideTokens.push(token);
    else toSideTokens.push(token);
    cardTokenSet.add(token);
    const start = m.index ?? 0;
    consumed.push({ start, end: start + m[0].length });
  }

  // توکن‌های دارای برچسب کارت/حساب بدون حرف اضافه («برداشت کارت 6219-…»)
  const CARD_KW_RE = /(?:کارت|حساب|شبا)\s*[:;\-]*\s*([0-9][0-9\-*]{3,})/g;
  for (const m of normalized.matchAll(CARD_KW_RE)) {
    cardTokenSet.add(m[1]);
    const start = m.index ?? 0;
    consumed.push({ start, end: start + m[0].length });
  }

  // شماره کارت ۱۶ رقمی بدون برچسب
  for (const m of normalized.matchAll(/(?:^|\s)([0-9]{16})(?=\s|$)/g)) {
    cardTokenSet.add(m[1]);
    const start = m.index ?? 0;
    consumed.push({ start, end: start + m[0].length });
  }

  /* ---------- ۵) طرف مقابل ---------- */
  const mCp = normalized.match(
    /(?:از طرف|به نام|بستانکار|پرداخت\s*کننده|دریافت\s*کننده)\s*[:;\-]*\s*([^;\d]{2,60})/
  );
  const counterpartyHint = mCp
    ? mCp[1].trim().replace(/\s+/g, " ").slice(0, 40) || null
    : null;

  /* ---------- ۶) نام بانک ---------- */
  let bankHint: string | null = null;
  for (const b of BANK_HINTS) {
    if (new RegExp(`(^|[^\\p{L}])${b}`, "u").test(normalized)) {
      bankHint = b;
      break;
    }
  }

  /* ---------- ۷) مبلغ اصلی (با فالبک بدون برچسب) ---------- */
  let amount = labeledAmount;
  if (!amount) {
    let best = 0;
    for (const m of normalized.matchAll(/[\d,]{4,}/g)) {
      const start = m.index ?? 0;
      const range = { start, end: start + m[0].length };
      if (consumed.some((r) => overlaps(r, range))) continue;
      const pure = m[0].replace(/,/g, "");
      if (pure.length > 11) continue; // احتمالاً شماره پیگیری/مرجع
      const v = toNumber(m[0]);
      if (v > best) best = v;
    }
    amount = best;
  }

  if (amount < 100) {
    return { ...empty, reason: "مبلغ معتبری در پیامک یافت نشد." };
  }

  /* ---------- ۸) تعیین نوع ---------- */
  // اگر «کارمزد» و «مبلغ» در یک جمله باشند، همان مبلغ خودِ کارمزد است.
  const karbarizIdx = normalized.indexOf("کارمزد");
  const amountIdx = mAmount?.index ?? -1;
  const sameClause =
    karbarizIdx >= 0 &&
    amountIdx >= 0 &&
    !normalized
      .slice(Math.min(karbarizIdx, amountIdx), Math.max(karbarizIdx, amountIdx))
      .includes(";");

  let kind: SmsKind = "unknown";
  let fee = 0;

  if (labeledFee && labeledFee === labeledAmount) {
    // «مبلغ» و «کارمزد» یکی هستند → پیامک کارمزد
    kind = "fee";
    amount = labeledFee;
  } else if (!labeledAmount && labeledFee) {
    // فقط کارمزد برچسب‌خورده → پیامک کارمزد
    kind = "fee";
    amount = labeledFee;
  } else if (labeledAmount && sameClause) {
    // «کارمزد … مبلغ …» در یک جمله → پیامک کارمزد
    kind = "fee";
  } else {
    fee = labeledFee;
    let score = 0;
    for (const [re, w] of DEPOSIT_HINTS) score += [...normalized.matchAll(re)].length * w;
    for (const [re, w] of WITHDRAW_HINTS) score -= [...normalized.matchAll(re)].length * w;
    if (score >= 2) kind = "deposit";
    else if (score <= -2) kind = "withdrawal";
  }

  return {
    ok: true,
    reason: null,
    kind,
    amount,
    fee,
    balance,
    dateIso: date.toISOString(),
    shamsiDate: toShamsiDateString(date),
    hasExplicitDate,
    hasExplicitTime,
    tracking,
    cardTokens: [...cardTokenSet],
    fromSideTokens,
    toSideTokens,
    counterpartyHint,
    bankHint,
    normalized,
  };
}
