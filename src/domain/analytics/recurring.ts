import { inRange, type PlanKind } from "./common";
import type { Bucket } from "./period";

export type ContractStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO" | "FINALIZADO";

export interface RecurringContract {
  kind: "SUSCRIPCION" | "MANTENIMIENTO";
  feeCents: number;
  status: ContractStatus;
  /** Fecha de creación del plan recurrente (el alta). */
  startedAt: Date;
  /** Fecha de baja (solo el mantenimiento la tiene). */
  endedAt: Date | null;
}

/** MRR/ARR y contratos. El MRR cuenta solo contratos con estado ACTIVO (vencidas y suspendidas no). */
export function recurringSummary(contracts: RecurringContract[], from: Date, to: Date) {
  const mrr = { subscriptionCents: 0, maintenanceCents: 0, totalCents: 0 };
  const subscriptions = { active: 0, overdue: 0, suspended: 0 };
  const maintenance = { active: 0 };
  for (const k of contracts) {
    if (k.status === "ACTIVO") {
      if (k.kind === "SUSCRIPCION") {
        mrr.subscriptionCents += k.feeCents;
        subscriptions.active += 1;
      } else {
        mrr.maintenanceCents += k.feeCents;
        maintenance.active += 1;
      }
    } else if (k.kind === "SUSCRIPCION") {
      if (k.status === "VENCIDA") subscriptions.overdue += 1;
      if (k.status === "SUSPENDIDO") subscriptions.suspended += 1;
    }
  }
  mrr.totalCents = mrr.subscriptionCents + mrr.maintenanceCents;
  const activeContracts = subscriptions.active + maintenance.active;
  return {
    mrr,
    arrCents: mrr.totalCents * 12,
    subscriptions,
    maintenance,
    activeContracts,
    avgPerContractCents: activeContracts === 0 ? null : Math.round(mrr.totalCents / activeContracts),
    signups: contracts.filter((k) => inRange(k.startedAt, from, to)).length,
    churnedMaintenance: contracts.filter((k) => k.kind === "MANTENIMIENTO" && k.endedAt && inRange(k.endedAt, from, to)).length,
    hasAny: contracts.length > 0,
  };
}

export interface RecurringPayment {
  amountCents: number;
  paidAt: Date;
  kind: PlanKind;
}

/** Cobrado en planes de suscripción y mantenimiento, por tramo. */
export function recurringCollectedSeries(payments: RecurringPayment[], buckets: Bucket[]) {
  return buckets.map((b) => ({
    label: b.label,
    from: b.from,
    cents: payments
      .filter((p) => p.kind !== "DESARROLLO" && inRange(p.paidAt, b.from, b.to))
      .reduce((s, p) => s + p.amountCents, 0),
  }));
}
