import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransaction,
  setTransactionStatus,
  AccountRow,
  PENDING_EXPENSE_CATEGORY_ID,
  PENDING_INCOME_CATEGORY_ID,
} from "@/db/repo";
import { toShamsiDateString, shamsiToGregorian } from "@/lib/date-utils";
import { syncToEquity } from "@/lib/equity-sync";   // ← افزوده شد
import {
  sanitizeString,
  validatePositiveMoney,
  validateNonNegativeMoney,
  isValidShamsiDateString,
} from "@/lib/validation";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * تعیین خودکار ماهیت تراکنش از روی نوع حساب مبدا و مقصد.
 * کاربر نیازی به انتخاب دستی نوع تراکنش ندارد.
 */
export function deriveTxType(
  fromAcc: AccountRow,
  toAcc: AccountRow
): { type: string; error?: string } {
  const asset = ["bank", "cash", "person"];
  const fromIsAsset = asset.includes(fromAcc.type);
  const toIsAsset = asset.includes(toAcc.type);

  if (fromIsAsset && toAcc.type === "expense") return { type: "expense" };
  if (fromAcc.type === "income" && toIsAsset) return { type: "income" };
  if (fromIsAsset && toIsAsset) return { type: "transfer" };

  if (fromAcc.type === "expense") {
    return {
      type: "",
      error:
        "سرفصل هزینه نمی‌تواند مبدا تراکنش باشد. مبدا باید بانک، صندوق، شخص یا سرفصل درآمد باشد.",
    };
  }
  if (toAcc.type === "income") {
    return {
      type: "",
      error:
        "سرفصل درآمد نمی‌تواند مقصد تراکنش باشد. مقصد باید بانک، صندوق، شخص یا سرفصل هزینه باشد.",
    };
  }
  if (fromAcc.type === "income" && toAcc.type === "expense") {
    return {
      type: "",
      error: "ثبت تراکنش مستقیم بین سرفصل درآمد و سرفصل هزینه از نظر حسابداری مجاز نیست.",
    };
  }
  return { type: "", error: "ترکیب حساب مبدا و مقصد معتبر نیست." };
}

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
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const allAccounts = await listAccounts();
    const accountMap = new Map<string, AccountRow>();
    for (const a of allAccounts) accountMap.set(a.id, a);

    // اگر حساب انتخابی یک سرفصل باشد، زیرمجموعه‌های آن نیز لحاظ می‌شوند
    let accountIds: string[] | undefined;
    if (accountId) {
      accountIds = [accountId, ...allAccounts.filter((a) => a.parentId === accountId).map((a) => a.id)];
    }

    const { items, total, sums } = await listTransactions({
      id: searchParams.get("id"),
      type: searchParams.get("type"),
      status: searchParams.get("status"),
      accountIds,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      search: searchParams.get("query"),
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    const enriched = items.map((tx) => {
      const fromAcc = accountMap.get(tx.fromAccountId);
      const toAcc = accountMap.get(tx.toAccountId);
      return {
        ...tx,
        fromAccount: fromAcc
          ? {
              id: fromAcc.id,
              name: fromAcc.name,
              type: fromAcc.type,
              parentName: fromAcc.parentId ? accountMap.get(fromAcc.parentId)?.name : undefined,
              icon: fromAcc.icon,
              color: fromAcc.color,
            }
          : null,
        toAccount: toAcc
          ? {
              id: toAcc.id,
              name: toAcc.name,
              type: toAcc.type,
              parentName: toAcc.parentId ? accountMap.get(toAcc.parentId)?.name : undefined,
              icon: toAcc.icon,
              color: toAcc.color,
            }
          : null,
      };
    });

    return NextResponse.json({
      transactions: enriched,
      total,
      sums,
      hasMore: offset + items.length < total,
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const body = await req.json();
    const { amount, fee, fromAccountId, toAccountId, shamsiDate, date, description, trackingNumber } =
      body;

    const validatedAmount = validatePositiveMoney(amount);
    if (!validatedAmount.valid) {
      return NextResponse.json({ error: validatedAmount.error }, { status: 400 });
    }
    const numAmount = validatedAmount.value;

    const validatedFee = validateNonNegativeMoney(fee);
    if (!validatedFee.valid) {
      return NextResponse.json({ error: validatedFee.error }, { status: 400 });
    }
    const numFee = validatedFee.value;

    if (!fromAccountId || !toAccountId) {
      return NextResponse.json({ error: "حساب مبدا و مقصد الزامی هستند." }, { status: 400 });
    }
    if (fromAccountId === toAccountId) {
      return NextResponse.json(
        { error: "حساب مبدا و مقصد نمی‌توانند یکسان باشند." },
        { status: 400 }
      );
    }

    const allAccounts = await listAccounts();
    const fromAcc = allAccounts.find((a) => a.id === fromAccountId);
    const toAcc = allAccounts.find((a) => a.id === toAccountId);

    if (!fromAcc || !toAcc) {
      return NextResponse.json({ error: "حساب انتخاب‌شده در سیستم یافت نشد." }, { status: 400 });
    }

    const derived = deriveTxType(fromAcc, toAcc);
    if (derived.error) {
      return NextResponse.json({ error: derived.error }, { status: 400 });
    }

    let txDate: Date;
    let actualShamsi = shamsiDate ? String(shamsiDate).trim() : "";

    if (actualShamsi && isValidShamsiDateString(actualShamsi)) {
      const now = new Date();
      if (actualShamsi === toShamsiDateString(now)) {
        txDate = shamsiToGregorian(
          actualShamsi,
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds()
        );
      } else {
        txDate = shamsiToGregorian(actualShamsi, 12, 0, 0);
      }
      actualShamsi = toShamsiDateString(txDate);
    } else if (date) {
      txDate = new Date(date);
      if (isNaN(txDate.getTime())) txDate = new Date();
      actualShamsi = toShamsiDateString(txDate);
    } else {
      txDate = new Date();
      actualShamsi = toShamsiDateString(txDate);
    }

    const cleanDescription = sanitizeString(description, 500);
    const cleanTracking = sanitizeString(trackingNumber, 100);

    const transaction = await createTransaction({
      type: derived.type,
      amount: numAmount,
      fee: numFee,
      fromAccountId,
      toAccountId,
      date: txDate,
      shamsiDate: actualShamsi,
      description: cleanDescription,
      trackingNumber: cleanTracking,
    });

    const fromParent = fromAcc.parentId ? allAccounts.find((a) => a.id === fromAcc.parentId) : null;
    const toParent = toAcc.parentId ? allAccounts.find((a) => a.id === toAcc.parentId) : null;

    // ↓↓↓ افزوده شد: همگام‌سازی با نرم‌افزار سرمایه ↓↓↓
    // بدون await تا پاسخ به کاربر کند نشود. اگر هیچ طرفی حساب سرمایه
    // نباشد، سمت مقابل خودش تراکنش را نادیده می‌گیرد.
    void syncToEquity({
      id: transaction.id,
      amount: numAmount,
      fromAccountId,
      toAccountId,
      fromAccountName: fromAcc.name,
      toAccountName: toAcc.name,
      fromAccountType: fromAcc.type,
      toAccountType: toAcc.type,
      fromParentName: fromParent?.name || null,
      toParentName: toParent?.name || null,
      shamsiDate: actualShamsi,
      description: description ? String(description).trim() : null,
    });
    // ↑↑↑ پایان بخش افزوده‌شده ↑↑↑

    return NextResponse.json({ success: true, transaction });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDatabase();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "دسترسی غیرمجاز. لطفاً وارد سیستم شوید." },
        { status: 401 }
      );
    }
    const body = await req.json();
    const { id, amount, fee, fromAccountId, toAccountId, shamsiDate, description, trackingNumber } =
      body;

    if (!id) {
      return NextResponse.json({ error: "شناسه تراکنش مشخص نشده است." }, { status: 400 });
    }

    const existing = await getTransaction(String(id));
    if (!existing) {
      return NextResponse.json({ error: "تراکنش یافت نشد." }, { status: 404 });
    }

    const finalFromId = fromAccountId || existing.fromAccountId;
    const finalToId = toAccountId || existing.toAccountId;

    if (finalFromId === finalToId) {
      return NextResponse.json(
        { error: "حساب مبدا و مقصد نمی‌توانند یکسان باشند." },
        { status: 400 }
      );
    }

    const allAccounts = await listAccounts();
    const fromAcc = allAccounts.find((a) => a.id === finalFromId);
    const toAcc = allAccounts.find((a) => a.id === finalToId);
    if (!fromAcc || !toAcc) {
      return NextResponse.json({ error: "حساب انتخاب‌شده یافت نشد." }, { status: 400 });
    }

    const derived = deriveTxType(fromAcc, toAcc);
    if (derived.error) {
      return NextResponse.json({ error: derived.error }, { status: 400 });
    }

    let validatedAmountValue: number | undefined;
    if (amount !== undefined) {
      const validatedAmount = validatePositiveMoney(amount);
      if (!validatedAmount.valid) {
        return NextResponse.json({ error: validatedAmount.error }, { status: 400 });
      }
      validatedAmountValue = validatedAmount.value;
    }

    let dateValue: Date | undefined;
    let shamsiValue: string | undefined;
    if (shamsiDate) {
      const rawShamsi = String(shamsiDate).trim();
      if (isValidShamsiDateString(rawShamsi)) {
        if (existing.date && rawShamsi === existing.shamsiDate) {
          dateValue = new Date(existing.date);
        } else {
          const prevDate = existing.date ? new Date(existing.date) : null;
          const h = prevDate && !isNaN(prevDate.getTime()) ? prevDate.getUTCHours() : 12;
          const m = prevDate && !isNaN(prevDate.getTime()) ? prevDate.getUTCMinutes() : 0;
          const s = prevDate && !isNaN(prevDate.getTime()) ? prevDate.getUTCSeconds() : 0;
          dateValue = shamsiToGregorian(rawShamsi, h, m, s);
        }
        shamsiValue = toShamsiDateString(dateValue);
      }
    }

    let nextFee: number = existing.fee;
    if (fee !== undefined && fee !== null && fee !== "") {
      const validatedFee = validateNonNegativeMoney(fee);
      if (!validatedFee.valid) {
        return NextResponse.json({ error: validatedFee.error }, { status: 400 });
      }
      nextFee = validatedFee.value;
    }

    await updateTransaction(String(id), {
      type: derived.type,
      amount: validatedAmountValue,
      fee: nextFee,
      fromAccountId: finalFromId,
      toAccountId: finalToId,
      date: dateValue,
      shamsiDate: shamsiValue,
      description: description !== undefined ? sanitizeString(description, 500) : undefined,
      trackingNumber:
        trackingNumber !== undefined ? sanitizeString(trackingNumber, 100) : undefined,
    });

    // ارتقای تراکنش‌های نیمه‌تمام (ثبت‌شده از پیامک):
    // به محض اینکه طرف دوم از سرفصل موقت به حساب/سرفصل واقعی تغییر کند،
    // وضعیت از pending به active می‌رود و از صف انتظار خارج می‌شود.
    const isStillPending = [finalFromId, finalToId].some(
      (sid) => sid === PENDING_EXPENSE_CATEGORY_ID || sid === PENDING_INCOME_CATEGORY_ID
    );
    if (existing.status === "pending" && !isStillPending) {
      await setTransactionStatus(String(id), "active");
    }

    // همگام‌سازی با نرم‌افزار سرمایه (در صورتی که تراکنش کامل و فعال باشد)
    if (!isStillPending) {
      const finalAmount = validatedAmountValue !== undefined ? validatedAmountValue : existing.amount;
      const finalShamsi = shamsiValue || existing.shamsiDate || "";
      const finalDesc = description !== undefined
        ? (description ? String(description).trim() : null)
        : (existing.description ? String(existing.description).trim() : null);

      const fromParent = fromAcc.parentId ? allAccounts.find((a) => a.id === fromAcc.parentId) : null;
      const toParent = toAcc.parentId ? allAccounts.find((a) => a.id === toAcc.parentId) : null;

      void syncToEquity({
        id: String(id),
        amount: finalAmount,
        fromAccountId: finalFromId,
        toAccountId: finalToId,
        fromAccountName: fromAcc.name,
        toAccountName: toAcc.name,
        fromAccountType: fromAcc.type,
        toAccountType: toAcc.type,
        fromParentName: fromParent?.name || null,
        toParentName: toParent?.name || null,
        shamsiDate: finalShamsi,
        description: finalDesc,
      });
    }

    return NextResponse.json({ success: true, message: "تراکنش با موفقیت ویرایش شد." });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "شناسه تراکنش مشخص نشده است." }, { status: 400 });
    }
    await deleteTransaction(id);
    return NextResponse.json({ success: true, message: "تراکنش حذف شد." });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
