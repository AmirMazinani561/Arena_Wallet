import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  getAccountFlows,
  getReportAggregates,
} from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";
import { getCurrentShamsi } from "@/lib/date-utils";

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
    const shamsiNow = getCurrentShamsi();
    const stamp = shamsiNow.formatted;
    const stampText = shamsiNow.fullText;

    /* ---------- خروجی فایل اکسل (TSV تب‌بندی شده با انکودینگ UTF-16LE و BOM جهت نمایش ۱۰۰٪ استاندارد در اکسل ویندوز و مک) ---------- */
    if (format === "csv") {
      const clean = (str: string | null | undefined) =>
        (str || "").replace(/\t|\r|\n/g, " ").trim();

      const rows: string[][] = [
        ["گزارش تحلیلی عملکرد مالی"],
        ["بازه زمانی", `${startDate || "ابتدا"} تا ${endDate || "اکنون"}`],
        ["تاریخ خروجی (شمسی)", clean(stamp)],
        [],
        ["شاخص عملکرد", "مبلغ (ریال)"],
        ["مجموع درآمد دوره", String(agg.periodIncome)],
        ["مجموع هزینه دوره", String(agg.periodExpense)],
        ["پس‌انداز خالص دوره", String(agg.periodIncome - agg.periodExpense)],
        ["مجموع کارمزد پرداختی", String(agg.totalFee)],
        ["تعداد کل تراکنش‌ها", String(agg.txCount)],
        ["موجودی نقد و بانک (کل)", String(totalBank + totalCash)],
        ["مانده خالص اشخاص", String(totalPersonsNet)],
        [],
        ["--- تفکیک سرفصل‌ها و زیرمجموعه‌های هزینه ---"],
        ["ردیف", "سرفصل هزینه", "زیرمجموعه", "مبلغ (ریال)", "درصد از کل هزینه"],
      ];

      let expIdx = 1;
      const expenseList = buildReport("expense", agg.periodExpense);
      expenseList.forEach((parent) => {
        rows.push([
          String(expIdx++),
          clean(parent.name),
          "[مجموع سرفصل]",
          String(parent.total),
          `${parent.percentage}%`,
        ]);

        parent.subcategories.forEach((sub) => {
          const subPct = agg.periodExpense > 0 ? ((sub.total / agg.periodExpense) * 100).toFixed(1) : "0";
          rows.push([
            "",
            clean(parent.name),
            clean(sub.name),
            String(sub.total),
            `${subPct}%`,
          ]);
        });
      });

      rows.push([]);
      rows.push(["--- تفکیک سرفصل‌ها و زیرمجموعه‌های درآمد ---"]);
      rows.push(["ردیف", "سرفصل درآمد", "زیرمجموعه", "مبلغ (ریال)", "درصد از کل درآمد"]);

      let incIdx = 1;
      const incomeList = buildReport("income", agg.periodIncome);
      incomeList.forEach((parent) => {
        rows.push([
          String(incIdx++),
          clean(parent.name),
          "[مجموع سرفصل]",
          String(parent.total),
          `${parent.percentage}%`,
        ]);

        parent.subcategories.forEach((sub) => {
          const subPct = agg.periodIncome > 0 ? ((sub.total / agg.periodIncome) * 100).toFixed(1) : "0";
          rows.push([
            "",
            clean(parent.name),
            clean(sub.name),
            String(sub.total),
            `${subPct}%`,
          ]);
        });
      });

      const tsvContent = rows.map((r) => r.join("\t")).join("\r\n");
      const buffer = Buffer.from("\uFEFF" + tsvContent, "utf16le");
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-16le",
          "Content-Disposition": `attachment; filename="financial_report_${stamp.replace(/\//g, "-")}.csv"`,
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
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
    .action-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 16px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.1);
    }
    .action-bar-inner {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .print-btn {
      width: 100%;
      padding: 14px 22px;
      background: #0284c7;
      color: #fff;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      text-align: center;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    .print-btn:active { background: #0369a1; transform: scale(0.99); }
    .btn-copy {
      width: 100%;
      padding: 10px 16px;
      background: #ffffff;
      color: #0369a1;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      touch-action: manipulation;
    }
    .btn-copy:active { background: #f0f9ff; }
    .copy-toast {
      display: none;
      font-size: 11px;
      color: #15803d;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
      padding: 6px 12px;
      border-radius: 6px;
      text-align: center;
      animation: fadeIn 0.2s ease-in-out;
    }
    .ios-hint {
      font-size: 10.5px;
      color: #0369a1;
      line-height: 1.6;
      background: #e0f2fe;
      padding: 8px 12px;
      border-radius: 8px;
    }
    @media (min-width: 640px) {
      body { padding: 16px; }
      .action-bar-inner {
        flex-direction: column;
        gap: 8px;
      }
      .btn-group {
        flex-direction: row;
        align-items: center;
      }
      .print-btn { width: auto; }
      .btn-copy { width: auto; }
    }
    .page-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    @media (min-width: 640px) {
      .stats {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    .stat-card {
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
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
      margin: 16px 0 10px 0;
      padding-right: 8px;
      border-right: 4px solid #0284c7;
    }
    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    table { width: 100%; min-width: 500px; border-collapse: collapse; font-size: 10.5px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: right;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
    }
    td {
      padding: 7px 10px;
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
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .page-container { border: none !important; box-shadow: none !important; padding: 0 !important; }
      .table-wrapper { overflow: visible !important; border: none !important; margin-bottom: 12px; }
      table { min-width: 100% !important; width: 100% !important; page-break-inside: auto; font-size: 10px; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      .stats { grid-template-columns: repeat(4, 1fr) !important; }
    }
  </style>
</head>
<body>
  <div class="no-print action-bar">
    <div class="action-bar-inner">
      <div class="btn-group">
        <button id="printBtn" class="print-btn" type="button" onclick="triggerPrintOrShare()">
          🖨️ چاپ / ذخیره به عنوان PDF
        </button>
        <button class="btn-copy" type="button" onclick="copyReportLink()">
          📋 کپی لینک گزارش جهت باز کردن در سافاری
        </button>
      </div>
      <div id="copyToast" class="copy-toast">✅ لینک کپی شد! می‌توانید آن را در مرورگر Safari باز کنید.</div>
      <div class="ios-hint">
        📱 <b>راهنمای کاربران آیفون:</b> با زدن دکمه بالا، منوی استاندارد آیفون باز می‌شود؛ برای چاپ <b>Print</b> و برای ذخیره سند <b>Save to Files</b> را انتخاب فرمایید. همچنین با دکمه «کپی لینک» می‌توانید گزارش را مستقیماً در مرورگر کامل Safari باز کنید.
      </div>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <div>
        <h1 class="title">گزارش تحلیلی عملکرد مالی</h1>
        <div class="meta">
          بازه گزارش: ${startDate || "ابتدا"} تا ${endDate || "اکنون"}
          | تاریخ استخراج: ${stampText} (${stamp})
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
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>سرفصل / زیرمجموعه</th>
            <th style="width: 130px;" class="text-left">مبلغ (ریال)</th>
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
                  <td class="text-left" style="font-weight: bold;">${formatNum(p.total)}</td>
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
                        <td class="text-left">${formatNum(s.total)}</td>
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
    </div>

    <div class="section-title">تفکیک درآمدها به تفکیک سرفصل</div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>سرفصل / زیرمجموعه</th>
            <th style="width: 130px;" class="text-left">مبلغ (ریال)</th>
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
                  <td class="text-left" style="font-weight: bold;">${formatNum(p.total)}</td>
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
                        <td class="text-left">${formatNum(s.total)}</td>
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
    </div>
  </div>

  <script>
    async function triggerPrintOrShare() {
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isStandalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

      // در آیفون (به‌ویژه وب‌اپلیکیشن هوم‌اسکرین که window.print مسدود است) از منوی سیستمی نیتیو استفاده می‌شود
      if (isIOS && navigator.share) {
        try {
          await navigator.share({
            title: document.title,
            url: window.location.href,
          });
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
      }

      // سایر سیستم‌ها و دسکتاپ
      try {
        window.print();
      } catch (e) {
        if (navigator.share) {
          navigator.share({ title: document.title, url: window.location.href });
        }
      }
    }

    async function copyReportLink() {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(window.location.href);
        } else {
          const inp = document.createElement("input");
          inp.value = window.location.href;
          document.body.appendChild(inp);
          inp.select();
          document.execCommand("copy");
          document.body.removeChild(inp);
        }
        const toast = document.getElementById("copyToast");
        if (toast) {
          toast.style.display = "block";
          setTimeout(() => { toast.style.display = "none"; }, 4000);
        }
      } catch (err) {
        prompt("آدرس گزارش جهت باز کردن در مرورگر سافاری:", window.location.href);
      }
    }

    window.addEventListener("DOMContentLoaded", () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        setTimeout(() => {
          window.print();
        }, 300);
      }
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
