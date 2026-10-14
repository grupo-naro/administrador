"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { emailField, fail, parseForm, passwordField, text, type ActionState } from "@/lib/form";
import { isUniqueViolation } from "@/lib/prisma-errors";

const BCRYPT_COST = 12;

const newAdminSchema = z
  .object({
    name: text("El nombre es obligatorio"),
    email: emailField,
    password: passwordField,
    passwordConfirm: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirm, { message: "Las contraseñas no coinciden", path: ["passwordConfirm"] });

/** Alta de otro administrador. Todos tienen los mismos permisos; no hay registro público. */
export async function createAdminUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(newAdminSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const { name, email, password } = parsed.data;
  try {
    await prisma.adminUser.create({
      data: { name, email, passwordHash: await bcrypt.hash(password, BCRYPT_COST) },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("Ya existe un usuario con ese email");
    throw e;
  }
  revalidatePath("/team");
  return { message: `Usuario creado: ${email}. Pasale la contraseña por un canal seguro; el sistema no la vuelve a mostrar.` };
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual"),
    newPassword: passwordField,
    newPasswordConfirm: z.string(),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    message: "Las contraseñas nuevas no coinciden",
    path: ["newPasswordConfirm"],
  });

/** Cambia la contraseña de quien tiene la sesión abierta (nunca la de otro usuario). */
export async function changeOwnPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = parseForm(changePasswordSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const email = user.email?.toLowerCase();
  if (!email) return fail("No se pudo identificar tu usuario");
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  if (!admin) return fail("No se pudo identificar tu usuario");
  if (!(await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash))) {
    return fail("La contraseña actual es incorrecta");
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return fail("La contraseña nueva debe ser distinta de la actual");
  }
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST) },
  });
  return { message: "Contraseña actualizada" };
}
