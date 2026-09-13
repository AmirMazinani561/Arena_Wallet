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
  shamsiDate: string;            // '1404/06/22'
  description?: string | null;
};

export async function syncToEquity(tx: SyncInput): Promise<void> {
  const base  = process.env.EQUITY_URL;
  const token = process.env.EQUITY_TOKEN;

  // تنظیم نشده ⇒ قابلیت خاموش است، بی‌سروصدا رد شو
  if (!base || !token) return;

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

    if (!res.ok) {
      console.error("[equity-sync] رد شد:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[equity-sync] ناموفق:", err);
  }
}
