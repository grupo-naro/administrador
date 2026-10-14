import { diffDays } from "../dates";
import { inRange } from "./common";

export interface CollectionInstallment {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
  /** Fecha del último pago registrado; null si no tiene pagos. */
  lastPaidAt: Date | null;
  clientId: string;
  clientName: string;
}

const remaining = (i: CollectionInstallment) => Math.max(0, i.amountCents - i.paidCents);

export type AgingKey = "1-7" | "8-30" | "31-60" | "60+";
export const AGING_KEYS: AgingKey[] = ["1-7", "8-30", "31-60", "60+"];
const AGING_LABEL: Record<AgingKey, string> = {
  "1-7": "1 a 7 días",
  "8-30": "8 a 30 días",
  "31-60": "31 a 60 días",
  "60+": "Más de 60 días",
};

const agingKey = (daysLate: number): AgingKey =>
  daysLate <= 7 ? "1-7" : daysLate <= 30 ? "8-30" : daysLate <= 60 ? "31-60" : "60+";

/** Saldo vencido (dueDate < hoy) agrupado por días de atraso. */
export function agingBuckets(insts: CollectionInstallment[], today: Date) {
  const acc = Object.fromEntries(AGING_KEYS.map((k) => [k, { count: 0, cents: 0 }])) as Record<
    AgingKey,
    { count: number; cents: number }
  >;
  for (const i of insts) {
    const rem = remaining(i);
    if (rem === 0 || i.dueDate.getTime() >= today.getTime()) continue;
    const bucket = acc[agingKey(diffDays(today, i.dueDate))];
    bucket.count += 1;
    bucket.cents += rem;
  }
  return AGING_KEYS.map((key) => ({ key, label: AGING_LABEL[key], ...acc[key] }));
}

/** Cuotas totalmente pagadas cuyo último pago cae en [from, to): % a tiempo y demora promedio de las tardías. */
export function punctuality(insts: CollectionInstallment[], from: Date, to: Date) {
  const paid = insts.filter(
    (i) => i.paidCents >= i.amountCents && i.lastPaidAt !== null && inRange(i.lastPaidAt, from, to),
  );
  if (paid.length === 0) return { count: 0, onTimePct: null as number | null, avgLateDays: null as number | null };
  const late = paid.filter((i) => (i.lastPaidAt as Date).getTime() > i.dueDate.getTime());
  const lateDays = late.reduce((s, i) => s + diffDays(i.lastPaidAt as Date, i.dueDate), 0);
  return {
    count: paid.length,
    onTimePct: (paid.length - late.length) / paid.length,
    avgLateDays: late.length === 0 ? null : lateDays / late.length,
  };
}

/** Deuda total (saldo de todas las cuotas) y lo que vence entre hoy y hoy + 30 días. */
export function debtSummary(insts: CollectionInstallment[], today: Date) {
  let totalCents = 0;
  let dueNext30Cents = 0;
  for (const i of insts) {
    const rem = remaining(i);
    totalCents += rem;
    const days = diffDays(i.dueDate, today);
    if (days >= 0 && days <= 30) dueNext30Cents += rem;
  }
  return { totalCents, dueNext30Cents };
}

/** Clientes con saldo vencido, de mayor a menor, con los días de atraso de la cuota más antigua. */
export function debtorsByClient(insts: CollectionInstallment[], today: Date) {
  const map = new Map<
    string,
    { clientId: string; clientName: string; overdueCents: number; overdueCount: number; maxDaysLate: number }
  >();
  for (const i of insts) {
    const rem = remaining(i);
    if (rem === 0 || i.dueDate.getTime() >= today.getTime()) continue;
    const entry = map.get(i.clientId) ?? {
      clientId: i.clientId,
      clientName: i.clientName,
      overdueCents: 0,
      overdueCount: 0,
      maxDaysLate: 0,
    };
    entry.overdueCents += rem;
    entry.overdueCount += 1;
    entry.maxDaysLate = Math.max(entry.maxDaysLate, diffDays(today, i.dueDate));
    map.set(i.clientId, entry);
  }
  return [...map.values()].sort((a, b) => b.overdueCents - a.overdueCents || a.clientName.localeCompare(b.clientName));
}
