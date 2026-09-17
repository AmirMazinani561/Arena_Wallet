/**
 * پارسر پیامک‌های بانکی ایرانی — جنریک و مستقل از بانک.
 *
 * طراحی به صورت «جدول‌کلیدواژه‌ای» است تا با هر بانکی کار کند:
 *   ۱. نرمال‌سازی متن (ارقام فارسی/عربی، ی/ک عربی، جداکننده‌ها، نیم‌فاصله)
 *   ۲. استخراج مبلغ / کارمزد / مانده با برچسب‌های رایج («مبلغ»، «کارمزد»، «مانده»/«موجودی») و علامت +/−
 *   ۳. تشخیص نوع (واریز/برداشت/کارمزد) با امتیازدهی کلیدواژه‌ها
 *   ۴. استخراج تاریخ (کامل شمسی/میلادی یا فشرده MMDD مثل «0620-14:48») و ساعت
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
  /** علامت صریح کنار مبلغ در متن پیامک (اگر باشد) — قوی‌ترین نشانه واریز/برداشت */
  amountSign: "+" | "-" | null;
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
  s = s.replace(/[−–—]/g, "-");
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
  [/نشست/g, 3],
  [/وصول/g, 3],
  [/انتقال\s+از/g, 2],
  [/به\s+حساب\s+شما/g, 2],
  [/دریافت/g, 1],
  [/بستانکار/g, 1],
];

