import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, listAccounts, getLedger } from "@/db/repo";

export const dynamic = "force-dynamic";

/**
 * گردش حساب با مانده لحظه‌ای برای یک حساب یا سرفصل (به همراه زیرمجموعه‌ها)
 */
export async function GET(req: Request) {
  try {
    await ensureDatabase();
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

    const limit = parseInt(searchParams.get("limit") || "40", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

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
