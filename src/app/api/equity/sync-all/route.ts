import { NextResponse } from "next/server";
import { ensureDatabase, listAccounts } from "@/db/repo";
import { query } from "@/db/client";
import { getSessionFromRequest } from "@/lib/session";
import { syncToEquity, isAllowedEquityAccount } from "@/lib/equity-sync";
import { PENDING_EXPENSE_CATEGORY_ID, PENDING_INCOME_CATEGORY_ID } from "@/lib/pending-categories";

export const dynamic = "force-dynamic";

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

    const allAccounts = await listAccounts();
    const accMap = new Map(allAccounts.map((a) => [a.id, a]));

    // استخراج تمام تراکنش‌های فعال
    const rows = await query<Record<string, unknown>>(
      `SELECT * FROM transactions WHERE status = 'active' ORDER BY date ASC`
    );

    let totalChecked = 0;
    let newSynced = 0;
    let newEquitySynced = 0;
    let newPayrollSynced = 0;
    let alreadySynced = 0;
    let skippedNoMatch = 0;
    let failed = 0;

    for (const r of rows) {
      const fromId = String(r.from_account_id);
      const toId = String(r.to_account_id);

      // رد کردن تراکنش‌های ناقص
      if (
        fromId === PENDING_EXPENSE_CATEGORY_ID ||
        fromId === PENDING_INCOME_CATEGORY_ID ||
        toId === PENDING_EXPENSE_CATEGORY_ID ||
        toId === PENDING_INCOME_CATEGORY_ID
      ) {
        continue;
      }

      const fromAcc = accMap.get(fromId);
      const toAcc = accMap.get(toId);
      if (!fromAcc || !toAcc) continue;

      // فیلتر: تراکنش‌هایی که یک طرف آن حساب‌های سرمایه یا شخص/پرسنل باشد
      const fromAllowed = isAllowedEquityAccount(fromAcc.name);
      const toAllowed = isAllowedEquityAccount(toAcc.name);
      const isPerson = fromAcc.type === "person" || toAcc.type === "person";

      if (!fromAllowed && !toAllowed && !isPerson) continue;
      if (fromAllowed && toAllowed) continue; // انتقال بین دو شریک

      totalChecked++;

      const res = await syncToEquity({
        id: String(r.id),
        amount: Number(r.amount) || 0,
        fromAccountId: fromId,
        toAccountId: toId,
        fromAccountName: fromAcc.name,
        toAccountName: toAcc.name,
        fromAccountType: fromAcc.type,
        toAccountType: toAcc.type,
        shamsiDate: String(r.shamsi_date),
        description: r.description ? String(r.description).trim() : null,
      });

      if (res.created) {
        newSynced++;
        if (res.type === "payroll" || (res.data as any)?.type === "payroll") {
          newPayrollSynced++;
        } else {
          newEquitySynced++;
        }
      } else if (res.skipped === "duplicate") {
        alreadySynced++;
      } else if (res.skipped === "no-partner" || res.skipped === "no-match" || res.skipped === "internal-transfer") {
        skippedNoMatch++;
      } else {
        if (!res.ok) failed++;
      }
    }

    let message = "";
    if (newSynced > 0) {
      const parts: string[] = [];
      if (newEquitySynced > 0) parts.push(`${newEquitySynced} تراکنش سرمایه`);
      if (newPayrollSynced > 0) parts.push(`${newPayrollSynced} پرداختی حقوق و دستمزد`);
      message = `همگام‌سازی با موفقیت انجام شد: ${parts.join(" و ")} با موفقیت منتقل گردید (${alreadySynced} مورد از قبل ثبت بودند).`;
    } else if (alreadySynced > 0) {
      message = `کلیه تراکنش‌های مرتبط (${alreadySynced} مورد) از قبل در نرم‌افزار حساب ثبت شده‌اند.`;
    } else {
      message = `تراکنش جدیدی مرتبط با حساب‌های سرمایه یا پرسنل حقوق و دستمزد یافت نشد.`;
    }

    return NextResponse.json({
      success: true,
      totalChecked,
      newSynced,
      newEquitySynced,
      newPayrollSynced,
      alreadySynced,
      skippedNoMatch,
      failed,
      message,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطا در پردازش";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
