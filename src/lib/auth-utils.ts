import crypto from "crypto";

export function hashPassword(password: string): string {
  const salt = "wallet_salt_ios_safe";
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}
