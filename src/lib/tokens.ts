import { createHash, randomBytes } from "node:crypto";

export const generateToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const isWellFormedToken = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);

export function evaluateToken(
  row: { expiresAt: Date | null; revokedAt: Date | null } | null,
  now: Date,
): "OK" | "INVALID" {
  if (!row || row.revokedAt) return "INVALID";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "INVALID";
  return "OK";
}
