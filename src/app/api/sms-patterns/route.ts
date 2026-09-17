import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  listSmsPatterns,
  createSmsPattern,
  deleteSmsPattern,
} from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";
import { parseBankSms } from "@/lib/sms-parser";
import { sanitizeString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** استخراج ۴ رقم آخر از توکن‌های معتبر کارت یا حساب */
function extractCardLast4(text: string, parsedTokens: string[]): string | null {
  for (const t of parsedTokens) {
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 4) return digits.slice(-4);
  }
  const match =
    text.match(/(?:کارت|حساب|شبا)\s*[:;\-]*\s*(?:\*{2,4}|[xX]{2,4})?(\d{4})\b/i) ||
    text.match(/(?:\*{2,4}|[xX]{2,4})[-*.\s]*(\d{4})\b/);
  if (match) return match[1];
  return null;
}

/** استخراج واژگان کلیدی غیرعددی برای تطبیق هوشمند الگو */
function extractKeywords(text: string): string[] {
  const cleaned = text
    .replace(/\d+/g, " ")
    .replace(/[+−\-:;\/\\.,_#@!?()\[\]{}«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopWords = new Set([
    "ریال", "تومان", "ساعت", "تاریخ", "مانده", "موجودی", "مبلغ", "کارت",
    "حساب", "شماره", "بانک", "به", "از", "در", "با", "و", "شد", "است",
    "اینترنت", "همراه", "پیگیری", "مرجع", "شناسه", "رسید",
    // واژگان عمومی تراکنش که در همه بانک‌ها تکرار می‌شوند و نباید کلیدواژه اختصاصی باشند:
    "واریز", "برداشت", "خرید", "انتقال", "پایا", "ساتنا", "کارمزد", "شاپرک", "شتاب",
    "پایانه", "موفق", "ناموفق", "شعبه", "خودپرداز", "pos", "pos+", "pos-",
    "طرف", "نام", "عادی", "سحاب", "پل", "پرداخت", "دریافت", "صورتحساب", "گردش",
    "وجه", "عملیات", "مشتری", "گرامی", "محترم", "عزیز"
  ]);

  const words = cleaned.split(" ").filter((w) => w.length >= 3 && !stopWords.has(w));
  return Array.from(new Set(words)).slice(0, 15);
}

export async function GET(req: Request) {
  try {
    await ensureDatabase();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً وارد سیستم شوید." },
        { status: 401 }
      );
    }

    const patterns = await listSmsPatterns();
    const accounts = await listAccounts();
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const enriched = patterns.map((p) => ({
      ...p,
      accountName: accountMap.get(p.accountId)?.name || "حساب نامشخص",
      accountType: accountMap.get(p.accountId)?.type || "bank",
    }));

    return NextResponse.json({ success: true, patterns: enriched });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureDatabase();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً وارد سیستم شوید." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId || "").trim();
    const kind = body.kind === "deposit" ? "deposit" : body.kind === "withdrawal" ? "withdrawal" : null;
    const rawSample = String(body.sampleText || "").trim();

    if (!accountId) {
      return NextResponse.json({ error: "لطفاً حساب بانکی متناظر را انتخاب کنید." }, { status: 400 });
    }
    if (!kind) {
      return NextResponse.json({ error: "نوع تراکنش (واریز یا برداشت) باید مشخص شود." }, { status: 400 });
    }
    if (!rawSample || rawSample.length < 5) {
      return NextResponse.json({ error: "لطفاً متن نمونه پیامک را به درستی وارد کنید." }, { status: 400 });
    }

    const accounts = await listAccounts();
    const targetAccount = accounts.find((a) => a.id === accountId);
    if (!targetAccount) {
      return NextResponse.json({ error: "حساب بانکی انتخاب‌شده یافت نشد." }, { status: 404 });
    }

    const sanitizedSample = sanitizeString(rawSample, 2000) || rawSample;
    const parsed = parseBankSms(sanitizedSample);

    const cardLast4 = extractCardLast4(sanitizedSample, [
      ...parsed.cardTokens,
      ...parsed.fromSideTokens,
      ...parsed.toSideTokens,
    ]);

    const keywords = extractKeywords(sanitizedSample);
    const bankName = parsed.bankHint || targetAccount.name;

    const pattern = await createSmsPattern({
      accountId,
      kind,
      sampleText: sanitizedSample,
      bankName,
      cardLast4,
      keywords: keywords.length > 0 ? JSON.stringify(keywords) : null,
    });

    return NextResponse.json({
      success: true,
      pattern: {
        ...pattern,
        accountName: targetAccount.name,
      },
      message: "الگوی نمونه پیامک بانکی با موفقیت ثبت و ذخیره شد.",
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureDatabase();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً وارد سیستم شوید." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: "شناسه الگو مشخص نشده است." }, { status: 400 });
    }

    await deleteSmsPattern(String(id));
    return NextResponse.json({ success: true, message: "الگو با موفقیت حذف شد." });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
