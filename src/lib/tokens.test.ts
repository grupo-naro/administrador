import { describe, it, expect } from "vitest";
import { evaluateToken, generateToken, hashToken, isWellFormedToken } from "./tokens";

describe("tokens", () => {
  it("genera tokens únicos de 43 caracteres base64url", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
  });

  it("hashToken es determinístico y hex de 64 caracteres", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("rechaza tokens malformados sin consultar la base", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("corto")).toBe(false);
    expect(isWellFormedToken(" ".repeat(43))).toBe(false);
    expect(isWellFormedToken("a".repeat(44))).toBe(false);
    expect(isWellFormedToken("../".repeat(15))).toBe(false);
  });

  it("evaluateToken: inexistente, revocado y vencido son INVALID", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(evaluateToken(null, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: null, revokedAt: new Date("2026-10-01") }, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: new Date("2026-10-13T12:00:00Z"), revokedAt: null }, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: new Date("2026-10-14"), revokedAt: null }, now)).toBe("OK");
    expect(evaluateToken({ expiresAt: null, revokedAt: null }, now)).toBe("OK");
  });
});
