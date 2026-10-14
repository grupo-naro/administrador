"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, optMoney, parseForm, text, type ActionState } from "@/lib/form";
import { centsToDec } from "@/server/mappers";

const schema = z.object({
  type: z.enum(["DOMINIO", "HOSTING", "SERVIDOR"]),
  provider: text("El proveedor es obligatorio"),
  identifier: text("El identificador es obligatorio (ej. dominio.com)"),
  renewalDate: dateField("Fecha de renovación inválida"),
  managedByNaro: z.enum(["true", "false"]),
  cost: optMoney,
  costEveryMonths: z.enum(["1", "3", "6", "12"]),
});

export async function createAsset(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail("El proyecto no existe");
  const { managedByNaro, cost, costEveryMonths, ...rest } = parsed.data;
  await prisma.infrastructureAsset.create({
    data: {
      ...rest,
      projectId,
      managedByNaro: managedByNaro === "true",
      costAmount: cost ? centsToDec(cost) : undefined,
      costEveryMonths: Number(costEveryMonths),
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/infrastructure");
  revalidatePath("/dashboard");
  return { message: "Activo agregado" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteAsset(id: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const asset = await prisma.infrastructureAsset.findUnique({ where: { id }, select: { projectId: true } });
  if (!asset) return fail("El activo no existe o ya fue eliminado");
  await prisma.infrastructureAsset.deleteMany({ where: { id } });
  revalidatePath(`/projects/${asset.projectId}`);
  revalidatePath("/infrastructure");
  revalidatePath("/dashboard");
  return { message: "Activo eliminado" };
}
