/**
 * همگام‌سازی با نرم‌افزار «حساب سرمایه‌گذاران».
 *
 * مسیر نصب:  src/lib/equity-sync.ts
 *
 * وقتی تراکنشی ثبت می‌شود که یک طرفش «سرمایه سلطانی» یا «سرمایه مزینانی»
 * باشد، همان تراکنش در نرم‌افزار سرمایه با وضعیت «در انتظار قیمت» ساخته
 * می‌شود. تشخیص شریک در سمت مقابل و به‌صورت خودکار از روی نام انجام
 * می‌شود، پس این فایل نیازی به هیچ تنظیمی ندارد.
 *
 * اصل طراحی: این کد هرگز نباید ثبت تراکنش کیف پول را خراب کند.
 * به همین دلیل همهٔ خطاها بلعیده می‌شوند و فقط در لاگ می‌نشینند.
 */

type SyncInput = {
  id: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  fromAccountType?: string | null;
  toAccountType?: string | null;
  fromParentName?: string | null;
  toParentName?: string | null;
  shamsiDate: string;            // '1404/06/22'
  description?: string | null;
};

export interface SyncResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
  skipped?: string;
  created?: string;
  type?: "equity" | "payroll";
}

function normalizeName(s?: string | null): string {
  return String(s || "")
    .replace(/\u200c/g, " ")        // نیم‌فاصله → فاصله
    .replace(/[يى]/g, "ی")          // ی عربی → ی فارسی
    .replace(/ك/g, "ک")             // ک عربی → ک فارسی
    .replace(/[أإآا]/g, "ا")        // انواع الف
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")           // چند فاصله → یک فاصله
    .trim()
    .toLowerCase();
}

/**
 * آیا حساب به یکی از شرکای مجاز سرمایه تعلق دارد؟
 * طبق تعریف صریح کاربر: فقط و فقط «سرمایه سلطانی» و «سرمایه مزینانی»
 */
export function isAllowedEquityAccount(name?: string | null): boolean {
  const norm = normalizeName(name);
  if (!norm) return false;
  const isSoltani = norm.includes("سلطانی");
  const isMazinani = norm.includes("مزینانی");
  return (isSoltani || isMazinani) && (norm.includes("سرمایه") || norm === "سلطانی" || norm === "مزینانی");
}

/**
 * آیا حساب مربوط به پرسنل و کارمندان است؟
 * یا زیرمجموعه سرفصل هزینه‌ای به نام «پرسنل» است، یا در نام حساب/والد کلمه پرسنل آمده است.
 */
export function isPersonnelAccount(accountName?: string | null, parentName?: string | null): boolean {
  const normParent = normalizeName(parentName);
  if (normParent.includes("پرسنل") || normParent.includes("حقوق")) return true;
  const normName = normalizeName(accountName);
  if (normName.includes("پرسنل") || normName.includes("حقوق")) return true;
  return false;
}

export async function syncToEquity(tx: SyncInput): Promise<SyncResult> {
  const base = process.env.EQUITY_URL;
  const token = process.env.EQUITY_TOKEN;

  // تنظیم نشده ⇒ قابلیت خاموش است، بی‌سروصدا رد شو
  if (!base || !token) return { ok: false, error: "not_configured" };

  // بررسی هدف: حساب شرکای سرمایه یا اشخاص/زیرمجموعه‌های پرسنل حقوق و دستمزد
  const fromAllowed = isAllowedEquityAccount(tx.fromAccountName);
  const toAllowed = isAllowedEquityAccount(tx.toAccountName);
  const isPersonnel = isPersonnelAccount(tx.fromAccountName, tx.fromParentName) ||
                      isPersonnelAccount(tx.toAccountName, tx.toParentName);
  const isPerson = tx.fromAccountType === "person" || tx.toAccountType === "person";

  // اگر هیچ‌کدام از طرفین نه شریک سرمایه باشد، نه پرسنل و نه شخص، ارسال لازم نیست
  if (!fromAllowed && !toAllowed && !isPersonnel && !isPerson) {
    return { ok: true, skipped: "no-match" };
  }

  // اگر هر دو طرف حساب سرمایه باشند (انتقال بین دو شریک) ⇒ بی‌اثر در سرمایه کل
  if (fromAllowed && toAllowed) {
    return { ok: true, skipped: "internal-transfer" };
  }

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/wallet-intake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-token": token,
      },
      body: JSON.stringify({
        id: tx.id,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        fromAccountName: tx.fromAccountName ?? null,
        toAccountName: tx.toAccountName ?? null,
        shamsiDate: tx.shamsiDate,
        description: tx.description ?? "",
      }),
      // اگر سرور مقابل کند بود، کاربر را معطل نکن
      signal: AbortSignal.timeout(8000),
    });

    const json = (await res.json().catch(() => null)) as {
      created?: string;
      skipped?: string;
      error?: string;
      type?: "equity" | "payroll";
    } | null;

    if (!res.ok) {
      console.error("[equity-sync] رد شد:", res.status, json);
      return { ok: false, status: res.status, error: json?.error || "rejected" };
    }

    return {
      ok: true,
      status: res.status,
      data: json,
      created: json?.created,
      skipped: json?.skipped,
      type: json?.type,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "network_error";
    console.error("[equity-sync] ناموفق:", err);
    return { ok: false, error: message };
  }
}
