import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, reorderAccounts } from "@/db/repo";

export const dynamic = "force-dynamic";

/**
 * ذخیره ترتیب دلخواه حساب‌های منتخب در صفحه اصلی.
 * بدنه: { ids: string[] } — ترتیب آرایه = ترتیب نمایش
 */
export async function POST(req: Request) {
  try {
    await ensureDatabase();
    const body = await req.json();
    const ids: unknown = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
      return NextResponse.json({ error: "لیست شناسه‌ها نامعتبر است." }, { status: 400 });
    }

    await reorderAccounts(ids as string[]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
