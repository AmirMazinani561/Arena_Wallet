import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, listAccounts, getLedger } from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";
import { getCurrentShamsi } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

/**
 * گردش حساب با مانده لحظه‌ای برای یک حساب یا سرفصل (به همراه زیرمجموعه‌ها)
 */
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
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "شناسه حساب مشخص نشده است." }, { status: 400 });
    }

    const allAccounts = await listAccounts();
    const account = allAccounts.find((a) => a.id === accountId);
    if (!account) {
      return NextResponse.json({ error: "حساب یافت نشد." }, { status: 404 });
    }

    const isAsset = ["bank", "cash", "person"].includes(account.type);
    const accountIds = [
      account.id,
      ...allAccounts.filter((a) => a.parentId === account.id).map((a) => a.id),
    ];

    const format = searchParams.get("format");
    const isExport = format === "csv" || format === "print" || format === "pdf";

    const limit = isExport ? 10000 : parseInt(searchParams.get("limit") || "40", 10);
    const offset = isExport ? 0 : parseInt(searchParams.get("offset") || "0", 10);

    const parent = account.parentId ? allAccounts.find((a) => a.id === account.parentId) : null;

    const result = await getLedger({
      accountIds,
      isAsset,
      initialBalance: account.initialBalance,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      search: searchParams.get("query"),
      limit: Number.isFinite(limit) ? limit : 40,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    const shamsiNow = getCurrentShamsi();
    const stamp = shamsiNow.formatted;
    const stampText = shamsiNow.fullText;

    const typeLabel =
      account.type === "bank"
        ? "بانک"
        : account.type === "cash"
        ? "صندوق"
        : account.type === "person"
        ? "شخص"
        : account.type === "expense"
        ? "سرفصل هزینه"
        : "سرفصل درآمد";

    /* ---------- خروجی اکسل (CSV UTF-8 BOM با تفکیک استاندارد ستون‌ها) ---------- */
    if (format === "csv") {
      const csvRows: string[] = [];
      csvRows.push(
        [`"صورت‌حساب دفتر معین"`, `"${account.name.replace(/"/g, '""')}"`].join(","),
        [`"نوع حساب"`, `"${typeLabel}"`].join(","),
        [`"تاریخ چاپ (شمسی)"`, `"${stamp}"`].join(","),
        [`"بازه زمانی"`, `"${searchParams.get("startDate") || "ابتدا"} تا ${searchParams.get("endDate") || "اکنون"}"`].join(","),
        [`"مانده ابتدای دوره (ریال)"`, `"${result.openingBalance}"`].join(","),
        [`"مانده انتهای دوره (ریال)"`, `"${result.closingBalance}"`].join(","),
        [`"تعداد کل تراکنش‌ها"`, `"${result.total}"`].join(","),
        ""
      );

      // ترتیب دقیق ستون‌ها مطابق درخواست کاربر:
      // ردیف - تاریخ شمسی - طرف حساب - واریز (بدهکار) - برداشت (بستانکار) - کارمزد - مانده حساب - شرح تراکنش - شماره پیگیری
      csvRows.push(
        [
          "ردیف",
          "تاریخ شمسی",
          "طرف حساب",
          "واریز (بدهکار)",
          "برداشت (بستانکار)",
          "کارمزد",
          "مانده حساب",
          "شرح تراکنش",
          "شماره پیگیری",
        ]
          .map((c) => `"${c}"`)
          .join(",")
      );

      result.rows.forEach((r, idx) => {
        const isIn = r.direction === "in";
        const inflow = isIn ? r.amount : 0;
        const outflow = !isIn ? r.amount : 0;
        const cp = [r.counterpartyName, r.counterpartyParentName ? `(${r.counterpartyParentName})` : null]
          .filter(Boolean)
          .join(" ");

        csvRows.push(
          [
            String(idx + 1),
            r.shamsiDate || "",
            cp,
            String(inflow),
            String(outflow),
            String(r.fee || 0),
            String(r.balanceAfter),
            r.description || "",
            r.trackingNumber || "",
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(",")
        );
      });

      // شناسه \uFEFF برای سازگاری فارسی و sep=, برای تفکیک خودکار و قطعی ستون‌ها در مایکروسافت اکسل
      const csvContent = "\uFEFFsep=,\r\n" + csvRows.join("\r\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ledger_${stamp.replace(/\//g, "-")}.csv"`,
        },
      });
    }

    /* ---------- خروجی چاپی استاندارد / ذخیره به عنوان PDF برای همین حساب ---------- */
    if (format === "print" || format === "pdf") {
      const formatNum = (n: number) => Number(n || 0).toLocaleString("fa-IR");

      let totalIn = 0;
      let totalOut = 0;
      result.rows.forEach((r) => {
        if (r.direction === "in") totalIn += Number(r.amount) || 0;
        else totalOut += Number(r.amount) || 0;
      });

      const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>صورت‌حساب دفتر معین - ${account.name}</title>
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
      gap: 8px;
    }
    .print-btn {
      width: 100%;
      padding: 12px 20px;
      background: #0284c7;
      color: #fff;
      font-family: inherit;
      font-size: 13px;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.25);
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .print-btn:active { background: #0369a1; }
    .ios-hint {
      font-size: 10px;
      color: #0369a1;
      line-height: 1.5;
      background: #e0f2fe;
      padding: 6px 10px;
      border-radius: 6px;
    }
    @media (min-width: 640px) {
      .action-bar-inner {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
      .print-btn { width: auto; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .title { font-size: 16px; font-weight: bold; color: #0369a1; margin: 0; }
    .meta { font-size: 10px; color: #64748b; margin-top: 4px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
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
    .val-neutral { color: #0284c7; }
    .val-in { color: #16a34a; }
    .val-out { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9.5px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: right;
      padding: 6px 7px;
      border: 1px solid #e2e8f0;
    }
    td {
      padding: 5px 7px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    tr:nth-child(even) td { background: #fafafa; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="no-print action-bar">
    <div class="action-bar-inner">
      <button class="print-btn" onclick="window.print()" ontouchend="window.print()">
        🖨️ چاپ / ذخیره به عنوان PDF
      </button>
      <div class="ios-hint">
        📱 <b>راهنمای ذخیره PDF در آیفون:</b> پس از زدن دکمه چاپ، در پیش‌نمایش پرینت با دو انگشت روی برگه زوم کنید (Pinch-Out) تا فایل PDF شود، سپس دکمه اشتراک <b>Share</b> را زده و <b>Save to Files</b> را انتخاب فرمایید.
      </div>
    </div>
  </div>

  <div class="header">
    <div>
      <h1 class="title">صورت‌حساب دفتر معین: ${account.name} (${typeLabel})</h1>
      <div class="meta">
        بازه گزارش: ${searchParams.get("startDate") || "ابتدا"} تا ${searchParams.get("endDate") || "اکنون"}
        ${searchParams.get("query") ? ` | فیلتر جستجو: «${searchParams.get("query")}»` : ""}
        | تاریخ چاپ: ${stampText} (${stamp})
      </div>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">مانده ابتدای دوره</div>
      <div class="stat-val val-neutral">${formatNum(result.openingBalance)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${isAsset ? "مجموع واریزها (بدهکار)" : "گردش ورودی"}</div>
      <div class="stat-val val-in">${formatNum(totalIn)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">${isAsset ? "مجموع برداشت‌ها (بستانکار)" : "گردش خروجی"}</div>
      <div class="stat-val val-out">${formatNum(totalOut)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">مانده پایانی انتهای دوره</div>
      <div class="stat-val val-neutral" style="font-size: 14px;">${formatNum(result.closingBalance)} ریال</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 32px;">ردیف</th>
        <th style="width: 72px;">تاریخ شمسی</th>
        <th style="width: 110px;">طرف حساب</th>
        <th style="width: 85px;">واریز (بدهکار)</th>
        <th style="width: 85px;">برداشت (بستانکار)</th>
        <th style="width: 55px;">کارمزد</th>
        <th style="width: 95px;" class="text-left">مانده حساب (ریال)</th>
        <th>شرح تراکنش</th>
        <th style="width: 75px;">شماره پیگیری</th>
      </tr>
    </thead>
    <tbody>
      ${result.rows
        .map((r, idx) => {
          const isIn = r.direction === "in";
          const cp = [r.counterpartyName, r.counterpartyParentName ? `(${r.counterpartyParentName})` : null]
            .filter(Boolean)
            .join(" ");

          return `<tr>
            <td class="text-center">${formatNum(idx + 1)}</td>
            <td>${r.shamsiDate || "-"}</td>
            <td>${cp || "-"}</td>
            <td style="color: #16a34a; font-weight: 600;">${isIn ? formatNum(r.amount) : "-"}</td>
            <td style="color: #dc2626; font-weight: 600;">${!isIn ? formatNum(r.amount) : "-"}</td>
            <td>${r.fee ? formatNum(r.fee) : "-"}</td>
            <td class="text-left" style="font-weight: bold; background: #f8fafc;">${formatNum(r.balanceAfter)}</td>
            <td>${r.description || "-"}</td>
            <td>${r.trackingNumber || "-"}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>

  <script>
    // اجرای هوشمند پرینت در دسکتاپ پس از بارگذاری
    window.addEventListener("DOMContentLoaded", () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (!isMobile) {
        setTimeout(() => {
          window.print();
        }, 400);
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
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        isParent: account.isParent,
        parentId: account.parentId,
        parentName: parent ? parent.name : null,
        initialBalance: account.initialBalance,
      },
      isAsset,
      showFee: true,
      ...result,
      hasMore: offset + result.rows.length < result.total,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
