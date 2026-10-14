import { daysBetween, inRange, type PlanKind } from "./common";
import type { Bucket } from "./period";

export const DAYS_PER_MONTH = 30.4375;

export interface FinancePayment {
  amountCents: number;
  paidAt: Date;
  method: string;
  kind: PlanKind;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
}

export interface FinanceInstallment {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
}

export interface FinanceAsset {
  managedByNaro: boolean;
  costCents: number | null;
  costEveryMonths: number;
}

/** Costo diario = costo ÷ (cada N meses × 30,4375); se multiplica por los días del rango. */
export function assetCostForDays(costCents: number, everyMonths: number, days: number): number {
  return Math.round((costCents / (everyMonths * DAYS_PER_MONTH)) * days);
}

/** Solo activos de Naro con costo y periodicidad válida (>= 1); el resto no suma. */
export function infraCostForDays(assets: FinanceAsset[], days: number): number {
  let total = 0;
  for (const a of assets) {
    if (!a.managedByNaro || !a.costCents || a.costCents <= 0) continue;
    if (!Number.isFinite(a.costEveryMonths) || a.costEveryMonths < 1) continue;
    total += assetCostForDays(a.costCents, a.costEveryMonths, days);
  }
  return total;
}

interface FinanceInput {
  payments: FinancePayment[];
  installments: FinanceInstallment[];
  assets: FinanceAsset[];
}

export function financeSummary(a: FinanceInput, from: Date, to: Date, today: Date) {
  let collectedCents = 0;
  const byKind = { oneTimeCents: 0, subscriptionCents: 0, maintenanceCents: 0 };
  const methods = new Map<string, number>();
  for (const p of a.payments) {
    if (!inRange(p.paidAt, from, to)) continue;
    collectedCents += p.amountCents;
    if (p.kind === "DESARROLLO") byKind.oneTimeCents += p.amountCents;
    else if (p.kind === "SUSCRIPCION") byKind.subscriptionCents += p.amountCents;
    else byKind.maintenanceCents += p.amountCents;
    methods.set(p.method, (methods.get(p.method) ?? 0) + p.amountCents);
  }

  let projectedCents = 0;
  let coveredCents = 0;
  let upcomingCents = 0;
  let overdueCents = 0;
  for (const i of a.installments) {
    if (!inRange(i.dueDate, from, to)) continue;
    projectedCents += i.amountCents;
    coveredCents += Math.min(i.paidCents, i.amountCents);
    const remaining = Math.max(0, i.amountCents - i.paidCents);
    if (i.dueDate.getTime() < today.getTime()) overdueCents += remaining;
    else upcomingCents += remaining;
  }

  const infraCostCents = infraCostForDays(a.assets, daysBetween(from, to));
  return {
    collectedCents,
    projectedCents,
    fulfillmentPct: projectedCents === 0 ? null : coveredCents / projectedCents,
    upcomingCents,
    overdueCents,
    infraCostCents,
    netCents: collectedCents - infraCostCents,
    byKind,
    byMethod: [...methods].map(([method, cents]) => ({ method, cents })).sort((x, y) => y.cents - x.cents),
  };
}

export interface SeriesPoint {
  label: string;
  from: Date;
  collectedCents: number;
  projectedCents: number;
  costCents: number;
  netCents: number;
}

export function financeSeries(a: FinanceInput, buckets: Bucket[], today: Date): SeriesPoint[] {
  return buckets.map((b) => {
    const s = financeSummary(a, b.from, b.to, today);
    return {
      label: b.label,
      from: b.from,
      collectedCents: s.collectedCents,
      projectedCents: s.projectedCents,
      costCents: s.infraCostCents,
      netCents: s.netCents,
    };
  });
}

export interface TopEntry {
  id: string;
  name: string;
  cents: number;
  sharePct: number;
}

export function topCollected(
  payments: FinancePayment[],
  from: Date,
  to: Date,
  by: "client" | "project",
  limit = 5,
): TopEntry[] {
  const map = new Map<string, { name: string; cents: number }>();
  let total = 0;
  for (const p of payments) {
    if (!inRange(p.paidAt, from, to)) continue;
    total += p.amountCents;
    const id = by === "client" ? p.clientId : p.projectId;
    const name = by === "client" ? p.clientName : p.projectName;
    const entry = map.get(id) ?? { name, cents: 0 };
    entry.cents += p.amountCents;
    map.set(id, entry);
  }
  return [...map]
    .map(([id, e]) => ({ id, name: e.name, cents: e.cents, sharePct: total === 0 ? 0 : e.cents / total }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Porcentaje (fracción) del cobrado que aportan los primeros `n` clientes; null si no hay cobros. */
export function topShare(payments: FinancePayment[], from: Date, to: Date, n = 3): number | null {
  const top = topCollected(payments, from, to, "client", n);
  if (top.length === 0) return null;
  return top.reduce((s, t) => s + t.sharePct, 0);
}
