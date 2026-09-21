import { NextResponse } from "next/server";
import { ensureDatabase, listAccounts } from "@/db/repo";
import { query } from "@/db/client";
import { getSessionFromRequest } from "@/lib/session";
import { syncToEquity } from "@/lib/equity-sync";
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
    let alreadySynced = 0;
    let skippedNoPartner = 0;
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

      totalChecked++;

      const res = await syncToEquity({
        id: String(r.id),
        amount: Number(r.amount) || 0,
        fromAccountId: fromId,
        toAccountId: toId,
        fromAccountName: fromAcc.name,
        toAccountName: toAcc.name,
        shamsiDate: String(r.shamsi_date),
        description: r.description ? String(r.description).trim() : null,
      });

      if (res.created) {
        newSynced++;
      } else if (res.skipped === "duplicate") {
        alreadySynced++;
      } else if (res.skipped === "no-partner" || res.skipped === "internal-transfer") {
        skippedNoPartner++;
      } else {
        if (!res.ok) failed++;
      }
    }

    return NextResponse.json({
      success: true,
      totalChecked,
      newSynced,
      alreadySynced,
      skippedNoPartner,
      failed,
      message:
        newSynced > 0
          ? `${newSynced} تراکنش جدید با موفقیت به نرم‌افزار سرمایه منتقل شد.`
          : `تمامی تراکنش‌های مرتبط از قبل در نرم‌افزار سرمایه ثبت شده‌اند (${alreadySynced} مورد).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "خطا در پردازش";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
