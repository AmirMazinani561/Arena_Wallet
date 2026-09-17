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
import { parseBankSms, normalizeSmsText, tokenLast4, parseExplicitKind } from "@/lib/sms-parser";
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

/** استخراج ۴ رقم آخر همه توکن‌های عددی «اطلاعات تکمیلی» یک حساب */
function accountLast4s(acc: AccountRow): Set<string> {
  const out = new Set<string>();
  if (!acc.detailInfo) return out;
  const norm = normalizeSmsText(acc.detailInfo);
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

    /* ---------- تطبیق حساب بانکی ---------- */
    const accounts = await listAccounts();
    const assetAccounts = accounts.filter((a) => a.type === "bank" || a.type === "cash");
    const smsTokens = [...parsed.cardTokens, ...parsed.fromSideTokens, ...parsed.toSideTokens];
    const smsLast4 = new Set<string>();
    for (const t of smsTokens) {
      smsLast4.add(tokenLast4(t));
      // حساب نقطه‌دار («292.8000.10195601.1»): اگر کاربر پسوند آخر را ذخیره نکرده باشد هم مچ شود
      const stripped = t.replace(/\.\d+$/, "");
      if (stripped !== t) {
        const l4s = tokenLast4(stripped);
        if (l4s.length === 4) smsLast4.add(l4s);
      }
    }

    /* ---------- تطبیق با الگوهای آموزش‌داده‌شده ---------- */
    let matched: AccountRow | null = null;
    let matchedVia = "";
    let patternMatchedKind: "deposit" | "withdrawal" | null = null;

    const trainedPatterns = await listSmsPatterns();
    for (const pat of trainedPatterns) {
      const acc = assetAccounts.find((a) => a.id === pat.accountId);
      if (!acc) continue;

      let score = 0;
      if (pat.cardLast4 && (smsLast4.has(pat.cardLast4) || rawText.includes(pat.cardLast4))) {
        score += 80;
      }
      if (pat.bankName && (rawText.includes(pat.bankName) || acc.name.includes(pat.bankName))) {
        score += 25;
      }
      if (pat.keywords) {
        try {
          const kws: string[] = JSON.parse(pat.keywords);
          let matchCount = 0;
          for (const kw of kws) {
            if (rawText.includes(kw)) matchCount++;
          }
          if (kws.length > 0) {
            score += Math.round((matchCount / kws.length) * 45);
          }
        } catch {}
      }

      if (score >= 45) {
        matched = acc;
        matchedVia = "الگوی آموزش‌داده‌شده";
        patternMatchedKind = pat.kind;
        break;
      }
    }

    /* ---------- تطبیق معمولی حساب در صورت عدم مچ با الگو ---------- */
    if (!matched) {
      for (const acc of assetAccounts) {
        const accLast4 = accountLast4s(acc);
        if ([...accLast4].some((x) => smsLast4.has(x))) {
          matched = acc;
          matchedVia = "شماره کارت/حساب";
          break;
        }
      }
    }

    if (!matched && parsed.bankHint) {
      const byName = assetAccounts.filter(
        (a) => a.name.includes(parsed.bankHint as string) || (a.detailInfo || "").includes(parsed.bankHint as string)
      );
      if (byName.length === 1) {
        matched = byName[0];
        matchedVia = "نام بانک";
      } else if (byName.length > 1) {
        matched = byName[0];
        matchedVia = `چندین حساب ${parsed.bankHint}`;
      }
    }

    let needsAccountReview = false;
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
      if (/(?:واریز|افزایش|بستانکار|سود|حقوق|نشست|وصول)/.test(rawText)) kind = "deposit";
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
