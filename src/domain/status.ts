export type ComputedStatus = "PENDIENTE" | "PAGADO" | "VENCIDO";
export type ServiceStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO";

interface Dated {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
}

export function installmentStatus(i: Dated, today: Date): ComputedStatus {
  if (i.paidCents >= i.amountCents) return "PAGADO";
  return i.dueDate.getTime() < today.getTime() ? "VENCIDO" : "PENDIENTE";
}

export const remainingCents = (i: { amountCents: number; paidCents: number }): number =>
  Math.max(0, i.amountCents - i.paidCents);

export function summarize(items: { amountCents: number; paidCents: number }[]) {
  const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
  const paidCents = items.reduce((s, i) => s + i.paidCents, 0);
  return { totalCents, paidCents, pendingCents: totalCents - paidCents };
}

export function serviceStatus(
  a: { suspended: boolean; installments: Dated[] },
  today: Date,
): ServiceStatus {
  if (a.suspended) return "SUSPENDIDO";
  return a.installments.some((i) => installmentStatus(i, today) === "VENCIDO") ? "VENCIDA" : "ACTIVO";
}

export function assertPayable(remaining: number, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("El monto debe ser mayor a cero");
  if (remaining <= 0) throw new Error("La cuota ya está pagada");
  if (amountCents > remaining) throw new Error("El monto supera el saldo de la cuota");
}
