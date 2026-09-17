import { NextResponse } from "next/server";
import { ensureDatabase, exportAll, replaceAll, createSnapshot, AccountRow, TransactionRow } from "@/db/repo";
import { dialect, translateDbError } from "@/db/client";
import { getSessionFromRequest } from "@/lib/session";
import { getCurrentShamsi } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

/** فرار دادن مقادیر متنی برای تولید فایل SQL */
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
  return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

export async function GET(req: Request) {
  try {
    await ensureDatabase();

    // بررسی احراز هویت سشن جهت جلوگیری از دانلود عمومی دیتابیس
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً ابتدا وارد حساب کاربری شوید." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";

    const data = await exportAll();
    const shamsiNow = getCurrentShamsi();
    const stamp = shamsiNow.formatted;
    const stampText = shamsiNow.fullText;

    /* ---------- خروجی SQL جهت بازیابی مستقیم در phpMyAdmin ---------- */
    if (format === "sql") {
      const lines: string[] = [];
      lines.push(`-- پشتیبان جامع کیف پول هوشمند`);
      lines.push(`-- تاریخ تولید: ${new Date().toISOString()}`);
      lines.push(`-- نوع پایگاه داده: ${dialect}`);
      lines.push(``);
      if (dialect === "mysql") {
        lines.push(`SET FOREIGN_KEY_CHECKS = 0;`);
      }
      lines.push(`DELETE FROM transactions;`);
      lines.push(`DELETE FROM accounts;`);
      lines.push(``);

      // مرتب‌سازی حساب‌ها: حساب‌های اصلی/والد قبل از زیرمجموعه‌ها درج شوند
      const sortedAccounts = [...data.accounts].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });

      for (const a of sortedAccounts) {
        lines.push(
          `INSERT INTO accounts (id, type, name, initial_balance, is_favorite, is_parent, parent_id, detail_info, icon, color, sort_order) VALUES (` +
            [
              a.id,
              a.type,
              a.name,
              a.initialBalance,
              a.isFavorite,
              a.isParent,
              a.parentId,
              a.detailInfo,
              a.icon,
              a.color,
              a.sortOrder || 0,
            ]
              .map(sqlValue)
              .join(", ") +
            `);`
        );
      }

      lines.push(``);

      for (const t of data.transactions) {
        lines.push(
          `INSERT INTO transactions (id, type, amount, fee, from_account_id, to_account_id, date, shamsi_date, description, tracking_number) VALUES (` +
            [
              t.id,
              t.type,
              t.amount,
              t.fee,
              t.fromAccountId,
              t.toAccountId,
              t.date,
              t.shamsiDate,
              t.description,
              t.trackingNumber,
            ]
              .map(sqlValue)
              .join(", ") +
            `);`
        );
      }

      if (dialect === "mysql") {
        lines.push(``);
        lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);
      }

      return new Response(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="wallet_backup_${stamp}.sql"`,
        },
      });
    }

    /* ---------- خروجی CSV سازگار با اکسل (Excel UTF-8 BOM) ---------- */
    if (format === "csv") {
      const accountMap = new Map(data.accounts.map((a) => [a.id, a.name]));
      const csvRows: string[] = [];

      // هدر ستون‌ها
      csvRows.push(
        [
          "ردیف",
          "شناسه",
          "تاریخ شمسی",
          "نوع تراکنش",
          "مبلغ (ریال)",
          "کارمزد (ریال)",
          "حساب مبدا",
          "حساب مقصد",
          "شماره پیگیری",
          "توضیحات",
        ]
          .map((c) => `"${c.replace(/"/g, '""')}"`)
          .join(",")
      );

      data.transactions.forEach((t, idx) => {
        const typeLabel =
          t.type === "expense" ? "هزینه" : t.type === "income" ? "درآمد" : "انتقال";
        const fromName = accountMap.get(t.fromAccountId) || t.fromAccountId;
        const toName = accountMap.get(t.toAccountId) || t.toAccountId;

        csvRows.push(
          [
            String(idx + 1),
            t.id,
            t.shamsiDate || "",
            typeLabel,
            String(t.amount),
            String(t.fee || 0),
            fromName,
            toName,
            t.trackingNumber || "",
            t.description || "",
          ]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(",")
        );
      });

      // \uFEFF برای نمایش بی‌نقص متون فارسی و sep=, برای تفکیک ستون‌ها در اکسل
      const csvContent = "\uFEFFsep=,\r\n" + csvRows.join("\r\n");
      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="wallet_transactions_${stamp.replace(/\//g, "-")}.csv"`,
        },
      });
    }

    /* ---------- خروجی HTML چاپی / ذخیره به عنوان PDF ---------- */
    if (format === "print" || format === "pdf") {
      const accountMap = new Map(data.accounts.map((a) => [a.id, a]));
      let totalExpense = 0;
      let totalIncome = 0;

      data.transactions.forEach((t) => {
        if (t.type === "expense") totalExpense += Number(t.amount) || 0;
        if (t.type === "income") totalIncome += Number(t.amount) || 0;
      });

      const formatNum = (n: number) => Number(n || 0).toLocaleString("fa-IR");

      const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>صورت‌حساب جامع مالی - کیف پول آرنا</title>
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
      margin-bottom: 16px;
    }
    .title { font-size: 16px; font-weight: bold; color: #0369a1; margin: 0; }
    .meta { font-size: 10px; color: #64748b; margin-top: 4px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
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
    .stat-val { font-size: 13px; font-weight: bold; }
    .val-neutral { color: #0284c7; }
    .val-income { color: #16a34a; }
    .val-expense { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9.5px; }
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
    tr:nth-child(even) td { background: #fafafa; }
    .badge {
      display: inline-block;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 600;
    }
    .badge-income { background: #dcfce7; color: #15803d; }
    .badge-expense { background: #fee2e2; color: #b91c1c; }
    .badge-transfer { background: #e0f2fe; color: #0369a1; }
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
      <h1 class="title">گزارش صورت‌حساب جامع - کیف پول آرنا</h1>
      <div class="meta">تاریخ گزارش: ${stampText} (${stamp}) | تعداد کل تراکنش‌ها: ${formatNum(data.transactions.length)} | تعداد حساب‌ها: ${formatNum(data.accounts.length)}</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-label">تعداد تراکنش‌ها</div>
      <div class="stat-val val-neutral">${formatNum(data.transactions.length)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">مجموع درآمدها</div>
      <div class="stat-val val-income">${formatNum(totalIncome)} ریال</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">مجموع هزینه‌ها</div>
      <div class="stat-val val-expense">${formatNum(totalExpense)} ریال</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 35px;">ردیف</th>
        <th style="width: 75px;">تاریخ</th>
        <th class="text-center" style="width: 55px;">نوع</th>
        <th style="width: 100px;">مبلغ (ریال)</th>
        <th style="width: 110px;">از حساب</th>
        <th style="width: 110px;">به حساب</th>
        <th>توضیحات / شماره پیگیری</th>
      </tr>
    </thead>
    <tbody>
      ${data.transactions
        .map((t, idx) => {
          const typeClass =
            t.type === "expense" ? "badge-expense" : t.type === "income" ? "badge-income" : "badge-transfer";
          const typeLabel =
            t.type === "expense" ? "هزینه" : t.type === "income" ? "درآمد" : "انتقال";
          const fromAcc = accountMap.get(t.fromAccountId);
          const toAcc = accountMap.get(t.toAccountId);
          const details = [t.description, t.trackingNumber ? `پیگیری: ${t.trackingNumber}` : null]
            .filter(Boolean)
            .join(" — ");

          return `<tr>
            <td class="text-center">${formatNum(idx + 1)}</td>
            <td>${t.shamsiDate || "-"}</td>
            <td class="text-center"><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td style="font-weight: bold;">${formatNum(t.amount)}</td>
            <td>${fromAcc ? fromAcc.name : t.fromAccountId}</td>
            <td>${toAcc ? toAcc.name : t.toAccountId}</td>
            <td>${details || "-"}</td>
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

    /* ---------- خروجی JSON (پیش‌فرض) ---------- */
    const backupData = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      appName: "کیف پول هوشمند",
      dialect,
      counts: {
        accounts: data.accounts.length,
        transactions: data.transactions.length,
      },
      users: data.users,
      accounts: data.accounts,
      transactions: data.transactions,
    };

    return new Response(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="wallet_backup_${stamp}.json"`,
      },
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureDatabase();

    // بررسی احراز هویت سشن جهت جلوگیری از بازنویسی غیرمجاز دیتابیس
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً ابتدا وارد حساب کاربری شوید." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { accounts: incomingAccounts, transactions: incomingTxs } = body;

    if (!Array.isArray(incomingAccounts) || !Array.isArray(incomingTxs)) {
      return NextResponse.json(
        { error: "فرمت فایل پشتیبان نامعتبر است. ساختار داده‌ها شامل حساب‌ها یا تراکنش‌ها نیست." },
        { status: 400 }
      );
    }

    const accountsData: AccountRow[] = incomingAccounts.map((a: Record<string, unknown>) => ({
      id: String(a.id),
      type: String(a.type),
      name: String(a.name),
      initialBalance: Number(a.initialBalance) || 0,
      isFavorite: Boolean(a.isFavorite),
      isParent: Boolean(a.isParent),
      parentId: a.parentId ? String(a.parentId) : null,
      detailInfo: a.detailInfo ? String(a.detailInfo) : null,
      icon: a.icon ? String(a.icon) : "wallet",
      color: a.color ? String(a.color) : "#0284c7",
      sortOrder: Number(a.sortOrder) || 0,
    }));

    const txData: TransactionRow[] = incomingTxs.map((t: Record<string, unknown>) => ({
      id: String(t.id),
      type: String(t.type),
      amount: Number(t.amount) || 0,
      fee: Number(t.fee) || 0,
      fromAccountId: String(t.fromAccountId),
      toAccountId: String(t.toAccountId),
      date: t.date ? String(t.date) : new Date().toISOString(),
      shamsiDate: String(t.shamsiDate || ""),
      description: t.description ? String(t.description) : null,
      trackingNumber: t.trackingNumber ? String(t.trackingNumber) : null,
      status: "active",
      sourceHash: null,
    }));

    // پیش از بازگردانی، یک اسنپ‌شات خودکار از وضعیت موجود گرفته می‌شود تا هیچ داده‌ای تصادفاً از بین نرود
    await createSnapshot("manual");

    await replaceAll(accountsData, txData);

    return NextResponse.json({
      success: true,
      message: `اطلاعات با موفقیت بازگردانی شد (${accountsData.length} حساب و ${txData.length} تراکنش).`,
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
