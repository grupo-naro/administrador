"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, optMoney, parseForm, text, type ActionState } from "@/lib/form";
import { todayAR } from "@/domain/dates";
import { createProjectRecord, validateNewProject } from "./create";

const newProjectSchema = z.object({
  clientId: text("Elegí un cliente"),
  name: text("El nombre es obligatorio"),
  contractType: z.enum(["PAGO_UNICO", "SUSCRIPCION"]),
  total: optMoney,
  monthlyFee: optMoney,
  firstPayment: optMoney,
});

export async function createProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(newProjectSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  const input = {
    clientId: d.clientId,
    name: d.name,
    contractType: d.contractType,
    totalCents: d.total,
    monthlyFeeCents: d.monthlyFee,
    firstPaymentCents: d.firstPayment,
  };
  const problem = validateNewProject(input);
  if (problem) return fail(problem);
  const project = await createProjectRecord(prisma, input);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

const stageSchema = z.object({
  stage: z.enum(["COTIZACION", "EN_DESARROLLO", "ENTREGADO", "EN_MANTENIMIENTO"]),
});

export async function setProjectStage(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(stageSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Proyecto no encontrado");
  const today = todayAR();
  await prisma.project.update({
    where: { id: projectId },
    data: {
      stage: parsed.data.stage,
      startedAt: parsed.data.stage === "EN_DESARROLLO" && !project.startedAt ? today : undefined,
      deliveredAt: parsed.data.stage === "ENTREGADO" && !project.deliveredAt ? today : undefined,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { message: "Etapa actualizada" };
}