/** کلیدواژه‌های برداشت/هزینه با وزن امتیاز */
const WITHDRAW_HINTS: [RegExp, number][] = [
  [/برداشت/g, 3],
  [/پرید/g, 3],
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

function makeTehranDate(gy: number, gm: number, gd: number, hour: number, minute: number): Date {
  const tehranOffsetMs = (3 * 60 + 30) * 60 * 1000;
  const epoch = Date.UTC(gy, gm - 1, gd, hour, minute, 0) - tehranOffsetMs;
  return new Date(epoch);
}

/** نوع صریح تراکنش که کاربر در شورتکات انتخاب می‌کند */
export type ExplicitKind = "deposit" | "withdrawal" | "fee";

/**
 * پارس نوع صریح ارسالی از شورتکات/کلاینت (body.kind یا ?kind=...).
 * مقادیر انگلیسی (با هر بزرگی/کوچکی حروف) و فارسی پذیرفته می‌شود؛
 * هر چیز دیگری null برمی‌گرداند تا پارسر خودکار تصمیم بگیرد.
 */
export function parseExplicitKind(v: unknown): ExplicitKind | null {
  if (typeof v !== "string") return null;
  const low = v.trim().toLowerCase();
  if (low === "deposit") return "deposit";
  if (low === "withdrawal") return "withdrawal";
  if (low === "fee") return "fee";
  const s = normalizeSmsText(v).trim();
  if (s === "واریز") return "deposit";
  if (s === "برداشت") return "withdrawal";
  if (s === "کارمزد") return "fee";
  return null;
}

export function parseBankSms(raw: string): ParsedSms {
  const normalized = normalizeSmsText(raw);

  const empty: ParsedSms = {
    ok: false,
    reason: null,
    kind: "unknown",
    amount: 0,
    fee: 0,
    amountSign: null,
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
  // پشتیبانی از انواع پیشوندهای متداول بانکی (مبلغ، انتقال، انتقال+کارمزد، واریز، برداشت، خرید)
  // علامت قبل یا بعد از عدد با یا بدون فاصله استخراج می‌شود
  const mAmount = normalized.match(
    /(?:مبلغ|انتقال(?:\s*\+\s*کارمزد)?|واریز|برداشت|خرید)\s*[:;()]*\s*([+\-])?\s*([\d,]{3,})\s*([+\-])?/
  );

  // کارمزد مستقل: فقط در صورتی که بخشی از برچسب «انتقال+کارمزد» نباشد
  let mFee: RegExpMatchArray | null = null;
  const feeMatch = normalized.match(/(?:^|[^\p{L}])کارمزد\s*[:;()\-]*\s*([\d,]{3,})/u);
  if (feeMatch) {
    const idx = feeMatch.index ?? 0;
    const before = normalized.slice(Math.max(0, idx - 10), idx);
    if (!/انتقال\s*\+?/.test(before)) {
      mFee = feeMatch;
    }
  }

  const mBalance = normalized.match(/(?:مانده|موجودی)[^;\d]*([\d,]{3,})/);
  mark(mAmount);
  if (mFee) mark(mFee);
  mark(mBalance);

  const labeledAmount = mAmount ? toNumber(mAmount[2]) : 0;

  // علامت کنار مبلغ: اول قبل از عدد، وگرنه بعد از عدد —
  // «+» علامت قطعی واریز و «−» علامت قطعی برداشت است
  let amountSign: "+" | "-" | null = null;
  if (mAmount) {
    if (mAmount[1] === "+" || mAmount[1] === "-") {
      amountSign = mAmount[1];
    } else if (mAmount[3] === "+" || mAmount[3] === "-") {
      amountSign = mAmount[3];
    } else if (mAmount.index !== undefined) {
      const after = normalized.slice(mAmount.index + mAmount[0].length);
      const tm = after.match(/^\s*([+\-])/);
      if (tm) {
        const s = tm[1] as "+" | "-";
        const trimmedAfter = after.trimStart();
        const nx = trimmedAfter.length > 1 ? trimmedAfter[1] : "";
        if (s === "+" ? !/[0-9]/.test(nx) : nx === "" || /^(?:ریال|ريال|تومان|تومن)/.test(trimmedAfter.slice(1, 8)) || !/[\p{L}0-9]/u.test(nx)) {
          amountSign = s;
        }
      }
    }
  }
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
        ? makeTehranDate(gy, gmo, gd, hour, minute)
        : new Date(Date.UTC(gy, gmo - 1, gd, 12, 0, 0));
      hasExplicitDate = true;
      mark(dm);
    }
  }

  // تاریخ فشرده بدون سال (قالب برخی بانک‌ها مثل «0620-14:48» یا «05/30») —
  // فرض: ماه و روز شمسی از سال جاری؛ اگر در آینده بیفتد، متعلق به سال قبل است
  if (!hasExplicitDate) {
    const mMMDDt = normalized.match(/(?:^|[\s;_])(0[1-9]|1[0-2])([0-2][0-9]|3[01])[\s_]*[-_][\s_]*(\d{1,2}):(\d{2})/);
    const mMMDDs = mMMDDt
      ? null
      : normalized.match(/(?:^|[\s;_])(0[1-9]|1[0-2])[\/._]([0-2][0-9]|3[01])(?![\d\/.])/);
    const mm = mMMDDt || mMMDDs;
    if (mm) {
      const mo = parseInt(mm[1], 10);
      let dd = parseInt(mm[2], 10);
      if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) {
        const nowJ = jalaali.toJalaali(new Date());
        let jy = nowJ.jy;
        const pad2 = (n: number) => String(n).padStart(2, "0");
        dd = Math.min(dd, jalaali.jalaaliMonthLength(jy, mo));
        // اگر تاریخ به‌دست‌آمده در آینده است، متعلق به سال قبل است
        if (`${jy}/${pad2(mo)}/${pad2(dd)}` > toShamsiDateString(new Date())) jy -= 1;
        dd = Math.min(dd, jalaali.jalaaliMonthLength(jy, mo));
        const g = jalaali.toGregorian(jy, mo, dd);
        let hh = hour;
        let mi2 = minute;
        if (mMMDDt) {
          const h3 = parseInt(mm[3], 10);
          const mi3 = parseInt(mm[4], 10);
          if (h3 <= 23 && mi3 <= 59) {
            hh = h3;
            mi2 = mi3;
          }
        }
        date =
          hh >= 0
            ? makeTehranDate(g.gy, g.gm, g.gd, hh, mi2)
            : new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0));
        hasExplicitDate = true;
        mark(mm);
      }
    }
  }

  if (!hasExplicitDate && hasExplicitTime) {
    // فقط ساعت ذکر شده — تاریخ امروز در نظر گرفته می‌شود
    const now = new Date();
    date = makeTehranDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), hour, minute);
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
  const SIDE_RE = /(?:^|[\s;])(از|به)\s*(?:شماره\s*)?(?:کارت|حساب|شبا)?\s*[:;\-]*\s*([0-9][0-9.\-*]{3,})/g;
  for (const m of normalized.matchAll(SIDE_RE)) {
    const token = m[2];
    if (m[1] === "از") fromSideTokens.push(token);
    else toSideTokens.push(token);
    cardTokenSet.add(token);
    const start = m.index ?? 0;
    consumed.push({ start, end: start + m[0].length });
  }

  // توکن‌های دارای برچسب کارت/حساب بدون حرف اضافه («برداشت کارت 6219-…»)
  const CARD_KW_RE = /(?:کارت|حساب|شبا)\s*[:;\-]*\s*([0-9][0-9.\-*]{3,})/g;
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

  // شماره حساب نقطه‌دار بدون برچسب («292.8000.10195601.1» پاسارگاد) —
  // باید حتماً نقطه داشته باشد (تا مبلغ ساده، حساب خوانده نشود) و روی بازه مصرف‌شده (مثل تاریخ) نیفتد
  for (const m of normalized.matchAll(/(?:^|[\s;_])([0-9][0-9.]{4,})(?=[\s;_]|$)/g)) {
    const tok = m[1].replace(/\.+$/, "");
    if (tok.length < 5 || !tok.includes(".")) continue;
    const start = (m.index ?? 0) + m[0].length - m[1].length;
    const range = { start, end: start + tok.length };
    if (consumed.some((r) => overlaps(r, range))) continue;
    cardTokenSet.add(tok);
    consumed.push(range);
  }

  // شماره حساب بلند (۱۰ تا ۱۶ رقم) بدون برچسب («80000609969009» پارسیان) —
  // اگر قبلش برچسب مبلغ/انتقال یا بعدش واحد پول باشد، مبلغ است نه شماره حساب
  for (const m of normalized.matchAll(/(?:^|[\s;_])([0-9]{10,16})(?=[\s;_]|$)/g)) {
    const start = (m.index ?? 0) + m[0].length - m[1].length;
    const range = { start, end: start + m[1].length };
    if (consumed.some((r) => overlaps(r, range))) continue;
    const beforeTxt = normalized.slice(Math.max(0, start - 12), start);
    const afterTxt = normalized.slice(range.end, range.end + 12);
    if (/مبلغ|انتقال|برداشت|واریز|کارمزد/.test(beforeTxt)) continue;
    if (/ریال|ريال|تومان|تومن/.test(afterTxt)) continue;
    cardTokenSet.add(m[1]);
    consumed.push(range);
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
    // بدون برچسب «مبلغ»: بزرگ‌ترین عدد آزاد — با رد کردن تکه‌های شماره کارت/حساب و شماره‌های مرجع
    // و خواندن علامت چسبیده به عدد («-500,000» یا «100,000,000+» با یا بدون فاصله تا ریال)
    let best = 0;
    let bestSign: "+" | "-" | null = null;
    for (const m of normalized.matchAll(/[\d,]{4,}/g)) {
      const start = m.index ?? 0;
      const range = { start, end: start + m[0].length };
      if (consumed.some((r) => overlaps(r, range))) continue;
      const chBefore = start > 0 ? normalized[start - 1] : "";
      const chBefore2 = start > 1 ? normalized[start - 2] : "";
      const chAfter = range.end < normalized.length ? normalized[range.end] : "";
      const chAfter2 = range.end + 1 < normalized.length ? normalized[range.end + 1] : "";
      // اگر با جداکننده به ارقام دیگری وصل است، تکه‌ای از یک شماره (کارت/حساب) است نه مبلغ
      if ("-./:*".includes(chBefore) && /[0-9]/.test(chBefore2)) continue;
      if ("./:*".includes(chAfter) && /[0-9]/.test(chAfter2)) continue;
      // شماره پیگیری/مرجع/سند، مبلغ نیست
      const beforeWord = normalized.slice(Math.max(0, start - 10), start);
      if (/پیگیری|مرجع|ارجاع|سند/.test(beforeWord)) continue;
      const pure = m[0].replace(/,/g, "");
      if (pure.length > 15) continue; // شماره کارت ۱۶ رقمی رد می‌شود، اما مبالغ بالای ۱۰ رقم (ریال) پذیرفته می‌شوند
      const v = toNumber(m[0]);
      if (v <= best) continue;
      best = v;
      bestSign = null;
      // علامت قبل یا بعد از عدد (با یا بدون فاصله)
      const afterSlice = normalized.slice(range.end, range.end + 8);
      const signMatch = afterSlice.match(/^\s*([+\-])/);
      if ((chBefore === "+" || chBefore === "-") && !/[0-9]/.test(chBefore2)) {
        bestSign = chBefore;
      } else if (signMatch) {
        const s = signMatch[1] as "+" | "-";
        const trimmed = afterSlice.trimStart();
        const nx = trimmed.length > 1 ? trimmed[1] : "";
        if (s === "+" ? !/[0-9]/.test(nx) : nx === "" || /^(?:ریال|ريال|تومان|تومن)/.test(trimmed.slice(1)) || !/[\p{L}0-9]/u.test(nx)) {
          bestSign = s;
        }
      }
    }
    amount = best;
    amountSign = bestSign;
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

  const isTransferWithFee = mAmount && /انتقال\s*\+\s*کارمزد/.test(mAmount[0]);

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
  } else if (labeledAmount && sameClause && !isTransferWithFee) {
    // «کارمزد … مبلغ …» در یک جمله (مگر اینکه پیشوند انتقال+کارمزد باشد) → پیامک کارمزد
    kind = "fee";
  } else {
    fee = labeledFee;
    let score = 0;
    for (const [re, w] of DEPOSIT_HINTS) score += [...normalized.matchAll(re)].length * w;
    for (const [re, w] of WITHDRAW_HINTS) score -= [...normalized.matchAll(re)].length * w;
    // علامت صریح کنار مبلغ، قوی‌ترین نشانه است و بر کلیدواژه‌ها غلبه می‌کند
    if (amountSign === "+") score += 5;
    else if (amountSign === "-") score -= 5;
    if (score >= 2) kind = "deposit";
    else if (score <= -2) kind = "withdrawal";
  }

  return {
    ok: true,
    reason: null,
    kind,
    amount,
    fee,
    amountSign,
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
