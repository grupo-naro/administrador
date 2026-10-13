"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { clientIp } from "@/lib/client-ip";
import { fail, type ActionState } from "@/lib/form";
import { createRateLimiter } from "@/lib/rate-limit";

// En memoria y por proceso: complementa (no reemplaza) la regla de rate limiting de Cloudflare (deploy/README.md §5).
const allowLogin = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!allowLogin(clientIp(await headers()))) {
    return fail("Demasiados intentos. Probá de nuevo en unos minutos.");
  }
  try {
    await signIn("credentials", {
      email: String(fd.get("email") ?? "").toLowerCase(),
      password: String(fd.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) return fail("Email o contraseña incorrectos");
    throw e;
  }
}
