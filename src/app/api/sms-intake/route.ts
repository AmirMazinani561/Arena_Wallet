import { NextResponse } from "next/server";
import crypto from "crypto";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  listSmsPatterns,
  createTransaction,
  findRecentDuplicateByHash,
  AccountRow,
  BANK_FEE_CATEGORY_ID,
  PENDING_EXPENSE_CATEGORY_ID,
  PENDING_INCOME_CATEGORY_ID,
} from "@/db/repo";
import { parseBankSms, normalizeSmsText, tokenLast4, parseExplicitKind, type SmsKind, KNOWN_BANKS } from "@/lib/sms-parser";
import { formatMoney } from "@/lib/date-utils";
import { sanitizeString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * اندپوینت ثبت سریع تراکنش از پیامک بانکی.
 *
 * ورودی (هر سه قالب پشتیبانی می‌شود):
 *   - JSON:    { "text": "متن پیامک", "token": "…", "dryRun": true, "description": "شرح دلخواه" }
 *   - Form:    text=…&token=…&description=…
 *   - متن خام: بدنه درخواست خودِ پیامک است (توکن از هدر یا کوئری)
 *
 * اگر description داده شود، به‌جای متن پیامک به‌عنوان شرح تراکنش ذخیره می‌شود؛
 * در غیر این صورت خودِ متن پیامک شرح خواهد بود.
 *
 * خروجی:
 *   - پیش‌فرض JSON کامل
 *   - با ?format=text فقط پیام فارسی آماده (برای «Show Notification» شورتکات iOS)
 *
 * امنیت: اگر متغیر محیطی SMS_INTAKE_TOKEN تنظیم شده باشد، همه درخواست‌ها
 * باید همان توکن را داشته باشند. در نبود آن (حالت تست) اندپوینت باز است —
 * مثل بقیه API های فعلی برنامه که ورود کاربر را اجباری نمی‌کنند.
 */

function intakeToken(): string | null {
  const t = process.env.SMS_INTAKE_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

/** مقایسه زمان-ثابت برای اینکه توکن از روی زمان پاسخ لو نرود */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function plain(message: string, status = 200): NextResponse {
  return new NextResponse(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export interface AccountCredentials {
  /** شماره کارت‌های ۱۶ رقمی کاربر (فقط ارقام خالص) */
  fullCards: string[];
  /** پیش‌شماره ۶ رقمی کارت‌ها (BIN) */
  cardPrefix6s: string[];
  /** شماره حساب‌های کامل کاربر (فقط ارقام خالص، طول >= 5) */
  fullAccounts: string[];
  /** شماره حساب بدون پسوند اعشاری/نقطه‌ای (هسته حساب پاسارگاد/سامان) */
  coreAccounts: string[];
  /** شماره‌های شبای ۲۴ رقمی */
  fullIbans: string[];
  /** ۴ رقم‌های آخر همه کارت‌ها و حساب‌ها */
  last4s: string[];
}

/** استخراج شناسنامه کامل تمام ارقام کارت، حساب و شبای یک حساب */
function extractAccountCredentials(acc: AccountRow): AccountCredentials {
  const fullCards: string[] = [];
  const cardPrefix6s: string[] = [];
  const fullAccounts: string[] = [];
  const coreAccounts: string[] = [];
  const fullIbans: string[] = [];
  const last4s = new Set<string>();

  const combined = `${acc.name} ${acc.detailInfo || ""}`;
  const norm = normalizeSmsText(combined);

  // ۱) استخراج شماره کارت‌های ۱۶ رقمی (با یا بدون جداکننده)
  for (const m of norm.matchAll(/(?:^|[^\d])(\d{4}[-\s.]\d{4}[-\s.]\d{4}[-\s.]\d{4})(?=[^\d]|$)/g)) {
    const clean = m[1].replace(/\D/g, "");
    if (clean.length === 16 && !fullCards.includes(clean)) {
      fullCards.push(clean);
      cardPrefix6s.push(clean.slice(0, 6));
      last4s.add(clean.slice(-4));
    }
  }
  for (const m of norm.matchAll(/(?:^|\D)(\d{16})(?=\D|$)/g)) {
    const clean = m[1];
    if (!fullCards.includes(clean)) {
      fullCards.push(clean);
      cardPrefix6s.push(clean.slice(0, 6));
      last4s.add(clean.slice(-4));
    }
  }

  // ۲) استخراج شبا (IR...)
  for (const m of norm.matchAll(/IR\s*([0-9]{24})/gi)) {
    const clean = m[1];
    if (!fullIbans.includes(clean)) {
      fullIbans.push(clean);
      last4s.add(clean.slice(-4));
    }
  }

  // ۳) استخراج شماره حساب‌های نقطه‌دار یا خط‌تیره‌دار (پاسارگاد و سامان)
  for (const m of norm.matchAll(/(?:^|[\s;_])([0-9][0-9.\-]{4,})(?=[\s;_]|$)/g)) {
    const rawTok = m[1];
    const clean = rawTok.replace(/\D/g, "");
    if (clean.length >= 6 && clean.length <= 18 && !fullCards.includes(clean)) {
      if (!fullAccounts.includes(clean)) fullAccounts.push(clean);
      last4s.add(clean.slice(-4));
      const stripped = rawTok.replace(/[\.\-]\d+$/, "");
      const strippedClean = stripped.replace(/\D/g, "");
      if (strippedClean !== clean && strippedClean.length >= 6) {
        if (!coreAccounts.includes(strippedClean)) coreAccounts.push(strippedClean);
      }
    }
  }

  // ۴) استخراج شماره حساب‌های ساده (۵ تا ۱۸ رقم)
  for (const m of norm.matchAll(/(?:^|\D)([0-9]{5,18})(?=\D|$)/g)) {
    const clean = m[1];
    if (!fullCards.includes(clean) && !fullIbans.includes(clean)) {
      if (!fullAccounts.includes(clean)) fullAccounts.push(clean);
      last4s.add(clean.slice(-4));
    }
  }

  // ۵) استخراج ۴ رقم‌های پایانی از هر توکن عددی ۳ رقمی یا بیشتر
  for (const m of norm.matchAll(/[0-9][0-9.\-*]{3,}/g)) {
    const l4 = tokenLast4(m[0]);
    if (l4.length === 4) last4s.add(l4);
  }

  return {
    fullCards,
    cardPrefix6s,
    fullAccounts,
    coreAccounts,
    fullIbans,
    last4s: Array.from(last4s),
  };
}

/** استخراج ۴ رقم‌های پایانی یک حساب جهت سازگاری کامل */
function accountLast4s(acc: AccountRow): string[] {
  return extractAccountCredentials(acc).last4s;
}

export async function GET() {
  return NextResponse.json({ ok: true, tokenRequired: Boolean(intakeToken()) });
}

export async function POST(req: Request) {
  const asText = new URL(req.url).searchParams.get("format") === "text";
  try {
    /* ---------- خواندن بدنه ---------- */
    let text = "";
    let bodyToken = "";
    let customDescription = "";
    let bodyKindRaw: unknown = null;
    let dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
    const queryKind = parseExplicitKind(new URL(req.url).searchParams.get("kind"));
    const ctype = (req.headers.get("content-type") || "").toLowerCase();

    if (ctype.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      text = String(body.text ?? "");
      bodyToken = String(body.token ?? "");
      customDescription = String(body.description ?? "");
      bodyKindRaw = body.kind;
      dryRun = dryRun || Boolean(body.dryRun);
    } else if (ctype.includes("form")) {
      const form = await req.formData().catch(() => null);
      if (form) {
        text = String(form.get("text") ?? "");
        bodyToken = String(form.get("token") ?? "");
        customDescription = String(form.get("description") ?? "");
      }
    } else {
      // بدنه متن خام — ساده‌ترین حالت برای شورتکات
      text = await req.text();
    }

    /* ---------- توکن ---------- */
    const explicitKind = parseExplicitKind(bodyKindRaw) ?? queryKind;
    const token = intakeToken();
    if (token) {
      const provided =
        bodyToken ||
        req.headers.get("x-intake-token") ||
        new URL(req.url).searchParams.get("token") ||
        "";
      if (!provided || !safeEqual(provided, token)) {
        const message = "⚠️ توکن ثبت سریع نامعتبر است.";
        return asText ? plain(message, 401) : NextResponse.json({ ok: false, message }, { status: 401 });
      }
    }

    await ensureDatabase();

    const rawText = String(text).trim().slice(0, 2000);
    if (!rawText) {
      const message = "⚠️ متن پیامک ارسال نشده است.";
      return asText ? plain(message, 400) : NextResponse.json({ ok: false, message }, { status: 400 });
    }

    /* ---------- پارس ---------- */
    const parsed = parseBankSms(rawText);
    if (!parsed.ok) {
      const message = `⚠️ پیامک بانکی شناسایی نشد — ${parsed.reason}`;
      return asText
        ? plain(message, 422)
        : NextResponse.json({ ok: false, reason: parsed.reason, message }, { status: 422 });
    }

    /* ---------- تشخیص تکراری (پنجره ۷ روزه) ---------- */
    const hashSha256 = crypto.createHash("sha256").update(parsed.normalized).digest("hex");
    const hashSha1 = crypto.createHash("sha1").update(parsed.normalized).digest("hex");
    const dup = await findRecentDuplicateByHash([hashSha256, hashSha1]);
    if (dup) {
      const payload = {
        ok: true,
        created: false,
        duplicate: true,
        transactionId: dup.id,
        message: "ℹ️ این پیامک قبلاً ثبت شده بود؛ تراکنش تکراری ساخته نشد.",
      };
      return asText ? plain(payload.message) : NextResponse.json(payload);
    }

    /* ---------- استخراج توکن‌های کارت و حساب به تفکیک مبدأ و مقصد ---------- */
    const accounts = await listAccounts();
    const assetAccounts = accounts.filter((a) => a.type === "bank" || a.type === "cash");

    const fromLast4 = new Set<string>();
    for (const t of parsed.fromSideTokens) {
      const l4 = tokenLast4(t);
      if (l4.length === 4) fromLast4.add(l4);
      const stripped = t.replace(/\.\d+$/, "");
      if (stripped !== t) {
        const l4s = tokenLast4(stripped);
        if (l4s.length === 4) fromLast4.add(l4s);
      }
    }

    const toLast4 = new Set<string>();
    for (const t of parsed.toSideTokens) {
      const l4 = tokenLast4(t);
      if (l4.length === 4) toLast4.add(l4);
      const stripped = t.replace(/\.\d+$/, "");
      if (stripped !== t) {
        const l4s = tokenLast4(stripped);
        if (l4s.length === 4) toLast4.add(l4s);
      }
    }

    const generalLast4 = new Set<string>();
    for (const t of parsed.cardTokens) {
      const l4 = tokenLast4(t);
      if (l4.length === 4) generalLast4.add(l4);
      const stripped = t.replace(/\.\d+$/, "");
      if (stripped !== t) {
        const l4s = tokenLast4(stripped);
        if (l4s.length === 4) generalLast4.add(l4s);
      }
    }

    const allSmsLast4 = new Set([...fromLast4, ...toLast4, ...generalLast4]);

    // قرینه جهت برای اولویت‌دهی به کارت مبدأ یا مقصد
    const likelyDeposit =
      parsed.amountSign === "+" ||
      parsed.kind === "deposit" ||
      explicitKind === "deposit" ||
      /(?:واریز|نشست|وصول|بستانکار|سود|حقوق)/.test(rawText);

    const likelyWithdrawal =
      parsed.amountSign === "-" ||
      parsed.kind === "withdrawal" ||
      parsed.kind === "fee" ||
      explicitKind === "withdrawal" ||
      /(?:برداشت|خرید|پرید|بدهکار|کارمزد)/.test(rawText);

    /* ---------- ارزیابی و امتیازدهی چندمعیاره همه حساب‌ها (Best-Match Scoring) ---------- */
    interface CandidateEvaluation {
      account: AccountRow;
      score: number;
      reasons: string[];
      matchedKind?: "deposit" | "withdrawal";
    }

    const trainedPatterns = await listSmsPatterns();
    const evaluatedCandidates: CandidateEvaluation[] = [];

    for (const acc of assetAccounts) {
      let score = 0;
      const reasons: string[] = [];
      let candidateMatchedKind: "deposit" | "withdrawal" | undefined;

      const cred = extractAccountCredentials(acc);
      const accCombined = `${acc.name} ${acc.detailInfo || ""}`;

      // =========================================================================
      // سطح ۱: انطباق قطعی تمام ارقام (Full-Digits 100% Match)
      // =========================================================================

      // ۱-الف) انطباق تمام ۱۶ رقم شماره کارت
      for (const fullCard of parsed.fullCardNumbers) {
        if (cred.fullCards.includes(fullCard)) {
          const isFrom = parsed.fromSideTokens.some((t) => t.replace(/\D/g, "").includes(fullCard));
          const isTo = parsed.toSideTokens.some((t) => t.replace(/\D/g, "").includes(fullCard));

          if (likelyWithdrawal && (isFrom || (!isFrom && !isTo))) {
            score += 260;
            reasons.push(`انطباق کامل ۱۶ رقم کارت مبدأ (${fullCard.slice(-4)})`);
            break;
          } else if (likelyDeposit && (isTo || (!isFrom && !isTo))) {
            score += 260;
            reasons.push(`انطباق کامل ۱۶ رقم کارت مقصد (${fullCard.slice(-4)})`);
            break;
          } else if (likelyWithdrawal && isTo) {
            score += 30;
            reasons.push(`کارت مقصد تراکنش (${fullCard.slice(-4)})`);
          } else {
            score += 240;
            reasons.push(`انطباق کامل ۱۶ رقم کارت (${fullCard.slice(-4)})`);
            break;
          }
        }
      }

      // ۱-ب) انطباق تمام ارقام شماره حساب یا شبا
      if (score < 200) {
        for (const accTok of parsed.accountTokens) {
          const isFrom = accTok.side === "from";
          const isTo = accTok.side === "to";
          const pure = accTok.pureDigits;

          if (cred.fullAccounts.includes(pure) || cred.coreAccounts.includes(pure) || cred.fullIbans.includes(pure)) {
            if (likelyWithdrawal && (isFrom || (!isFrom && !isTo))) {
              score += 250;
              reasons.push(`انطباق کامل شماره حساب مبدأ (${pure.slice(-4)})`);
              break;
            } else if (likelyDeposit && (isTo || (!isFrom && !isTo))) {
              score += 250;
              reasons.push(`انطباق کامل شماره حساب مقصد (${pure.slice(-4)})`);
              break;
            } else if (likelyWithdrawal && isTo) {
              score += 30;
              reasons.push(`حساب مقصد تراکنش (${pure.slice(-4)})`);
            } else {
              score += 230;
              reasons.push(`انطباق کامل شماره حساب (${pure.slice(-4)})`);
              break;
            }
          }
        }
      }

      // =========================================================================
      // سطح ۲: انطباق ارقام دوطرفه کارت‌های ماسک‌شده (۶ رقم اول + ۴ رقم آخر)
      // =========================================================================
      if (score < 200) {
        for (const masked of parsed.maskedCardTokens) {
          if (masked.prefix && masked.suffix && masked.prefix.length >= 4) {
            const matchedCard = cred.fullCards.find(
              (c) => c.startsWith(masked.prefix) && c.endsWith(masked.suffix)
            );
            if (matchedCard) {
              const isFrom = masked.side === "from";
              const isTo = masked.side === "to";
              if (likelyWithdrawal && (isFrom || (!isFrom && !isTo))) {
                score += 210;
                reasons.push(`انطباق ارقام اول و آخر کارت (${masked.prefix}...${masked.suffix})`);
                break;
              } else if (likelyDeposit && (isTo || (!isFrom && !isTo))) {
                score += 210;
                reasons.push(`انطباق ارقام اول و آخر کارت (${masked.prefix}...${masked.suffix})`);
                break;
              } else {
                score += 190;
                reasons.push(`انطباق ارقام اول و آخر کارت (${masked.prefix}...${masked.suffix})`);
                break;
              }
            }
          }
        }
      }

      // =========================================================================
      // سطح ۳: فالبک ۴ رقم آخر کارت/حساب (صرفاً در نبود انطباق کامل)
      // =========================================================================
      if (score < 180) {
        for (const l4 of cred.last4s) {
          if (likelyWithdrawal) {
            if (fromLast4.has(l4) || generalLast4.has(l4)) {
              score += 110;
              reasons.push(`۴ رقم کارت/حساب مبدأ (${l4})`);
              break;
            } else if (toLast4.has(l4)) {
              score += 25;
              reasons.push(`۴ رقم کارت مقصد (${l4})`);
              break;
            }
          } else if (likelyDeposit) {
            if (toLast4.has(l4) || generalLast4.has(l4)) {
              score += 110;
              reasons.push(`۴ رقم کارت/حساب مقصد (${l4})`);
              break;
            } else if (fromLast4.has(l4)) {
              score += 25;
              reasons.push(`۴ رقم کارت مبدأ (${l4})`);
              break;
            }
          } else {
            if (allSmsLast4.has(l4)) {
              score += 90;
              reasons.push(`۴ رقم کارت/حساب (${l4})`);
              break;
            }
          }
        }
      }

      // =========================================================================
      // سطح ۴: تطبیق الگوهای آموزش‌داده‌شده این حساب
      // =========================================================================
      const accPatterns = trainedPatterns.filter((p) => p.accountId === acc.id);
      let bestPatScore = 0;
      for (const pat of accPatterns) {
        let pScore = 0;
        if (pat.cardLast4) {
          if (likelyWithdrawal && (fromLast4.has(pat.cardLast4) || generalLast4.has(pat.cardLast4))) {
            pScore += 110;
          } else if (likelyDeposit && (toLast4.has(pat.cardLast4) || generalLast4.has(pat.cardLast4))) {
            pScore += 110;
          } else if (allSmsLast4.has(pat.cardLast4)) {
            pScore += 90;
          }
        }

        if (pat.bankName && parsed.bankHint && (pat.bankName.includes(parsed.bankHint) || parsed.bankHint.includes(pat.bankName))) {
          pScore += 30;
        }

        if (pat.keywords) {
          try {
            const kws: string[] = JSON.parse(pat.keywords);
            let matchCount = 0;
            for (const kw of kws) {
              if (rawText.includes(kw)) matchCount++;
            }
            if (kws.length > 0) {
              pScore += Math.round((matchCount / kws.length) * 35);
            }
          } catch {}
        }

        if (pScore > bestPatScore) {
          bestPatScore = pScore;
          if (pat.kind === "deposit" && /(?:واریز|نشست|وصول|بستانکار|\+)/.test(rawText)) {
            candidateMatchedKind = "deposit";
          } else if (pat.kind === "withdrawal" && /(?:برداشت|خرید|پرید|بدهکار|کارمزد|\-)/.test(rawText)) {
            candidateMatchedKind = "withdrawal";
          }
        }
      }

      if (bestPatScore > 0 && score < 150) {
        score += bestPatScore;
        reasons.push("الگوی آموزش‌داده‌شده");
      }

      // =========================================================================
      // سطح ۵: تطبیق نام بانک و اعمال جریمه تضاد بانکی
      // =========================================================================
      if (parsed.bankHint) {
        const matchesThisBank =
          accCombined.includes(parsed.bankHint) ||
          (parsed.bankHint === "بلو" && /بلو|blu/i.test(accCombined)) ||
          (parsed.bankHint === "ملی" && /ملی/i.test(accCombined)) ||
          (parsed.bankHint === "ملت" && /ملت/i.test(accCombined));

        if (matchesThisBank) {
          score += 60;
          reasons.push(`نام بانک (${parsed.bankHint})`);
        } else {
          // اگر پیامک صراحتاً متعلق به یک بانک دیگر است، این حساب جریمه سنگین می‌گیرد
          const conflictingBank = KNOWN_BANKS.find(
            (b) => b.canonical !== parsed.bankHint && accCombined.includes(b.canonical)
          );
          if (conflictingBank) {
            score -= 200;
          }
        }
      }

      // تطبیق نام صریح حساب در متن پیامک
      if (acc.name.length >= 3 && rawText.includes(acc.name)) {
        score += 35;
        reasons.push("نام حساب در متن");
      }

      evaluatedCandidates.push({
        account: acc,
        score,
        reasons,
        matchedKind: candidateMatchedKind,
      });
    }

    // مرتب‌سازی کاندیداها بر اساس بیشترین امتیاز
    evaluatedCandidates.sort((a, b) => b.score - a.score);
    const bestCandidate = evaluatedCandidates[0];
    const runnerUpCandidate = evaluatedCandidates[1];

    let matched: AccountRow | null = null;
    let matchedVia = "";
    let patternMatchedKind: "deposit" | "withdrawal" | null = null;
    let needsAccountReview = false;

    if (bestCandidate && bestCandidate.score >= 180) {
      // تطابق ۱۰۰٪ قطعی تمام ارقام کارت، شماره حساب یا ۶ رقم اول + ۴ رقم آخر
      matched = bestCandidate.account;
      matchedVia = bestCandidate.reasons.join(" + ");
      patternMatchedKind = bestCandidate.matchedKind || null;
    } else if (bestCandidate && bestCandidate.score >= 80) {
      // تطابق قوی ۴ رقم آخر یا الگو + نام بانک
      if (!runnerUpCandidate || bestCandidate.score - runnerUpCandidate.score >= 20) {
        matched = bestCandidate.account;
        matchedVia = bestCandidate.reasons.join(" + ");
        patternMatchedKind = bestCandidate.matchedKind || null;
      } else {
        // دو یا چند حساب با امتیاز نزدیک در یک بانک (نیاز به بازبینی توسط کاربر)
        matched = bestCandidate.account;
        matchedVia = `چندین حساب مرتبط با ${parsed.bankHint || "پیامک"}`;
        needsAccountReview = true;
      }
    } else if (bestCandidate && bestCandidate.score >= 50) {
      // تطابق با نام بانک یا امتیاز متوسط
      if (!runnerUpCandidate || bestCandidate.score - runnerUpCandidate.score >= 20) {
        matched = bestCandidate.account;
        matchedVia = bestCandidate.reasons.join(" + ");
        patternMatchedKind = bestCandidate.matchedKind || null;
      } else {
        // دو یا چند حساب با امتیاز نزدیک در یک بانک (نیاز به بازبینی توسط کاربر)
        matched = bestCandidate.account;
        matchedVia = `چندین حساب مرتبط با ${parsed.bankHint || "پیامک"}`;
        needsAccountReview = true;
      }
    }

    if (!matched) {
      if (assetAccounts.length > 0) {
        matched = assetAccounts[0];
        matchedVia = "پیش‌فرض خودکار (عدم شناسایی بانک)";
        needsAccountReview = true;
      } else {
        const message = "⚠️ هیچ حساب بانکی فعالی در سیستم وجود ندارد. لطفاً ابتدا در تنظیمات یک حساب بانکی ایجاد کنید.";
        return asText ? plain(message) : NextResponse.json({ ok: true, created: false, needsAccount: true, message });
      }
    }

    /* ---------- جهت تراکنش ----------
     * ۱) علامت صریح ریاضی کنار مبلغ (+ واریز، - برداشت) — قوی‌ترین و قطعی‌ترین معیار
     * ۲) نوع تعیین‌شده توسط پارسر پیامک (بر اساس کلیدواژه‌های اختصاصی بانکی و کارمزد)
     * ۳) جهت انتقال بر اساس توکن‌های «به» و «از» شماره حساب/کارت
     * ۴) نوع صریح ارسال‌شده از کلاینت (در صورت نبود علامت متضاد در متن)
     * ۵) الگوی آموزش‌داده‌شده (در صورتی که پیامک علامت و نوع صریح نداشته باشد)
     * ۶) هوش کلیدواژه‌ای متن
     */
    let kind: SmsKind = "unknown";

    if (parsed.amountSign === "+") {
      kind = "deposit";
    } else if (parsed.amountSign === "-") {
      kind = "withdrawal";
    } else if (parsed.kind === "fee") {
      kind = "fee";
    } else if (parsed.kind === "deposit" || parsed.kind === "withdrawal") {
      kind = parsed.kind;
    }

    if (kind === "unknown" && matched) {
      const matchedCred = extractAccountCredentials(matched);
      const inFrom =
        parsed.fromSideTokens.some((t) => matchedCred.last4s.includes(tokenLast4(t))) ||
        parsed.fullCardNumbers.some((c) => matchedCred.fullCards.includes(c));
      const inTo =
        parsed.toSideTokens.some((t) => matchedCred.last4s.includes(tokenLast4(t))) ||
        parsed.fullCardNumbers.some((c) => matchedCred.fullCards.includes(c));
      if (inTo && !inFrom) kind = "deposit";
      else if (inFrom && !inTo) kind = "withdrawal";
    }

    if (kind === "unknown" && explicitKind) {
      kind = explicitKind;
    }

    if (kind === "unknown" && patternMatchedKind) {
      kind = patternMatchedKind;
    }

    if (kind === "unknown") {
      if (/انتقال\s*\+\s*کارمزد/.test(rawText)) kind = "withdrawal";
      else if (/انتقال\s*:\s*[\d,]+\s*\+/.test(rawText)) kind = "deposit";
      else if (/انتقال\s*:\s*[\d,]+\s*\-/.test(rawText)) kind = "withdrawal";
      else if (/(?:واریز|افزایش|بستانکار|سود|حقوق|نشست|وصول)/.test(rawText)) kind = "deposit";
      else if (/(?:برداشت|کاهش|بدهکار|خرید|پایا|ساتنا|کارمزد|پرید)/.test(rawText)) kind = "withdrawal";
      else kind = "withdrawal";
    }

    /* ---------- ساخت تراکنش ----------
     * برداشت: از حساب بانکی → «در انتظار دسته‌بندی (هزینه)»  [وضعیت: pending]
     * واریز:  از «در انتظار دسته‌بندی (درآمد)» → حساب بانکی  [وضعیت: pending]
     * کارمزد: از حساب بانکی → سرفصل سیستمی کارمزد            [وضعیت: active]
     */
    let fromId: string;
    let toId: string;
    let type: string;
    let status: string;
    if (kind === "fee") {
      fromId = matched.id;
      toId = BANK_FEE_CATEGORY_ID;
      type = "expense";
      status = "active";
    } else if (kind === "deposit") {
      fromId = PENDING_INCOME_CATEGORY_ID;
      toId = matched.id;
      type = "income";
      status = "pending";
    } else {
      fromId = matched.id;
      toId = PENDING_EXPENSE_CATEGORY_ID;
      type = "expense";
      status = "pending";
    }

    const fee = kind === "withdrawal" ? parsed.fee : 0;
    const fromName = accounts.find((a) => a.id === fromId)?.name || "";
    const toName = accounts.find((a) => a.id === toId)?.name || "";
    const trimmedDesc = customDescription.trim().slice(0, 500);
    let finalDescription = trimmedDesc || rawText;
    if (needsAccountReview && !finalDescription.includes("[بررسی حساب بانک]")) {
      finalDescription = `[بررسی حساب بانک] ${finalDescription}`.slice(0, 500);
    }

    const base = {
      ok: true,
      kind,
      amount: parsed.amount,
      amountSign: parsed.amountSign,
      fee,
      description: finalDescription,
      balance: parsed.balance,
      shamsiDate: parsed.shamsiDate,
      hasExplicitDate: parsed.hasExplicitDate,
      tracking: parsed.tracking,
      counterpartyHint: parsed.counterpartyHint,
      bankHint: parsed.bankHint,
      account: { id: matched.id, name: matched.name },
      matchedVia,
      plannedFromName: fromName,
      plannedToName: toName,
      plannedStatus: status,
    };

    if (dryRun) {
      return NextResponse.json({
        ...base,
        created: false,
        dryRun: true,
        message: "پیش‌نمایش تحلیل — برای ثبت، دکمه ثبت را بزنید.",
      });
    }

    const tx = await createTransaction({
      type,
      amount: parsed.amount,
      fee,
      fromAccountId: fromId,
      toAccountId: toId,
      date: new Date(parsed.dateIso),
      shamsiDate: parsed.shamsiDate,
      description: sanitizeString(finalDescription, 500) || finalDescription,
      trackingNumber: sanitizeString(parsed.tracking, 100),
      status,
      sourceHash: hashSha256,
    });

    const kindLabel = kind === "deposit" ? "واریز" : kind === "fee" ? "کارمزد" : "برداشت";
    const direction = kind === "deposit" ? "به" : "از";
    const tail = needsAccountReview
      ? " — در انتظار تعیین حساب بانکی در برنامه"
      : status === "pending"
      ? " — در انتظار دسته‌بندی"
      : "";
    const message = `✅ ${kindLabel} ${formatMoney(parsed.amount)} ریال ${direction} «${matched.name}» ثبت شد${tail}.`;

    const payload = { ...base, created: true, transactionId: tx.id, message };
    return asText ? plain(payload.message) : NextResponse.json(payload);
  } catch (err: unknown) {
    const message = translateDbError(err);
    return asText
      ? plain(`⚠️ خطای سرور: ${message}`, 500)
      : NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
