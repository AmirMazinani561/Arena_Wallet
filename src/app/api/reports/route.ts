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

    const format = searchParams.get("format");
    const stamp = new Date().toISOString().slice(0, 10);

    /* ---------- خروجی فایل اکسل (CSV با پشتیبانی کامل UTF-8 BOM فارسی) ---------- */
    if (format === "csv") {
      const csvRows: string[] = [];

      // ۱. خلاصه شاخص‌های مالی دوره
      csvRows.push(
        [`"گزارش تحلیلی مالی"`],
        [`"بازه زمانی"`, `"${startDate || "ابتدا"} تا ${endDate || "اکنون"}"`],
        [`"تاریخ خروجی"`, `"${stamp}"`],
        []
      );

      csvRows.push(
        [`"شاخص عملکرد"`, `"مبلغ (ریال)"`].join(","),
        [`"مجموع درآمد دوره"`, `"${agg.periodIncome}"`].join(","),
        [`"مجموع هزینه دوره"`, `"${agg.periodExpense}"`].join(","),
        [`"پس‌انداز خالص دوره"`, `"${agg.periodIncome - agg.periodExpense}"`].join(","),
        [`"مجموع کارمزد پرداختی"`, `"${agg.totalFee}"`].join(","),
        [`"تعداد کل تراکنش‌ها"`, `"${agg.txCount}"`].join(","),
        [`"موجودی نقد و بانک (کل)"`, `"${totalBank + totalCash}"`].join(","),
        [`"مانده خالص اشخاص"`, `"${totalPersonsNet}"`].join(","),
        []
      );

      // ۲. تفکیک هزینه‌ها
      csvRows.push([`"--- تفکیک سرفصل‌ها و زیرمجموعه‌های هزینه ---"`]);
      csvRows.push(
        [`"ردیف"`, `"سرفصل هزینه"`, `"زیرمجموعه"`, `"مبلغ (ریال)"`, `"درصد از کل هزینه"`].join(",")
      );

      let expIdx = 1;
      const expenseList = buildReport("expense", agg.periodExpense);
      expenseList.forEach((parent) => {
        csvRows.push(
          [
            String(expIdx++),
            `"${parent.name.replace(/"/g, '""')}"`,
            `"[مجموع سرفصل]"`,
            `"${parent.total}"`,
            `"${parent.percentage}%"`,
          ].join(",")
        );

        parent.subcategories.forEach((sub) => {
          const subPct = agg.periodExpense > 0 ? ((sub.total / agg.periodExpense) * 100).toFixed(1) : "0";
          csvRows.push(
            [
              "",
              `"${parent.name.replace(/"/g, '""')}"`,
              `"${sub.name.replace(/"/g, '""')}"`,
              `"${sub.total}"`,
              `"${subPct}%"`,
            ].join(",")
          );
        });
      });

      csvRows.push([]);

      // ۳. تفکیک درآمدها
      csvRows.push([`"--- تفکیک سرفصل‌ها و زیرمجموعه‌های درآمد ---"`]);
      csvRows.push(
        [`"ردیف"`, `"سرفصل درآمد"`, `"زیرمجموعه"`, `"مبلغ (ریال)"`, `"درصد از کل درآمد"`].join(",")
      );

      let incIdx = 1;
      const incomeList = buildReport("income", agg.periodIncome);
      incomeList.forEach((parent) => {
        csvRows.push(
          [
            String(incIdx++),
            `"${parent.name.replace(/"/g, '""')}"`,
            `"[مجموع سرفصل]"`,
            `"${parent.total}"`,
            `"${parent.percentage}%"`,
          ].join(",")
        );

        parent.subcategories.forEach((sub) => {
          const subPct = agg.periodIncome > 0 ? ((sub.total / agg.periodIncome) * 100).toFixed(1) : "0";
          csvRows.push(
            [
              "",
              `"${parent.name.replace(/"/g, '""')}"`,
              `"${sub.name.replace(/"/g, '""')}"`,
              `"${sub.total}"`,
              `"${subPct}%"`,
            ].join(",")
          );
        });
      });

      const csvContent = "\uFEFF" + csvRows.join("\r\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="financial_report_${stamp}.csv"`,
        },
      });
    }

    /* ---------- خروجی چاپی مدرن A4 / ذخیره به عنوان PDF برای گزارشات تحلیلی ---------- */
    if (format === "print" || format === "pdf") {
      const formatNum = (n: number) => Number(n || 0).toLocaleString("fa-IR");
      const expenseList = buildReport("expense", agg.periodExpense);
      const incomeList = buildReport("income", agg.periodIncome);
      const netSavings = agg.periodIncome - agg.periodExpense;

      const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>گزارش عملکرد مالی - آرنا والت</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
      margin: 0;
      padding: 16px;
      font-size: 11px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .title { font-size: 17px; font-weight: bold; color: #0369a1; margin: 0; }
    .meta { font-size: 10.5px; color: #64748b; margin-top: 4px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .stat-card {
      padding: 8px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      text-align: center;
    }
    .stat-label { font-size: 10px; color: #64748b; margin-bottom: 2px; }
    .stat-val { font-size: 12.5px; font-weight: bold; }
    .val-income { color: #16a34a; }
    .val-expense { color: #dc2626; }
    .val-savings { color: #0284c7; }
    .val-fee { color: #f59e0b; }
    .section-title {
      font-size: 13px;
      font-weight: bold;
      color: #1e293b;
      margin: 14px 0 8px 0;
      padding-right: 6px;
      border-right: 3px solid #0284c7;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: right;
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    .parent-row { background: #f8fafc; font-weight: bold; }
    .sub-row td:first-child { padding-right: 20px; color: #64748b; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .progress-bar-bg {
      background: #e2e8f0;
      border-radius: 999px;
      height: 6px;
      width: 60px;
      display: inline-block;
      vertical-align: middle;
      margin-left: 6px;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 999px;
    }
    .fill-expense { background: #ef4444; }
    .fill-income { background: #22c55e; }
    .print-btn {
      position: fixed;
      bottom: 20px;
      left: 20px;
      padding: 10px 18px;
      background: #0284c7;
      color: #fff;
      font-family: inherit;
      font-size: 12px;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
    }
    @media print {
      body { padding: 0; }
      .print-btn { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">گزارش تحلیلی عملکرد مالی</h1>
      <div class="meta">
        بازه گزارش: ${startDate || "ابتدا"} تا ${endDate || "اکنون"}
        | تاریخ استخراج: ${stamp}
      </div>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">درآمد دوره</div>
      <div class="stat-val val-income">${formatNum(agg.periodIncome)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">هزینه دوره</div>
      <div class="stat-val val-expense">${formatNum(agg.periodExpense)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">پس‌انداز خالص دوره</div>
      <div class="stat-val val-savings">${formatNum(netSavings)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">کارمزد پرداختی</div>
      <div class="stat-val val-fee">${formatNum(agg.totalFee)} ریال</div>
    </div>
  </div>

  <div class="section-title">تفکیک هزینه‌ها به تفکیک سرفصل</div>
  <table>
    <thead>
      <tr>
        <th>سرفصل / زیرمجموعه</th>
        <th style="width: 130px;">مبلغ (ریال)</th>
        <th style="width: 140px;">سهم از کل هزینه</th>
      </tr>
    </thead>
    <tbody>
      ${expenseList.length === 0 ? `<tr><td colspan="3" class="text-center" style="color: #94a3b8; padding: 12px;">در این بازه هزینه‌ای ثبت نشده است.</td></tr>` : ""}
      ${expenseList
        .map((p) => {
          const pRows = `
            <tr class="parent-row">
              <td>📁 ${p.name}</td>
              <td style="font-weight: bold;">${formatNum(p.total)}</td>
              <td>
                <span class="progress-bar-bg"><span class="progress-bar-fill fill-expense" style="width: ${Math.min(100, Math.max(0, Number(p.percentage)))}%;"></span></span>
                <span>${Number(p.percentage).toLocaleString("fa-IR")}%</span>
              </td>
            </tr>
            ${p.subcategories
              .map((s) => {
                const sPct = agg.periodExpense > 0 ? ((s.total / agg.periodExpense) * 100).toFixed(1) : "0";
                return `
                  <tr class="sub-row">
                    <td>↳ ${s.name}</td>
                    <td>${formatNum(s.total)}</td>
                    <td style="color: #64748b;">${Number(sPct).toLocaleString("fa-IR")}%</td>
                  </tr>
                `;
              })
              .join("")}
          `;
          return pRows;
        })
        .join("")}
    </tbody>
  </table>

  <div class="section-title">تفکیک درآمدها به تفکیک سرفصل</div>
  <table>
    <thead>
      <tr>
        <th>سرفصل / زیرمجموعه</th>
        <th style="width: 130px;">مبلغ (ریال)</th>
        <th style="width: 140px;">سهم از کل درآمد</th>
      </tr>
    </thead>
    <tbody>
      ${incomeList.length === 0 ? `<tr><td colspan="3" class="text-center" style="color: #94a3b8; padding: 12px;">در این بازه درآمدی ثبت نشده است.</td></tr>` : ""}
      ${incomeList
        .map((p) => {
          const pRows = `
            <tr class="parent-row">
              <td>💰 ${p.name}</td>
              <td style="font-weight: bold;">${formatNum(p.total)}</td>
              <td>
                <span class="progress-bar-bg"><span class="progress-bar-fill fill-income" style="width: ${Math.min(100, Math.max(0, Number(p.percentage)))}%;"></span></span>
                <span>${Number(p.percentage).toLocaleString("fa-IR")}%</span>
              </td>
            </tr>
            ${p.subcategories
              .map((s) => {
                const sPct = agg.periodIncome > 0 ? ((s.total / agg.periodIncome) * 100).toFixed(1) : "0";
                return `
                  <tr class="sub-row">
                    <td>↳ ${s.name}</td>
                    <td>${formatNum(s.total)}</td>
                    <td style="color: #64748b;">${Number(sPct).toLocaleString("fa-IR")}%</td>
                  </tr>
                `;
              })
              .join("")}
          `;
          return pRows;
        })
        .join("")}
    </tbody>
  </table>

  <button class="print-btn" onclick="window.print()">🖨️ چاپ / ذخیره به عنوان PDF</button>

  <script>
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => {
        window.print();
      }, 400);
    });
  </script>
</body>
</html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
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
