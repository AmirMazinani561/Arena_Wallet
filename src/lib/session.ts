import crypto from "crypto";

export const SESSION_COOKIE_NAME = "arena_wallet_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 روز به ثانیه

function getSecretKey(): string {
  return (
    process.env.SESSION_SECRET ||
    "arena_wallet_secret_key_v1_secure_salt_change_in_env_production_mode"
  );
}

export interface SessionPayload {
  userId: string;
  username: string;
  exp: number;
}

export interface ResponseWithCookies {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => unknown;
  };
}

/** ساخت توکن سشن با امضای دیجیتال HMAC-SHA256 */
export function createSessionToken(user: { id: string; username: string }): string {
  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSecretKey())
    .update(payloadStr)
    .digest("base64url");
  return `${payloadStr}.${signature}`;
}

/** اعتبارسنجی توکن سشن و جلوگیری از حملات زمانی */
export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSecretKey())
    .update(payloadStr)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(
      Buffer.from(payloadStr, "base64url").toString("utf-8")
    );
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** پارس ساده و سریع کوکی‌های هدر Request */
export function parseCookieHeader(cookieHeader?: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      const k = pair.substring(0, idx).trim();
      const v = pair.substring(idx + 1).trim();
      map.set(k, decodeURIComponent(v));
    }
  }
  return map;
}

/** بررسی سشن کلاینت از روی Request */
export function getSessionFromRequest(req: Request): SessionPayload | null {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies.get(SESSION_COOKIE_NAME);
  return verifySessionToken(token);
}

/** تزریق کوکی HttpOnly امن به پاسخ سرور */
export function attachSessionCookie(res: ResponseWithCookies, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** پاک‌کردن کوکی سشن هنگام خروج */
export function clearSessionCookie(res: ResponseWithCookies): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
