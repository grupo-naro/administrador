import "server-only";
import { addMonths, todayAR } from "@/domain/dates";
import { installmentLabel } from "@/domain/labels";
import { installmentAlerts, monthSummary, mrrCents, realVsProjected, renewalAlerts } from "@/domain/metrics";
import { serviceStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export async function getDashboard(now = new Date()) {
  const today = todayAR(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [installments, assets, projects] = await Promise.all([
    prisma.installment.findMany({
      include: {
        payments: true,
        plan: { select: { kind: true, project: { select: { id: true, name: true, client: { select: { name: true } } } } } },
      },
    }),
    prisma.infrastructureAsset.findMany({
      where: { managedByNaro: true },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { OR: [{ contractType: "SUSCRIPCION" }, { maintenanceFee: { not: null } }] },
      include: { plans: { include: { installments: { include: { payments: true } } } } },
    }),
  ]);

  const rows = installments.map((i) => {
    const paidCents = i.payments.reduce((s, p) => s + decToCents(p.amount), 0);
    return {
      id: i.id,
      projectId: i.plan.project.id,
      label: `${i.plan.project.name} (${i.plan.project.client.name}) — ${installmentLabel(i.type, i.sequence)}`,
      amountCents: decToCents(i.amount),
      paidCents,
      dueDate: i.dueDate,
      kind: i.plan.kind,
      payments: i.payments.map((p) => ({ amountCents: decToCents(p.amount), paidAt: p.paidAt })),
    };
  });

  // Mes en curso: lo que ya entró y lo que falta cobrar de las cuotas que vencen este mes.
  const thisMonth = monthSummary(
    {
      payments: rows.flatMap((r) => r.payments.map((p) => ({ ...p, kind: r.kind }))),
      installments: rows,
    },
    monthStart,
    addMonths(monthStart, 1),
  );

  const allPayments = rows.flatMap((r) => r.payments);
  const months = Array.from({ length: 4 }, (_, k) => {
    const from = addMonths(monthStart, k);
    const to = addMonths(monthStart, k + 1);
    const { realCents, projectedCents } = realVsProjected({ payments: allPayments, installments: rows }, from, to);
    return {
      label: new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(from),
      realCents,
      projectedCents,
    };
  });

  const mrr = mrrCents(
    projects.flatMap((p) => {
      const out: { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; active: boolean }[] = [];
      const subPlan = p.plans.find((pl) => pl.kind === "SUSCRIPCION");
      if (subPlan && p.monthlyFee) {
        const status = serviceStatus(
          {
            suspended: p.serviceSuspended,
            installments: subPlan.installments.map((i) => ({
              amountCents: decToCents(i.amount),
              paidCents: i.payments.reduce((s, x) => s + decToCents(x.amount), 0),
              dueDate: i.dueDate,
            })),
          },
          today,
        );
        out.push({ kind: "SUSCRIPCION", feeCents: decToCents(p.monthlyFee), active: status === "ACTIVO" });
      }
      const hasMaint = p.plans.some((pl) => pl.kind === "MANTENIMIENTO");
      if (hasMaint && p.maintenanceFee) {
        out.push({ kind: "MANTENIMIENTO", feeCents: decToCents(p.maintenanceFee), active: !p.maintenanceEndedAt });
      }
      return out;
    }),
  );

  const { overdue, upcoming } = installmentAlerts(rows, today, 7);
  const renewals = renewalAlerts(
    assets.map((a) => ({ id: a.id, projectId: a.project.id, label: `${a.identifier} — ${a.project.name}`, renewalDate: a.renewalDate })),
    today,
    30,
  );

  return { today, thisMonth, mrr, months, overdue, upcoming, renewals };
}
