import { NextResponse } from "next/server";
import { ensureDatabase, exportAll, replaceAll, AccountRow, TransactionRow } from "@/db/repo";
import { dialect, translateDbError } from "@/db/client";

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
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";

    const data = await exportAll();
    const stamp = new Date().toISOString().slice(0, 10);

    /* ---------- خروجی SQL جهت بازیابی مستقیم در phpMyAdmin ---------- */
    if (format === "sql") {
      const lines: string[] = [];
      lines.push(`-- پشتیبان کیف پول هوشمند`);
      lines.push(`-- تاریخ تولید: ${new Date().toISOString()}`);
      lines.push(`-- نوع پایگاه داده: ${dialect}`);
      lines.push(``);
      lines.push(`DELETE FROM transactions;`);
      lines.push(`DELETE FROM accounts;`);
      lines.push(``);

      for (const a of data.accounts) {
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
              new Date(t.date),
              t.shamsiDate,
              t.description,
              t.trackingNumber,
            ]
              .map(sqlValue)
              .join(", ") +
            `);`
        );
      }

      return new Response(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="wallet_backup_${stamp}.sql"`,
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
    }));

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
