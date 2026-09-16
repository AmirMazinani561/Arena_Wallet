import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  countAccountTransactions,
  countChildAccounts,
  getAccountFlows,
  findDuplicateAccount,
  getAccount,
  BANK_FEE_CATEGORY_ID,
} from "@/db/repo";
import { sanitizeString } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const favoritesOnly = searchParams.get("favorite") === "true";

    const [allAccounts, flows] = await Promise.all([listAccounts(), getAccountFlows()]);

    // نگاشت سرفصل والد به زیرمجموعه‌ها
    const childrenMap = new Map<string, string[]>();
    for (const acc of allAccounts) {
      if (acc.parentId) {
        const list = childrenMap.get(acc.parentId) || [];
        list.push(acc.id);
        childrenMap.set(acc.parentId, list);
      }
    }

    const withBalances = allAccounts.map((acc) => {
      let balance = 0;
      let totalFlow = 0;

      if (acc.type === "bank" || acc.type === "cash" || acc.type === "person") {
        const ins = flows.inflow.get(acc.id) || 0;
        const outs = flows.outflow.get(acc.id) || 0;
        balance = acc.initialBalance + ins - outs;
      } else if (acc.type === "expense") {
        let sum = flows.inflow.get(acc.id) || 0;
        if (acc.id === BANK_FEE_CATEGORY_ID) sum += flows.totalFees;
        if (acc.isParent) {
          for (const cid of childrenMap.get(acc.id) || []) {
            sum += flows.inflow.get(cid) || 0;
          }
        }
        balance = sum;
        totalFlow = sum;
      } else if (acc.type === "income") {
        let sum = flows.outflow.get(acc.id) || 0;
        if (acc.isParent) {
          for (const cid of childrenMap.get(acc.id) || []) {
            sum += flows.outflow.get(cid) || 0;
          }
        }
        balance = sum;
        totalFlow = sum;
      }

      return { ...acc, balance, totalFlow };
    });

    let result = withBalances;
    if (type) result = result.filter((a) => a.type === type);
    if (favoritesOnly) result = result.filter((a) => a.isFavorite);

    return NextResponse.json({ accounts: result });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const {
      name,
      type,
      initialBalance = 0,
      isFavorite = false,
      isParent = false,
      parentId = null,
      detailInfo = null,
      color,
      icon,
    } = body;

    const cleanName = sanitizeString(name, 100);
    if (!cleanName) {
      return NextResponse.json({ error: "نام حساب الزامی است." }, { status: 400 });
    }
    if (!type || !["bank", "cash", "person", "income", "expense"].includes(type)) {
      return NextResponse.json({ error: "نوع حساب نامعتبر است." }, { status: 400 });
    }

    const dup = await findDuplicateAccount({
      type,
      name: cleanName,
      parentId: parentId || null,
    });
    if (dup) {
      return NextResponse.json(
        {
          error: parentId
            ? "زیرمجموعه‌ای با همین نام در این سرفصل وجود دارد."
            : "حسابی با همین نام در این بخش وجود دارد.",
        },
        { status: 409 }
      );
    }

    const numInitial = Number(initialBalance);
    const validInitial = Number.isFinite(numInitial) ? numInitial : 0;
    const cleanDetail = sanitizeString(detailInfo, 250);

    const account = await createAccount({
      type,
      name: cleanName,
      initialBalance: validInitial,
      isFavorite: Boolean(isFavorite),
      isParent: Boolean(isParent),
      parentId: parentId || null,
      detailInfo: cleanDetail,
      icon:
        icon ||
        (type === "bank"
          ? "credit-card"
          : type === "cash"
          ? "banknote"
          : type === "person"
          ? "user"
          : "tag"),
      color:
        color ||
        (type === "income" ? "#10b981" : type === "expense" ? "#ef4444" : "#0284c7"),
    });

    return NextResponse.json({
      success: true,
      account: { ...account, balance: account.initialBalance, totalFlow: 0 },
    });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "شناسه حساب مشخص نشده است." }, { status: 400 });
    }

    let cleanName: string | undefined;
    if (body.name !== undefined) {
      const sanitized = sanitizeString(body.name, 100);
      if (!sanitized) {
        return NextResponse.json({ error: "نام حساب نمی‌تواند خالی باشد." }, { status: 400 });
      }
      cleanName = sanitized;
    }

    const cleanDetail = body.detailInfo !== undefined ? sanitizeString(body.detailInfo, 250) : undefined;
    const numInitial = body.initialBalance !== undefined ? Number(body.initialBalance) : undefined;
    const validInitial = numInitial !== undefined && Number.isFinite(numInitial) ? numInitial : undefined;

    if (cleanName !== undefined || body.parentId !== undefined) {
      const current = await getAccount(String(id));
      if (current) {
        const nextName: string = cleanName !== undefined ? cleanName : current.name;
        const nextParent: string | null =
          body.parentId !== undefined ? body.parentId || null : current.parentId;
        const dup = await findDuplicateAccount({
          type: current.type,
          name: nextName,
          parentId: nextParent,
          excludeId: current.id,
        });
        if (dup) {
          return NextResponse.json(
            {
              error: nextParent
                ? "زیرمجموعه‌ای با همین نام در این سرفصل وجود دارد."
                : "حسابی با همین نام در این بخش وجود دارد.",
            },
            { status: 409 }
          );
        }
      }
    }

    await updateAccount(String(id), {
      name: cleanName,
      initialBalance: validInitial,
      isFavorite: body.isFavorite !== undefined ? Boolean(body.isFavorite) : undefined,
      isParent: body.isParent !== undefined ? Boolean(body.isParent) : undefined,
      parentId: body.parentId !== undefined ? body.parentId || null : undefined,
      detailInfo: cleanDetail,
      icon: body.icon !== undefined ? (sanitizeString(body.icon, 50) || undefined) : undefined,
      color: body.color !== undefined ? (sanitizeString(body.color, 30) || undefined) : undefined,
    });

    return NextResponse.json({ success: true, message: "حساب با موفقیت ویرایش شد." });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "شناسه حساب مشخص نشده است." }, { status: 400 });
    }

    if (id === BANK_FEE_CATEGORY_ID) {
      return NextResponse.json(
        { error: "سرفصل سیستمی کارمزد بانکی قابل حذف نیست." },
        { status: 400 }
      );
    }

    if ((await countAccountTransactions(id)) > 0) {
      return NextResponse.json(
        {
          error:
            "این حساب دارای تراکنش ثبت شده است و امکان حذف مستقیم ندارد. ابتدا تراکنش‌ها را حذف نمایید.",
        },
        { status: 400 }
      );
    }

    if ((await countChildAccounts(id)) > 0) {
      return NextResponse.json(
        { error: "این سرفصل دارای زیرمجموعه است. ابتدا زیرمجموعه‌های آن را حذف یا جابجا کنید." },
        { status: 400 }
      );
    }

    await deleteAccount(id);
    return NextResponse.json({ success: true, message: "حساب با موفقیت حذف شد." });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
