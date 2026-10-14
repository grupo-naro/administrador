"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, money, optText, parseForm, type ActionState } from "@/lib/form";
import { PAYMENT_METHODS } from "@/lib/labels";
import { isRecordNotFound, isUniqueViolation } from "@/lib/prisma-errors";
import { todayAR } from "@/domain/dates";
import {
  BATCH_SIZE,
  planOneTime,
  planRecurring,
  planReschedule,
  planSubscription,
  repriceInstallments,
  resumeStartSequence,
  type InstallmentDraft,
  type Interval,
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

/** Bloquea todas las cuotas de un plan, en orden estable (mismo orden en todas las rutas => sin deadlocks). */
const lockPlanInstallments = (tx: Prisma.TransactionClient, planId: string) =>
  tx.$queryRaw`SELECT id FROM "Installment" WHERE "planId" = ${planId} ORDER BY id FOR UPDATE`;

/** Serializa baja/reanudación del mantenimiento aunque el plan no tenga cuotas que bloquear (siempre después de las cuotas). */
const lockProject = (tx: Prisma.TransactionClient, projectId: string) =>
  tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;

const CONFIRM_ERROR = "Marcá la casilla para confirmar";
const confirmed = (fd: FormData) => fd.get("confirm") === "si";

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`);

/** Campos del formulario "Cada [N] [días|semanas|meses]". */
const intervalFields = {
  every: z.string().trim().regex(/^\d+$/, "La frecuencia debe ser un número entero mayor a cero"),
  unit: z.enum(["dias", "semanas", "meses"]),
};
const toInterval = (d: { every: string; unit: Interval["unit"] }): Interval => ({ every: Number(d.every), unit: d.unit });

export async function createDevelopmentPlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(
    z.object({ total: money("Total inválido"), count: z.enum(["2", "3"]), startDate: dateField(), ...intervalFields }),
    fd,
  );
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El proyecto no es de Pago Único");
  if (project.plans.some((p) => p.kind === "DESARROLLO")) return fail("Ya existe un plan de desarrollo");
  const { total, count, startDate } = parsed.data;
  let drafts: InstallmentDraft[];
  try {
    drafts = planOneTime({ totalCents: total, count: Number(count), startDate, interval: toInterval(parsed.data) });
  } catch (e) {
    return fail((e as Error).message);
  }
  try {
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
  } catch (e) {
    if (isUniqueViolation(e)) return fail("El plan ya existe, recargá la página");
    throw e;
  }
  refresh(projectId);
  return { message: "Plan de cobros creado" };
}

/** Reprograma los vencimientos de las cuotas sin pagos del plan de desarrollo (anticipo y cuotas con pagos no se tocan). */
export async function reschedulePlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ firstDate: dateField("Fecha de la primera cuota inválida"), ...intervalFields }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind: "DESARROLLO" } },
    select: { id: true },
  });
  if (!plan) return fail("El proyecto no tiene plan de desarrollo");
  let updated = 0;
  try {
    updated = await prisma.$transaction(async (tx) => {
      await lockPlanInstallments(tx, plan.id);
      const installments = await tx.installment.findMany({
        where: { planId: plan.id },
        include: { payments: { select: { amount: true } } },
      });
      let changes: { id: string; dueDate: Date }[];
      try {
        changes = planReschedule(
          installments.map((i) => ({
            id: i.id,
            type: i.type,
            sequence: i.sequence,
            paidCents: i.payments.reduce((s, p) => s + decToCents(p.amount), 0),
          })),
          parsed.data.firstDate,
          toInterval(parsed.data),
        );
      } catch (e) {
        throw new BillingError((e as Error).message);
      }
      if (changes.length === 0) throw new BillingError("No hay cuotas pendientes para reprogramar");
      let count = 0;
      for (const c of changes) {
        // Se revalida bajo el bloqueo: una cuota que recibió un pago entretanto no se mueve.
        const r = await tx.installment.updateMany({
          where: { id: c.id, payments: { none: {} } },
          data: { dueDate: c.dueDate },
        });
        count += r.count;
      }
      return count;
    });
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    throw e;
  }
  refresh(projectId);
  return { message: `Se reprogramaron ${updated} cuota(s)` };
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
  try {
    await prisma.$transaction([
      prisma.project.update({
        where: { id: projectId },
        data: { monthlyFee: centsToDec(monthlyFee), firstPaymentAmount: centsToDec(firstPayment) },
      }),
      prisma.installmentPlan.create({
        data: { projectId, kind: "SUSCRIPCION", installments: { create: drafts.map(toCreate) } },
      }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) return fail("El plan ya existe, recargá la página");
    throw e;
  }
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
  method: z.enum(PAYMENT_METHODS, { error: "Elegí un método de pago válido" }),
  receiptNote: optText,
});

export async function registerPayment(installmentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(paymentSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  if (parsed.data.paidAt.getTime() > todayAR().getTime()) return fail("La fecha de pago no puede ser futura");
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

export async function deletePayment(paymentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!confirmed(fd)) return fail(CONFIRM_ERROR);
  try {
    const projectId = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { installment: { include: { plan: true } } },
      });
      if (!payment) throw new BillingError("Pago no encontrado");
      // Mismo bloqueo que registerPayment/updateInstallment antes de tocar la cuota.
      await lockInstallment(tx, payment.installmentId);
      await tx.payment.delete({ where: { id: paymentId } });
      await recalcInstallment(tx, payment.installmentId);
      return payment.installment.plan.projectId;
    });
    refresh(projectId);
    return { message: "Pago eliminado" };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    if (isRecordNotFound(e)) return fail("El pago ya no existe, recargá la página");
    throw e;
  }
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
  const plan = await prisma.installmentPlan.findUnique({ where: { projectId_kind: { projectId, kind } } });
  if (!plan) return fail("No hay plan para ajustar");
  try {
    const updated = await prisma.$transaction(async (tx) => {
      await lockPlanInstallments(tx, plan.id);
      if (kind === "MANTENIMIENTO") {
        const project = await tx.project.findUnique({ where: { id: projectId }, select: { maintenanceEndedAt: true } });
        if (project?.maintenanceEndedAt) {
          throw new BillingError("El mantenimiento está dado de baja: reanudalo para actualizar el abono");
        }
      }
      const installments = await tx.installment.findMany({
        where: { planId: plan.id },
        include: { payments: true },
      });
      const items = installments.map((i) => ({
        id: i.id,
        type: i.type,
        dueDate: i.dueDate,
        amountCents: decToCents(i.amount),
        paidCents: i.payments.reduce((s, p) => s + decToCents(p.amount), 0),
      }));
      const changes = repriceInstallments(items, parsed.data.fromDate, parsed.data.newFee);
      let count = 0;
      for (const c of changes) {
        const r = await tx.installment.updateMany({
          where: { id: c.id, payments: { none: {} } },
          data: { amount: centsToDec(c.amountCents) },
        });
        count += r.count;
      }
      await tx.project.update({
        where: { id: projectId },
        data:
          kind === "SUSCRIPCION"
            ? { monthlyFee: centsToDec(parsed.data.newFee) }
            : { maintenanceFee: centsToDec(parsed.data.newFee) },
      });
      return count;
    });
    refresh(projectId);
    return { message: `Abono actualizado en ${updated} cuota(s)` };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    throw e;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function extendPlan(planId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  try {
    const projectId = await prisma.$transaction(async (tx) => {
      // Mismo bloqueo que endMaintenance/repricePlan: el chequeo de baja y el abono vigente no pueden cambiar en el medio.
      await lockPlanInstallments(tx, planId);
      const plan = await tx.installmentPlan.findUnique({
        where: { id: planId },
        include: { project: true, installments: { orderBy: { sequence: "asc" } } },
      });
      if (!plan) throw new BillingError("Plan no encontrado");
      if (plan.kind === "DESARROLLO") throw new BillingError("El plan de desarrollo no se extiende");
      if (plan.kind === "MANTENIMIENTO" && plan.project.maintenanceEndedAt) {
        throw new BillingError("El mantenimiento está dado de baja");
      }
      const fee = plan.kind === "SUSCRIPCION" ? plan.project.monthlyFee : plan.project.maintenanceFee;
      if (!fee || plan.installments.length === 0) throw new BillingError("Falta el abono vigente");
      const last = plan.installments[plan.installments.length - 1];
      const drafts = planRecurring({
        type: plan.kind === "SUSCRIPCION" ? "MENSUAL" : "MANTENIMIENTO",
        feeCents: decToCents(fee),
        baseDate: plan.installments[0].dueDate,
        startSequence: last.sequence + 1,
        count: BATCH_SIZE,
      });
      await tx.installment.createMany({ data: drafts.map((d) => ({ planId, ...toCreate(d) })) });
      return plan.projectId;
    });
    refresh(projectId);
    return { message: `Se generaron ${BATCH_SIZE} cuotas más` };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    if (isUniqueViolation(e)) return fail("Las cuotas ya fueron generadas, recargá la página");
    throw e;
  }
}

async function resumeMaintenance(projectId: string, planId: string, feeCents: number): Promise<ActionState> {
  const today = todayAR();
  try {
    await prisma.$transaction(async (tx) => {
      await lockPlanInstallments(tx, planId);
      await lockProject(tx, projectId);
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { maintenanceEndedAt: true, maintenanceStartsAt: true },
      });
      if (!project) throw new BillingError("Proyecto no encontrado");
      if (!project.maintenanceEndedAt) throw new BillingError("El mantenimiento ya está activo");
      const installments = await tx.installment.findMany({
        where: { planId },
        orderBy: { sequence: "asc" },
        select: { sequence: true, dueDate: true },
      });
      // Ancla original: la primera cuota del plan (o el inicio registrado si la baja anuló todas).
      const base = installments[0]?.dueDate ?? project.maintenanceStartsAt;
      if (!base) throw new BillingError("No se encontró la fecha de inicio del mantenimiento");
      const maxSequence = installments.reduce((m, i) => Math.max(m, i.sequence), 0);
      const startSequence = resumeStartSequence(base, maxSequence, today);
      const drafts = planRecurring({
        type: "MANTENIMIENTO",
        feeCents,
        baseDate: base,
        startSequence,
        count: BATCH_SIZE,
      });
      await tx.installment.createMany({ data: drafts.map((d) => ({ planId, ...toCreate(d) })) });
      await tx.project.update({
        where: { id: projectId },
        data: { maintenanceEndedAt: null, maintenanceFee: centsToDec(feeCents), stage: "EN_MANTENIMIENTO" },
      });
    });
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    if (isUniqueViolation(e)) return fail("Las cuotas ya fueron generadas, recargá la página");
    throw e;
  }
  refresh(projectId);
  return { message: "Mantenimiento reanudado" };
}

export async function activateMaintenance(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const feeParsed = parseForm(z.object({ fee: money("Abono inválido") }), fd);
  if (!feeParsed.ok) return fail(feeParsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El mantenimiento aplica a proyectos de Pago Único");
  const existing = project.plans.find((p) => p.kind === "MANTENIMIENTO");
  if (existing) {
    if (!project.maintenanceEndedAt) return fail("El mantenimiento ya está activo");
    return resumeMaintenance(projectId, existing.id, feeParsed.data.fee);
  }
  const parsed = parseForm(z.object({ fee: money("Abono inválido"), firstDueDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
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

export async function endMaintenance(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  if (!confirmed(fd)) return fail(CONFIRM_ERROR);
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind: "MANTENIMIENTO" } },
  });
  if (!plan) return fail("No hay mantenimiento activo");
  const today = todayAR();
  try {
    const removed = await prisma.$transaction(async (tx) => {
      // Mismo bloqueo de fila que registerPayment: un pago concurrente o ya se confirmó (la cuota se conserva) o espera.
      await tx.$queryRaw`SELECT id FROM "Installment" WHERE "planId" = ${plan.id} AND "dueDate" >= ${today}::date ORDER BY id FOR UPDATE`;
      await lockProject(tx, projectId);
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { maintenanceEndedAt: true } });
      if (project?.maintenanceEndedAt) throw new BillingError("El mantenimiento ya está dado de baja");
      const { count } = await tx.installment.deleteMany({
        where: { planId: plan.id, dueDate: { gte: today }, payments: { none: {} } },
      });
      await tx.project.update({ where: { id: projectId }, data: { maintenanceEndedAt: today } });
      return count;
    });
    refresh(projectId);
    return { message: `Mantenimiento dado de baja (${removed} cuota(s) futuras anuladas)` };
  } catch (e) {
    if (e instanceof BillingError) return fail(e.message);
    throw e;
  }
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
  try {
    await prisma.project.update({ where: { id: projectId }, data: { serviceSuspended: suspended } });
  } catch (e) {
    if (isRecordNotFound(e)) return fail("Proyecto no encontrado");
    throw e;
  }
  refresh(projectId);
  return { message: suspended ? "Servicio suspendido" : "Servicio reactivado" };
}
