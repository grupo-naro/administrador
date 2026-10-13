import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { clientAccessToken: { findUnique } } }));

import { generateToken, hashToken } from "@/lib/tokens";
import { PORTAL_PREFIX, portalRequestAllowed } from "./gate";

let ipSeq = 0;
/** IP distinta por caso: el limitador del gate es de módulo y se comparte entre tests. */
const freshHeaders = () => new Headers({ "cf-connecting-ip": `203.0.113.${++ipSeq}` });
const path = (token: string) => `${PORTAL_PREFIX}${token}`;
const DAY = 86_400_000;

describe("portalRequestAllowed", () => {
  beforeEach(() => findUnique.mockReset());

  it("token mal formado => false sin tocar la base", async () => {
    for (const bad of ["abc", "x".repeat(44), `${"a".repeat(42)}!`, "%E0%A4%A", ""]) {
      expect(await portalRequestAllowed(path(bad), freshHeaders())).toBe(false);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("token bien formado pero desconocido => false", async () => {
    findUnique.mockResolvedValue(null);
    const token = generateToken();
    expect(await portalRequestAllowed(path(token), freshHeaders())).toBe(false);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashToken(token) } }));
  });

  it("revocado => false; vencido => false; vigente => true", async () => {
    const token = generateToken();
    findUnique.mockResolvedValueOnce({ expiresAt: null, revokedAt: new Date() });
    expect(await portalRequestAllowed(path(token), freshHeaders())).toBe(false);
    findUnique.mockResolvedValueOnce({ expiresAt: new Date(Date.now() - DAY), revokedAt: null });
    expect(await portalRequestAllowed(path(token), freshHeaders())).toBe(false);
    findUnique.mockResolvedValueOnce({ expiresAt: new Date(Date.now() + DAY), revokedAt: null });
    expect(await portalRequestAllowed(path(token), freshHeaders())).toBe(true);
    findUnique.mockResolvedValueOnce({ expiresAt: null, revokedAt: null });
    expect(await portalRequestAllowed(path(token), freshHeaders())).toBe(true);
  });

  it("IP con más de 30 pedidos por minuto => false sin consultar la base", async () => {
    findUnique.mockResolvedValue({ expiresAt: null, revokedAt: null });
    const token = generateToken();
    const headers = freshHeaders();
    for (let i = 0; i < 30; i++) expect(await portalRequestAllowed(path(token), headers)).toBe(true);
    findUnique.mockClear();
    expect(await portalRequestAllowed(path(token), headers)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("segmento extra o barra final => false", async () => {
    findUnique.mockResolvedValue({ expiresAt: null, revokedAt: null });
    const token = generateToken();
    expect(await portalRequestAllowed(`${path(token)}/x`, freshHeaders())).toBe(false);
    expect(await portalRequestAllowed(`${path(token)}/`, freshHeaders())).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
