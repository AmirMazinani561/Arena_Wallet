import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, listAccounts, getLedger } from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";

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

    const stamp = new Date().toISOString().slice(0, 10);
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

    /* ---------- خروجی اکسل (CSV UTF-8 BOM) برای دفتر معین همین حساب ---------- */
    if (format === "csv") {
      const csvRows: string[] = [];
      csvRows.push(`"گزارش صورت‌حساب دفتر معین - ${account.name.replace(/"/g, '""')}"`);
      csvRows.push(
        `"نوع حساب","${typeLabel}","تاریخ تولید","${stamp}","بازه زمانی","${searchParams.get("startDate") || "ابتدا"} تا ${searchParams.get("endDate") || "اکنون"}"`
      );
      csvRows.push(
        `"مانده ابتدای دوره (ریال)","${result.openingBalance}","مانده انتهای دوره (ریال)","${result.closingBalance}","تعداد تراکنش‌ها","${result.total}"`
      );
      csvRows.push("");

      csvRows.push(
        [
          "ردیف",
          "شناسه",
          "تاریخ شمسی",
          "شرح تراکنش",
          "طرف حساب / سرفصل",
          isAsset ? "واریز / بدهکار (ریال)" : "مبلغ (ریال)",
          isAsset ? "برداشت / بستانکار (ریال)" : "جهت",
          "کارمزد (ریال)",
          isAsset ? "مانده پس از تراکنش (ریال)" : "گردش تجمعی (ریال)",
          "شماره پیگیری",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
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
            r.id,
            r.shamsiDate || "",
            r.description || "",
            cp,
            isAsset ? String(inflow) : String(r.amount),
            isAsset ? String(outflow) : isIn ? "افزایشی" : "کاهشی",
            String(r.fee || 0),
            String(r.balanceAfter),
            r.trackingNumber || "",
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(",")
        );
      });

      const csvContent = "\uFEFF" + csvRows.join("\r\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ledger_${stamp}.csv"`,
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
    .badge {
      display: inline-block;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 600;
    }
    .badge-in { background: #dcfce7; color: #15803d; }
    .badge-out { background: #fee2e2; color: #b91c1c; }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
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
      <h1 class="title">صورت‌حساب دفتر معین: ${account.name} (${typeLabel})</h1>
      <div class="meta">
        بازه گزارش: ${searchParams.get("startDate") || "ابتدا"} تا ${searchParams.get("endDate") || "اکنون"}
        ${searchParams.get("query") ? ` | فیلتر جستجو: «${searchParams.get("query")}»` : ""}
        | تاریخ چاپ: ${stamp}
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
        <th class="text-center" style="width: 30px;">ردیف</th>
        <th style="width: 65px;">تاریخ</th>
        <th class="text-center" style="width: 45px;">جهت</th>
        <th style="width: 85px;">مبلغ (ریال)</th>
        <th style="width: 60px;">کارمزد</th>
        <th style="width: 95px;">طرف حساب</th>
        <th>شرح / شماره پیگیری</th>
        <th style="width: 95px;" class="text-left">${isAsset ? "مانده لحظه‌ای" : "گردش تجمعی"}</th>
      </tr>
    </thead>
    <tbody>
      ${result.rows
        .map((r, idx) => {
          const isIn = r.direction === "in";
          const cp = [r.counterpartyName, r.counterpartyParentName ? `(${r.counterpartyParentName})` : null]
            .filter(Boolean)
            .join(" ");
          const desc = [r.description, r.trackingNumber ? `پیگیری: ${r.trackingNumber}` : null]
            .filter(Boolean)
            .join(" — ");

          return `<tr>
            <td class="text-center">${formatNum(idx + 1)}</td>
            <td>${r.shamsiDate || "-"}</td>
            <td class="text-center"><span class="badge ${isIn ? "badge-in" : "badge-out"}">${isIn ? (isAsset ? "واریز" : "ورودی") : isAsset ? "برداشت" : "خروجی"}</span></td>
            <td style="font-weight: bold;">${formatNum(r.amount)}</td>
            <td>${r.fee ? formatNum(r.fee) : "-"}</td>
            <td>${cp || "-"}</td>
            <td>${desc || "-"}</td>
            <td class="text-left" style="font-weight: 600;">${formatNum(r.balanceAfter)}</td>
          </tr>`;
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
