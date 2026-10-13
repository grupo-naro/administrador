"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, money, optText, parseForm, text, type ActionState } from "@/lib/form";
import { todayAR } from "@/domain/dates";
import {
  BATCH_SIZE,
  planOneTime,
  planRecurring,
  planSubscription,
  repriceInstallments,
  type InstallmentDraft,
} from "@/domain/installments";
import { assertPayable, remainingCents } from "@/domain/status";
import { centsToDec, decToCents } from "@/server/mappers";
import { recalcInstallment } from "./recalc";

const toCreate = (d: InstallmentDraft) => ({
  type: d.type,
  sequence: d.sequence,
  amount: centsToDec(d.amountCents),
  dueDate: d.dueDate,
});

class BillingError extends Error {}

/** Bloquea la fila de la cuota hasta el fin de la transacción (evita check-then-act concurrente). */
const lockInstallment = (tx: Prisma.TransactionClient, id: string) =>
  tx.$queryRaw`SELECT 1 FROM "Installment" WHERE id = ${id} FOR UPDATE`;

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`);

export async function createDevelopmentPlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(
    z.object({ total: money("Total inválido"), count: z.enum(["2", "3"]), startDate: dateField() }),
    fd,
  );
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El proyecto no es de Pago Único");
  if (project.plans.some((p) => p.kind === "DESARROLLO")) return fail("Ya existe un plan de desarrollo");
  const { total, count, startDate } = parsed.data;
  const drafts = planOneTime({ totalCents: total, count: Number(count), startDate });
  await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { totalAmount: centsToDec(total) } }),
    prisma.installmentPlan.create({
      data: {
        projectId,
        kind: "DESARROLLO",
        totalAmount: centsToDec(total),
        installmentCount: Number(count),
        installments: { create: drafts.map(toCreate) },
      },
    }),
  ]);
  refresh(projectId);
  return { message: "Plan de cobros creado" };
}

export async function createSubscriptionPlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(
    z.object({ monthlyFee: money("Abono inválido"), firstPayment: money("Primer pago inválido"), firstDueDate: dateField() }),
    fd,
  );
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "SUSCRIPCION") return fail("El proyecto no es una Suscripción");
  if (project.plans.some((p) => p.kind === "SUSCRIPCION")) return fail("Ya existe un plan de suscripción");
  const { monthlyFee, firstPayment, firstDueDate } = parsed.data;
  const drafts = planSubscription({ monthlyFeeCents: monthlyFee, firstPaymentCents: firstPayment, firstDueDate });
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { monthlyFee: centsToDec(monthlyFee), firstPaymentAmount: centsToDec(firstPayment) },
    }),
    prisma.installmentPlan.create({
      data: { projectId, kind: "SUSCRIPCION", installments: { create: drafts.map(toCreate) } },
    }),
  ]);
  refresh(projectId);
  return { message: "Plan de suscripción creado" };
}

export async function updateInstallment(installmentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ amount: money(), dueDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  try {
    const projectId = await prisma.$transaction(async (tx) => {
      await lockInstallment(tx, installmentId);
      const inst = await tx.installment.findUnique({
        where: { id: installmentId },
        include: { payments: true, plan: true },
      });
      if (!inst) throw new BillingError("Cuota no encontrada");
      const paid = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
      if (parsed.data.amount < paid) throw new BillingError("El monto no puede ser menor a lo ya pagado");
      await tx.installment.update({
        where: { id: installmentId },
        data: { amount: centsToDec(parsed.data.amount), dueDate: parsed.data.dueDate },
      });
      await recalcInstallment(tx, installmentId);
      return inst.plan.projectId;
    });
    refresh(projectId);
    return { message: "Cuota actualizada" };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    throw e;
  }
}

const paymentSchema = z.object({
  amount: money(),
  paidAt: dateField("Fecha de pago inválida"),
  method: text("Elegí un método"),
  receiptNote: optText,
});

export async function registerPayment(installmentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(paymentSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  try {
    const projectId = await prisma.$transaction(async (tx) => {
      await lockInstallment(tx, installmentId);
      const inst = await tx.installment.findUnique({
        where: { id: installmentId },
        include: { payments: true, plan: true },
      });
      if (!inst) throw new BillingError("Cuota no encontrada");
      const paidCents = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
      try {
        assertPayable(remainingCents({ amountCents: decToCents(inst.amount), paidCents }), parsed.data.amount);
      } catch (e) {
        throw new BillingError((e as Error).message);
      }
      await tx.payment.create({
        data: {
          installmentId,
          amount: centsToDec(parsed.data.amount),
          paidAt: parsed.data.paidAt,
          method: parsed.data.method,
          receiptNote: parsed.data.receiptNote,
        },
      });
      await recalcInstallment(tx, installmentId);
      return inst.plan.projectId;
    });
    refresh(projectId);
    return { message: "Pago registrado" };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deletePayment(paymentId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { installment: { include: { plan: true } } },
  });
  if (!payment) return fail("Pago no encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await recalcInstallment(tx, payment.installmentId);
  });
  refresh(payment.installment.plan.projectId);
  return { message: "Pago eliminado" };
}

export async function repricePlan(
  projectId: string,
  kind: "SUSCRIPCION" | "MANTENIMIENTO",
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ newFee: money("Abono inválido"), fromDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind } },
    include: { installments: { include: { payments: true } } },
  });
  if (!plan) return fail("No hay plan para ajustar");
  const items = plan.installments.map((i) => ({
    id: i.id,
    type: i.type,
    dueDate: i.dueDate,
    amountCents: decToCents(i.amount),
    paidCents: i.payments.reduce((s, p) => s + decToCents(p.amount), 0),
  }));
  const changes = repriceInstallments(items, parsed.data.fromDate, parsed.data.newFee);
  await prisma.$transaction([
    ...changes.map((c) =>
      prisma.installment.update({ where: { id: c.id }, data: { amount: centsToDec(c.amountCents) } }),
    ),
    prisma.project.update({
      where: { id: projectId },
      data:
        kind === "SUSCRIPCION"
          ? { monthlyFee: centsToDec(parsed.data.newFee) }
          : { maintenanceFee: centsToDec(parsed.data.newFee) },
    }),
  ]);
  refresh(projectId);
  return { message: `Abono actualizado en ${changes.length} cuota(s)` };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function extendPlan(planId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const plan = await prisma.installmentPlan.findUnique({
    where: { id: planId },
    include: { project: true, installments: { orderBy: { sequence: "asc" } } },
  });
  if (!plan) return fail("Plan no encontrado");
  if (plan.kind === "DESARROLLO") return fail("El plan de desarrollo no se extiende");
  if (plan.kind === "MANTENIMIENTO" && plan.project.maintenanceEndedAt) return fail("El mantenimiento está dado de baja");
  const fee = plan.kind === "SUSCRIPCION" ? plan.project.monthlyFee : plan.project.maintenanceFee;
  if (!fee || plan.installments.length === 0) return fail("Falta el abono vigente");
  const last = plan.installments[plan.installments.length - 1];
  const drafts = planRecurring({
    type: plan.kind === "SUSCRIPCION" ? "MENSUAL" : "MANTENIMIENTO",
    feeCents: decToCents(fee),
    baseDate: plan.installments[0].dueDate,
    startSequence: last.sequence + 1,
    count: BATCH_SIZE,
  });
  try {
    await prisma.installment.createMany({ data: drafts.map((d) => ({ planId, ...toCreate(d) })) });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("Las cuotas ya fueron generadas, recargá la página");
    throw e;
  }
  refresh(plan.projectId);
  return { message: `Se generaron ${BATCH_SIZE} cuotas más` };
}

export async function activateMaintenance(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ fee: money("Abono inválido"), firstDueDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El mantenimiento aplica a proyectos de Pago Único");
  if (project.plans.some((p) => p.kind === "MANTENIMIENTO")) return fail("El mantenimiento ya está activo");
  const { fee, firstDueDate } = parsed.data;
  const drafts = planRecurring({
    type: "MANTENIMIENTO",
    feeCents: fee,
    baseDate: firstDueDate,
    startSequence: 1,
    count: BATCH_SIZE,
  });
  try {
    await prisma.$transaction([
      prisma.project.update({
        where: { id: projectId },
        data: {
          maintenanceFee: centsToDec(fee),
          maintenanceStartsAt: firstDueDate,
          maintenanceEndedAt: null,
          stage: "EN_MANTENIMIENTO",
        },
      }),
      prisma.installmentPlan.create({
        data: { projectId, kind: "MANTENIMIENTO", installments: { create: drafts.map(toCreate) } },
      }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return fail("El mantenimiento ya fue activado, recargá la página");
    throw e;
  }
  refresh(projectId);
  return { message: "Mantenimiento activado" };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function endMaintenance(projectId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind: "MANTENIMIENTO" } },
    include: { installments: { include: { payments: true } } },
  });
  if (!plan) return fail("No hay mantenimiento activo");
  const today = todayAR();
  const removable = plan.installments
    .filter((i) => i.dueDate.getTime() >= today.getTime() && i.payments.length === 0)
    .map((i) => i.id);
  await prisma.$transaction([
    prisma.installment.deleteMany({ where: { id: { in: removable } } }),
    prisma.project.update({ where: { id: projectId }, data: { maintenanceEndedAt: today } }),
  ]);
  refresh(projectId);
  return { message: `Mantenimiento dado de baja (${removable.length} cuota(s) futuras anuladas)` };
}

export async function setServiceSuspended(
  projectId: string,
  suspended: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: ActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fd: FormData,
): Promise<ActionState> {
  await requireAdmin();
  await prisma.project.update({ where: { id: projectId }, data: { serviceSuspended: suspended } });
  refresh(projectId);
  return { message: suspended ? "Servicio suspendido" : "Servicio reactivado" };
}
