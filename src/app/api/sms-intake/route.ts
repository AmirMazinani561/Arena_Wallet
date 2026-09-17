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

/** استخراج ۴ رقم آخر همه توکن‌های عددی «اطلاعات تکمیلی» و «نام» یک حساب */
function accountLast4s(acc: AccountRow): Set<string> {
  const out = new Set<string>();
  const combined = `${acc.name} ${acc.detailInfo || ""}`;
  const norm = normalizeSmsText(combined);
  for (const m of norm.matchAll(/[0-9][0-9.\-*]{3,}/g)) {
    const l4 = tokenLast4(m[0]);
    if (l4.length === 4) out.add(l4);
  }
  return out;
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

      const accLast4 = accountLast4s(acc);
      const accCombined = `${acc.name} ${acc.detailInfo || ""}`;

      // ۱) تطبیق ۴ رقم کارت/حساب کاربر با توکن‌های رسمی پیامک (حذف قطعی جستجوی رشته‌ای در متن خام)
      let cardMatched = false;
      for (const l4 of accLast4) {
        if (likelyWithdrawal) {
          if (fromLast4.has(l4) || generalLast4.has(l4)) {
            score += 120;
            reasons.push("کارت/حساب مبدأ");
            cardMatched = true;
            break;
          } else if (toLast4.has(l4)) {
            score += 25;
            reasons.push("کارت مقصد");
            cardMatched = true;
            break;
          }
        } else if (likelyDeposit) {
          if (toLast4.has(l4) || generalLast4.has(l4)) {
            score += 120;
            reasons.push("کارت/حساب مقصد");
            cardMatched = true;
            break;
          } else if (fromLast4.has(l4)) {
            score += 25;
            reasons.push("کارت مبدأ");
            cardMatched = true;
            break;
          }
        } else {
          if (allSmsLast4.has(l4)) {
            score += 100;
            reasons.push("شماره کارت/حساب");
            cardMatched = true;
            break;
          }
        }
      }

      // ۲) تطبیق با الگوهای آموزش‌داده‌شده این حساب
      const accPatterns = trainedPatterns.filter((p) => p.accountId === acc.id);
      let bestPatScore = 0;
      for (const pat of accPatterns) {
        let pScore = 0;
        // تطبیق کارت الگو فقط در صورتی که در توکن‌های معتبر کارت وجود داشته باشد
        if (pat.cardLast4) {
          if (likelyWithdrawal && (fromLast4.has(pat.cardLast4) || generalLast4.has(pat.cardLast4))) {
            pScore += 120;
          } else if (likelyDeposit && (toLast4.has(pat.cardLast4) || generalLast4.has(pat.cardLast4))) {
            pScore += 120;
          } else if (allSmsLast4.has(pat.cardLast4)) {
            pScore += 100;
          }
        }

        // تطبیق نام بانک الگو
        if (pat.bankName && parsed.bankHint && (pat.bankName.includes(parsed.bankHint) || parsed.bankHint.includes(pat.bankName))) {
          pScore += 30;
        }

        // تطبیق کلیدواژه‌های اختصاصی الگو
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

      if (bestPatScore > 0) {
        score += bestPatScore;
        reasons.push("الگوی آموزش‌داده‌شده");
      }

      // ۳) تطبیق نام بانک و اعمال جریمه تضاد بانکی
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
          // اگر پیامک قطعاً متعلق به یک بانک دیگر است، این حساب جریمه سنگین می‌گیرد
          const conflictingBank = KNOWN_BANKS.find(
            (b) => b.canonical !== parsed.bankHint && accCombined.includes(b.canonical)
          );
          if (conflictingBank) {
            score -= 200;
          }
        }
      }

      // ۴) تطبیق نام صریح حساب در متن پیامک
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

    if (bestCandidate && bestCandidate.score >= 80) {
      // تطابق قوی و مطمئن (شماره کارت یا الگو + بانک)
      matched = bestCandidate.account;
      matchedVia = bestCandidate.reasons.join(" + ") || "تطبیق الگو";
      patternMatchedKind = bestCandidate.matchedKind || null;
    } else if (bestCandidate && bestCandidate.score >= 50) {
      // تطابق با نام بانک یا امتیاز متوسط
      if (!runnerUpCandidate || bestCandidate.score - runnerUpCandidate.score >= 20) {
        matched = bestCandidate.account;
        matchedVia = bestCandidate.reasons.join(" + ") || "نام بانک";
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
      const matchedLast4 = [...accountLast4s(matched)];
      const inFrom = parsed.fromSideTokens.some((t) => matchedLast4.includes(tokenLast4(t)));
      const inTo = parsed.toSideTokens.some((t) => matchedLast4.includes(tokenLast4(t)));
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
