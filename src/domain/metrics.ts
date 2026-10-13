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
