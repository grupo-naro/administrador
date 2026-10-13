import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { PORTAL_PREFIX, portalNotFound, portalRequestAllowed } from "./server/portal/gate";

const authProxy = NextAuth(authConfig).auth as unknown as (
  req: NextRequest,
  ev: NextFetchEvent,
) => Promise<Response | undefined>;

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  // Portal público: sin login. El 404 se decide acá para que sea un 404 HTTP real
  // (dentro de la página, notFound() llega tarde: el shell parcial ya se envió con 200).
  const { pathname } = req.nextUrl;
  if (pathname === PORTAL_PREFIX.slice(0, -1) || pathname.startsWith(PORTAL_PREFIX)) {
    if (!(await portalRequestAllowed(pathname, req.headers))) return portalNotFound();
    return;
  }
  return authProxy(req, ev);
}

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
