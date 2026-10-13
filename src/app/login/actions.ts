"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { fail, type ActionState } from "@/lib/form";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
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
