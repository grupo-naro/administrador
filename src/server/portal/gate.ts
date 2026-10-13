// Validación liviana del portal, usada desde src/proxy.ts (no lleva "server-only" porque el bundle
// del proxy no resuelve la condición react-server). Decide el 404 antes de que empiece el streaming.
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/client-ip";
import { createRateLimiter } from "@/lib/rate-limit";
import { evaluateToken, hashToken, isWellFormedToken } from "@/lib/tokens";

export const PORTAL_PREFIX = "/client/view/";

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

export { clientIp };

/** true si la request puede seguir a la página; false => 404 genérico (rate limit o token inválido). */
export async function portalRequestAllowed(pathname: string, headers: Headers): Promise<boolean> {
  if (!allow(clientIp(headers))) return false;
  const rest = pathname.slice(PORTAL_PREFIX.length);
  let token: string;
  try {
    token = decodeURIComponent(rest);
  } catch {
    return false;
  }
  if (!isWellFormedToken(token)) return false;
  const row = await prisma.clientAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, revokedAt: true },
  });
  return evaluateToken(row, new Date()) === "OK";
}

const NOT_FOUND_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>404 - Página no encontrada</title></head><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><p>404 · Página no encontrada.</p></body></html>`;

export function portalNotFound(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
