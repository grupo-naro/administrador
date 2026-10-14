import { diffDays } from "./dates";

export function mrrCents(items: { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; active: boolean }[]) {
  let subscriptionCents = 0;
  let maintenanceCents = 0;
  for (const i of items) {
    if (!i.active) continue;
    if (i.kind === "SUSCRIPCION") subscriptionCents += i.feeCents;
    else maintenanceCents += i.feeCents;
  }
  return { subscriptionCents, maintenanceCents, totalCents: subscriptionCents + maintenanceCents };
}

const inRange = (d: Date, from: Date, to: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();

export function realVsProjected(
  a: {
    payments: { amountCents: number; paidAt: Date }[];
    installments: { amountCents: number; dueDate: Date }[];
  },
  from: Date,
  to: Date,
) {
  const realCents = a.payments.filter((p) => inRange(p.paidAt, from, to)).reduce((s, p) => s + p.amountCents, 0);
  const projectedCents = a.installments
    .filter((i) => inRange(i.dueDate, from, to))
    .reduce((s, i) => s + i.amountCents, 0);
  return { realCents, projectedCents };
}

const byDate = <T>(get: (x: T) => Date) => (a: T, b: T) => get(a).getTime() - get(b).getTime();

export function installmentAlerts<T>(
  items: (T & { amountCents: number; paidCents: number; dueDate: Date })[],
  today: Date,
  windowDays = 7,
) {
  const unpaid = items.filter((i) => i.paidCents < i.amountCents);
  const overdue = unpaid.filter((i) => i.dueDate.getTime() < today.getTime()).sort(byDate((i) => i.dueDate));
  const upcoming = unpaid
    .filter((i) => {
      const days = diffDays(i.dueDate, today);
      return days >= 0 && days <= windowDays;
    })
    .sort(byDate((i) => i.dueDate));
  return { overdue, upcoming };
}

export function renewalAlerts<T>(items: (T & { renewalDate: Date })[], today: Date, windowDays = 30) {
  const expired = items.filter((i) => i.renewalDate.getTime() < today.getTime()).sort(byDate((i) => i.renewalDate));
  const upcoming = items
    .filter((i) => {
      const days = diffDays(i.renewalDate, today);
      return days >= 0 && days <= windowDays;
    })
    .sort(byDate((i) => i.renewalDate));
  return { expired, upcoming };
}

type PlanKindLike = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";

/**
 * Resumen del mes [from, to):
 * - `collected`: plata que efectivamente entró (pagos con fecha en el mes), total y por origen.
 * - `expected`: saldo todavía no cobrado de las cuotas que vencen en el mes, separado en
 *   proyectos únicos (plan DESARROLLO) y recurrentes (suscripción + mantenimiento).
 * Las cuotas vencidas de meses anteriores no entran en `expected` (están en las alertas de vencidas).
 */
export function monthSummary(
  a: {
    payments: { amountCents: number; paidAt: Date; kind: PlanKindLike }[];
    installments: { amountCents: number; paidCents: number; dueDate: Date; kind: PlanKindLike }[];
  },
  from: Date,
  to: Date,
) {
  const collected = { totalCents: 0, oneTimeCents: 0, subscriptionCents: 0, maintenanceCents: 0 };
  for (const p of a.payments) {
    if (!inRange(p.paidAt, from, to)) continue;
    collected.totalCents += p.amountCents;
    if (p.kind === "DESARROLLO") collected.oneTimeCents += p.amountCents;
    else if (p.kind === "SUSCRIPCION") collected.subscriptionCents += p.amountCents;
    else collected.maintenanceCents += p.amountCents;
  }
  const expected = { totalCents: 0, oneTimeCents: 0, recurringCents: 0 };
  for (const i of a.installments) {
    if (!inRange(i.dueDate, from, to)) continue;
    const remaining = Math.max(0, i.amountCents - i.paidCents);
    expected.totalCents += remaining;
    if (i.kind === "DESARROLLO") expected.oneTimeCents += remaining;
    else expected.recurringCents += remaining;
  }
  return { collected, expected };
}
