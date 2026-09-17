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

    /* ---------- خروجی اکسل (UTF-16LE با تب و BOM استاندارد مایکروسافت اکسل) ---------- */
    if (format === "csv") {
      const clean = (v: unknown) => String(v ?? "").replace(/[\t\r\n]/g, " ").trim();
      const rows: string[][] = [
        ["صورت‌حساب دفتر معین", clean(account.name)],
        ["نوع حساب", clean(typeLabel)],
        ["تاریخ چاپ (شمسی)", clean(stamp)],
        ["بازه زمانی", `${searchParams.get("startDate") || "ابتدا"} تا ${searchParams.get("endDate") || "اکنون"}`],
        ["مانده ابتدای دوره (ریال)", String(result.openingBalance)],
        ["مانده انتهای دوره (ریال)", String(result.closingBalance)],
        ["تعداد کل تراکنش‌ها", String(result.total)],
        [],
        // ترتیب دقیق ستون‌ها مطابق درخواست کاربر:
        [
          "ردیف",
          "تاریخ شمسی",
          "طرف حساب",
          "واریز (بدهکار)",
          "برداشت (بستانکار)",
          "کارمزد",
          "مانده حساب (ریال)",
          "شرح تراکنش",
          "شماره پیگیری",
        ],
      ];

      result.rows.forEach((r, idx) => {
        const isIn = r.direction === "in";
        const inflow = isIn ? r.amount : 0;
        const outflow = !isIn ? r.amount : 0;
        const cp = [r.counterpartyName, r.counterpartyParentName ? `(${r.counterpartyParentName})` : null]
          .filter(Boolean)
          .join(" ");

        rows.push([
          String(idx + 1),
          r.shamsiDate || "",
          clean(cp),
          String(inflow),
          String(outflow),
          String(r.fee || 0),
          String(r.balanceAfter),
          clean(r.description || ""),
          clean(r.trackingNumber || ""),
        ]);
      });

      const tsvContent = rows.map((r) => r.join("\t")).join("\r\n");
      const buffer = Buffer.from("\uFEFF" + tsvContent, "utf16le");
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-16le",
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
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 12px;
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
      margin-bottom: 14px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.12);
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
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .title { font-size: 16px; font-weight: bold; color: #0369a1; margin: 0; }
    .meta { font-size: 10px; color: #64748b; margin-top: 4px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    @media (min-width: 640px) {
      .stats {
        grid-template-columns: repeat(4, 1fr);
      }
    }
    .stat-card {
      padding: 8px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      text-align: center;
    }
    .stat-label { font-size: 9.5px; color: #64748b; margin-bottom: 3px; white-space: nowrap; }
    .stat-val { font-size: 12px; font-weight: bold; }
    .val-neutral { color: #0284c7; }
    .val-in { color: #16a34a; }
    .val-out { color: #dc2626; }
    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    table { width: 100%; min-width: 860px; border-collapse: collapse; font-size: 10px; }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: right;
      padding: 7px 8px;
      border: 1px solid #e2e8f0;
      white-space: nowrap;
    }
    td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    tr:nth-child(even) td { background: #fafafa; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .nowrap { white-space: nowrap; }
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .page-container { border: none !important; box-shadow: none !important; padding: 0 !important; }
      .table-wrapper { overflow: visible !important; border: none !important; }
      table { min-width: 100% !important; width: 100% !important; page-break-inside: auto; font-size: 9px; }
      th, td { padding: 5px 6px !important; }
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
        <div class="stat-val val-neutral" style="font-size: 13px;">${formatNum(result.closingBalance)} ریال</div>
      </div>
    </div>

    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="text-center" style="width: 35px;">ردیف</th>
            <th style="width: 75px;">تاریخ شمسی</th>
            <th style="width: 140px;">طرف حساب</th>
            <th style="width: 100px;" class="text-left">واریز (بدهکار)</th>
            <th style="width: 100px;" class="text-left">برداشت (بستانکار)</th>
            <th style="width: 65px;" class="text-left">کارمزد</th>
            <th style="width: 110px;" class="text-left">مانده حساب (ریال)</th>
            <th style="min-width: 160px;">شرح تراکنش</th>
            <th style="width: 80px;" class="text-center">شماره پیگیری</th>
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
                <td class="text-center nowrap">${formatNum(idx + 1)}</td>
                <td class="nowrap">${r.shamsiDate || "-"}</td>
                <td>${cp || "-"}</td>
                <td class="text-left nowrap" style="color: #16a34a; font-weight: 600;">${isIn ? formatNum(r.amount) : "-"}</td>
                <td class="text-left nowrap" style="color: #dc2626; font-weight: 600;">${!isIn ? formatNum(r.amount) : "-"}</td>
                <td class="text-left nowrap">${r.fee ? formatNum(r.fee) : "-"}</td>
                <td class="text-left nowrap" style="font-weight: bold; background: #f8fafc;">${formatNum(r.balanceAfter)}</td>
                <td>${r.description || "-"}</td>
                <td class="text-center nowrap">${r.trackingNumber || "-"}</td>
              </tr>`;
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
