"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, money, optText, parseForm, text, type ActionState } from "@/lib/form";
import { planOneTime, planSubscription, type InstallmentDraft } from "@/domain/installments";
import { assertPayable, remainingCents } from "@/domain/status";
import { centsToDec, decToCents } from "@/server/mappers";
import { recalcInstallment } from "./recalc";

const toCreate = (d: InstallmentDraft) => ({
  type: d.type,
  sequence: d.sequence,
  amount: centsToDec(d.amountCents),
  dueDate: d.dueDate,
});

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
  const inst = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: { payments: true, plan: true },
  });
  if (!inst) return fail("Cuota no encontrada");
  const paid = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  if (parsed.data.amount < paid) return fail("El monto no puede ser menor a lo ya pagado");
  await prisma.$transaction(async (tx) => {
    await tx.installment.update({
      where: { id: installmentId },
      data: { amount: centsToDec(parsed.data.amount), dueDate: parsed.data.dueDate },
    });
    await recalcInstallment(tx, installmentId);
  });
  refresh(inst.plan.projectId);
  return { message: "Cuota actualizada" };
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
  const inst = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: { payments: true, plan: true },
  });
  if (!inst) return fail("Cuota no encontrada");
  const paidCents = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  try {
    assertPayable(remainingCents({ amountCents: decToCents(inst.amount), paidCents }), parsed.data.amount);
  } catch (e) {
    return fail((e as Error).message);
  }
  await prisma.$transaction(async (tx) => {
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
  });
  refresh(inst.plan.projectId);
  return { message: "Pago registrado" };
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
