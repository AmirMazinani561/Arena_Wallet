import crypto from "crypto";

export function hashPassword(password: string): string {
  const salt = "wallet_salt_ios_safe";
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!password || !hash) return false;
  const computed = hashPassword(password);
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(hash);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
