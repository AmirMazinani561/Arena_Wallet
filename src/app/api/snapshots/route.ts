import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import {
  ensureDatabase,
  createSnapshot,
  listSnapshots,
  getSnapshotPayload,
  replaceAll,
  AccountRow,
  TransactionRow,
} from "@/db/repo";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/** لیست اسنپ‌شات‌های خودکار و دستی */
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
    const snapshots = await listSnapshots();
    return NextResponse.json({
      snapshots,
      cronConfigured: Boolean(process.env.VERCEL),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}

/** ساخت اسنپ‌شات دستی یا بازگردانی از یک اسنپ‌شات */
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
    const body = await req.json().catch(() => ({}));
    const action = body.action || "create";

    if (action === "create") {
      const meta = await createSnapshot("manual");
      return NextResponse.json({ success: true, snapshot: meta, message: "اسنپ‌شات با موفقیت ذخیره شد." });
    }

    if (action === "restore") {
      const id = String(body.id || "");
      if (!id) return NextResponse.json({ error: "شناسه اسنپ‌شات مشخص نشده است." }, { status: 400 });

      const payload = await getSnapshotPayload(id);
      if (!payload) return NextResponse.json({ error: "اسنپ‌شات یافت نشد." }, { status: 404 });

      // پیش از بازگردانی، از وضعیت فعلی یک نسخه امن گرفته می‌شود
      await createSnapshot("manual");

      const parsed = JSON.parse(payload) as { accounts: AccountRow[]; transactions: TransactionRow[] };
      await replaceAll(parsed.accounts || [], parsed.transactions || []);

      return NextResponse.json({
        success: true,
        message: `بازگردانی انجام شد (${parsed.accounts.length} حساب و ${parsed.transactions.length} تراکنش). نسخه قبلی نیز به عنوان اسنپ‌شات ذخیره شد.`,
      });
    }

    return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: translateDbError(err) }, { status: 500 });
  }
}
