"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, optMoney, parseForm, text, type ActionState } from "@/lib/form";
import { todayAR } from "@/domain/dates";
import { deliveryDueUpdates } from "@/domain/installments";
import { lockPlanInstallments } from "@/server/billing/locks";
import { decToCents } from "@/server/mappers";
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

/** Al entregar: el saldo "al entregar" sin pagos pasa a vencer hoy (las cuotas con pagos no se mueven). */
async function moveDeliveryDues(tx: Prisma.TransactionClient, projectId: string, deliveredAt: Date) {
  const plan = await tx.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind: "DESARROLLO" } },
    select: { id: true },
  });
  if (!plan) return;
  await lockPlanInstallments(tx, plan.id);
  const installments = await tx.installment.findMany({
    where: { planId: plan.id },
    select: { id: true, type: true, payments: { select: { amount: true } } },
  });
  const changes = deliveryDueUpdates(
    installments.map((i) => ({
      id: i.id,
      type: i.type,
      paidCents: i.payments.reduce((s, p) => s + decToCents(p.amount), 0),
    })),
    deliveredAt,
  );
  for (const c of changes) {
    await tx.installment.updateMany({ where: { id: c.id, payments: { none: {} } }, data: { dueDate: c.dueDate } });
  }
}

export async function setProjectStage(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(stageSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Proyecto no encontrado");
  const today = todayAR();
  const delivering = parsed.data.stage === "ENTREGADO";
  await prisma.$transaction(async (tx) => {
    // Cuotas antes que el proyecto: mismo orden de bloqueo que las acciones de cobros (sin deadlocks).
    if (delivering) await moveDeliveryDues(tx, projectId, today);
    await tx.project.update({
      where: { id: projectId },
      data: {
        stage: parsed.data.stage,
        startedAt: parsed.data.stage === "EN_DESARROLLO" && !project.startedAt ? today : undefined,
        deliveredAt: delivering && !project.deliveredAt ? today : undefined,
      },
    });
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { message: "Etapa actualizada" };
}
