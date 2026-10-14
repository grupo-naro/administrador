import "server-only";
import type { Facts } from "@/domain/analytics/facts";
import { todayAR } from "@/domain/dates";
import { serviceStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

/**
 * Los createdAt son instantes reales (no @db.Date): se llevan al día calendario de Buenos Aires
 * (spec §3) para que no caigan en el período siguiente entre las 21:00 y las 24:00 (hora AR).
 */
const arDay = (d: Date): Date => todayAR(d);

/** Carga una vez todos los datos que usan las analíticas y los mapea a centavos y fechas (los cálculos son del dominio). */
export async function loadFacts(now: Date = new Date()): Promise<Facts> {
  const today = todayAR(now);
  const [installments, projects, proposals, clients, assets] = await Promise.all([
    prisma.installment.findMany({
      include: {
        payments: true,
        plan: {
          select: {
            kind: true,
            project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.project.findMany({
      include: {
        plans: {
          select: {
            kind: true,
            createdAt: true,
            installments: { select: { amount: true, dueDate: true, payments: { select: { amount: true } } } },
          },
        },
      },
    }),
    prisma.proposal.findMany({
      include: { project: { select: { createdAt: true, contractType: true, totalAmount: true, monthlyFee: true } } },
    }),
    prisma.client.findMany({ select: { id: true, name: true, createdAt: true } }),
    prisma.infrastructureAsset.findMany({ include: { project: { select: { name: true } } } }),
  ]);

  const payments: Facts["payments"] = [];
  const instFacts: Facts["installments"] = [];
  const collectedByClient = new Map<string, number>();
  for (const i of installments) {
    const { project } = i.plan;
    let paidCents = 0;
    let lastPaidAt: Date | null = null;
    for (const p of i.payments) {
      const cents = decToCents(p.amount);
      paidCents += cents;
      if (!lastPaidAt || p.paidAt.getTime() > lastPaidAt.getTime()) lastPaidAt = p.paidAt;
      payments.push({
        amountCents: cents,
        paidAt: p.paidAt,
        method: p.method,
        kind: i.plan.kind,
        clientId: project.client.id,
        clientName: project.client.name,
        projectId: project.id,
        projectName: project.name,
      });
      collectedByClient.set(project.client.id, (collectedByClient.get(project.client.id) ?? 0) + cents);
    }
    instFacts.push({
      amountCents: decToCents(i.amount),
      paidCents,
      dueDate: i.dueDate,
      lastPaidAt,
      clientId: project.client.id,
      clientName: project.client.name,
    });
  }

  const contracts: Facts["contracts"] = [];
  const activeRecurring = new Set<string>();
  for (const p of projects) {
    const sub = p.plans.find((pl) => pl.kind === "SUSCRIPCION");
    if (sub && p.monthlyFee) {
      const status = serviceStatus(
        {
          suspended: p.serviceSuspended,
          installments: sub.installments.map((i) => ({
            amountCents: decToCents(i.amount),
            paidCents: i.payments.reduce((s, x) => s + decToCents(x.amount), 0),
            dueDate: i.dueDate,
          })),
        },
        today,
      );
      contracts.push({ kind: "SUSCRIPCION", feeCents: decToCents(p.monthlyFee), status, startedAt: arDay(sub.createdAt), endedAt: null });
      if (status === "ACTIVO") activeRecurring.add(p.id);
    }
    const maint = p.plans.find((pl) => pl.kind === "MANTENIMIENTO");
    if (maint && p.maintenanceFee) {
      const ended = p.maintenanceEndedAt !== null;
      contracts.push({
        kind: "MANTENIMIENTO",
        feeCents: decToCents(p.maintenanceFee),
        status: ended ? "FINALIZADO" : "ACTIVO",
        startedAt: arDay(maint.createdAt),
        endedAt: p.maintenanceEndedAt,
      });
      if (!ended) activeRecurring.add(p.id);
    }
  }

  return {
    today,
    payments,
    installments: instFacts,
    contracts,
    proposals: proposals.map((p) => ({
      status: p.status,
      createdAt: arDay(p.createdAt),
      validUntil: p.validUntil,
      oneTimePriceCents: decToCents(p.oneTimePrice),
      project: p.project
        ? {
            createdAt: arDay(p.project.createdAt),
            contractType: p.project.contractType,
            totalCents: p.project.totalAmount ? decToCents(p.project.totalAmount) : null,
            monthlyFeeCents: p.project.monthlyFee ? decToCents(p.project.monthlyFee) : null,
          }
        : null,
    })),
    projects: projects.map((p) => ({
      clientId: p.clientId,
      stage: p.stage,
      contractType: p.contractType,
      totalCents: p.totalAmount ? decToCents(p.totalAmount) : null,
      monthlyFeeCents: p.monthlyFee ? decToCents(p.monthlyFee) : null,
      createdAt: arDay(p.createdAt),
      startedAt: p.startedAt,
      deliveredAt: p.deliveredAt,
      activeRecurring: activeRecurring.has(p.id),
    })),
    clients: clients.map((c) => ({ id: c.id, name: c.name, createdAt: arDay(c.createdAt), collectedCents: collectedByClient.get(c.id) ?? 0 })),
    assets: assets.map((a) => ({
      id: a.id,
      type: a.type,
      identifier: a.identifier,
      projectName: a.project.name,
      managedByNaro: a.managedByNaro,
      costCents: a.costAmount ? decToCents(a.costAmount) : null,
      costEveryMonths: a.costEveryMonths,
      renewalDate: a.renewalDate,
    })),
  };
}
