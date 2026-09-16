import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  getAccountFlows,
  getReportAggregates,
} from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

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
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const parentId = searchParams.get("parentId");

    const [allAccounts, flows, agg] = await Promise.all([
      listAccounts(),
      getAccountFlows(),
      getReportAggregates(startDate, endDate),
    ]);

    // افزودن مبلغ زیرمجموعه‌ها به سرفصل والد
    const rollup = new Map(agg.categoryTotals);
    for (const acc of allAccounts) {
      if (acc.parentId) {
        const own = agg.categoryTotals.get(acc.id) || 0;
        if (own > 0) {
          rollup.set(acc.parentId, (rollup.get(acc.parentId) || 0) + own);
        }
      }
    }

    const buildReport = (type: "expense" | "income", periodTotal: number) =>
      allAccounts
        .filter((a) => a.type === type && a.isParent)
        .map((parent) => {
          const subcategories = allAccounts
            .filter((a) => a.parentId === parent.id)
            .map((sub) => ({
              id: sub.id,
              name: sub.name,
              total: agg.categoryTotals.get(sub.id) || 0,
              color: sub.color || parent.color,
              icon: sub.icon || parent.icon,
            }));

          const total = rollup.get(parent.id) || 0;
          return {
            id: parent.id,
            name: parent.name,
            color: parent.color,
            icon: parent.icon,
            total,
            percentage: periodTotal > 0 ? ((total / periodTotal) * 100).toFixed(1) : "0",
            subcategories,
          };
        })
        .filter((cat) => (parentId ? cat.id === parentId : true))
        .sort((a, b) => b.total - a.total);

    // مانده کلی دارایی‌ها (مستقل از بازه گزارش)
    let totalBank = 0;
    let totalCash = 0;
    let totalPersonsNet = 0;

    for (const acc of allAccounts) {
      if (!["bank", "cash", "person"].includes(acc.type)) continue;
      const ins = flows.inflow.get(acc.id) || 0;
      const outs = flows.outflow.get(acc.id) || 0;
      const net = acc.initialBalance + ins - outs;

      if (acc.type === "bank") totalBank += net;
      else if (acc.type === "cash") totalCash += net;
      else totalPersonsNet += net;
    }

    return NextResponse.json({
      summary: {
        totalBank,
        totalCash,
        totalLiquid: totalBank + totalCash,
        totalPersonsNet,
        periodIncome: agg.periodIncome,
        periodExpense: agg.periodExpense,
        periodFee: agg.totalFee,
        netPeriodSavings: agg.periodIncome - agg.periodExpense,
        txCount: agg.txCount,
      },
      expenseReport: buildReport("expense", agg.periodExpense),
      incomeReport: buildReport("income", agg.periodIncome),
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
