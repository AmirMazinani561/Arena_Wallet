import { NextResponse } from "next/server";
import { translateDbError } from "@/db/client";
import { ensureDatabase, findUser, updateUserPassword } from "@/db/repo";
import { hashPassword, verifyPassword } from "@/lib/auth-utils";
import {
  createSessionToken,
  attachSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureDatabase();
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    const user = await findUser(session.username);
    if (!user || user.id !== session.userId) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      user: { id: user.id, username: user.username, fullName: user.fullName },
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
    const { action, username, password, newPassword } = body;

    if (action === "login") {
      if (!username || !password) {
        return NextResponse.json(
          { error: "نام کاربری و رمز عبور الزامی است." },
          { status: 400 }
        );
      }

      const user = await findUser(String(username).trim());
      if (!user) {
        return NextResponse.json({ error: "کاربری با این مشخصات یافت نشد." }, { status: 401 });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: "رمز عبور اشتباه است." }, { status: 401 });
      }

      const token = createSessionToken({ id: user.id, username: user.username });
      const res = NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username, fullName: user.fullName },
      });
      attachSessionCookie(res, token);
      return res;
    }

    if (action === "logout") {
      const res = NextResponse.json({ success: true });
      clearSessionCookie(res);
      return res;
    }

    if (action === "changePassword") {
      const user = await findUser(String(username || "admin").trim());
      if (!user) {
        return NextResponse.json({ error: "کاربر یافت نشد." }, { status: 404 });
      }
      if (!verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: "رمز عبور فعلی نامعتبر است." }, { status: 400 });
      }
      if (!newPassword || String(newPassword).length < 4) {
        return NextResponse.json(
          { error: "رمز عبور جدید باید حداقل ۴ کاراکتر باشد." },
          { status: 400 }
        );
      }

      await updateUserPassword(user.id, hashPassword(newPassword));
      const token = createSessionToken({ id: user.id, username: user.username });
      const res = NextResponse.json({ success: true, message: "رمز عبور با موفقیت به‌روزرسانی شد." });
      attachSessionCookie(res, token);
      return res;
    }

    return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  } catch (err: unknown) {
    const message = translateDbError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
